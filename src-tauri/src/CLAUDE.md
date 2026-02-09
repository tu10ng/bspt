# Rust Backend Module

Tauri v2 backend for BSPT terminal.

## Patterns

### Tauri Commands
```rust
#[tauri::command]
fn command_name(param: &str) -> Result<String, String> {
    // Sync command
}

#[tauri::command]
async fn async_command(param: String) -> Result<Data, String> {
    // Async with Tokio
}
```

Register in `lib.rs`:
```rust
.invoke_handler(tauri::generate_handler![command1, command2])
```

### Error Handling
Return `Result<T, String>` for commands - errors become JS exceptions.

## Current Implementation

### main.rs
Entry point with Windows subsystem attribute to hide console.

### lib.rs
Tauri commands and app setup:
- `create_session` - Create SSH/Telnet session
- `send_input` - Send data to session
- `disconnect_session` - Close session
- `resize_terminal` - PTY resize (NAWS for Telnet)
- `scan_boards` - Send `display device` command
- `set_auto_pagination` - Toggle VRP auto-pagination
- Window vibrancy setup (Windows-only via `window_vibrancy`)

### session.rs
Session management with DashMap:
- `SessionManager` - Concurrent session storage
- `SessionHandle` - Channels for input, shutdown, resize, auto_pagination
- `SessionConfig` - Host, port, protocol, credentials
- `SessionState` - Connecting, Connected, Ready, Disconnected, Error

### ssh.rs
SSH client using `russh`:
- Password authentication
- PTY allocation with xterm-256color
- Async data flow via Tauri events
- Window resize support

### telnet.rs
Telnet client with VRP integration:
- Telnet protocol negotiation (IAC, WILL/WONT, DO/DONT)
- NAWS (window size) support
- Terminal type negotiation (xterm-256color)
- VRP parser integration for Huawei routers

### vrp.rs
Huawei VRP-specific handling:
- `VrpParser` - Stream parser for VRP output
- `VrpView` enum - User, System, Interface view detection
- `VrpEvent` - View changes, pagination, board info
- Regex patterns for:
  - `---- More ----` pagination (auto-send Space)
  - `<Huawei>` (User View) detection
  - `[Huawei]` (System View) detection
  - `[Huawei-interface]` (Interface View) detection
  - Board parsing from `display device` output

## Window Transparency

### Windows
```rust
use window_vibrancy::apply_acrylic;
apply_acrylic(&window, Some((r, g, b, alpha)))
```

### Linux
Requires compositor support. Use `set_decorations(false)` + CSS transparency.
No native vibrancy API - rely on frontend blur effects.

## Async Patterns
```rust
use tokio::sync::mpsc;
use dashmap::DashMap;

// Shared state across commands
struct SessionManager {
    sessions: DashMap<String, Arc<SessionHandle>>,
    app_handle: AppHandle,
}
```

## Event Emission
Sessions emit events to frontend:
- `session:{id}` - Terminal data (Vec<u8>)
- `session:{id}:state` - Connection state changes
- `session:{id}:vrp` - VRP events (view changes, pagination, board info)

## Planned Modules

### tracer.rs
Log-to-code linkage for debugging visualization:
- tree-sitter for C code parsing
- aho-corasick for log matching
- Source location mapping

## Guidelines
- Use `async` for I/O-bound operations
- Prefer `DashMap` over `Mutex<HashMap>` for concurrent access
- Emit events to frontend via `app_handle.emit()`
- See root `CLAUDE.md` for VRP handling requirements
