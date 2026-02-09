import { memo, useCallback } from "react";
import { BlockMarker } from "../../types/session";
import { useBlockStore } from "../../stores/blockStore";
import { formatBlockTime } from "../../utils/blockDetector";

interface OutlineProps {
  sessionId: string;
  onSelectMarker: (markerId: string) => void;
  activeMarkerId?: string;
}

export const Outline = memo(function Outline({
  sessionId,
  onSelectMarker,
  activeMarkerId,
}: OutlineProps) {
  const { getSessionMarkers, collapseAll, expandAll } = useBlockStore();
  const markers = getSessionMarkers(sessionId);

  const handleCollapseAll = useCallback(() => {
    collapseAll(sessionId);
  }, [sessionId, collapseAll]);

  const handleExpandAll = useCallback(() => {
    expandAll(sessionId);
  }, [sessionId, expandAll]);

  return (
    <div className="outline-panel">
      <div className="outline-header">
        <span className="outline-title">Outline</span>
        <div className="outline-actions">
          <button
            className="outline-action-btn"
            onClick={handleCollapseAll}
            title="Collapse All (Ctrl+Shift+[)"
          >
            Fold
          </button>
          <button
            className="outline-action-btn"
            onClick={handleExpandAll}
            title="Expand All (Ctrl+Shift+])"
          >
            Unfold
          </button>
        </div>
      </div>

      <div className="outline-list">
        {markers.length === 0 ? (
          <div className="outline-empty">
            No commands yet
          </div>
        ) : (
          <div className="outline-session">
            <div className="outline-session-header">
              <span className="outline-session-icon">{"\u25BC"}</span>
              <span>Session: {sessionId.slice(0, 8)}...</span>
            </div>
            {markers.map((marker) => (
              <OutlineItem
                key={marker.id}
                marker={marker}
                isActive={marker.id === activeMarkerId}
                onClick={() => onSelectMarker(marker.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

interface OutlineItemProps {
  marker: BlockMarker;
  isActive: boolean;
  onClick: () => void;
}

const OutlineItem = memo(function OutlineItem({
  marker,
  isActive,
  onClick,
}: OutlineItemProps) {
  // Truncate command for display
  const displayCommand = marker.command.length > 30
    ? marker.command.slice(0, 30) + "..."
    : marker.command;

  // Format time as HH:MM
  const timeDisplay = formatBlockTime(marker.timestamp).slice(0, 5);

  // Calculate line count for display
  const lineCount = marker.endLine !== null
    ? marker.endLine - marker.startLine + 1
    : null;

  return (
    <div
      className={`outline-item ${isActive ? "outline-item-active" : ""}`}
      onClick={onClick}
    >
      <span className={`outline-item-status ${marker.status}`} />
      <span className="outline-item-command" title={marker.command}>
        {displayCommand || "(empty)"}
      </span>
      {lineCount !== null && lineCount > 1 && (
        <span className="outline-item-lines">{lineCount}L</span>
      )}
      <span className="outline-item-time">{timeDisplay}</span>
    </div>
  );
});

export default Outline;
