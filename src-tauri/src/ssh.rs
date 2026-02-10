use crate::ringbuffer::SessionRingBuffer;
use crate::session::{SessionConfig, SessionError, SessionHandle, SessionManager, SessionState};
use async_trait::async_trait;
use russh::keys::key::PublicKey;
use russh::{client, ChannelId};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, error, info, warn};

struct SshHandler {
    session_id: String,
    app_handle: tauri::AppHandle,
    buffer: Arc<Mutex<SessionRingBuffer>>,
    /// Channel to signal backpressure state to the main loop
    backpressure_tx: mpsc::Sender<bool>,
}

#[async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement proper host key verification with known_hosts
        warn!(
            session_id = %self.session_id,
            "Accepting server key without verification (TODO: implement known_hosts)"
        );
        Ok(true)
    }

    async fn data(
        &mut self,
        _channel: ChannelId,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let event_name = format!("session:{}", self.session_id);
        debug!(
            session_id = %self.session_id,
            bytes = data.len(),
            "Received data from SSH"
        );

        // Buffer data with backpressure control
        {
            let mut buf = self.buffer.lock().await;
            buf.push(data);

            // Check if we should pause reads
            if buf.should_pause() {
                debug!(
                    session_id = %self.session_id,
                    buffer_fill = %buf.fill_percent(),
                    "Backpressure: signaling SSH pause"
                );
                let _ = self.backpressure_tx.send(true).await;
            }
        }

        // Emit data to frontend
        if let Err(e) = self.app_handle.emit(&event_name, data.to_vec()) {
            error!(
                session_id = %self.session_id,
                error = %e,
                "Failed to emit data event"
            );
        }
        Ok(())
    }

    async fn extended_data(
        &mut self,
        _channel: ChannelId,
        ext: u32,
        data: &[u8],
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        // Extended data (stderr, etc.)
        let event_name = format!("session:{}", self.session_id);
        debug!(
            session_id = %self.session_id,
            ext = ext,
            bytes = data.len(),
            "Received extended data from SSH"
        );

        if let Err(e) = self.app_handle.emit(&event_name, data.to_vec()) {
            error!(
                session_id = %self.session_id,
                error = %e,
                "Failed to emit extended data event"
            );
        }
        Ok(())
    }
}

pub async fn run_ssh_session(
    session_id: String,
    config: SessionConfig,
    manager: Arc<SessionManager>,
) -> Result<(), SessionError> {
    let app_handle = manager.app_handle().clone();

    // Create channels for communication
    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(256);
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u32, u32)>(16);
    let (drain_tx, mut drain_rx) = mpsc::channel::<()>(16);
    let (backpressure_tx, mut backpressure_rx) = mpsc::channel::<bool>(16);

    // Create ring buffer for backpressure
    let buffer = Arc::new(Mutex::new(SessionRingBuffer::new(session_id.clone())));

    // Store session handle (SSH doesn't use auto_pagination - VRP is telnet-only)
    let handle = SessionHandle {
        id: session_id.clone(),
        config: config.clone(),
        state: SessionState::Connecting,
        input_tx,
        shutdown_tx,
        resize_tx,
        auto_pagination_tx: None,
        buffer: Arc::clone(&buffer),
        drain_tx,
    };
    manager.insert(handle);

    // Emit connecting state
    emit_state(&app_handle, &session_id, SessionState::Connecting);

    // Configure SSH client
    let ssh_config = client::Config {
        inactivity_timeout: Some(std::time::Duration::from_secs(3600)),
        keepalive_interval: Some(std::time::Duration::from_secs(30)),
        keepalive_max: 3,
        ..Default::default()
    };

    let handler = SshHandler {
        session_id: session_id.clone(),
        app_handle: app_handle.clone(),
        buffer: Arc::clone(&buffer),
        backpressure_tx,
    };

    // Connect to server
    let addr = format!("{}:{}", config.host, config.port);
    info!(session_id = %session_id, addr = %addr, "Connecting to SSH server");

    let mut session = match client::connect(Arc::new(ssh_config), &addr, handler).await {
        Ok(session) => session,
        Err(e) => {
            error!(session_id = %session_id, error = %e, "SSH connection failed");
            emit_state(&app_handle, &session_id, SessionState::Error);
            manager.remove(&session_id);
            return Err(SessionError::ConnectionFailed(e.to_string()));
        }
    };

    emit_state(&app_handle, &session_id, SessionState::Connected);
    emit_state(&app_handle, &session_id, SessionState::Authenticating);

    // Authenticate
    info!(session_id = %session_id, username = %config.username, "Authenticating");

    let auth_result = session
        .authenticate_password(&config.username, &config.password)
        .await;

    match auth_result {
        Ok(true) => {
            info!(session_id = %session_id, "Authentication successful");
        }
        Ok(false) => {
            error!(session_id = %session_id, "Authentication rejected");
            emit_state(&app_handle, &session_id, SessionState::Error);
            manager.remove(&session_id);
            return Err(SessionError::AuthenticationFailed(
                "Authentication rejected".to_string(),
            ));
        }
        Err(e) => {
            error!(session_id = %session_id, error = %e, "Authentication error");
            emit_state(&app_handle, &session_id, SessionState::Error);
            manager.remove(&session_id);
            return Err(SessionError::AuthenticationFailed(e.to_string()));
        }
    }

    // Open channel
    let channel = match session.channel_open_session().await {
        Ok(channel) => channel,
        Err(e) => {
            error!(session_id = %session_id, error = %e, "Failed to open channel");
            emit_state(&app_handle, &session_id, SessionState::Error);
            manager.remove(&session_id);
            return Err(SessionError::ChannelError(e.to_string()));
        }
    };

    // Request PTY
    if let Err(e) = channel
        .request_pty(
            false,
            "xterm-256color",
            config.cols,
            config.rows,
            0,
            0,
            &[],
        )
        .await
    {
        error!(session_id = %session_id, error = %e, "Failed to request PTY");
        emit_state(&app_handle, &session_id, SessionState::Error);
        manager.remove(&session_id);
        return Err(SessionError::ChannelError(e.to_string()));
    }

    // Request shell
    if let Err(e) = channel.request_shell(false).await {
        error!(session_id = %session_id, error = %e, "Failed to request shell");
        emit_state(&app_handle, &session_id, SessionState::Error);
        manager.remove(&session_id);
        return Err(SessionError::ChannelError(e.to_string()));
    }

    emit_state(&app_handle, &session_id, SessionState::Ready);
    info!(session_id = %session_id, "SSH session ready");

    // Main event loop
    // Note: SSH backpressure is handled in the SshHandler::data callback.
    // The backpressure_rx channel is available for future use if we need
    // to pause the SSH channel at the transport level.
    loop {
        tokio::select! {
            // Handle drain notification from frontend
            Some(()) = drain_rx.recv() => {
                let mut buf = buffer.lock().await;
                // Clear the buffer since frontend has processed the data
                buf.drain_all();
                debug!(
                    session_id = %session_id,
                    buffer_fill = %buf.fill_percent(),
                    "Buffer drained by frontend"
                );
            }

            // Handle backpressure signal from SSH handler
            Some(paused) = backpressure_rx.recv() => {
                if paused {
                    debug!(session_id = %session_id, "SSH backpressure: handler signaled pause");
                    // In SSH, we can't directly pause the channel read like in telnet.
                    // The buffer will continue accepting data, but the signal is useful
                    // for monitoring/logging purposes.
                }
            }

            // Handle input from frontend
            Some(data) = input_rx.recv() => {
                debug!(session_id = %session_id, bytes = data.len(), "Sending data to SSH");
                if let Err(e) = channel.data(&data[..]).await {
                    error!(session_id = %session_id, error = %e, "Failed to send data");
                    break;
                }
            }

            // Handle resize requests
            Some((cols, rows)) = resize_rx.recv() => {
                debug!(session_id = %session_id, cols = cols, rows = rows, "Resizing PTY");
                if let Err(e) = channel.window_change(cols, rows, 0, 0).await {
                    warn!(session_id = %session_id, error = %e, "Failed to resize PTY");
                }
            }

            // Handle shutdown request
            _ = shutdown_rx.recv() => {
                info!(session_id = %session_id, "Shutdown requested");
                break;
            }
        }
    }

    // Cleanup
    info!(session_id = %session_id, "SSH session ending");
    emit_state(&app_handle, &session_id, SessionState::Disconnected);
    manager.remove(&session_id);

    Ok(())
}

fn emit_state(app_handle: &tauri::AppHandle, session_id: &str, state: SessionState) {
    let event_name = format!("session:{}:state", session_id);
    if let Err(e) = app_handle.emit(&event_name, state) {
        error!(
            session_id = %session_id,
            error = %e,
            "Failed to emit state event"
        );
    }
}
