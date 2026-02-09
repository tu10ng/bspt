import { useRef, useEffect, useCallback } from "react";
import { TreeNodeData } from "../../types/session";
import { useSessionTreeStore } from "../../stores/sessionTreeStore";

interface TreeContextMenuProps {
  node: TreeNodeData;
  position: { x: number; y: number };
  onClose: () => void;
}

export function TreeContextMenu({ node, position, onClose }: TreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const { connectNode, disconnectNode, scanBoards, removeRouter, removeBoard, switchProtocol, routers } =
    useSessionTreeStore();

  const nodeData = node.nodeData;
  const isRouter = nodeData.type === "router";
  const isConnected = nodeData.connectionState === "ready" || nodeData.connectionState === "connected";

  // Find parent router for boards
  const getParentRouterId = useCallback((): string | null => {
    if (isRouter) return null;
    for (const [id, router] of routers.entries()) {
      if (router.boards.some((b) => b.id === nodeData.id)) {
        return id;
      }
    }
    return null;
  }, [isRouter, routers, nodeData.id]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  const handleConnect = () => {
    connectNode(nodeData.id);
    onClose();
  };

  const handleDisconnect = () => {
    disconnectNode(nodeData.id);
    onClose();
  };

  const handleScanBoards = () => {
    if (isRouter) {
      scanBoards(nodeData.id);
    }
    onClose();
  };

  const handleRemove = () => {
    if (isRouter) {
      removeRouter(nodeData.id);
    } else {
      const parentId = getParentRouterId();
      if (parentId) {
        removeBoard(parentId, nodeData.id);
      }
    }
    onClose();
  };

  const handleSwitchProtocol = () => {
    const newProtocol = nodeData.protocol === "ssh" ? "telnet" : "ssh";
    switchProtocol(nodeData.id, newProtocol);
    onClose();
  };

  // Adjust position to stay within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 180),
    y: Math.min(position.y, window.innerHeight - 200),
  };

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        position: "fixed",
        left: adjustedPosition.x,
        top: adjustedPosition.y,
        zIndex: 1000,
      }}
    >
      {!isConnected ? (
        <button className="context-menu-item" onClick={handleConnect}>
          Connect
        </button>
      ) : (
        <button className="context-menu-item" onClick={handleDisconnect}>
          Disconnect
        </button>
      )}

      {isRouter && isConnected && (
        <button className="context-menu-item" onClick={handleScanBoards}>
          Scan Boards
        </button>
      )}

      <button className="context-menu-item" onClick={handleSwitchProtocol}>
        Switch to {nodeData.protocol === "ssh" ? "Telnet" : "SSH"}
      </button>

      <div className="context-menu-separator" />

      <button className="context-menu-item context-menu-item-danger" onClick={handleRemove}>
        Remove
      </button>
    </div>
  );
}
