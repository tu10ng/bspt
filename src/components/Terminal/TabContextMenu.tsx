import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Tab } from "../../stores/tabStore";

interface TabContextMenuProps {
  tab: Tab;
  position: { x: number; y: number };
  isConnected: boolean;
  onClose: () => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onClose_tab: () => void;
}

export function TabContextMenu({
  tab,
  position,
  isConnected,
  onClose,
  onConnect,
  onDisconnect,
  onClose_tab,
}: TabContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Adjust position to stay within viewport
  const adjustedPosition = {
    x: Math.min(position.x, window.innerWidth - 150),
    y: Math.min(position.y, window.innerHeight - 120),
  };

  const handleConnect = () => {
    onConnect();
    onClose();
  };

  const handleDisconnect = () => {
    onDisconnect();
    onClose();
  };

  const handleCloseTab = () => {
    onClose_tab();
    onClose();
  };

  return createPortal(
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
      <div className="context-menu-separator" />
      <button className="context-menu-item" onClick={handleCloseTab}>
        Close Tab
      </button>
    </div>,
    document.body
  );
}
