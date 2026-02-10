import { useRef, useEffect, useCallback, useState } from "react";
import { TreeNodeData } from "../../types/session";
import { useSessionTreeStore } from "../../stores/sessionTreeStore";

interface TreeContextMenuProps {
  node: TreeNodeData;
  position: { x: number; y: number };
  onClose: () => void;
}

export function TreeContextMenu({ node, position, onClose }: TreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("New Folder");
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    scanBoards,
    removeRouter,
    removeBoard,
    removeFolder,
    switchProtocol,
    routers,
    addFolder,
  } = useSessionTreeStore();

  const nodeData = node.nodeData;
  const isRoot = node.id === "__root__";
  const isRouter = nodeData.type === "router";
  const isFolder = nodeData.type === "folder";
  const isBoard = nodeData.type === "board";
  const isConnectable = isRouter || isBoard;
  const isConnected =
    isConnectable &&
    ((nodeData as { connectionState?: string }).connectionState === "ready" ||
    (nodeData as { connectionState?: string }).connectionState === "connected");

  // Find parent router for boards
  const getParentRouterId = useCallback((): string | null => {
    if (isRouter || isFolder) return null;
    for (const [id, router] of routers.entries()) {
      if (router.boards.some((b) => b.id === nodeData.id)) {
        return id;
      }
    }
    return null;
  }, [isRouter, isFolder, routers, nodeData.id]);

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

  // Focus input when showing new folder input
  useEffect(() => {
    if (showNewFolderInput && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [showNewFolderInput]);

  const handleScanBoards = () => {
    if (isRouter) {
      scanBoards(nodeData.id);
    }
    onClose();
  };

  const handleRemove = () => {
    if (isRouter) {
      removeRouter(nodeData.id);
    } else if (isFolder && !isRoot) {
      removeFolder(nodeData.id);
    } else if (isBoard) {
      const parentId = getParentRouterId();
      if (parentId) {
        removeBoard(parentId, nodeData.id);
      }
    }
    onClose();
  };

  const handleSwitchProtocol = () => {
    if (isConnectable) {
      const connectable = nodeData as { protocol: string };
      const newProtocol = connectable.protocol === "ssh" ? "telnet" : "ssh";
      switchProtocol(nodeData.id, newProtocol as "ssh" | "telnet");
    }
    onClose();
  };

  const handleNewFolder = () => {
    setShowNewFolderInput(true);
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      // Create folder under current folder or at root
      const parentId = isRoot ? null : isFolder ? nodeData.id : null;
      addFolder(newFolderName.trim(), parentId);
    }
    onClose();
  };

  const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateFolder();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setShowNewFolderInput(false);
    }
  };

  const handleRename = () => {
    // Trigger rename by dispatching a custom event
    // The tree node will catch this and enter edit mode
    const event = new CustomEvent("bspt:rename-node", {
      detail: { nodeId: nodeData.id },
    });
    window.dispatchEvent(event);
    onClose();
  };

  // Adjust position to stay within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 180),
    y: Math.min(position.y, window.innerHeight - 250),
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
      {/* New Folder - available for folders and root */}
      {(isFolder || isRoot) && !showNewFolderInput && (
        <button className="context-menu-item" onClick={handleNewFolder}>
          New Folder
        </button>
      )}

      {/* New Folder Input */}
      {showNewFolderInput && (
        <div className="context-menu-input-wrapper">
          <input
            ref={inputRef}
            type="text"
            className="context-menu-input"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={handleNewFolderKeyDown}
            onBlur={handleCreateFolder}
            placeholder="Folder name"
          />
        </div>
      )}

      {/* Rename - available for all non-root nodes */}
      {!isRoot && !showNewFolderInput && (
        <button className="context-menu-item" onClick={handleRename}>
          Rename
          <span className="context-menu-shortcut">F2</span>
        </button>
      )}

      {/* Scan Boards - only for connected routers */}
      {isRouter && isConnected && !showNewFolderInput && (
        <button className="context-menu-item" onClick={handleScanBoards}>
          Scan Boards
        </button>
      )}

      {/* Switch Protocol - only for routers and boards */}
      {isConnectable && !showNewFolderInput && (
        <button className="context-menu-item" onClick={handleSwitchProtocol}>
          Switch to{" "}
          {(nodeData as { protocol: string }).protocol === "ssh"
            ? "Telnet"
            : "SSH"}
        </button>
      )}

      {/* Remove - available for all non-root nodes */}
      {!isRoot && !showNewFolderInput && (
        <>
          <div className="context-menu-separator" />
          <button
            className="context-menu-item context-menu-item-danger"
            onClick={handleRemove}
          >
            Remove
          </button>
        </>
      )}
    </div>
  );
}
