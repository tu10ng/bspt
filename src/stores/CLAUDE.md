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

## Planned Stores

### sessionStore
Session tree management:
- Active connections (SSH/Telnet)
- Router → Board hierarchy
- Connection status

### terminalStore
Terminal instance state:
- Active terminal ID
- Terminal dimensions
- Input history

### blockStore
Block-based command/response tracking:
- Command blocks with timestamps
- Collapsible output blocks
- Search/filter state

## IPC Synchronization
For stores that sync with Rust backend:
```typescript
import { invoke } from "@tauri-apps/api/core";

// In action
setValue: async (value) => {
  await invoke("set_backend_value", { value });
  set({ value });
}
```

## Guidelines
- One store per domain (theme, session, terminal)
- Keep stores flat when possible
- See root `CLAUDE.md` for overall architecture
