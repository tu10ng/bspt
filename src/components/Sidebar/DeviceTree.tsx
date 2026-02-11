import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Tree, NodeRendererProps, MoveHandler, NodeApi } from "react-arborist";
import {
  TreeNodeData,
  RouterNode,
  LinuxBoardNode,
  FolderNode,
  SlotNode,
} from "../../types/session";
import { useDeviceTreeStore } from "../../stores/deviceTreeStore";
import { useTabStore, ConnectionConfig } from "../../stores/tabStore";
import { TreeContextMenu } from "./TreeContextMenu";

// ASCII tree line characters
const TREE_LINE = "│";
const TREE_BRANCH = "├─";
const TREE_LAST = "└─";
const TREE_SPACE = "  ";

interface ContextMenuState {
  node: TreeNodeData;
  position: { x: number; y: number };
}

interface SlotInputDialogProps {
  routerId: string;
  onConfirm: (slotId: string, name: string) => void;
  onCancel: () => void;
}

function SlotInputDialog({ onConfirm, onCancel }: SlotInputDialogProps) {
  const [slotName, setSlotName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  const handleConfirm = () => {
    if (slotName.trim()) {
      onConfirm(slotName.trim(), slotName.trim());
    }
  };

  return createPortal(
    <div className="slot-input-dialog" onClick={onCancel}>
      <div className="slot-input-content" onClick={(e) => e.stopPropagation()}>
        <h3 className="slot-input-title">Create New Slot</h3>
        <input
          ref={inputRef}
          type="text"
          className="slot-input-field"
          placeholder="Slot name (e.g., 21, meth)"
          value={slotName}
          onChange={(e) => setSlotName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleConfirm();
            }
          }}
        />
        <div className="slot-input-buttons">
          <button className="slot-input-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="slot-input-confirm"
            onClick={handleConfirm}
            disabled={!slotName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// Helper to compute tree prefix based on node ancestry
function computeTreePrefix(node: NodeApi<TreeNodeData>): string {
  const levels: boolean[] = []; // true = is last child at that level
  let current: NodeApi<TreeNodeData> | null = node;

  // Walk up the tree to determine ancestry
  while (current && current.parent) {
    const siblings = current.parent.children || [];
    const isLast = siblings[siblings.length - 1]?.id === current.id;
    levels.unshift(isLast);
    current = current.parent;
  }

  if (levels.length === 0) return "";

  let prefix = "";
  for (let i = 0; i < levels.length - 1; i++) {
    prefix += levels[i] ? TREE_SPACE : TREE_LINE + " ";
  }
  prefix += levels[levels.length - 1] ? TREE_LAST : TREE_BRANCH;

  return prefix;
}

function NodeRenderer({
  node,
  style,
  dragHandle,
}: NodeRendererProps<TreeNodeData>) {
  const {
    activeNodeId,
    setActiveNode,
    connectNode,
    findNodeById,
    renameNode,
    setDraggingNodeId,
    addSlot,
    moveBoardToSlot,
  } = useDeviceTreeStore();
  const { openTab, setActiveTab, getTabByNodeId } = useTabStore();
  const nodeData = node.data.nodeData;
  const isRouter = nodeData.type === "router";
  const isFolder = nodeData.type === "folder";
  const isBoard = nodeData.type === "board";
  const isSlot = nodeData.type === "slot";
  const isGhostSlot = isSlot && (nodeData as SlotNode).isGhost;
  const isActive = activeNodeId === nodeData.id;

  // Compute ASCII tree prefix
  const treePrefix = useMemo(() => computeTreePrefix(node), [node]);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(node.data.name);
  const [showSlotDialog, setShowSlotDialog] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Connection state indicator - VS Code style dot
  const getStateIndicator = () => {
    if (isFolder || isSlot) return null;
    const connectable = nodeData as RouterNode | LinuxBoardNode;
    const isConnected = connectable.connectionState === "ready" || connectable.connectionState === "connected";
    const isConnecting = connectable.connectionState === "connecting" ||
                         connectable.connectionState === "authenticating" ||
                         connectable.connectionState === "reconnecting";
    const isError = connectable.connectionState === "error";

    let statusClass = "tree-status disconnected";
    if (isConnected) statusClass = "tree-status connected";
    else if (isConnecting) statusClass = "tree-status connecting";
    else if (isError) statusClass = "tree-status error";

    return <span className={statusClass}>{isConnected ? "●" : "○"}</span>;
  };

  // Protocol badge - only shown on routers
  const getProtocolBadge = () => {
    if (!isRouter) return null;
    const router = nodeData as RouterNode;
    return (
      <span className="tree-protocol">
        {router.protocol.toUpperCase()}
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
      <span className="tree-vrp" title={`VRP ${router.vrpView} view`}>
        {viewSymbols[router.vrpView] || ""}
      </span>
    );
  };

  const handleClick = () => {
    if (isFolder) {
      node.toggle();
    } else if (isGhostSlot) {
      // Show slot creation dialog
      setShowSlotDialog(true);
    } else if (!isSlot) {
      setActiveNode(nodeData.id);
      const existingTab = getTabByNodeId(nodeData.id);
      if (existingTab) {
        setActiveTab(existingTab.id);
      }
    }
  };

  const handleDoubleClick = async () => {
    if (isFolder || isSlot) {
      if (!isGhostSlot) {
        setIsEditing(true);
      }
      return;
    }

    await connectNode(nodeData.id);

    const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
      for (let i = 0; i < maxAttempts; i++) {
        const n = findNodeById(nodeData.id);
        if (n && n.type !== "folder" && n.type !== "slot" && (n as RouterNode | LinuxBoardNode).sessionId) {
          return (n as RouterNode | LinuxBoardNode).sessionId;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      return null;
    };

    const sessionId = await waitForSession();
    const updatedNode = findNodeById(nodeData.id);

    if (updatedNode && updatedNode.type !== "folder" && updatedNode.type !== "slot" && sessionId) {
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

  // Handle drag start for boards
  const handleDragStart = () => {
    if (isBoard) {
      setDraggingNodeId(nodeData.id);
    }
  };

  const handleDragEnd = () => {
    setDraggingNodeId(null);
  };

  // Handle drop on ghost slot
  const handleGhostDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    setShowSlotDialog(true);
  };

  const handleSlotConfirm = (slotId: string, name: string) => {
    if (isGhostSlot) {
      const ghostSlot = nodeData as SlotNode;
      const newSlotId = addSlot(ghostSlot.routerId, slotId, name);

      // Move the dragged board to the new slot
      const { draggingNodeId } = useDeviceTreeStore.getState();
      if (draggingNodeId && newSlotId) {
        moveBoardToSlot(draggingNodeId, slotId);
      }
    }
    setShowSlotDialog(false);
    setDraggingNodeId(null);
  };

  // Render ghost slot - simplified dashed box style
  if (isGhostSlot) {
    return (
      <div
        style={style}
        className={`tree-node-row tree-ghost ${isDragOver ? "drag-over" : ""}`}
        onClick={handleClick}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleGhostDrop}
      >
        <span className="tree-prefix">{treePrefix}</span>
        <span className="tree-name">+ New slot</span>
        {showSlotDialog && (
          <SlotInputDialog
            routerId={(nodeData as SlotNode).routerId}
            onConfirm={handleSlotConfirm}
            onCancel={() => {
              setShowSlotDialog(false);
              setDraggingNodeId(null);
            }}
          />
        )}
      </div>
    );
  }

  // Render slot - with trailing /
  if (isSlot) {
    const slot = nodeData as SlotNode;
    return (
      <div
        style={style}
        className="tree-node-row"
        onClick={() => node.toggle()}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <span className="tree-prefix">{treePrefix}</span>
        <span className="tree-arrow">{node.isOpen ? "▼" : "▶"}</span>
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
          <span className="tree-name slot">{slot.name}</span>
        )}
      </div>
    );
  }

  // Render folder - VS Code style
  if (isFolder) {
    return (
      <div
        ref={dragHandle}
        style={style}
        className="tree-node-row"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <span className="tree-prefix">{treePrefix}</span>
        <span className="tree-arrow">{node.isOpen ? "▼" : "▶"}</span>
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
          <span className="tree-name">{node.data.name}</span>
        )}
      </div>
    );
  }

  // Render router - VS Code style with status and protocol
  if (isRouter) {
    const router = nodeData as RouterNode;
    return (
      <div
        ref={dragHandle}
        style={style}
        className={`tree-node-row ${isActive ? "active" : ""}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <span className="tree-prefix">{treePrefix}</span>
        <span className="tree-arrow">{node.isOpen ? "▼" : "▶"}</span>
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
          <span className="tree-name">{router.name}</span>
        )}
        {getVrpIndicator()}
        {getStateIndicator()}
        {getProtocolBadge()}
      </div>
    );
  }

  // Render board - VS Code style
  if (isBoard) {
    const board = nodeData as LinuxBoardNode;
    return (
      <div
        ref={dragHandle}
        style={style}
        className={`tree-node-row ${isActive ? "active" : ""}`}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        draggable
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <span className="tree-prefix">{treePrefix}</span>
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
          <span className="tree-name">{board.name || board.ip}</span>
        )}
        {getStateIndicator()}
      </div>
    );
  }

  // Fallback
  return (
    <div
      ref={dragHandle}
      style={style}
      className={`tree-node-row ${isActive ? "active" : ""}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <span className="tree-prefix">{treePrefix}</span>
      <span className="tree-name">{node.data.name}</span>
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
    setDraggingNodeId,
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

  const handleContainerContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({
      node: {
        id: "__root__",
        name: "Root",
        nodeData: {
          type: "folder",
          id: "__root__",
          name: "Root",
          parentId: null,
          order: 0,
        } as FolderNode,
      },
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleMove: MoveHandler<TreeNodeData> = useCallback(
    ({ dragIds, parentId, index }) => {
      for (const dragId of dragIds) {
        let targetParentId: string | null = null;
        if (parentId) {
          const targetNode = findNodeById(parentId);
          if (targetNode && targetNode.type === "folder") {
            targetParentId = parentId;
          } else if (targetNode && targetNode.type === "router") {
            continue;
          }
        }
        moveNode(dragId, targetParentId, index);
      }
      setDraggingNodeId(null);
    },
    [moveNode, findNodeById, setDraggingNodeId]
  );

  const handleActivate = useCallback(
    async (node: { data: TreeNodeData }) => {
      const nodeData = node.data.nodeData;

      if (nodeData.type === "folder" || nodeData.type === "slot") {
        return;
      }

      await connectNode(nodeData.id);

      const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
        for (let i = 0; i < maxAttempts; i++) {
          const n = findNodeById(nodeData.id);
          if (n && n.type !== "folder" && n.type !== "slot" && (n as RouterNode | LinuxBoardNode).sessionId) {
            return (n as RouterNode | LinuxBoardNode).sessionId;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      };

      const sessionId = await waitForSession();
      const updatedNode = findNodeById(nodeData.id);

      if (updatedNode && updatedNode.type !== "folder" && updatedNode.type !== "slot" && sessionId) {
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

  const disableDrop = useCallback(
    ({
      parentNode,
      dragNodes,
    }: {
      parentNode: { data: TreeNodeData } | null;
      dragNodes: { data: TreeNodeData }[];
    }) => {
      if (!parentNode) return false;

      const parentData = parentNode.data.nodeData;

      if (parentData.type !== "folder") {
        return true;
      }

      for (const dragNode of dragNodes) {
        if (dragNode.data.nodeData.type === "folder") {
          let checkId: string | null = parentData.id;
          while (checkId) {
            if (checkId === dragNode.data.id) {
              return true;
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
        indent={0}
        rowHeight={28}
        onActivate={handleActivate}
        onMove={handleMove}
        disableDrag={false}
        disableDrop={disableDrop}
      >
        {(props) => (
          <div
            onContextMenu={(e) => {
              e.stopPropagation();
              handleContextMenu(e, props.node.data);
            }}
          >
            <NodeRenderer {...props} />
          </div>
        )}
      </Tree>

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
