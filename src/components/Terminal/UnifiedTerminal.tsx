import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

import { useThemeStore } from "../../stores/themeStore";
import { useBlockStore } from "../../stores/blockStore";
import { BlockDetector } from "../../utils/blockDetector";
import { useGutterSync, getCurrentBufferLine, useCollapsedRanges } from "../../hooks";
import { GutterOverlay } from "./GutterOverlay";
import { InlineGhostText } from "./InlineGhostText";

interface UnifiedTerminalProps {
  sessionId: string;
  activeMarkerId?: string | null;
}

export function UnifiedTerminal({ sessionId, activeMarkerId: _activeMarkerId }: UnifiedTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const detectorRef = useRef<BlockDetector | null>(null);
  const ghostTextRef = useRef<string>("");

  const { fontFamily } = useThemeStore();
  const {
    createMarker,
    completeMarker,
    toggleCollapse,
    collapseAll,
    expandAll,
    clearSession,
    getSessionMarkers,
    setActiveMarker,
    getCommandHistory,
  } = useBlockStore();

  const markers = getSessionMarkers(sessionId);

  // Calculate collapsed ranges for visual hiding
  const collapsedRanges = useCollapsedRanges(markers);

  // Gutter sync state
  const gutterSync = useGutterSync(terminalRef.current);

  // Container dimensions for gutter
  const [containerHeight, setContainerHeight] = useState(0);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    markerId: string;
  } | null>(null);

  // Inline ghost text state (Fish shell style autocomplete)
  const [ghostText, setGhostText] = useState("");
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [cellDimensions, setCellDimensions] = useState({ width: 0, height: 0 });

  // Keep ghostTextRef in sync with state for use in event handlers
  useEffect(() => {
    ghostTextRef.current = ghostText;
  }, [ghostText]);

  const handleResize = useCallback(() => {
    if (!fitAddonRef.current || !terminalRef.current) return;

    fitAddonRef.current.fit();
    const { cols, rows } = terminalRef.current;

    invoke("resize_terminal", {
      sessionId,
      cols,
      rows,
    }).catch(console.error);
  }, [sessionId]);

  const handleMarkerToggle = useCallback(
    (markerId: string) => {
      toggleCollapse(markerId);
    },
    [toggleCollapse]
  );

  const handleMarkerClick = useCallback(
    (markerId: string) => {
      setActiveMarker(markerId);
      // Scroll terminal to marker position
      const marker = markers.find((m) => m.id === markerId);
      if (marker && terminalRef.current) {
        terminalRef.current.scrollToLine(marker.startLine);
      }
      // Clear highlight after 2 seconds
      setTimeout(() => {
        setActiveMarker(null);
      }, 2000);
    },
    [markers, setActiveMarker]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      // Find marker at click position
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clickY = e.clientY - rect.top + gutterSync.scrollTop;
      const clickLine = Math.floor(clickY / gutterSync.cellHeight);

      const marker = markers.find((m) => {
        if (clickLine < m.startLine) return false;
        if (m.endLine === null) return clickLine <= m.startLine + 100; // Running marker
        return clickLine <= m.endLine;
      });

      if (marker) {
        setContextMenu({ x: e.clientX, y: e.clientY, markerId: marker.id });
      }
    },
    [markers, gutterSync]
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Search state for find functionality
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchBar, setShowSearchBar] = useState(false);

  // Search handler
  // Note: Auto-expand on search requires getting the match line number,
  // which xterm SearchAddon doesn't expose directly. For now, we expand
  // all blocks when searching to ensure the match is visible.
  const handleSearch = useCallback(
    (query: string, direction: "next" | "prev" = "next") => {
      if (!searchAddonRef.current) return false;

      // Expand all blocks when searching to ensure matches are visible
      // This is a simple approach since SearchAddon doesn't expose match line
      if (query) {
        expandAll(sessionId);
      }

      const result =
        direction === "next"
          ? searchAddonRef.current.findNext(query, {
              decorations: {
                matchBackground: "#f1fa8c40",
                matchBorder: "#f1fa8c",
                matchOverviewRuler: "#f1fa8c",
                activeMatchBackground: "#50fa7b60",
                activeMatchBorder: "#50fa7b",
                activeMatchColorOverviewRuler: "#50fa7b",
              },
            })
          : searchAddonRef.current.findPrevious(query, {
              decorations: {
                matchBackground: "#f1fa8c40",
                matchBorder: "#f1fa8c",
                matchOverviewRuler: "#f1fa8c",
                activeMatchBackground: "#50fa7b60",
                activeMatchBorder: "#50fa7b",
                activeMatchColorOverviewRuler: "#50fa7b",
              },
            });

      return result;
    },
    [sessionId, expandAll]
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Shift+[ - Collapse All
      if (e.ctrlKey && e.shiftKey && e.key === "[") {
        e.preventDefault();
        collapseAll(sessionId);
      }
      // Ctrl+Shift+] - Expand All
      if (e.ctrlKey && e.shiftKey && e.key === "]") {
        e.preventDefault();
        expandAll(sessionId);
      }
      // Ctrl+L - Clear All
      if (e.ctrlKey && e.key === "l") {
        clearSession(sessionId);
      }
      // Ctrl+F - Find
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        setShowSearchBar(true);
      }
      // Escape - Close search
      if (e.key === "Escape" && showSearchBar) {
        setShowSearchBar(false);
        setSearchQuery("");
        searchAddonRef.current?.clearDecorations();
      }
      // F3 or Ctrl+G - Find next
      if ((e.key === "F3" || (e.ctrlKey && e.key === "g")) && searchQuery) {
        e.preventDefault();
        handleSearch(searchQuery, e.shiftKey ? "prev" : "next");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sessionId, collapseAll, expandAll, clearSession, showSearchBar, searchQuery, handleSearch]);

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal with transparent background
    const term = new Terminal({
      allowTransparency: true,
      theme: {
        background: "#00000000",
        foreground: "#e0e0e0",
        cursor: "#ffffff",
        cursorAccent: "#000000",
        selectionBackground: "#ffffff40",
        black: "#000000",
        red: "#ff5555",
        green: "#50fa7b",
        yellow: "#f1fa8c",
        blue: "#6272a4",
        magenta: "#ff79c6",
        cyan: "#8be9fd",
        white: "#f8f8f2",
        brightBlack: "#6272a4",
        brightRed: "#ff6e6e",
        brightGreen: "#69ff94",
        brightYellow: "#ffffa5",
        brightBlue: "#d6acff",
        brightMagenta: "#ff92df",
        brightCyan: "#a4ffff",
        brightWhite: "#ffffff",
      },
      fontFamily: fontFamily,
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
    });

    terminalRef.current = term;

    // Initialize block detector with line number tracking
    const detector = new BlockDetector({
      onBlockStart: (command, startLine) => {
        return createMarker(sessionId, command, startLine);
      },
      onBlockComplete: (markerId, endLine, status) => {
        completeMarker(markerId, endLine, status);
      },
      getCurrentLine: () => getCurrentBufferLine(term),
    });
    detectorRef.current = detector;

    // Initialize addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    term.loadAddon(searchAddon);

    // Open terminal in container
    term.open(containerRef.current);

    // Try to load WebGL addon for better performance
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon not supported:", e);
    }

    // Fit terminal to container
    fitAddon.fit();

    // Update cell dimensions after fit
    const updateCellDimensions = () => {
      // Access internal render dimensions for accurate cell sizing
      const core = (term as unknown as { _core: {
        _renderService?: { dimensions?: { css?: { cell?: { width: number; height: number } } } }
      } })._core;
      const dims = core?._renderService?.dimensions?.css?.cell;
      if (dims) {
        setCellDimensions({ width: dims.width, height: dims.height });
      }
    };
    // Initial update after a short delay to ensure rendering is ready
    setTimeout(updateCellDimensions, 100);

    // Helper to extract current input from prompt line
    const extractPromptInput = (lineText: string): string => {
      // Match common prompt endings: $, #, >, ], followed by optional space and input
      const promptMatch = lineText.match(/[$#>\]]\s*(.*)$/);
      return promptMatch?.[1] || "";
    };

    // Helper to update ghost text based on current line
    const updateGhostText = () => {
      const buffer = term.buffer.active;
      const line = buffer.getLine(buffer.cursorY + buffer.baseY);
      const lineText = line?.translateToString(true) || "";
      const currentInput = extractPromptInput(lineText);

      // Update cursor position (relative to viewport)
      setCursorPos({ x: buffer.cursorX, y: buffer.cursorY });

      // Match against command history
      if (currentInput.length > 0) {
        const history = getCommandHistory(sessionId);
        const match = history.find(
          (cmd) => cmd.startsWith(currentInput) && cmd !== currentInput
        );
        setGhostText(match ? match.slice(currentInput.length) : "");
      } else {
        setGhostText("");
      }
    };

    // Handle terminal input with Tab key interception
    const inputDisposable = term.onData((data) => {
      // Tab key - accept ghost text suggestion
      if (data === "\t" && ghostTextRef.current) {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(ghostTextRef.current));
        invoke("send_input", { sessionId, data: bytes }).catch(console.error);
        setGhostText("");
        return; // Don't send Tab to backend
      }

      // Update detector state for block detection
      detector.processInput(data);

      // Send all input directly to backend
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(data));
      invoke("send_input", {
        sessionId,
        data: bytes,
      }).catch(console.error);

      // Clear ghost text on Enter (command submitted)
      if (data === "\r" || data === "\n") {
        setGhostText("");
      }
    });

    // Track cursor movement to update ghost text
    const cursorDisposable = term.onCursorMove(() => {
      updateGhostText();
    });

    // Listen for data from backend with batching for backpressure control
    let unlistenData: UnlistenFn | null = null;
    let unlistenState: UnlistenFn | null = null;

    // Batch processing state
    let pendingWrites = 0;
    const BATCH_THRESHOLD = 10; // Notify drain after this many writes

    const notifyDrain = () => {
      invoke("notify_buffer_drained", { sessionId }).catch((e) => {
        console.warn("Failed to notify buffer drain:", e);
      });
    };

    const setupListeners = async () => {
      unlistenData = await listen<number[]>(
        `session:${sessionId}`,
        (event) => {
          const bytes = new Uint8Array(event.payload);
          const text = new TextDecoder().decode(bytes);

          pendingWrites++;

          // Write to terminal, then process for block detection after write completes
          // This ensures the buffer is updated before getCurrentLine() is called
          term.write(bytes, () => {
            detector.processOutput(text);
            // Update ghost text after output is written
            updateGhostText();
            updateCellDimensions();

            // Notify backend that we've processed data (backpressure signal)
            // Batch notifications to avoid excessive IPC overhead
            if (pendingWrites >= BATCH_THRESHOLD) {
              pendingWrites = 0;
              notifyDrain();
            }
          });
        }
      );

      unlistenState = await listen<string>(
        `session:${sessionId}:state`,
        (event) => {
          console.log(`Session ${sessionId} state:`, event.payload);
        }
      );
    };

    setupListeners();

    // Handle window resize
    const resizeObserver = new ResizeObserver((entries) => {
      handleResize();
      // Update container height for gutter
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Cleanup
    return () => {
      inputDisposable.dispose();
      cursorDisposable.dispose();
      resizeObserver.disconnect();
      unlistenData?.();
      unlistenState?.();
      detector.dispose();
      term.dispose();
    };
  }, [
    sessionId,
    fontFamily,
    handleResize,
    createMarker,
    completeMarker,
    getCommandHistory,
  ]);

  // Context menu actions
  const handleCopyCommand = useCallback(() => {
    if (!contextMenu) return;
    const marker = markers.find((m) => m.id === contextMenu.markerId);
    if (marker) {
      navigator.clipboard.writeText(marker.command);
    }
    closeContextMenu();
  }, [contextMenu, markers, closeContextMenu]);

  const handleRerunCommand = useCallback(() => {
    if (!contextMenu) return;
    const marker = markers.find((m) => m.id === contextMenu.markerId);
    if (marker && terminalRef.current) {
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(marker.command + "\r"));
      invoke("send_input", { sessionId, data: bytes }).catch(console.error);
      detectorRef.current?.processInput(marker.command);
      detectorRef.current?.processInput("\r");
    }
    closeContextMenu();
  }, [contextMenu, markers, sessionId, closeContextMenu]);

  return (
    <div className="unified-terminal" onContextMenu={handleContextMenu}>
      {/* Search bar */}
      {showSearchBar && (
        <div className="terminal-search-bar">
          <input
            type="text"
            className="terminal-search-input"
            placeholder="Search..."
            value={searchQuery}
            autoFocus
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value) {
                handleSearch(e.target.value);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleSearch(searchQuery, e.shiftKey ? "prev" : "next");
              }
            }}
          />
          <button
            className="terminal-search-btn"
            onClick={() => handleSearch(searchQuery, "prev")}
            title="Previous (Shift+Enter)"
          >
            &#x25B2;
          </button>
          <button
            className="terminal-search-btn"
            onClick={() => handleSearch(searchQuery, "next")}
            title="Next (Enter)"
          >
            &#x25BC;
          </button>
          <button
            className="terminal-search-close"
            onClick={() => {
              setShowSearchBar(false);
              setSearchQuery("");
              searchAddonRef.current?.clearDecorations();
            }}
            title="Close (Esc)"
          >
            &#x2715;
          </button>
        </div>
      )}

      {/* Gutter overlay - synced with terminal scroll */}
      <div className="gutter-container">
        <GutterOverlay
          markers={markers}
          scrollTop={gutterSync.scrollTop}
          cellHeight={gutterSync.cellHeight}
          viewportHeight={containerHeight}
          onToggleMarker={handleMarkerToggle}
          onClickMarker={handleMarkerClick}
        />
      </div>

      {/* Terminal canvas - all output renders here */}
      <div ref={containerRef} className="terminal-canvas" />

      {/* Collapsed range overlays - opaque covers for hidden lines */}
      {collapsedRanges.map((range) => (
        <div
          key={`collapse-overlay-${range.markerId}`}
          className="collapsed-range-overlay"
          style={{
            position: "absolute",
            top: range.startLine * gutterSync.cellHeight - gutterSync.scrollTop,
            left: "var(--gutter-width, 60px)",
            right: 0,
            height: range.hiddenCount * gutterSync.cellHeight,
            zIndex: 5,
          }}
        />
      ))}

      {/* Inline Ghost Text - Fish shell style autocomplete */}
      <InlineGhostText
        text={ghostText}
        cursorX={cursorPos.x}
        cursorY={cursorPos.y}
        cellWidth={cellDimensions.width}
        cellHeight={cellDimensions.height}
        visible={ghostText.length > 0}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
        >
          <button className="context-menu-item" onClick={handleCopyCommand}>
            Copy Command
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={handleRerunCommand}>
            Re-run Command
          </button>
          <div className="context-menu-separator" />
          <button
            className="context-menu-item"
            onClick={() => {
              if (contextMenu) toggleCollapse(contextMenu.markerId);
              closeContextMenu();
            }}
          >
            Toggle Collapse
          </button>
          <button
            className="context-menu-item"
            onClick={() => {
              collapseAll(sessionId);
              closeContextMenu();
            }}
          >
            Collapse All
          </button>
        </div>
      )}
    </div>
  );
}

export default UnifiedTerminal;
