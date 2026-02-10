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
GDK_BACKEND=x11 pnpm tauri dev

# Build Rust backend only
cd src-tauri && cargo build

# Start frontend dev server only
pnpm dev

# Production build
pnpm tauri build
# Output: src-tauri/target/release/bundle/
#   - .deb (Debian/Ubuntu)
#   - .AppImage (universal)
#   - .rpm (Fedora/RHEL)
```

> **Note**: `GDK_BACKEND=x11` fixes GTK/WebKit rendering issues on Wayland compositors. Tauri uses WebKitGTK on Linux which may have compatibility problems with some Wayland environments.

### Windows

```powershell
# Development
pnpm tauri dev

# Production build
pnpm tauri build
# Output: src-tauri\target\release\bundle\
#   - .msi (installer)
#   - .exe (NSIS installer)
```

### Testing

```bash
cargo test                          # Rust tests
pnpm test                           # Frontend tests
```

### CI/CD

GitHub Actions 自动构建，推送 tag 时触发：

```bash
git tag v0.1.0
git push origin v0.1.0
```

构建产物自动上传到 GitHub Releases (草稿状态)：
- **Linux**: `.deb`, `.AppImage`, `.rpm`
- **Windows**: `.msi`, `.exe`

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
├── .github/
│   └── workflows/
│       └── build.yml           # CI/CD multi-platform build
├── src-tauri/
│   └── src/
│       ├── main.rs             # Tauri entry
│       ├── lib.rs              # Tauri commands & setup
│       ├── ringbuffer.rs       # Backpressure buffer for high-throughput
│       ├── session.rs          # Session management with DashMap
│       ├── ssh.rs              # SSH client (russh)
│       ├── telnet.rs           # Telnet client with VRP integration
│       └── vrp.rs              # VRP parser (pagination, view detection)
├── src/
│   ├── App.tsx                 # Main layout (Grid)
│   ├── App.css                 # Grid & component styles
│   ├── types/
│   │   ├── session.ts          # RouterNode, LinuxBoardNode, VrpEvent
│   │   └── index.ts            # Barrel export
│   ├── components/
│   │   ├── Terminal/
│   │   │   ├── Terminal.tsx    # xterm.js wrapper with WebGL
│   │   │   └── index.ts
│   │   ├── Sidebar/
│   │   │   ├── SessionTree.tsx # react-arborist tree
│   │   │   ├── TreeContextMenu.tsx
│   │   │   └── index.ts
│   │   └── ThemeControls.tsx   # Theme sliders
│   └── stores/
│       ├── themeStore.ts       # Theme persistence
│       └── sessionTreeStore.ts # Session tree with VRP events
└── IMPLEMENTATION_PLAN.md      # Detailed build phases
```

See `IMPLEMENTATION_PLAN.md` for detailed implementation steps and data structures.

## Implementation Status

- **Phase 1**: Project Foundation - COMPLETE
- **Phase 2**: Terminal Core - COMPLETE
- **Phase 3**: Session Manager - COMPLETE
- **Phase 4**: Block-Based Terminal - COMPLETE (RingBuffer backpressure done)
- **Phase 5**: Log Tracer & Code Linkage - Planned
