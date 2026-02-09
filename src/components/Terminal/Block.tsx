import { memo, useMemo, useRef, useEffect } from "react";
import { Block } from "../../types/session";
import { formatBlockTime, stripAnsi } from "../../utils/blockDetector";
import { BlockGutter } from "./BlockGutter";

interface BlockProps {
  block: Block;
  isActive?: boolean;
  onToggle: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export const BlockView = memo(function BlockView({
  block,
  isActive = false,
  onToggle,
  onContextMenu,
}: BlockProps) {
  const blockRef = useRef<HTMLDivElement>(null);

  // Clean output for display (strip ANSI codes)
  const cleanOutput = useMemo(() => stripAnsi(block.output), [block.output]);

  // Format line count for display
  const lineCountDisplay = useMemo(() => {
    if (block.lineCount <= 1) return "";
    return `${block.lineCount} lines`;
  }, [block.lineCount]);

  // Scroll into view when active
  useEffect(() => {
    if (isActive && blockRef.current) {
      blockRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isActive]);

  return (
    <div
      ref={blockRef}
      className={`block ${block.collapsed ? "block-collapsed" : ""} ${isActive ? "block-active" : ""}`}
      onContextMenu={onContextMenu}
    >
      <div className="block-row">
        <BlockGutter
          collapsed={block.collapsed}
          status={block.status}
          onToggle={onToggle}
        />
        <div className="block-content">
          <div className="block-header" onClick={onToggle}>
            <span className="block-command">{block.command || "(empty)"}</span>
            <span className="block-meta">
              {lineCountDisplay && (
                <span className="block-line-count">{lineCountDisplay}</span>
              )}
              <span className="block-timestamp">
                {formatBlockTime(block.timestamp)}
              </span>
            </span>
          </div>
          {!block.collapsed && cleanOutput && (
            <pre className="block-body">{cleanOutput}</pre>
          )}
        </div>
      </div>
    </div>
  );
});

interface BlockListProps {
  blocks: Block[];
  activeBlockId?: string;
  onToggle: (blockId: string) => void;
  onContextMenu?: (blockId: string, e: React.MouseEvent) => void;
}

export const BlockList = memo(function BlockList({
  blocks,
  activeBlockId,
  onToggle,
  onContextMenu,
}: BlockListProps) {
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className="block-list">
      {blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          isActive={block.id === activeBlockId}
          onToggle={() => onToggle(block.id)}
          onContextMenu={onContextMenu ? (e) => onContextMenu(block.id, e) : undefined}
        />
      ))}
    </div>
  );
});

export default BlockView;
