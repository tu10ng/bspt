import { useMemo } from "react";
import { BlockMarker } from "../types/session";

export interface CollapsedRange {
  markerId: string;
  startLine: number;  // First hidden line (after command)
  endLine: number;    // Last hidden line (before next prompt)
  hiddenCount: number;
}

/**
 * Calculate which line ranges should be visually hidden based on collapsed BlockMarkers.
 * This hook is used to overlay opaque divs over collapsed sections.
 *
 * Key insight: xterm.js buffer is never modified - we only visually hide lines.
 * This preserves data integrity for Ctrl+A selection and search.
 */
export function useCollapsedRanges(markers: BlockMarker[]): CollapsedRange[] {
  return useMemo(() => {
    return markers
      .filter((m) => {
        // Only include collapsed blocks with actual hidden content
        // Block needs at least 2 lines to have hideable content:
        // - startLine: command
        // - endLine: next prompt
        // Anything in between is hideable
        return (
          m.collapsed &&
          m.endLine !== null &&
          m.endLine > m.startLine + 1
        );
      })
      .map((m) => ({
        markerId: m.id,
        // Hidden range starts at line after command
        startLine: m.startLine + 1,
        // Hidden range ends at line before next prompt
        endLine: m.endLine! - 1,
        // Count of hidden lines
        hiddenCount: m.endLine! - m.startLine - 1,
      }));
  }, [markers]);
}
