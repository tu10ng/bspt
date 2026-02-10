mod reconnect;
mod ringbuffer;
mod session;
mod ssh;
mod telnet;
mod tracer;
mod vrp;

use dashmap::DashMap;
use reconnect::ReconnectController;
use session::{Protocol, ReconnectPolicy, SessionConfig, SessionManager};
use std::path::Path;
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::{mpsc, Mutex};
use tracer::{IndexStats, LogTracer, SourceLocation, TracerStats};
use tracing::info;

/// Manages active reconnection attempts
struct ReconnectManager {
    /// Active reconnection cancel handles, keyed by session_id
    cancel_handles: DashMap<String, mpsc::Sender<()>>,
}

impl ReconnectManager {
    fn new() -> Self {
        Self {
            cancel_handles: DashMap::new(),
        }
    }

    fn register(&self, session_id: String, cancel_tx: mpsc::Sender<()>) {
        self.cancel_handles.insert(session_id, cancel_tx);
    }

    fn remove(&self, session_id: &str) {
        self.cancel_handles.remove(session_id);
    }

    async fn cancel(&self, session_id: &str) -> bool {
        if let Some((_, cancel_tx)) = self.cancel_handles.remove(session_id) {
            let _ = cancel_tx.send(()).await;
            true
        } else {
            false
        }
    }
}

#[tauri::command]
async fn create_session(
    config: SessionConfig,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<String, String> {
    let session_id = SessionManager::generate_session_id();
    let manager = Arc::clone(&state);

    info!(
        session_id = %session_id,
        host = %config.host,
        port = config.port,
        protocol = ?config.protocol,
        "Creating session"
    );

    let id = session_id.clone();
    let config_clone = config.clone();

    // Spawn the session task
    tokio::spawn(async move {
        let result = match config_clone.protocol {
            Protocol::Ssh => ssh::run_ssh_session(id.clone(), config_clone, manager).await,
            Protocol::Telnet => telnet::run_telnet_session(id.clone(), config_clone, manager).await,
        };

        if let Err(e) = result {
            tracing::error!(session_id = %id, error = %e, "Session error");
        }
    });

    Ok(session_id)
}

#[tauri::command]
async fn send_input(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    state.send_data(&session_id, data).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn disconnect_session(
    session_id: String,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    info!(session_id = %session_id, "Disconnecting session");
    state.disconnect(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn resize_terminal(
    session_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    state.resize(&session_id, cols, rows).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn scan_boards(
    session_id: String,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    // Send "display device" command to get board information
    // The VRP parser will detect and emit BoardInfo events
    let cmd = b"display device\r\n";
    state.send_data(&session_id, cmd.to_vec()).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_auto_pagination(
    session_id: String,
    enabled: bool,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    state.set_auto_pagination(&session_id, enabled).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn notify_buffer_drained(
    session_id: String,
    state: tauri::State<'_, Arc<SessionManager>>,
) -> Result<(), String> {
    state.notify_drained(&session_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn index_source_directory(
    path: String,
    state: tauri::State<'_, Arc<Mutex<LogTracer>>>,
) -> Result<IndexStats, String> {
    info!(path = %path, "Indexing source directory");
    let mut tracer = state.lock().await;
    tracer
        .index_directory(Path::new(&path))
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn match_log_line(
    line: String,
    state: tauri::State<'_, Arc<Mutex<LogTracer>>>,
) -> Result<Option<SourceLocation>, String> {
    let tracer = state.lock().await;
    Ok(tracer.match_log(&line).cloned())
}

#[tauri::command]
async fn get_tracer_stats(
    state: tauri::State<'_, Arc<Mutex<LogTracer>>>,
) -> Result<TracerStats, String> {
    let tracer = state.lock().await;
    Ok(tracer.get_stats())
}

/// Attempt to reconnect a session with the given configuration
/// Uses exponential backoff strategy
#[tauri::command]
async fn reconnect_session(
    session_id: String,
    config: SessionConfig,
    policy: Option<ReconnectPolicy>,
    session_state: tauri::State<'_, Arc<SessionManager>>,
    reconnect_state: tauri::State<'_, Arc<ReconnectManager>>,
) -> Result<String, String> {
    let policy = policy.unwrap_or_default();
    let manager = Arc::clone(&session_state);

    info!(
        session_id = %session_id,
        host = %config.host,
        port = config.port,
        protocol = ?config.protocol,
        "Starting reconnection"
    );

    let controller = ReconnectController::new(session_id.clone(), config, policy);

    // Register cancel handle
    reconnect_state.register(session_id.clone(), controller.get_cancel_handle());

    // Run reconnection
    let result = controller.run(manager).await;

    // Clean up cancel handle
    reconnect_state.remove(&session_id);

    result
}

/// Cancel an ongoing reconnection attempt
#[tauri::command]
async fn cancel_reconnect(
    session_id: String,
    reconnect_state: tauri::State<'_, Arc<ReconnectManager>>,
) -> Result<bool, String> {
    info!(session_id = %session_id, "Cancelling reconnection");
    Ok(reconnect_state.cancel(&session_id).await)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("bspt=debug".parse().unwrap())
                .add_directive("russh=info".parse().unwrap()),
        )
        .init();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let session_manager = SessionManager::new(app.handle().clone());
            app.manage(Arc::new(session_manager));

            // Initialize ReconnectManager for managing reconnection attempts
            let reconnect_manager = ReconnectManager::new();
            app.manage(Arc::new(reconnect_manager));

            // Initialize LogTracer for log-to-source mapping
            let log_tracer = LogTracer::new();
            app.manage(Arc::new(Mutex::new(log_tracer)));

            #[cfg(target_os = "windows")]
            {
                use window_vibrancy::apply_acrylic;
                let window = app.get_webview_window("main").unwrap();
                apply_acrylic(&window, Some((18, 18, 18, 125)))
                    .expect("Unsupported platform! 'apply_acrylic' is only supported on Windows");
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_session,
            send_input,
            disconnect_session,
            resize_terminal,
            scan_boards,
            set_auto_pagination,
            notify_buffer_drained,
            index_source_directory,
            match_log_line,
            get_tracer_stats,
            reconnect_session,
            cancel_reconnect
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
