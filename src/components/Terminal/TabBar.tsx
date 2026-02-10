import { useCallback, useRef, useState } from "react";
import { Tab } from "../../stores/tabStore";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabClick: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder: (dragId: string, dropId: string) => void;
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onTabReorder,
}: TabBarProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
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

  // Sort tabs by order
  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <div className="tab-bar">
      {sortedTabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab-item ${tab.id === activeTabId ? "tab-active" : ""} ${
            tab.id === draggedId ? "tab-dragging" : ""
          } ${tab.id === dropTargetId ? "tab-drop-target" : ""}`}
          onClick={() => onTabClick(tab.id)}
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
          <button
            className="tab-close"
            onClick={(e) => handleTabClose(e, tab.id)}
            title="Close tab"
          >
            &times;
          </button>
        </div>
      ))}
    </div>
  );
}

export default TabBar;
