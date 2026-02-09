import { memo } from "react";

interface InlineGhostTextProps {
  text: string;           // The suggestion text to display (suffix only)
  cursorX: number;        // Cursor X position (characters from left)
  cursorY: number;        // Cursor Y position (lines from top of viewport)
  cellWidth: number;      // Terminal cell width in pixels
  cellHeight: number;     // Terminal cell height in pixels
  visible: boolean;
}

/**
 * InlineGhostText - Fish shell style inline autocomplete overlay
 *
 * Renders semi-transparent suggestion text directly after the cursor position
 * in the terminal. Uses absolute positioning synced with xterm.js cell dimensions.
 */
export const InlineGhostText = memo(function InlineGhostText({
  text,
  cursorX,
  cursorY,
  cellWidth,
  cellHeight,
  visible,
}: InlineGhostTextProps) {
  if (!visible || !text) return null;

  return (
    <span
      className="inline-ghost-text"
      style={{
        position: "absolute",
        left: `calc(var(--gutter-width, 60px) + ${cursorX * cellWidth}px)`,
        top: `${cursorY * cellHeight}px`,
        lineHeight: `${cellHeight}px`,
        pointerEvents: "none",
      }}
    >
      {text}
    </span>
  );
});

export default InlineGhostText;
