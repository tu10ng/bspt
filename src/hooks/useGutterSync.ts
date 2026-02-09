import { useState, useEffect, useCallback } from "react";
import { Terminal } from "@xterm/xterm";

interface GutterSyncState {
  scrollTop: number;
  cellHeight: number;
  cellWidth: number;
  viewportRows: number;
  bufferLine: number;  // Current top line of viewport in buffer
}

/**
 * Hook to sync gutter scroll position with xterm.js viewport.
 *
 * The gutter overlay needs to track the terminal's scroll position
 * to align marker rows with their corresponding terminal lines.
 */
export function useGutterSync(terminal: Terminal | null): GutterSyncState {
  const [syncState, setSyncState] = useState<GutterSyncState>({
    scrollTop: 0,
    cellHeight: 17,
    cellWidth: 8,
    viewportRows: 24,
    bufferLine: 0,
  });

  const updateDimensions = useCallback(() => {
    if (!terminal) return;

    // Access xterm internal rendering dimensions
    // @ts-expect-error - accessing private xterm API for dimensions
    const renderService = terminal._core?._renderService;
    if (!renderService?.dimensions?.css?.cell) return;

    const cellHeight = renderService.dimensions.css.cell.height;
    const cellWidth = renderService.dimensions.css.cell.width;
    const viewportRows = terminal.rows;
    const bufferLine = terminal.buffer.active.viewportY;
    const scrollTop = bufferLine * cellHeight;

    setSyncState({
      scrollTop,
      cellHeight,
      cellWidth,
      viewportRows,
      bufferLine,
    });
  }, [terminal]);

  useEffect(() => {
    if (!terminal) return;

    // Initial dimensions
    updateDimensions();

    // Update on scroll
    const scrollDisposable = terminal.onScroll(() => {
      updateDimensions();
    });

    // Update on resize
    const resizeDisposable = terminal.onResize(() => {
      updateDimensions();
    });

    // Update on render (catches line additions)
    const renderDisposable = terminal.onRender(() => {
      updateDimensions();
    });

    return () => {
      scrollDisposable.dispose();
      resizeDisposable.dispose();
      renderDisposable.dispose();
    };
  }, [terminal, updateDimensions]);

  return syncState;
}

/**
 * Get the current cursor line in the terminal buffer.
 * Used to track where new output is being written.
 */
export function getCurrentBufferLine(terminal: Terminal | null): number {
  if (!terminal) return 0;
  const buffer = terminal.buffer.active;
  return buffer.baseY + buffer.cursorY;
}

export default useGutterSync;
