mod session;
mod ssh;
mod telnet;

use session::{Protocol, SessionConfig, SessionManager};
use std::sync::Arc;
use tauri::Manager;
use tracing::info;

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
            resize_terminal
        ]);

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
