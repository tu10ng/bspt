import { useState, useCallback } from "react";
import { Tree, NodeRendererProps } from "react-arborist";
import { TreeNodeData, RouterNode, LinuxBoardNode } from "../../types/session";
import { useSessionTreeStore } from "../../stores/sessionTreeStore";
import { useTabStore } from "../../stores/tabStore";
import { TreeContextMenu } from "./TreeContextMenu";

interface ContextMenuState {
  node: TreeNodeData;
  position: { x: number; y: number };
}

function NodeRenderer({ node, style, dragHandle }: NodeRendererProps<TreeNodeData>) {
  const { activeNodeId, setActiveNode, connectNode, findNodeById } = useSessionTreeStore();
  const { openTab, setActiveTab, getTabByNodeId } = useTabStore();
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
    // If already has a tab, switch to it
    const existingTab = getTabByNodeId(nodeData.id);
    if (existingTab) {
      setActiveTab(existingTab.id);
    }
  };

  const handleDoubleClick = async () => {
    // Check if already has a tab
    const existingTab = getTabByNodeId(nodeData.id);
    if (existingTab) {
      // Just switch to the existing tab
      setActiveTab(existingTab.id);
      return;
    }

    // If not connected, connect first
    if (nodeData.connectionState === "disconnected" || nodeData.connectionState === "error") {
      await connectNode(nodeData.id);
    }

    // Get the updated node to get session ID
    const updatedNode = findNodeById(nodeData.id);
    if (updatedNode && updatedNode.sessionId) {
      // Create label based on node type
      let label: string;
      if (updatedNode.type === "router") {
        const router = updatedNode as RouterNode;
        label = `${router.mgmtIp}:${router.port}`;
      } else {
        const board = updatedNode as LinuxBoardNode;
        label = board.name || board.ip;
      }

      // Open a new tab
      openTab(nodeData.id, updatedNode.sessionId, label, updatedNode.protocol);
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
  const { getTreeData, connectNode, findNodeById } = useSessionTreeStore();
  const { openTab, setActiveTab, getTabByNodeId } = useTabStore();
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

  // Handle double-click / activate (from react-arborist)
  const handleActivate = useCallback(
    async (node: { data: TreeNodeData }) => {
      const nodeData = node.data.nodeData;

      // Check if already has a tab
      const existingTab = getTabByNodeId(nodeData.id);
      if (existingTab) {
        setActiveTab(existingTab.id);
        return;
      }

      // Connect if needed
      if (nodeData.connectionState === "disconnected" || nodeData.connectionState === "error") {
        await connectNode(nodeData.id);
      }

      // Get updated node
      const updatedNode = findNodeById(nodeData.id);
      if (updatedNode && updatedNode.sessionId) {
        let label: string;
        if (updatedNode.type === "router") {
          const router = updatedNode as RouterNode;
          label = `${router.mgmtIp}:${router.port}`;
        } else {
          const board = updatedNode as LinuxBoardNode;
          label = board.name || board.ip;
        }
        openTab(nodeData.id, updatedNode.sessionId, label, updatedNode.protocol);
      }
    },
    [connectNode, findNodeById, getTabByNodeId, openTab, setActiveTab]
  );

  if (treeData.length === 0) {
    return (
      <div className="session-tree-empty">
        No routers configured. Enter connection details above.
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
