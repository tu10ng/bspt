use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;
use thiserror::Error;
use tokio::sync::mpsc;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Ssh,
    Telnet,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Connecting,
    Connected,
    Authenticating,
    Ready,
    Disconnected,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionConfig {
    pub host: String,
    pub port: u16,
    pub protocol: Protocol,
    pub username: String,
    pub password: String,
    pub cols: u32,
    pub rows: u32,
}

#[derive(Debug, Error)]
pub enum SessionError {
    #[error("Session not found: {0}")]
    NotFound(String),
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    #[error("Authentication failed: {0}")]
    AuthenticationFailed(String),
    #[error("Channel error: {0}")]
    ChannelError(String),
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

impl From<SessionError> for String {
    fn from(err: SessionError) -> String {
        err.to_string()
    }
}

pub struct SessionHandle {
    pub id: String,
    #[allow(dead_code)]
    pub config: SessionConfig,
    #[allow(dead_code)]
    pub state: SessionState,
    pub input_tx: mpsc::Sender<Vec<u8>>,
    pub shutdown_tx: mpsc::Sender<()>,
    pub resize_tx: mpsc::Sender<(u32, u32)>,
}

pub struct SessionManager {
    sessions: DashMap<String, Arc<SessionHandle>>,
    app_handle: AppHandle,
}

impl SessionManager {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            sessions: DashMap::new(),
            app_handle,
        }
    }

    pub fn app_handle(&self) -> &AppHandle {
        &self.app_handle
    }

    pub fn generate_session_id() -> String {
        Uuid::new_v4().to_string()
    }

    pub fn insert(&self, handle: SessionHandle) {
        let id = handle.id.clone();
        self.sessions.insert(id, Arc::new(handle));
    }

    pub fn get(&self, session_id: &str) -> Option<Arc<SessionHandle>> {
        self.sessions.get(session_id).map(|r| Arc::clone(&r))
    }

    pub fn remove(&self, session_id: &str) -> Option<Arc<SessionHandle>> {
        self.sessions.remove(session_id).map(|(_, v)| v)
    }

    pub async fn send_data(&self, session_id: &str, data: Vec<u8>) -> Result<(), SessionError> {
        let handle = self
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        handle
            .input_tx
            .send(data)
            .await
            .map_err(|e| SessionError::ChannelError(e.to_string()))
    }

    pub async fn resize(
        &self,
        session_id: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(), SessionError> {
        let handle = self
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        handle
            .resize_tx
            .send((cols, rows))
            .await
            .map_err(|e| SessionError::ChannelError(e.to_string()))
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<(), SessionError> {
        let handle = self
            .get(session_id)
            .ok_or_else(|| SessionError::NotFound(session_id.to_string()))?;

        let _ = handle.shutdown_tx.send(()).await;
        self.remove(session_id);
        Ok(())
    }
}
