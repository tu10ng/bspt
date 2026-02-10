# Hooks Module

Custom React hooks for BSPT terminal interface.

## Current Hooks

### useTerminalPool.ts
Terminal instance pool for preserving content across tab switches.

**Exports:**
- `useTerminalPool()` - Hook returning pool access methods
- `cleanupTerminalInstance(sessionId)` - Cleanup helper
- `setupTabCloseListener()` - Event listener setup for tab close cleanup

**Pool Methods:**
```typescript
const pool = useTerminalPool();
pool.get(sessionId)    // Get terminal instance
pool.set(sessionId, instance)  // Store instance
pool.has(sessionId)    // Check existence
pool.delete(sessionId) // Cleanup and remove
pool.keys()            // All session IDs
pool.size()            // Pool size
```

**TerminalInstance Interface:**
```typescript
interface TerminalInstance {
  terminal: Terminal;           // xterm.js instance
  containerDiv: HTMLDivElement; // DOM container
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
  searchAddon: SearchAddon;
  detector: BlockDetector;
  unlistenData?: UnlistenFn;    // Tauri event listener
  unlistenState?: UnlistenFn;
  disposables: Array<{ dispose: () => void }>; // React handlers
}
```

**Lifecycle:**
1. New session: Create terminal, store in pool
2. Tab switch away: Detach DOM, dispose React handlers, keep instance
3. Tab switch back: Reattach DOM, setup fresh React handlers
4. Tab close: Dispatch `bspt:tab-closed` event, pool cleans up

### useGutterSync.ts
Syncs gutter overlay scroll position with xterm.js viewport.

**Returns:**
```typescript
interface GutterSyncState {
  scrollTop: number;    // Pixel offset
  cellHeight: number;   // Line height in pixels
  cellWidth: number;    // Character width
  viewportRows: number; // Visible rows
  bufferLine: number;   // Top line index in buffer
}
```

**Usage:**
```typescript
const gutterSync = useGutterSync(terminalRef.current);
// gutterSync.cellHeight === 0 means not initialized
```

### useCollapsedRanges.ts
Calculates collapsed block ranges for visual hiding.

**Returns:** `CollapsedRange[]` with markerId, startLine, hiddenCount

### useKeywordHighlighter.ts
Keyword highlighting for terminal output.

## Guidelines
- Hooks should be pure and composable
- Use refs for values that shouldn't trigger re-renders
- Clean up subscriptions in useEffect return
- Initialize state to indicate "not ready" (e.g., cellHeight: 0)
