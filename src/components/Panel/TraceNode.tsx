import { memo } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import type { TraceEvent } from "../../types";
import { openInVSCode } from "../../utils/vscode";

export interface TraceNodeData {
  label: string;
  trace: TraceEvent;
}

function TraceNodeComponent({ data }: NodeProps<TraceNodeData>) {
  const { trace } = data;

  const handleClick = () => {
    openInVSCode(trace.file, trace.line);
  };

  // Extract just the filename from the full path
  const fileName = trace.file.split("/").pop() || trace.file;

  return (
    <div
      className="trace-node"
      onClick={handleClick}
      style={{
        padding: "8px 12px",
        borderRadius: "6px",
        background: "rgba(30, 30, 30, 0.9)",
        border: "1px solid rgba(100, 100, 100, 0.5)",
        cursor: "pointer",
        minWidth: "150px",
        fontSize: "12px",
        color: "#e0e0e0",
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "#555" }}
      />

      <div
        style={{
          fontWeight: 600,
          color: "#64b5f6",
          marginBottom: "4px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {trace.function}
      </div>

      <div
        style={{
          color: "#9e9e9e",
          fontSize: "11px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {fileName}:{trace.line}
      </div>

      <div
        style={{
          marginTop: "4px",
          color: "#757575",
          fontSize: "10px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: "180px",
        }}
        title={trace.log_line}
      >
        {trace.matched_text}...
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "#555" }}
      />
    </div>
  );
}

export const TraceNode = memo(TraceNodeComponent);
