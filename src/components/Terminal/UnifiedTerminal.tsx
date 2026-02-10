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
import { useTracerStore } from "../../stores/tracerStore";
import { useCommandBarStore } from "../../stores/commandBarStore";
import { BlockDetector } from "../../utils/blockDetector";
import { useGutterSync, getCurrentBufferLine, useCollapsedRanges, useTerminalPool } from "../../hooks";
import type { TerminalInstance } from "../../hooks";
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

  // Track last sent dimensions to avoid duplicate resize calls
  const lastDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Terminal pool for instance persistence across tab switches
  const pool = useTerminalPool();

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

  // Clipboard history for CommandBar
  const addClipboardEntry = useCommandBarStore((s) => s.addClipboardEntry);

  // Tracer for log-to-source mapping
  const matchLine = useTracerStore((s) => s.matchLine);

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
    if (!fitAddonRef.current || !terminalRef.current || !containerRef.current) return;

    // Skip resize if container is hidden (display: none) or too small
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width < 50 || rect.height < 50) {
      return;
    }

    fitAddonRef.current.fit();
    const { cols, rows } = terminalRef.current;

    // Skip sending tiny dimensions to backend
    if (cols < 20 || rows < 5) {
      return;
    }

    // Skip if dimensions haven't changed
    const last = lastDimensionsRef.current;
    if (last && last.cols === cols && last.rows === rows) {
      return;
    }

    // Debounce: clear pending timeout and set new one
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = setTimeout(() => {
      // Double-check dimensions are still the same
      if (!terminalRef.current) return;
      const { cols: currentCols, rows: currentRows } = terminalRef.current;

      lastDimensionsRef.current = { cols: currentCols, rows: currentRows };

      invoke("resize_terminal", {
        sessionId,
        cols: currentCols,
        rows: currentRows,
      }).catch(console.error);
    }, 100);
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

  // Initialize terminal with pool-based instance management
  useEffect(() => {
    if (!containerRef.current) return;

    let term: Terminal;
    let detector: BlockDetector;
    let termContainer: HTMLDivElement;
    let isNewInstance = false;

    // Check if we already have an instance in the pool
    const existingInstance = pool.get(sessionId);
    if (existingInstance) {
      // Reuse existing instance - attach to DOM
      containerRef.current.appendChild(existingInstance.containerDiv);

      term = existingInstance.terminal;
      detector = existingInstance.detector;
      termContainer = existingInstance.containerDiv;

      // Update refs
      terminalRef.current = term;
      fitAddonRef.current = existingInstance.fitAddon;
      searchAddonRef.current = existingInstance.searchAddon;
      detectorRef.current = detector;

      // Dispose old React-side handlers (they reference stale state)
      existingInstance.disposables.forEach((d) => d.dispose());
      existingInstance.disposables = [];

      // Refit to new container size
      existingInstance.fitAddon.fit();

      // Focus terminal
      term.focus();
    } else {
      // Create new terminal instance
      isNewInstance = true;

      // Create inner container div for the terminal
      termContainer = document.createElement("div");
      termContainer.className = "terminal-canvas-inner";
      termContainer.style.width = "100%";
      termContainer.style.height = "100%";
      containerRef.current.appendChild(termContainer);

      // Create terminal with transparent background
      term = new Terminal({
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
      detector = new BlockDetector({
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
      term.open(termContainer);

      // Try to load WebGL addon for better performance
      let webglAddon: WebglAddon | null = null;
      try {
        webglAddon = new WebglAddon();
        webglAddon.onContextLoss(() => {
          webglAddon?.dispose();
        });
        term.loadAddon(webglAddon);
      } catch (e) {
        console.warn("WebGL addon not supported:", e);
      }

      // Fit terminal to container
      fitAddon.fit();

      // Store instance in pool (without disposables yet)
      const instance: TerminalInstance = {
        terminal: term,
        containerDiv: termContainer,
        fitAddon,
        webglAddon,
        searchAddon,
        detector,
        disposables: [],
      };
      pool.set(sessionId, instance);
    }

    // === Setup React-side handlers (fresh each mount) ===

    // Update cell dimensions
    const updateCellDimensions = () => {
      const core = (term as unknown as { _core: {
        _renderService?: { dimensions?: { css?: { cell?: { width: number; height: number } } } }
      } })._core;
      const dims = core?._renderService?.dimensions?.css?.cell;
      if (dims) {
        setCellDimensions({ width: dims.width, height: dims.height });
      }
    };
    setTimeout(updateCellDimensions, 100);

    // Helper to extract current input from prompt line
    const extractPromptInput = (lineText: string): string => {
      const promptMatch = lineText.match(/[$#>\]]\s*(.*)$/);
      return promptMatch?.[1] || "";
    };

    // Helper to update ghost text based on current line
    const updateGhostText = () => {
      const buffer = term.buffer.active;
      const line = buffer.getLine(buffer.cursorY + buffer.baseY);
      const lineText = line?.translateToString(true) || "";
      const currentInput = extractPromptInput(lineText);

      setCursorPos({ x: buffer.cursorX, y: buffer.cursorY });

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

    // Collect disposables
    const disposables: Array<{ dispose: () => void }> = [];

    // Handle terminal input with Tab key interception
    const inputDisposable = term.onData((data) => {
      if (data === "\t" && ghostTextRef.current) {
        const encoder = new TextEncoder();
        const bytes = Array.from(encoder.encode(ghostTextRef.current));
        invoke("send_input", { sessionId, data: bytes }).catch(console.error);
        setGhostText("");
        return;
      }

      detector.processInput(data);

      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(data));
      invoke("send_input", { sessionId, data: bytes }).catch(console.error);

      if (data === "\r" || data === "\n") {
        setGhostText("");
      }
    });
    disposables.push(inputDisposable);

    // Track cursor movement to update ghost text
    const cursorDisposable = term.onCursorMove(() => {
      updateGhostText();
    });
    disposables.push(cursorDisposable);

    // Track selection changes
    const selectionDisposable = term.onSelectionChange(() => {});
    disposables.push(selectionDisposable);

    // Listen for Ctrl+C to capture clipboard
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "c" && term.hasSelection()) {
        const selectedText = term.getSelection();
        if (selectedText) {
          addClipboardEntry(selectedText);
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    // Store disposables in pool instance
    const poolInstance = pool.get(sessionId);
    if (poolInstance) {
      poolInstance.disposables = disposables;
    }

    // === Setup Tauri listeners (only for new instances) ===
    let unlistenData: UnlistenFn | null = null;
    let unlistenState: UnlistenFn | null = null;

    if (isNewInstance) {
      let pendingWrites = 0;
      const BATCH_THRESHOLD = 10;

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

            term.write(bytes, () => {
              detector.processOutput(text);
              updateGhostText();
              updateCellDimensions();

              const lines = text.split("\n");
              for (const line of lines) {
                if (line.trim().length > 5) {
                  matchLine(line.trim(), sessionId).catch(() => {});
                }
              }

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

        // Update pool instance with listeners
        const inst = pool.get(sessionId);
        if (inst) {
          inst.unlistenData = unlistenData ?? undefined;
          inst.unlistenState = unlistenState ?? undefined;
        }
      };

      setupListeners();
    }

    // Handle window resize
    const resizeObserver = new ResizeObserver((entries) => {
      handleResize();
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Cleanup: dispose React handlers, detach from DOM
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      resizeObserver.disconnect();

      // Clear pending resize timeout
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }

      // Dispose React-side handlers
      disposables.forEach((d) => d.dispose());

      // Clear disposables from pool (they're now stale)
      const inst = pool.get(sessionId);
      if (inst) {
        inst.disposables = [];
      }

      // Just remove from DOM, instance stays in pool
      if (termContainer.parentNode) {
        termContainer.remove();
      }
    };
    // Note: handleResize uses refs so it's stable, but we still include it for correctness
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, fontFamily, createMarker, completeMarker, getCommandHistory, matchLine, addClipboardEntry, pool]);

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
