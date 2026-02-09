import { memo } from "react";
import { BlockMarker, BlockStatus } from "../../types/session";
import { formatBlockTime } from "../../utils/blockDetector";

interface GutterRowProps {
  marker: BlockMarker;
  cellHeight: number;
  onToggle: () => void;
  onClick?: () => void;
}

const STATUS_COLORS: Record<BlockStatus, string> = {
  running: "var(--block-status-running)",
  success: "var(--block-status-success)",
  error: "var(--block-status-error)",
};

export const GutterRow = memo(function GutterRow({
  marker,
  cellHeight,
  onToggle,
  onClick,
}: GutterRowProps) {
  // Calculate height: single row for command line
  const rowHeight = cellHeight;

  // Format time as HH:MM
  const timeDisplay = formatBlockTime(marker.timestamp).slice(0, 5);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick();
    }
  };

  const handleToggleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle();
  };

  return (
    <div
      className="gutter-row"
      style={{
        position: "absolute",
        top: marker.startLine * cellHeight,
        height: rowHeight,
      }}
      onClick={handleClick}
    >
      {/* Status bar */}
      <span
        className="gutter-status"
        style={{ backgroundColor: STATUS_COLORS[marker.status] }}
      />

      {/* Fold icon - only show for completed blocks with multiple lines */}
      {marker.endLine !== null && marker.endLine > marker.startLine ? (
        <span className="gutter-fold" onClick={handleToggleClick}>
          {marker.collapsed ? "\u25B6" : "\u25BC"}
        </span>
      ) : (
        <span className="gutter-fold">
          {marker.status === "running" ? "\u25CF" : ""}
        </span>
      )}

      {/* Timestamp */}
      <span className="gutter-time">{timeDisplay}</span>
    </div>
  );
});

export default GutterRow;
