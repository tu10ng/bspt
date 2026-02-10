import { useCallback, useMemo, useRef } from "react";
import type { Terminal } from "@xterm/xterm";

// Keyword patterns for VRP terminal highlighting
const KEYWORD_PATTERNS = {
  error: {
    patterns: [/\bError\b/gi, /\bFailed\b/gi, /\bdown\b/gi, /\bDOWN\b/g],
    color: "#ff5555", // Red
  },
  warning: {
    patterns: [/\bWarning\b/gi, /\bwarning\b/g],
    color: "#f1fa8c", // Yellow
  },
  success: {
    patterns: [/\bup\b/gi, /\bUP\b/g, /\bconnected\b/gi, /\bSuccess\b/gi],
    color: "#50fa7b", // Green
  },
} as const;

interface HighlightRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  color: string;
}

interface UseKeywordHighlighterOptions {
  enabled?: boolean;
}

/**
 * Hook for tracking user-typed parameters and highlighting them in output.
 * Also applies syntax highlighting for keywords like Error, Warning, UP, DOWN.
 */
export function useKeywordHighlighter(options: UseKeywordHighlighterOptions = {}) {
  const { enabled = true } = options;

  // Track parameters typed by the user (e.g., interface names like GE0/0/1)
  const typedParametersRef = useRef<Set<string>>(new Set());

  // Extract parameters from a command string
  // Matches patterns like: GE0/0/1, Eth-Trunk1, Vlanif100, 192.168.1.1, etc.
  const extractParameters = useCallback((command: string): string[] => {
    const patterns = [
      /\bGE\d+\/\d+\/\d+\b/gi, // Gigabit Ethernet interfaces
      /\bXGE\d+\/\d+\/\d+\b/gi, // 10G Ethernet interfaces
      /\bEth-Trunk\d+\b/gi, // Trunk interfaces
      /\bVlanif\d+\b/gi, // VLAN interfaces
      /\bLoopBack\d+\b/gi, // Loopback interfaces
      /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IP addresses
      /\b[A-Za-z]\d+\/\d+\/\d+\b/g, // Generic slot/card/port
    ];

    const params: string[] = [];
    for (const pattern of patterns) {
      const matches = command.match(pattern);
      if (matches) {
        params.push(...matches);
      }
    }
    return params;
  }, []);

  // Called when user submits a command
  const onCommandSubmit = useCallback(
    (command: string) => {
      if (!enabled) return;

      const params = extractParameters(command);
      for (const param of params) {
        typedParametersRef.current.add(param.toLowerCase());
      }
    },
    [enabled, extractParameters]
  );

  // Clear tracked parameters
  const clearParameters = useCallback(() => {
    typedParametersRef.current.clear();
  }, []);

  // Get all tracked parameters
  const getTrackedParameters = useCallback(() => {
    return Array.from(typedParametersRef.current);
  }, []);

  // Build regex patterns for highlighting
  const highlightPatterns = useMemo(() => {
    if (!enabled) return [];

    const patterns: { pattern: RegExp; color: string }[] = [];

    // Add built-in keyword patterns
    for (const [, config] of Object.entries(KEYWORD_PATTERNS)) {
      for (const pattern of config.patterns) {
        patterns.push({ pattern, color: config.color });
      }
    }

    return patterns;
  }, [enabled]);

  // Find highlight ranges in a buffer line
  const findHighlightRanges = useCallback(
    (line: string, rowIndex: number): HighlightRange[] => {
      if (!enabled) return [];

      const ranges: HighlightRange[] = [];

      // Check built-in keyword patterns
      for (const { pattern, color } of highlightPatterns) {
        // Reset regex state for global patterns
        pattern.lastIndex = 0;

        let match;
        while ((match = pattern.exec(line)) !== null) {
          ranges.push({
            startRow: rowIndex,
            startCol: match.index,
            endRow: rowIndex,
            endCol: match.index + match[0].length,
            color,
          });
        }
      }

      // Check user-typed parameters (highlight in cyan)
      for (const param of typedParametersRef.current) {
        const paramRegex = new RegExp(`\\b${escapeRegExp(param)}\\b`, "gi");
        let match;
        while ((match = paramRegex.exec(line)) !== null) {
          ranges.push({
            startRow: rowIndex,
            startCol: match.index,
            endRow: rowIndex,
            endCol: match.index + match[0].length,
            color: "#8be9fd", // Cyan for user parameters
          });
        }
      }

      return ranges;
    },
    [enabled, highlightPatterns]
  );

  // Apply decorations to an xterm.js terminal (if using decoration API)
  const applyDecorations = useCallback(
    (terminal: Terminal) => {
      if (!enabled) return () => {};

      const decorations: ReturnType<typeof terminal.registerDecoration>[] = [];

      // Get buffer content
      const buffer = terminal.buffer.active;
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (!line) continue;

        const lineText = line.translateToString();
        const ranges = findHighlightRanges(lineText, i);

        for (const range of ranges) {
          try {
            const decoration = terminal.registerDecoration({
              marker: terminal.registerMarker(range.startRow - buffer.baseY),
              x: range.startCol,
              width: range.endCol - range.startCol,
              backgroundColor: range.color,
            });
            if (decoration) {
              decorations.push(decoration);
            }
          } catch {
            // Decoration API may not be available in all xterm versions
          }
        }
      }

      // Return cleanup function
      return () => {
        for (const decoration of decorations) {
          decoration?.dispose();
        }
      };
    },
    [enabled, findHighlightRanges]
  );

  return {
    onCommandSubmit,
    clearParameters,
    getTrackedParameters,
    findHighlightRanges,
    applyDecorations,
  };
}

// Escape special regex characters in a string
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default useKeywordHighlighter;
