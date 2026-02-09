import { useState, useCallback } from "react";
import { Tree, NodeRendererProps } from "react-arborist";
import { TreeNodeData, RouterNode } from "../../types/session";
import { useSessionTreeStore } from "../../stores/sessionTreeStore";
import { TreeContextMenu } from "./TreeContextMenu";

interface ContextMenuState {
  node: TreeNodeData;
  position: { x: number; y: number };
}

function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
  const { activeNodeId, setActiveNode, connectNode } = useSessionTreeStore();
  const nodeData = node.data.nodeData;
  const isRouter = nodeData.type === "router";
  const isActive = activeNodeId === nodeData.id;

  // Connection state indicator
  const getStateIndicator = () => {
    switch (nodeData.connectionState) {
      case "ready":
      case "connected":
        return <span className="state-indicator state-connected" />;
      case "connecting":
      case "authenticating":
        return <span className="state-indicator state-connecting" />;
      case "error":
        return <span className="state-indicator state-error" />;
      default:
        return <span className="state-indicator state-disconnected" />;
    }
  };

  // Protocol badge
  const getProtocolBadge = () => {
    const protocol = nodeData.protocol.toUpperCase();
    return (
      <span className={`protocol-badge protocol-${nodeData.protocol}`}>
        [{protocol.charAt(0)}]
      </span>
    );
  };

  // VRP view indicator for routers
  const getVrpIndicator = () => {
    if (!isRouter) return null;
    const router = nodeData as RouterNode;
    if (router.connectionState !== "ready" || router.vrpView === "unknown") return null;

    const viewSymbols: Record<string, string> = {
      user: "<>",
      system: "[]",
      interface: "[~]",
    };

    return (
      <span className="vrp-indicator" title={`VRP ${router.vrpView} view`}>
        {viewSymbols[router.vrpView] || ""}
      </span>
    );
  };

  const handleClick = () => {
    setActiveNode(nodeData.id);
  };

  const handleDoubleClick = () => {
    if (nodeData.connectionState === "disconnected" || nodeData.connectionState === "error") {
      connectNode(nodeData.id);
    }
  };

  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-node ${isActive ? "tree-node-active" : ""} ${isRouter ? "tree-node-router" : "tree-node-board"}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <div className="tree-node-content">
        {getStateIndicator()}
        {getProtocolBadge()}
        <span className="tree-node-name">{node.data.name}</span>
        {getVrpIndicator()}
      </div>
      {isRouter && (nodeData as RouterNode).boards.length > 0 && (
        <span className="tree-node-children-count">
          {(nodeData as RouterNode).boards.length}
        </span>
      )}
    </div>
  );
}

export function SessionTree() {
  const { getTreeData, connectNode } = useSessionTreeStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const treeData = getTreeData();

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNodeData) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        node,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle double-click on empty area (from react-arborist)
  const handleActivate = useCallback(
    (node: { data: TreeNodeData }) => {
      const nodeData = node.data.nodeData;
      if (nodeData.connectionState === "disconnected" || nodeData.connectionState === "error") {
        connectNode(nodeData.id);
      }
    },
    [connectNode]
  );

  if (treeData.length === 0) {
    return (
      <div className="session-tree-empty">
        No routers configured. Use the form above to add one.
      </div>
    );
  }

  return (
    <div
      className="session-tree-container"
      onContextMenu={(e) => {
        // Prevent default context menu on container
        e.preventDefault();
      }}
    >
      <Tree<TreeNodeData>
        data={treeData}
        openByDefault={true}
        width="100%"
        height={400}
        indent={24}
        rowHeight={36}
        onActivate={handleActivate}
        onContextMenu={() => {
          // This is called by react-arborist when right-clicking a node
          // But we handle it ourselves in the node renderer
        }}
      >
        {(props) => (
          <div
            onContextMenu={(e) => handleContextMenu(e, props.node.data)}
          >
            <NodeRenderer {...props} />
          </div>
        )}
      </Tree>

      {contextMenu && (
        <TreeContextMenu
          node={contextMenu.node}
          position={contextMenu.position}
          onClose={closeContextMenu}
        />
      )}
    </div>
  );
}

export default SessionTree;
