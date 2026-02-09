import { NodeApi } from "react-arborist";

export type Protocol = "ssh" | "telnet";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "authenticating"
  | "ready"
  | "error";

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
}

export type SessionTreeNode = RouterNode | LinuxBoardNode;

// react-arborist compatible tree data structure
export interface TreeNodeData {
  id: string;
  name: string;
  children?: TreeNodeData[];
  // Discriminated union for node-specific data
  nodeData: SessionTreeNode;
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
