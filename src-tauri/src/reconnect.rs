use crate::session::{Protocol, ReconnectPolicy, SessionConfig, SessionManager, SessionState};
use crate::ssh;
use crate::telnet;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::Emitter;
use tokio::sync::{mpsc, Mutex};
use tokio::time::{sleep, Duration};
use tracing::{debug, error, info, warn};

/// Status of a reconnection attempt, sent to frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReconnectStatus {
    /// Current attempt number (1-indexed)
    pub attempt: u32,
    /// Maximum number of attempts
    pub max_attempts: u32,
    /// Milliseconds until next retry
    pub next_retry_ms: u64,
    /// Error message from last failed attempt
    pub last_error: Option<String>,
}

/// Controller for managing reconnection with exponential backoff
pub struct ReconnectController {
    session_id: String,
    config: SessionConfig,
    policy: ReconnectPolicy,
    cancel_tx: mpsc::Sender<()>,
    cancel_rx: Arc<Mutex<mpsc::Receiver<()>>>,
}

impl ReconnectController {
    pub fn new(session_id: String, config: SessionConfig, policy: ReconnectPolicy) -> Self {
        let (cancel_tx, cancel_rx) = mpsc::channel(1);
        Self {
            session_id,
            config,
            policy,
            cancel_tx,
            cancel_rx: Arc::new(Mutex::new(cancel_rx)),
        }
    }

    /// Get a sender that can be used to cancel the reconnection
    pub fn get_cancel_handle(&self) -> mpsc::Sender<()> {
        self.cancel_tx.clone()
    }

    /// Calculate delay for the given attempt using exponential backoff
    fn calculate_delay(&self, attempt: u32) -> u64 {
        let delay = (self.policy.initial_delay_ms as f64)
            * self.policy.backoff_multiplier.powi(attempt.saturating_sub(1) as i32);
        (delay as u64).min(self.policy.max_delay_ms)
    }

    /// Attempt to reconnect with exponential backoff
    /// Returns the new session ID on success, or an error message on failure
    pub async fn run(&self, manager: Arc<SessionManager>) -> Result<String, String> {
        let app_handle = manager.app_handle().clone();
        let mut cancel_rx = self.cancel_rx.lock().await;

        // Emit reconnecting state
        emit_state(&app_handle, &self.session_id, SessionState::Reconnecting);

        for attempt in 1..=self.policy.max_retries {
            let delay = self.calculate_delay(attempt);

            // Emit status to frontend
            let status = ReconnectStatus {
                attempt,
                max_attempts: self.policy.max_retries,
                next_retry_ms: delay,
                last_error: None,
            };
            emit_reconnect_status(&app_handle, &self.session_id, &status);

            info!(
                session_id = %self.session_id,
                attempt = attempt,
                max_attempts = self.policy.max_retries,
                delay_ms = delay,
                "Attempting reconnection"
            );

            // Wait before attempting, with cancellation support
            tokio::select! {
                _ = sleep(Duration::from_millis(delay)) => {}
                _ = cancel_rx.recv() => {
                    info!(session_id = %self.session_id, "Reconnection cancelled");
                    emit_state(&app_handle, &self.session_id, SessionState::Disconnected);
                    return Err("Reconnection cancelled by user".to_string());
                }
            }

            // Attempt to connect
            let result = self.attempt_connect(Arc::clone(&manager)).await;

            match result {
                Ok(new_session_id) => {
                    info!(
                        session_id = %self.session_id,
                        new_session_id = %new_session_id,
                        attempt = attempt,
                        "Reconnection successful"
                    );
                    return Ok(new_session_id);
                }
                Err(e) => {
                    warn!(
                        session_id = %self.session_id,
                        attempt = attempt,
                        error = %e,
                        "Reconnection attempt failed"
                    );

                    // Emit failure status
                    let status = ReconnectStatus {
                        attempt,
                        max_attempts: self.policy.max_retries,
                        next_retry_ms: if attempt < self.policy.max_retries {
                            self.calculate_delay(attempt + 1)
                        } else {
                            0
                        },
                        last_error: Some(e),
                    };
                    emit_reconnect_status(&app_handle, &self.session_id, &status);
                }
            }
        }

        // All attempts exhausted
        error!(
            session_id = %self.session_id,
            max_attempts = self.policy.max_retries,
            "Reconnection failed after all attempts"
        );
        emit_state(&app_handle, &self.session_id, SessionState::Error);
        Err(format!(
            "Failed to reconnect after {} attempts",
            self.policy.max_retries
        ))
    }

    /// Attempt a single connection
    async fn attempt_connect(&self, manager: Arc<SessionManager>) -> Result<String, String> {
        let session_id = SessionManager::generate_session_id();
        let config = self.config.clone();
        let manager_clone = Arc::clone(&manager);

        // Create a channel to receive connection result
        let (result_tx, mut result_rx) = mpsc::channel::<Result<(), String>>(1);

        // Spawn the session task
        let id = session_id.clone();
        let result_tx_clone = result_tx.clone();

        tokio::spawn(async move {
            let result = match config.protocol {
                Protocol::Ssh => ssh::run_ssh_session(id.clone(), config, manager_clone).await,
                Protocol::Telnet => {
                    telnet::run_telnet_session(id.clone(), config, manager_clone).await
                }
            };

            let _ = match result {
                Ok(()) => result_tx_clone.send(Ok(())).await,
                Err(e) => result_tx_clone.send(Err(e.to_string())).await,
            };
        });

        // Wait a bit for the connection to establish
        // The session will emit Ready state if successful
        tokio::select! {
            result = result_rx.recv() => {
                match result {
                    Some(Ok(())) => Ok(session_id),
                    Some(Err(e)) => Err(e),
                    None => Err("Connection task ended unexpectedly".to_string()),
                }
            }
            _ = sleep(Duration::from_secs(30)) => {
                // Timeout waiting for connection
                Err("Connection timeout".to_string())
            }
        }
    }
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

fn emit_reconnect_status(
    app_handle: &tauri::AppHandle,
    session_id: &str,
    status: &ReconnectStatus,
) {
    let event_name = format!("session:{}:reconnect", session_id);
    if let Err(e) = app_handle.emit(&event_name, status) {
        debug!(
            session_id = %session_id,
            error = %e,
            "Failed to emit reconnect status"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculate_delay() {
        let controller = ReconnectController::new(
            "test".to_string(),
            SessionConfig {
                host: "localhost".to_string(),
                port: 22,
                protocol: Protocol::Ssh,
                username: "test".to_string(),
                password: "test".to_string(),
                cols: 80,
                rows: 24,
            },
            ReconnectPolicy {
                enabled: true,
                max_retries: 10,
                initial_delay_ms: 2000,
                max_delay_ms: 60000,
                backoff_multiplier: 1.5,
            },
        );

        // First attempt: 2000ms
        assert_eq!(controller.calculate_delay(1), 2000);
        // Second attempt: 2000 * 1.5 = 3000ms
        assert_eq!(controller.calculate_delay(2), 3000);
        // Third attempt: 3000 * 1.5 = 4500ms
        assert_eq!(controller.calculate_delay(3), 4500);
        // Should cap at max_delay_ms
        assert!(controller.calculate_delay(20) <= 60000);
    }
}
