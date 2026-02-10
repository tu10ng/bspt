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

### Terminal/Terminal.tsx
xterm.js wrapper with WebGL rendering:
- Transparent background (`#00000000`)
- Dracula-inspired color theme
- FitAddon for responsive sizing
- SearchAddon for find functionality
- WebglAddon for GPU acceleration
- ResizeObserver for container changes
- Tauri event listeners for session data

**Props:**
- `sessionId: string` - Backend session identifier

**Events Listened:**
- `session:{sessionId}` - Terminal data (Uint8Array)
- `session:{sessionId}:state` - Connection state changes

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
