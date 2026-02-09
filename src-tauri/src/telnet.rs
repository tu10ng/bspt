use crate::session::{SessionConfig, SessionError, SessionHandle, SessionManager, SessionState};
use std::sync::Arc;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

// Telnet protocol constants
const IAC: u8 = 255; // Interpret As Command
const DONT: u8 = 254;
const DO: u8 = 253;
const WONT: u8 = 252;
const WILL: u8 = 251;
const SB: u8 = 250; // Sub-negotiation Begin
const SE: u8 = 240; // Sub-negotiation End

// Telnet options
const OPT_ECHO: u8 = 1;
const OPT_SUPPRESS_GO_AHEAD: u8 = 3;
const OPT_TERMINAL_TYPE: u8 = 24;
const OPT_NAWS: u8 = 31; // Negotiate About Window Size

struct TelnetParser {
    state: TelnetParseState,
    subneg_option: u8,
    subneg_data: Vec<u8>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum TelnetParseState {
    Normal,
    Iac,
    Will,
    Wont,
    Do,
    Dont,
    Sb,
    SbData,
    SbIac,
}

impl TelnetParser {
    fn new() -> Self {
        Self {
            state: TelnetParseState::Normal,
            subneg_option: 0,
            subneg_data: Vec::new(),
        }
    }

    fn parse(&mut self, input: &[u8]) -> (Vec<u8>, Vec<TelnetCommand>) {
        let mut output = Vec::with_capacity(input.len());
        let mut commands = Vec::new();

        for &byte in input {
            match self.state {
                TelnetParseState::Normal => {
                    if byte == IAC {
                        self.state = TelnetParseState::Iac;
                    } else {
                        output.push(byte);
                    }
                }
                TelnetParseState::Iac => match byte {
                    IAC => {
                        output.push(IAC);
                        self.state = TelnetParseState::Normal;
                    }
                    WILL => self.state = TelnetParseState::Will,
                    WONT => self.state = TelnetParseState::Wont,
                    DO => self.state = TelnetParseState::Do,
                    DONT => self.state = TelnetParseState::Dont,
                    SB => self.state = TelnetParseState::Sb,
                    SE => self.state = TelnetParseState::Normal,
                    _ => self.state = TelnetParseState::Normal,
                },
                TelnetParseState::Will => {
                    commands.push(TelnetCommand::Will(byte));
                    self.state = TelnetParseState::Normal;
                }
                TelnetParseState::Wont => {
                    commands.push(TelnetCommand::Wont(byte));
                    self.state = TelnetParseState::Normal;
                }
                TelnetParseState::Do => {
                    commands.push(TelnetCommand::Do(byte));
                    self.state = TelnetParseState::Normal;
                }
                TelnetParseState::Dont => {
                    commands.push(TelnetCommand::Dont(byte));
                    self.state = TelnetParseState::Normal;
                }
                TelnetParseState::Sb => {
                    self.subneg_option = byte;
                    self.subneg_data.clear();
                    self.state = TelnetParseState::SbData;
                }
                TelnetParseState::SbData => {
                    if byte == IAC {
                        self.state = TelnetParseState::SbIac;
                    } else {
                        self.subneg_data.push(byte);
                    }
                }
                TelnetParseState::SbIac => {
                    if byte == SE {
                        commands.push(TelnetCommand::Subnegotiation(
                            self.subneg_option,
                            std::mem::take(&mut self.subneg_data),
                        ));
                        self.state = TelnetParseState::Normal;
                    } else if byte == IAC {
                        self.subneg_data.push(IAC);
                        self.state = TelnetParseState::SbData;
                    } else {
                        self.state = TelnetParseState::Normal;
                    }
                }
            }
        }

        (output, commands)
    }
}

#[derive(Debug)]
#[allow(dead_code)]
enum TelnetCommand {
    Will(u8),
    Wont(u8),
    Do(u8),
    Dont(u8),
    Subnegotiation(u8, Vec<u8>),
}

fn build_response(commands: &[TelnetCommand], cols: u32, rows: u32) -> Vec<u8> {
    let mut response = Vec::new();

    for cmd in commands {
        match cmd {
            TelnetCommand::Will(opt) => {
                // Acknowledge WILL for options we support
                match *opt {
                    OPT_ECHO | OPT_SUPPRESS_GO_AHEAD => {
                        response.extend_from_slice(&[IAC, DO, *opt]);
                    }
                    _ => {
                        response.extend_from_slice(&[IAC, DONT, *opt]);
                    }
                }
            }
            TelnetCommand::Do(opt) => {
                // Handle DO requests
                match *opt {
                    OPT_TERMINAL_TYPE => {
                        response.extend_from_slice(&[IAC, WILL, OPT_TERMINAL_TYPE]);
                    }
                    OPT_NAWS => {
                        // Agree to NAWS and send window size
                        response.extend_from_slice(&[IAC, WILL, OPT_NAWS]);
                        response.extend_from_slice(&build_naws(cols, rows));
                    }
                    OPT_SUPPRESS_GO_AHEAD => {
                        response.extend_from_slice(&[IAC, WILL, OPT_SUPPRESS_GO_AHEAD]);
                    }
                    _ => {
                        response.extend_from_slice(&[IAC, WONT, *opt]);
                    }
                }
            }
            TelnetCommand::Subnegotiation(opt, data) => {
                if *opt == OPT_TERMINAL_TYPE && !data.is_empty() && data[0] == 1 {
                    // Terminal type request (SEND)
                    response.extend_from_slice(&[
                        IAC,
                        SB,
                        OPT_TERMINAL_TYPE,
                        0, // IS
                    ]);
                    response.extend_from_slice(b"xterm-256color");
                    response.extend_from_slice(&[IAC, SE]);
                }
            }
            _ => {}
        }
    }

    response
}

fn build_naws(cols: u32, rows: u32) -> Vec<u8> {
    let cols = cols as u16;
    let rows = rows as u16;
    let mut naws = vec![IAC, SB, OPT_NAWS];

    // Width (2 bytes, big endian)
    let width_hi = (cols >> 8) as u8;
    let width_lo = (cols & 0xFF) as u8;
    if width_hi == IAC {
        naws.push(IAC);
    }
    naws.push(width_hi);
    if width_lo == IAC {
        naws.push(IAC);
    }
    naws.push(width_lo);

    // Height (2 bytes, big endian)
    let height_hi = (rows >> 8) as u8;
    let height_lo = (rows & 0xFF) as u8;
    if height_hi == IAC {
        naws.push(IAC);
    }
    naws.push(height_hi);
    if height_lo == IAC {
        naws.push(IAC);
    }
    naws.push(height_lo);

    naws.extend_from_slice(&[IAC, SE]);
    naws
}

pub async fn run_telnet_session(
    session_id: String,
    config: SessionConfig,
    manager: Arc<SessionManager>,
) -> Result<(), SessionError> {
    let app_handle = manager.app_handle().clone();

    // Create channels for communication
    let (input_tx, mut input_rx) = mpsc::channel::<Vec<u8>>(256);
    let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);
    let (resize_tx, mut resize_rx) = mpsc::channel::<(u32, u32)>(16);

    // Store session handle
    let handle = SessionHandle {
        id: session_id.clone(),
        config: config.clone(),
        state: SessionState::Connecting,
        input_tx,
        shutdown_tx,
        resize_tx,
    };
    manager.insert(handle);

    // Emit connecting state
    emit_state(&app_handle, &session_id, SessionState::Connecting);

    // Connect to server
    let addr = format!("{}:{}", config.host, config.port);
    info!(session_id = %session_id, addr = %addr, "Connecting to Telnet server");

    let stream = match TcpStream::connect(&addr).await {
        Ok(stream) => stream,
        Err(e) => {
            error!(session_id = %session_id, error = %e, "Telnet connection failed");
            emit_state(&app_handle, &session_id, SessionState::Error);
            manager.remove(&session_id);
            return Err(SessionError::ConnectionFailed(e.to_string()));
        }
    };

    emit_state(&app_handle, &session_id, SessionState::Connected);
    emit_state(&app_handle, &session_id, SessionState::Ready);
    info!(session_id = %session_id, "Telnet session ready");

    let (mut reader, mut writer) = stream.into_split();
    let mut parser = TelnetParser::new();
    let mut read_buf = [0u8; 4096];
    let mut current_cols = config.cols;
    let mut current_rows = config.rows;

    loop {
        tokio::select! {
            // Read from server
            result = reader.read(&mut read_buf) => {
                match result {
                    Ok(0) => {
                        info!(session_id = %session_id, "Server closed connection");
                        break;
                    }
                    Ok(n) => {
                        let (data, commands) = parser.parse(&read_buf[..n]);

                        // Handle telnet commands
                        if !commands.is_empty() {
                            let response = build_response(&commands, current_cols, current_rows);
                            if !response.is_empty() {
                                if let Err(e) = writer.write_all(&response).await {
                                    warn!(session_id = %session_id, error = %e, "Failed to send telnet response");
                                }
                            }
                        }

                        // Forward clean data to frontend
                        if !data.is_empty() {
                            let event_name = format!("session:{}", session_id);
                            debug!(session_id = %session_id, bytes = data.len(), "Received data from Telnet");
                            if let Err(e) = app_handle.emit(&event_name, data) {
                                error!(session_id = %session_id, error = %e, "Failed to emit data event");
                            }
                        }
                    }
                    Err(e) => {
                        error!(session_id = %session_id, error = %e, "Read error");
                        break;
                    }
                }
            }

            // Handle input from frontend
            Some(data) = input_rx.recv() => {
                debug!(session_id = %session_id, bytes = data.len(), "Sending data to Telnet");
                if let Err(e) = writer.write_all(&data).await {
                    error!(session_id = %session_id, error = %e, "Failed to send data");
                    break;
                }
            }

            // Handle resize requests
            Some((cols, rows)) = resize_rx.recv() => {
                debug!(session_id = %session_id, cols = cols, rows = rows, "Resizing terminal");
                current_cols = cols;
                current_rows = rows;
                let naws = build_naws(cols, rows);
                if let Err(e) = writer.write_all(&naws).await {
                    warn!(session_id = %session_id, error = %e, "Failed to send NAWS");
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
    info!(session_id = %session_id, "Telnet session ending");
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
