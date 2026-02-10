# Stores Module

Zustand state management for BSPT frontend.

## Patterns

### Store Creation
```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const useMyStore = create<MyState>()(
  persist(
    (set) => ({
      // State
      value: defaultValue,
      // Actions
      setValue: (value) => set({ value }),
    }),
    { name: "bspt-storename" }  // localStorage key
  )
);
```

### Conventions
- Export type definitions (`ThemeMode`, `ThemeState`)
- Validate inputs in setters (e.g., `Math.max(0, Math.min(1, opacity))`)
- Use `persist` middleware for user preferences

## Current Stores

### themeStore.ts
Visual customization state:
- `mode`: "glass" | "solid" | "image"
- `opacity`: 0-1 (background transparency)
- `blur`: 0-50px (backdrop blur)
- `fontFamily`: terminal font
- `backgroundImage`: optional URL

Persisted to `bspt-theme` in localStorage.

### sessionTreeStore.ts
Session tree management with VRP event handling:

**State:**
- `routers`: Map<string, RouterNode> - Router configurations
- `activeNodeId`: Currently selected node
- `activeSessionId`: Active session for terminal display
- `vrpListeners`: VRP event listener cleanup functions

**CRUD Actions:**
- `addRouter(data)` - Add new router node
- `updateRouter(id, updates)` - Update router properties
- `removeRouter(id)` - Remove router and disconnect
- `addBoard(routerId, data)` - Add board to router
- `updateBoard(routerId, boardId, updates)` - Update board
- `removeBoard(routerId, boardId)` - Remove board

**Connection Actions:**
- `connectNode(nodeId)` - Create session via Tauri IPC
- `disconnectNode(nodeId)` - Close session
- `setActiveNode(nodeId)` - Select node for terminal display

**VRP Actions:**
- `scanBoards(routerId)` - Send `display device` command
- `switchProtocol(nodeId, protocol)` - Toggle SSH/Telnet

**Helpers:**
- `getTreeData()` - Convert to react-arborist format
- `findNodeById(id)` - Find router or board by ID
- `getActiveSession()` - Get active node and session ID

Persisted to `bspt-session-tree` in localStorage (connection state reset on load).

## Planned Stores

### terminalStore
Terminal instance state:
- Active terminal ID
- Terminal dimensions
- Input history

### blockStore.ts
Block-based command/response tracking:

**State:**
- `markers`: Record<sessionId, BlockMarker[]> - Command markers with line positions
- `commandFrequency`: Record<sessionId, Record<command, count>> - Usage frequency
- `suggestionConfig`: { sortBy, maxSuggestions } - History algorithm config

**Marker Actions:**
- `createMarker(sessionId, command, startLine)` - Create new command block
- `completeMarker(markerId, endLine, status)` - Mark block complete
- `toggleCollapse(markerId)` / `collapseAll` / `expandAll` - Block visibility

**History Suggestion Algorithm:**
- `getCommandHistory(sessionId)` - Returns deduplicated, sorted command list
- Sorting strategies (`suggestionConfig.sortBy`):
  - `"recent"` - Most recently used first (default)
  - `"frequency"` - Most frequently used first
  - `"combined"` - Weighted score: recency decay × frequency
- `setSuggestionSortBy(sortBy)` / `setMaxSuggestions(max)` - Config setters

Persisted to `bspt-markers` in localStorage.

### tabStore.ts
Multi-tab terminal management:

**State:**
- `tabs`: Tab[] - Open terminal tabs
- `activeTabId`: Currently active tab

**Tab Interface:**
```typescript
interface Tab {
  id: string;         // Unique tab ID
  nodeId: string;     // Session tree node ID
  sessionId: string;  // Backend session ID
  label: string;      // Display label (hostname:port)
  protocol: Protocol; // SSH | Telnet
  order: number;      // Tab order
}
```

**Actions:**
- `openTab(nodeId, sessionId, label, protocol)` - Create new tab
- `closeTab(tabId)` - Close tab, dispatches `bspt:tab-closed` event
- `setActiveTab(tabId)` - Switch to tab
- `reorderTabs(dragId, dropId)` - Drag-drop reorder
- `getTabByNodeId(nodeId)` / `getTabBySessionId(sessionId)` - Lookups

**Tab Close Event:**
When `closeTab` is called, it dispatches a custom event for terminal pool cleanup:
```typescript
window.dispatchEvent(new CustomEvent("bspt:tab-closed", {
  detail: { sessionId: tab.sessionId }
}));
```

Persisted to `bspt-tabs` in localStorage (sessionId cleared on persist).

## IPC Synchronization
For stores that sync with Rust backend:
```typescript
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Invoke commands
const sessionId = await invoke<string>("create_session", { config });

// Listen for events
const unlisten = await listen<VrpEvent>(`session:${sessionId}:vrp`, (event) => {
  // Handle VRP event
});
```

## Guidelines
- One store per domain (theme, session, terminal)
- Keep stores flat when possible
- Clear connection state on persist (don't save sessionId)
- See root `CLAUDE.md` for overall architecture
