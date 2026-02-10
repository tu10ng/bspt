import { useMemo, useCallback } from "react";
import ReactFlow, {
  Node,
  Edge,
  Background,
  Controls,
  useNodesState,
  useEdgesState,
  NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";
import type { TraceEvent } from "../../types";
import { TraceNode, TraceNodeData } from "./TraceNode";
import { useTracerStore } from "../../stores/tracerStore";

const nodeTypes: NodeTypes = {
  traceNode: TraceNode,
};

interface FlowPanelProps {
  traces?: TraceEvent[];
  sessionId?: string;
}

export function FlowPanel({ traces: propTraces, sessionId }: FlowPanelProps) {
  const storeTraces = useTracerStore((s) => s.traceEvents);
  const clearTraces = useTracerStore((s) => s.clearTraces);
  const { indexed, sourcePath, patternCount, indexing } = useTracerStore();

  // Use prop traces if provided, otherwise use store traces
  // Filter by sessionId if provided
  const traces = useMemo(() => {
    const allTraces = propTraces ?? storeTraces;
    if (sessionId) {
      return allTraces.filter((t) => t.session_id === sessionId);
    }
    return allTraces;
  }, [propTraces, storeTraces, sessionId]);

  // Convert traces to React Flow nodes
  const initialNodes: Node<TraceNodeData>[] = useMemo(() => {
    return traces.map((trace, i) => ({
      id: trace.id,
      position: { x: 100, y: i * 100 },
      data: {
        label: `${trace.function}\n${trace.file}:${trace.line}`,
        trace,
      },
      type: "traceNode",
    }));
  }, [traces]);

  // Create edges connecting consecutive nodes
  const initialEdges: Edge[] = useMemo(() => {
    return traces.slice(1).map((trace, i) => ({
      id: `e-${traces[i].id}-${trace.id}`,
      source: traces[i].id,
      target: trace.id,
      animated: true,
      style: { stroke: "#555" },
    }));
  }, [traces]);

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const handleClear = useCallback(() => {
    clearTraces();
  }, [clearTraces]);

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div
        style={{
          padding: "8px 12px",
          borderBottom: "1px solid rgba(100, 100, 100, 0.3)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ fontSize: "12px", color: "#9e9e9e" }}>
          {indexed ? (
            <span>
              Indexed: {patternCount} patterns
              {sourcePath && (
                <span
                  title={sourcePath}
                  style={{ marginLeft: "8px", color: "#757575" }}
                >
                  ({sourcePath.split("/").pop()})
                </span>
              )}
            </span>
          ) : indexing ? (
            <span>Indexing...</span>
          ) : (
            <span style={{ color: "#757575" }}>Not indexed</span>
          )}
        </div>
        {traces.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              padding: "4px 8px",
              fontSize: "11px",
              background: "rgba(100, 100, 100, 0.3)",
              border: "none",
              borderRadius: "4px",
              color: "#9e9e9e",
              cursor: "pointer",
            }}
          >
            Clear ({traces.length})
          </button>
        )}
      </div>

      {/* Flow visualization */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {traces.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "#757575",
              fontSize: "13px",
              textAlign: "center",
              padding: "20px",
            }}
          >
            {indexed
              ? "No trace events yet. Log output matching indexed patterns will appear here."
              : "Index a C source directory to enable log tracing."}
          </div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ background: "transparent" }}
          >
            <Background color="#333" gap={16} />
            <Controls />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}
