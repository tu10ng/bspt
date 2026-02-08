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
- `greet` command (placeholder)
- Window vibrancy setup (Windows-only via `window_vibrancy`)
- Acrylic effect: `apply_acrylic(&window, Some((18, 18, 18, 125)))`

## Window Transparency

### Windows
```rust
use window_vibrancy::apply_acrylic;
apply_acrylic(&window, Some((r, g, b, alpha)))
```

### Linux
Requires compositor support. Use `set_decorations(false)` + CSS transparency.
No native vibrancy API - rely on frontend blur effects.

## Planned Modules

### session.rs
SSH/Telnet session management:
- `dashmap` for concurrent session storage
- Tokio async I/O
- Protocol abstraction (SSH vs Telnet)

### vrp.rs
Huawei VRP-specific handling:
- `---- More ----` pagination (auto-send Space)
- View detection: `<Huawei>` (User) vs `[Huawei]` (System)
- VT100 TAB completion (`\x08` backspace sequences)
- `screen-length 0 temporary` command

### tracer.rs
Log-to-code linkage for debugging visualization.

## Async Patterns
```rust
use tokio::sync::mpsc;
use dashmap::DashMap;

// Shared state across commands
struct AppState {
    sessions: DashMap<String, Session>,
}
```

## Guidelines
- Use `async` for I/O-bound operations
- Prefer `DashMap` over `Mutex<HashMap>` for concurrent access
- See root `CLAUDE.md` for VRP handling requirements
