# Components Module

Frontend React components for BSPT terminal interface.

## Patterns

### Component Structure
- Functional components with hooks
- TypeScript for all components
- Import stores from `../stores/`

### Styling
- **Tailwind CSS** for utility classes
- **CSS variables** in `index.css` for theming
- Custom component classes in `App.css`

### UI Libraries
- **Radix UI** for accessible primitives (`@radix-ui/react-slider`)
- **react-arborist** for tree views

## Current Components

### ThemeControls.tsx
Theme customization panel with:
- Mode selector: glass | solid | image
- Opacity slider (0-100%)
- Blur slider (0-50px)

Uses `useThemeStore` hook for state management.

### Terminal/TerminalArea.tsx
Container for multi-tab terminal management:
- Renders TabBar for tab navigation
- Renders ALL terminals with valid sessions (not just active)
- Uses CSS `display: none/block` for visibility control
- Preserves terminal content across tab switches
- Sets up tab close listener for pool cleanup
- Handles tab reconnect/disconnect via Tauri IPC

**Tab Disconnect:** Disconnects individual sessions directly via `invoke("disconnect_session")` using the tab's own `sessionId`. Does NOT use `disconnectNode()` to avoid affecting other tabs sharing the same node.

### Terminal/TabBar.tsx
Chrome-style tab bar with drag-drop reordering:
- Protocol badges: `[S]` SSH, `[T]` Telnet
- Connection state per-tab (based on `tab.sessionId`, not node state)
- Reconnect button for disconnected tabs
- Right-click context menu (TabContextMenu)
- Drag-drop tab reordering

**Connection State:** Each tab's connection status is determined solely by `!!tab.sessionId`. This allows multiple tabs for the same node to have independent connection states.

### Terminal/TabContextMenu.tsx
Context menu for tabs:
- Connect / Disconnect
- Close Tab

Uses `createPortal` to render at document body level, ensuring correct `position: fixed` behavior regardless of ancestor CSS transforms.

### Terminal/UnifiedTerminal.tsx
xterm.js wrapper with WebGL rendering and instance pooling:
- Transparent background (`#00000000`)
- Dracula-inspired color theme
- FitAddon for responsive sizing
- SearchAddon for find functionality
- WebglAddon for GPU acceleration
- ResizeObserver with debouncing (100ms)
- Tauri event listeners for session data
- **Terminal Pool**: Instances persist across tab switches via `useTerminalPool`

**Props:**
- `sessionId: string` - Backend session identifier
- `activeMarkerId?: string | null` - Highlighted block marker

**Events Listened:**
- `session:{sessionId}` - Terminal data (Uint8Array)
- `session:{sessionId}:state` - Connection state changes

**Instance Pool Architecture:**
```
Tab Switch A → B:
1. UnifiedTerminal unmounts for session A
2. Terminal instance stays in pool (not disposed)
3. DOM element detached, React handlers disposed
4. Tauri listeners persist in pool

Tab Switch B → A:
1. UnifiedTerminal mounts for session A
2. Finds existing instance in pool
3. Reattaches DOM element
4. Sets up fresh React handlers
5. Buffer content preserved!
```

### Sidebar/SessionTree.tsx
react-arborist tree for session management:
- Router nodes with board children
- Protocol badges: `[S]` SSH, `[T]` Telnet
- Connection state indicators (green/yellow/red dots)
- VRP view indicator for connected routers
- Double-click to connect
- Right-click context menu

Uses `useSessionTreeStore` for state.

### Sidebar/TreeContextMenu.tsx
Context menu for tree nodes:
- Connect / Disconnect
- Scan Boards (routers only)
- Switch Protocol (SSH ↔ Telnet)
- Remove

Positioned at click coordinates, closes on outside click or Escape.

## CSS Classes

### Session Tree
```css
.session-tree-container   /* Tree wrapper */
.tree-node                /* Node row */
.tree-node-active         /* Selected node */
.tree-node-content        /* Icon + name container */
.state-indicator          /* Connection dot */
.state-connected          /* Green with glow */
.state-connecting         /* Yellow, pulsing */
.state-error              /* Red */
.state-disconnected       /* Gray */
.protocol-badge           /* [S] or [T] badge */
.vrp-indicator            /* <> [] [~] view indicator */
```

### Context Menu
```css
.context-menu             /* Menu container */
.context-menu-item        /* Menu button */
.context-menu-item-danger /* Red text for Remove */
.context-menu-separator   /* Divider line */
```

### Terminal Area
```css
.terminal-area-container  /* Flex column container */
.terminal-content         /* Terminal panels container */
.terminal-tab-panel       /* Individual terminal wrapper (absolute positioned) */
.tab-bar                  /* Chrome-style tab bar */
.tab-item                 /* Individual tab */
.tab-active               /* Active tab styling */
```

## Planned Components

### Terminal/Block.tsx
Collapsible command/response blocks:
- Command header with timestamp
- Status gutter (success/error/running)
- Expandable output area

### Terminal/InputOverlay.tsx
Fish-like command input:
- Floating input field with inline ghost text suggestions
- History-based autocomplete with smart sorting:
  - Recent (default), frequency, or combined scoring
  - Automatic deduplication
  - Configurable via blockStore
- Tab/Right-arrow to accept suggestion
- VRP command suggestions (planned)

### Panel/FlowPanel.tsx
React Flow visualization for log tracing:
- Call graph nodes
- Source location links
- VS Code deep linking

## Guidelines
- Keep components focused and composable
- Use Zustand stores for shared state (not prop drilling)
- Handle cleanup in useEffect return
- See root `CLAUDE.md` for xterm.js transparency setup
