# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BSPT** - A modern terminal for BSP developers, optimized for Huawei VRP routers and Linux boards.

## Tech Stack

- **Framework**: Tauri v2
- **Backend**: Rust + Tokio (async)
- **Frontend**: React + TypeScript + Vite
- **Terminal**: xterm.js (WebGL)
- **State**: Zustand (frontend), dashmap (backend)

## Build Commands

### Linux

```bash
# Development (recommended - uses run.sh script)
./run.sh                            # Sets GDK_BACKEND=x11 automatically

# Or manually set environment variable
GDK_BACKEND=x11 npm run tauri dev

# Build Rust backend only
cd src-tauri && cargo build

# Start frontend dev server only
npm run dev

# Production build
npm run tauri build
# Output: src-tauri/target/release/bundle/
#   - .deb (Debian/Ubuntu)
#   - .AppImage (universal)
#   - .rpm (Fedora/RHEL)
```

> **Note**: `GDK_BACKEND=x11` fixes GTK/WebKit rendering issues on Wayland compositors. Tauri uses WebKitGTK on Linux which may have compatibility problems with some Wayland environments.

### Windows

```powershell
# Development
npm run tauri dev

# Production build
npm run tauri build
# Output: src-tauri\target\release\bundle\
#   - .msi (installer)
#   - .exe (NSIS installer)
```

### Testing

```bash
cargo test                          # Rust tests
npm test                            # Frontend tests
```

## Architecture

### Layout
3x3 CSS Grid: Header | Sidebar (tree) | Terminal (center) | Panel (right) | Footer

### Terminal Model
Block-based interaction - each command/response is a collapsible block, not raw character stream.

### Session Management
Tree structure: Router (Mgmt IP) → Boards (Linux IPs). Support Telnet/SSH protocol switching.

## Critical Implementation Notes

### xterm.js Transparency
```javascript
{ allowTransparency: true, theme: { background: '#00000000' } }
```

### Huawei VRP Handling
- Auto-handle `---- More ----` pagination (send Space or `screen-length 0 temporary`)
- Detect `<Huawei>` (User View) vs `[Huawei]` (System View)
- Handle VT100 TAB completion (`\x08` backspace sequences)

### Performance
- RingBuffer backpressure for 100k+ lines
- WebGL rendering required

## Project Structure

```
bspt/
├── src-tauri/
│   └── src/
│       ├── main.rs          # Tauri entry
│       ├── session.rs       # SSH/Telnet session management
│       ├── vrp.rs           # VRP-specific handling
│       └── tracer.rs        # Log-to-code linkage
├── src/
│   ├── App.tsx              # Main layout (Grid)
│   ├── components/
│   │   ├── Terminal/        # xterm.js wrapper, blocks
│   │   ├── Sidebar/         # Session tree
│   │   └── Panel/           # React Flow visualization
│   └── stores/              # Zustand stores
└── IMPLEMENTATION_PLAN.md   # Detailed build phases
```

See `IMPLEMENTATION_PLAN.md` for detailed implementation steps and data structures.
