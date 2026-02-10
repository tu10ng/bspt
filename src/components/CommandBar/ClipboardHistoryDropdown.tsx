import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useCommandBarStore, ClipboardEntry } from "../../stores/commandBarStore";

interface ClipboardHistoryDropdownProps {
  sessionId: string | null;
}

export function ClipboardHistoryDropdown({ sessionId }: ClipboardHistoryDropdownProps) {
  const { clipboardHistory, removeClipboardEntry, clearClipboardHistory } =
    useCommandBarStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handlePasteEntry = useCallback(
    async (entry: ClipboardEntry) => {
      if (!sessionId) return;

      try {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(entry.text));
        await invoke("send_input", { sessionId, data: bytes });
        setIsOpen(false);
      } catch (error) {
        console.error("Failed to paste clipboard entry:", error);
      }
    },
    [sessionId]
  );

  const handleRemoveEntry = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      removeClipboardEntry(id);
    },
    [removeClipboardEntry]
  );

  const formatTimestamp = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  const truncateText = (text: string, maxLen: number = 40) => {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen) + "...";
  };

  return (
    <div className="clipboard-section" ref={dropdownRef}>
      <button
        className="clipboard-toggle"
        onClick={() => setIsOpen(!isOpen)}
        disabled={!sessionId}
        title="Clipboard history"
      >
        <span className="clipboard-icon">&#128203;</span>
        {clipboardHistory.length > 0 && (
          <span className="clipboard-badge">{clipboardHistory.length}</span>
        )}
      </button>

      {isOpen && (
        <div className="clipboard-dropdown">
          <div className="clipboard-header">
            <span>Clipboard History</span>
            {clipboardHistory.length > 0 && (
              <button
                className="clipboard-clear"
                onClick={clearClipboardHistory}
                title="Clear all"
              >
                Clear
              </button>
            )}
          </div>

          {clipboardHistory.length === 0 ? (
            <div className="clipboard-empty">No clipboard entries</div>
          ) : (
            <div className="clipboard-menu">
              {clipboardHistory.map((entry) => (
                <div
                  key={entry.id}
                  className="clipboard-item"
                  onClick={() => handlePasteEntry(entry)}
                >
                  <span className="clipboard-text" title={entry.text}>
                    {truncateText(entry.text)}
                  </span>
                  <span className="clipboard-time">
                    {formatTimestamp(entry.timestamp)}
                  </span>
                  <button
                    className="clipboard-remove"
                    onClick={(e) => handleRemoveEntry(e, entry.id)}
                    title="Remove"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ClipboardHistoryDropdown;
