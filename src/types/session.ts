import { NodeApi } from "react-arborist";

export type Protocol = "ssh" | "telnet";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "authenticating"
  | "ready"
  | "reconnecting"
  | "error";

// Reconnection status sent from backend during reconnection attempts
export interface ReconnectStatus {
  attempt: number;
  maxAttempts: number;
  nextRetryMs: number;
  lastError?: string;
}

// Reconnection policy configuration
export interface ReconnectPolicy {
  enabled: boolean;
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export type VrpView = "user" | "system" | "interface" | "unknown";

export interface AuthProfile {
  id: string;
  name: string;
  username: string;
  password: string;
}

export interface LinuxBoardNode {
  id: string;
  type: "board";
  slotId: string;
  ip: string;
  name: string;
  protocol: Protocol;
  connectionState: ConnectionState;
  sessionId: string | null;
}

export interface RouterNode {
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
  parentId: string | null;  // null = root level
  order: number;            // sibling sort order
}

// Folder node for organizing routers
export interface FolderNode {
  id: string;
  type: "folder";
  name: string;
  parentId: string | null;  // null = root level
  order: number;            // sibling sort order
}

export type SessionTreeNode = RouterNode | LinuxBoardNode | FolderNode;

// react-arborist compatible tree data structure
export interface TreeNodeData {
  id: string;
  name: string;
  children?: TreeNodeData[];
  // Discriminated union for node-specific data
  nodeData: SessionTreeNode;
  // For inline editing
  isEditing?: boolean;
}

// Helper type for react-arborist node
export type SessionTreeNodeApi = NodeApi<TreeNodeData>;

// VRP events emitted from backend
export interface VrpEvent {
  type: "view_change" | "pagination" | "board_info";
  sessionId: string;
  data: VrpViewChange | VrpPagination | VrpBoardInfo;
}

export interface VrpViewChange {
  view: VrpView;
  hostname: string;
}

export interface VrpPagination {
  detected: boolean;
  autoHandled: boolean;
}

export interface VrpBoardInfo {
  slot_id: string;
  sub_slot: string;
  board_type: string;
  status: "Present" | "Absent" | string;
  ip?: string;
}

// Session config for creating connections
export interface SessionConfig {
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  password: string;
  cols: number;
  rows: number;
}

// Block-based terminal types
export type BlockStatus = "running" | "success" | "error";

// Legacy Block type - kept for migration, prefer BlockMarker
export interface Block {
  id: string;
  sessionId: string;
  command: string;
  timestamp: Date;
  status: BlockStatus;
  output: string;
  collapsed: boolean;
  lineCount: number;
}

// New marker-based block model - output lives only in xterm.js buffer
export interface BlockMarker {
  id: string;
  sessionId: string;
  command: string;
  timestamp: Date;
  status: BlockStatus;
  collapsed: boolean;

  // xterm.js line position tracking
  startLine: number;      // Command starting line in xterm buffer
  endLine: number | null; // Output ending line (null while running)
}

// Log Tracer types for source code linkage
export interface TraceEvent {
  id: string;
  file: string;
  line: number;
  function: string;
  timestamp: Date;
  matched_text: string;
  log_line: string;
  session_id: string;
}

export interface SourceLocation {
  file: string;
  line: number;
  function: string;
  format_string: string;
}

export interface IndexStats {
  files_scanned: number;
  patterns_indexed: number;
  duration_ms: number;
}

export interface TracerStats {
  indexed: boolean;
  pattern_count: number;
  source_path: string | null;
}
