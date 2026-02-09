# Types Module

TypeScript type definitions for BSPT frontend.

## session.ts

### Node Types
```typescript
RouterNode {
  id: string;
  type: "router";
  name: string;
  mgmtIp: string;
  port: number;
  protocol: Protocol;
  authProfileId: string | null;
  username: string;
  password: string;
  connectionState: ConnectionState;
  sessionId: string | null;
  vrpView: VrpView;
  boards: LinuxBoardNode[];
}

LinuxBoardNode {
  id: string;
  type: "board";
  slotId: string;
  ip: string;
  name: string;
  protocol: Protocol;
  connectionState: ConnectionState;
  sessionId: string | null;
}
```

### Enums
```typescript
Protocol = "ssh" | "telnet"

ConnectionState = "disconnected" | "connecting" | "connected"
                | "authenticating" | "ready" | "error"

VrpView = "user" | "system" | "interface" | "unknown"
```

### VRP Events (from Rust backend)
```typescript
VrpEvent {
  type: "view_change" | "pagination" | "board_info";
  sessionId: string;
  data: VrpViewChange | VrpPagination | VrpBoardInfo;
}

VrpBoardInfo {
  slot_id: string;      // snake_case from Rust
  sub_slot: string;
  board_type: string;
  status: string;
  ip?: string;
}
```

### Tree Data (react-arborist)
```typescript
TreeNodeData {
  id: string;
  name: string;
  children?: TreeNodeData[];
  nodeData: RouterNode | LinuxBoardNode;
}
```

## Conventions

- Match Rust enum variants with TypeScript union types
- VRP types use snake_case to match Rust serialization (no rename_all)
- Use discriminated unions for node types (`type: "router" | "board"`)
- Export all types from `index.ts` barrel

## Adding New Types

1. Define interface in `session.ts` (or new file)
2. Export from `index.ts`
3. Update this CLAUDE.md
