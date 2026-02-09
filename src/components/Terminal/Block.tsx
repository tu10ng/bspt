import { memo, useMemo } from "react";
import { Block } from "../../types/session";
import { formatBlockTime, stripAnsi } from "../../utils/blockDetector";

interface BlockProps {
  block: Block;
  onToggle: () => void;
}

const STATUS_COLORS: Record<Block["status"], string> = {
  running: "#f1fa8c", // yellow
  success: "#50fa7b", // green
  error: "#ff5555", // red
};

export const BlockView = memo(function BlockView({ block, onToggle }: BlockProps) {
  const statusColor = STATUS_COLORS[block.status];

  // Clean output for display (strip ANSI codes)
  const cleanOutput = useMemo(() => stripAnsi(block.output), [block.output]);

  // Format line count for display
  const lineCountDisplay = useMemo(() => {
    if (block.lineCount <= 1) return "";
    return `${block.lineCount} lines`;
  }, [block.lineCount]);

  return (
    <div className={`block ${block.collapsed ? "block-collapsed" : ""}`}>
      <div className="block-header" onClick={onToggle}>
        <span
          className="block-gutter"
          style={{ backgroundColor: statusColor }}
        />
        <span className="block-command">{block.command}</span>
        <span className="block-meta">
          {lineCountDisplay && (
            <span className="block-line-count">{lineCountDisplay}</span>
          )}
          <span className="block-timestamp">
            {formatBlockTime(block.timestamp)}
          </span>
        </span>
        <span className="block-chevron">{block.collapsed ? "▶" : "▼"}</span>
      </div>
      {!block.collapsed && cleanOutput && (
        <pre className="block-body">{cleanOutput}</pre>
      )}
    </div>
  );
});

interface BlockListProps {
  blocks: Block[];
  onToggle: (blockId: string) => void;
}

export const BlockList = memo(function BlockList({ blocks, onToggle }: BlockListProps) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="block-list">
      {blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          onToggle={() => onToggle(block.id)}
        />
      ))}
    </div>
  );
});

export default BlockView;
