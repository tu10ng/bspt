import { memo } from "react";
import { BlockStatus } from "../../types/session";

interface BlockGutterProps {
  collapsed: boolean;
  status: BlockStatus;
  onToggle: () => void;
}

const STATUS_COLORS: Record<BlockStatus, string> = {
  running: "var(--block-status-running)",
  success: "var(--block-status-success)",
  error: "var(--block-status-error)",
};

export const BlockGutter = memo(function BlockGutter({
  collapsed,
  status,
  onToggle,
}: BlockGutterProps) {
  return (
    <div className="block-gutter" onClick={onToggle}>
      <span className="block-fold-icon">{collapsed ? "\u25B6" : "\u25BC"}</span>
      <span
        className="block-status-bar"
        style={{ backgroundColor: STATUS_COLORS[status] }}
      />
    </div>
  );
});

export default BlockGutter;
