import { useState, useCallback, useRef, useEffect } from "react";
import { Tree, NodeRendererProps, MoveHandler } from "react-arborist";
import { TreeNodeData, RouterNode, LinuxBoardNode, FolderNode } from "../../types/session";
import { useDeviceTreeStore } from "../../stores/deviceTreeStore";
import { useTabStore, ConnectionConfig } from "../../stores/tabStore";
import { TreeContextMenu } from "./TreeContextMenu";

interface ContextMenuState {
  node: TreeNodeData;
  position: { x: number; y: number };
}

function NodeRenderer({
  node,
  style,
  dragHandle,
}: NodeRendererProps<TreeNodeData>) {
  const { activeNodeId, setActiveNode, connectNode, findNodeById, renameNode } =
    useDeviceTreeStore();
  const { openTab, setActiveTab, getTabByNodeId } = useTabStore();
  const nodeData = node.data.nodeData;
  const isRouter = nodeData.type === "router";
  const isFolder = nodeData.type === "folder";
  const isBoard = nodeData.type === "board";
  const isActive = activeNodeId === nodeData.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.data.name);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Connection state indicator
  const getStateIndicator = () => {
    if (isFolder) return null;
    const connectable = nodeData as RouterNode | LinuxBoardNode;
    switch (connectable.connectionState) {
      case "ready":
      case "connected":
        return <span className="state-indicator state-connected" />;
      case "connecting":
      case "authenticating":
        return <span className="state-indicator state-connecting" />;
      case "reconnecting":
        return <span className="state-indicator state-reconnecting" title="Reconnecting..." />;
      case "error":
        return <span className="state-indicator state-error" />;
      default:
        return <span className="state-indicator state-disconnected" />;
    }
  };

  // Protocol badge
  const getProtocolBadge = () => {
    if (isFolder) return null;
    const connectable = nodeData as RouterNode | LinuxBoardNode;
    const protocol = connectable.protocol.toUpperCase();
    return (
      <span className={`protocol-badge protocol-${connectable.protocol}`}>
        [{protocol.charAt(0)}]
      </span>
    );
  };

  // Folder icon
  const getFolderIcon = () => {
    if (!isFolder) return null;
    return (
      <span className="tree-node-icon">
        {node.isOpen ? "\u{1F4C2}" : "\u{1F4C1}"}
      </span>
    );
  };

  // VRP view indicator for routers
  const getVrpIndicator = () => {
    if (!isRouter) return null;
    const router = nodeData as RouterNode;
    if (router.connectionState !== "ready" || router.vrpView === "unknown")
      return null;

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
    if (isFolder) {
      // Toggle folder open/close
      node.toggle();
    } else {
      setActiveNode(nodeData.id);
      // If already has a tab, switch to it
      const existingTab = getTabByNodeId(nodeData.id);
      if (existingTab) {
        setActiveTab(existingTab.id);
      }
    }
  };

  const handleDoubleClick = async () => {
    if (isFolder) {
      // Start rename on double-click for folders
      setIsEditing(true);
      return;
    }

    // Always create a new connection and new tab on double-click
    // One tree node can have multiple tabs (each with its own backend session)
    await connectNode(nodeData.id);

    // Wait for session ID to be available (store update is async)
    const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
      for (let i = 0; i < maxAttempts; i++) {
        const n = findNodeById(nodeData.id);
        if (n && n.type !== "folder" && (n as RouterNode | LinuxBoardNode).sessionId) {
          return (n as RouterNode | LinuxBoardNode).sessionId;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    };

    const sessionId = await waitForSession();
    const updatedNode = findNodeById(nodeData.id);

    if (updatedNode && updatedNode.type !== "folder" && sessionId) {
      // Create label and connection config based on node type
      let label: string;
      let connectionConfig: ConnectionConfig;

      if (updatedNode.type === "router") {
        const router = updatedNode as RouterNode;
        label = `${router.mgmtIp}:${router.port}`;
        connectionConfig = {
          host: router.mgmtIp,
          port: router.port,
          protocol: router.protocol,
          username: router.username,
          password: router.password,
        };
      } else {
        const board = updatedNode as LinuxBoardNode;
        label = board.name || board.ip;
        // Get parent router for credentials
        const parentRouter = [...useDeviceTreeStore.getState().routers.values()].find(
          (r) => r.boards.some((b) => b.id === board.id)
        );
        connectionConfig = {
          host: board.ip,
          port: board.protocol === "ssh" ? 22 : 23,
          protocol: board.protocol,
          username: parentRouter?.username || "",
          password: parentRouter?.password || "",
        };
      }

      // Open a new tab with connection config for reconnection
      openTab(
        nodeData.id,
        sessionId,
        label,
        (updatedNode as RouterNode | LinuxBoardNode).protocol,
        connectionConfig
      );
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "F2" && !isEditing) {
      e.preventDefault();
      setIsEditing(true);
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (editValue.trim()) {
        renameNode(nodeData.id, editValue.trim());
      }
      setIsEditing(false);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditValue(node.data.name);
      setIsEditing(false);
    }
  };

  const handleEditBlur = () => {
    if (editValue.trim() && editValue !== node.data.name) {
      renameNode(nodeData.id, editValue.trim());
    }
    setIsEditing(false);
  };

  const nodeClassName = [
    "tree-node",
    isActive ? "tree-node-active" : "",
    isRouter ? "tree-node-router" : "",
    isBoard ? "tree-node-board" : "",
    isFolder ? "tree-node-folder" : "",
    isEditing ? "tree-node-editing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={dragHandle}
      style={style}
      className={nodeClassName}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div className="tree-node-content">
        {getFolderIcon()}
        {getStateIndicator()}
        {getProtocolBadge()}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="tree-node-edit-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={handleEditBlur}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="tree-node-name">{node.data.name}</span>
        )}
        {getVrpIndicator()}
      </div>
      {isRouter && (nodeData as RouterNode).boards.length > 0 && (
        <span className="tree-node-children-count">
          {(nodeData as RouterNode).boards.length}
        </span>
      )}
      {isFolder && node.children && node.children.length > 0 && (
        <span className="tree-node-children-count">{node.children.length}</span>
      )}
    </div>
  );
}

export function DeviceTree() {
  const {
    getTreeData,
    connectNode,
    findNodeById,
    moveNode,
    folders,
    addFolder,
  } = useDeviceTreeStore();
  const { openTab } = useTabStore();
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

  // Handle right-click on empty area
  const handleContainerContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Show context menu for creating folder at root level
      setContextMenu({
        node: {
          id: "__root__",
          name: "Root",
          nodeData: { type: "folder", id: "__root__", name: "Root", parentId: null, order: 0 } as FolderNode,
        },
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Handle drag and drop
  const handleMove: MoveHandler<TreeNodeData> = useCallback(
    ({ dragIds, parentId, index }) => {
      for (const dragId of dragIds) {
        // Determine if target is a folder or root
        let targetParentId: string | null = null;
        if (parentId) {
          const targetNode = findNodeById(parentId);
          // Can only drop into folders (or root)
          if (targetNode && targetNode.type === "folder") {
            targetParentId = parentId;
          } else if (targetNode && targetNode.type === "router") {
            // Don't allow dropping into routers (boards are auto-managed)
            continue;
          }
        }
        moveNode(dragId, targetParentId, index);
      }
    },
    [moveNode, findNodeById]
  );

  // Handle double-click / activate (from react-arborist)
  // Always create new connection and new tab
  const handleActivate = useCallback(
    async (node: { data: TreeNodeData }) => {
      const nodeData = node.data.nodeData;

      // Skip folders
      if (nodeData.type === "folder") {
        return;
      }

      // Always create a new connection - one node can have multiple tabs
      await connectNode(nodeData.id);

      // Wait for session ID to be available (store update is async)
      const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
        for (let i = 0; i < maxAttempts; i++) {
          const n = findNodeById(nodeData.id);
          if (n && n.type !== "folder" && (n as RouterNode | LinuxBoardNode).sessionId) {
            return (n as RouterNode | LinuxBoardNode).sessionId;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      };

      const sessionId = await waitForSession();
      const updatedNode = findNodeById(nodeData.id);

      if (updatedNode && updatedNode.type !== "folder" && sessionId) {
        let label: string;
        let connectionConfig: ConnectionConfig;

        if (updatedNode.type === "router") {
          const router = updatedNode as RouterNode;
          label = `${router.mgmtIp}:${router.port}`;
          connectionConfig = {
            host: router.mgmtIp,
            port: router.port,
            protocol: router.protocol,
            username: router.username,
            password: router.password,
          };
        } else {
          const board = updatedNode as LinuxBoardNode;
          label = board.name || board.ip;
          // Get parent router for credentials
          const parentRouter = [...useDeviceTreeStore.getState().routers.values()].find(
            (r) => r.boards.some((b) => b.id === board.id)
          );
          connectionConfig = {
            host: board.ip,
            port: board.protocol === "ssh" ? 22 : 23,
            protocol: board.protocol,
            username: parentRouter?.username || "",
            password: parentRouter?.password || "",
          };
        }

        openTab(
          nodeData.id,
          sessionId,
          label,
          (updatedNode as RouterNode | LinuxBoardNode).protocol,
          connectionConfig
        );
      }
    },
    [connectNode, findNodeById, openTab]
  );

  // Check if node can be dropped on target
  const disableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: { data: TreeNodeData } | null;
      dragNodes: { data: TreeNodeData }[];
    }) => {
      // Allow drop at root
      if (!parentNode) return false;

      const parentData = parentNode.data.nodeData;

      // Only allow dropping into folders
      if (parentData.type !== "folder") {
        return true;
      }

      // Prevent dropping folder into itself or its descendants
      for (const dragNode of dragNodes) {
        if (dragNode.data.nodeData.type === "folder") {
          let checkId: string | null = parentData.id;
          while (checkId) {
            if (checkId === dragNode.data.id) {
              return true; // Would create cycle
            }
            const folder = folders.get(checkId);
            checkId = folder?.parentId ?? null;
          }
        }
      }

      return false;
    },
    [folders]
  );

  const handleAddFolder = useCallback(() => {
    addFolder("New Folder", null);
  }, [addFolder]);

  if (treeData.length === 0) {
    return (
      <div
        className="device-tree-empty"
        onContextMenu={handleContainerContextMenu}
      >
        <div className="device-tree-actions">
          <button
            className="device-tree-action-btn"
            onClick={handleAddFolder}
            title="New Folder"
          >
            + Folder
          </button>
        </div>
        No routers configured. Enter connection details above.
        <br />
        <span className="text-muted">Right-click to create a folder.</span>
      </div>
    );
  }

  return (
    <div
      className="device-tree-container"
      onContextMenu={handleContainerContextMenu}
    >
      <div className="device-tree-actions">
        <button
          className="device-tree-action-btn"
          onClick={handleAddFolder}
          title="New Folder"
        >
          + Folder
        </button>
      </div>
      <Tree<TreeNodeData>
        data={treeData}
        openByDefault={true}
        width="100%"
        height={400}
        indent={24}
        rowHeight={36}
        onActivate={handleActivate}
        onMove={handleMove}
        disableDrag={false}
        disableDrop={disableDrop}
      >
        {(props) => (
          <div
            onContextMenu={(e) => {
              e.stopPropagation(); // Prevent bubbling to container
              handleContextMenu(e, props.node.data);
            }}
          >
            <NodeRenderer {...props} />
          </div>
        )}
      </Tree>

      {/* Empty area for right-click when tree has items but user clicks below */}
      <div
        className="device-tree-empty-area"
        onContextMenu={handleContainerContextMenu}
        style={{ minHeight: 50, flex: 1 }}
      />

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

export default DeviceTree;
