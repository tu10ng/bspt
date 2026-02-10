import { useCallback, useRef, useState } from "react";
import { Tab } from "../../stores/tabStore";
import { TabContextMenu } from "./TabContextMenu";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder: (dragId: string, dropId: string) => void;
  onTabReconnect?: (tabId: string) => void;
  onTabDisconnect?: (tabId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
  onTabReconnect,
  onTabDisconnect,
}: TabBarProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    tab: Tab;
    position: { x: number; y: number };
  } | null>(null);
  const dragOverCountRef = useRef(0);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tabId);
    setDraggedId(tabId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDropTargetId(null);
    dragOverCountRef.current = 0;
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    dragOverCountRef.current++;
    if (tabId !== draggedId) {
      setDropTargetId(tabId);
    }
  }, [draggedId]);

  const handleDragLeave = useCallback(() => {
    dragOverCountRef.current--;
    if (dragOverCountRef.current === 0) {
      setDropTargetId(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, dropId: string) => {
      e.preventDefault();
      const dragId = e.dataTransfer.getData("text/plain");
      if (dragId && dragId !== dropId) {
        onTabReorder(dragId, dropId);
      }
      setDraggedId(null);
      setDropTargetId(null);
      dragOverCountRef.current = 0;
    },
    [onTabReorder]
  );

  const handleTabClose = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onTabClose(tabId);
    },
    [onTabClose]
  );

  const handleReconnect = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation();
      onTabReconnect?.(tabId);
    },
    [onTabReconnect]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, tab: Tab) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        tab,
        position: { x: e.clientX, y: e.clientY },
      });
    },
    []
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Sort tabs by order
  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar">
      {sortedTabs.map((tab) => {
        // Determine connection status based on tab's sessionId, not node state
        // This allows multiple tabs for the same node to have independent connection states
        const isDisconnected = !tab.sessionId;
        const isReconnecting = false; // TODO: track reconnecting state per-tab if needed
        const canReconnect = isDisconnected && !isReconnecting;

        return (
          <div
            key={tab.id}
            className={`tab-item ${tab.id === activeTabId ? "tab-active" : ""} ${
              tab.id === draggedId ? "tab-dragging" : ""
            } ${tab.id === dropTargetId ? "tab-drop-target" : ""} ${
              isDisconnected ? "tab-disconnected" : ""
            } ${isReconnecting ? "tab-reconnecting" : ""}`}
            onClick={() => onTabClick(tab.id)}
            onContextMenu={(e) => handleContextMenu(e, tab)}
            draggable
            onDragStart={(e) => handleDragStart(e, tab.id)}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={(e) => handleDragEnter(e, tab.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, tab.id)}
          >
            <span className={`tab-protocol protocol-${tab.protocol}`}>
              [{tab.protocol === "ssh" ? "S" : "T"}]
            </span>
            <span className="tab-label" title={tab.label}>
              {tab.label}
            </span>
            {isReconnecting && (
              <span className="tab-reconnecting-indicator" title="Reconnecting...">
                &#8635;
              </span>
            )}
            {canReconnect && onTabReconnect && (
              <button
                className="tab-reconnect"
                onClick={(e) => handleReconnect(e, tab.id)}
                title="Reconnect"
              >
                &#8635;
              </button>
            )}
            <button
              className="tab-close"
              onClick={(e) => handleTabClose(e, tab.id)}
              title="Close tab"
            >
              &times;
            </button>
          </div>
        );
      })}
      {contextMenu && (
        <TabContextMenu
          tab={contextMenu.tab}
          position={contextMenu.position}
          isConnected={!!contextMenu.tab.sessionId}
          onClose={closeContextMenu}
          onConnect={() => onTabReconnect?.(contextMenu.tab.id)}
          onDisconnect={() => onTabDisconnect?.(contextMenu.tab.id)}
          onClose_tab={() => onTabClose(contextMenu.tab.id)}
        />
      )}
    </div>
  );
}

export default TabBar;
