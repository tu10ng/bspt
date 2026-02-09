import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";

import { useThemeStore } from "../../stores/themeStore";
import { useBlockStore } from "../../stores/blockStore";
import { BlockDetector } from "../../utils/blockDetector";
import { BlockList } from "./Block";
import { InputOverlay } from "./InputOverlay";

interface BlockTerminalProps {
  sessionId: string;
}

export function BlockTerminal({ sessionId }: BlockTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const blockListRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const detectorRef = useRef<BlockDetector | null>(null);

  const { fontFamily } = useThemeStore();
  const {
    createBlock,
    appendOutput,
    completeBlock,
    toggleCollapse,
    getSessionBlocks,
    getCommandHistory,
  } = useBlockStore();

  const blocks = getSessionBlocks(sessionId);
  const commandHistory = getCommandHistory(sessionId);

  // InputOverlay state
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [overlayInput, setOverlayInput] = useState("");

  // Scroll to bottom when new blocks are added
  useEffect(() => {
    if (blockListRef.current) {
      blockListRef.current.scrollTop = blockListRef.current.scrollHeight;
    }
  }, [blocks.length]);

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

  const handleBlockToggle = useCallback(
    (blockId: string) => {
      toggleCollapse(blockId);
    },
    [toggleCollapse]
  );

  // Ctrl+Space toggle for InputOverlay
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.code === "Space") {
        e.preventDefault();
        setOverlayVisible((v) => !v);
        if (!overlayVisible) {
          setOverlayInput("");
        }
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [overlayVisible]);

  // Handle command submission from InputOverlay
  const handleOverlaySubmit = useCallback(
    (command: string) => {
      // Send command with carriage return
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(command + "\r"));
      invoke("send_input", { sessionId, data: bytes }).catch(console.error);

      // Process for block detection
      detectorRef.current?.processInput(command);
      detectorRef.current?.processInput("\r");

      // Hide overlay
      setOverlayVisible(false);
      setOverlayInput("");
    },
    [sessionId]
  );

  useEffect(() => {
    if (!terminalContainerRef.current) return;

    // Initialize block detector
    const detector = new BlockDetector({
      onBlockStart: (command) => {
        return createBlock(sessionId, command);
      },
      onBlockOutput: (blockId, output) => {
        appendOutput(blockId, output);
      },
      onBlockComplete: (blockId, status) => {
        completeBlock(blockId, status);
      },
    });
    detectorRef.current = detector;

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
      scrollback: 10000, // Full scrollback for normal terminal behavior
    });

    terminalRef.current = term;

    // Initialize addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // Open terminal in container
    term.open(terminalContainerRef.current);

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

    // Handle terminal input - send all input directly to backend
    const inputDisposable = term.onData((data) => {
      // Update detector state for block detection
      detector.processInput(data);

      // Send all input directly to backend
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(data));
      invoke("send_input", {
        sessionId,
        data: bytes,
      }).catch(console.error);
    });

    // Listen for data from backend
    let unlistenData: UnlistenFn | null = null;
    let unlistenState: UnlistenFn | null = null;

    const setupListeners = async () => {
      unlistenData = await listen<number[]>(
        `session:${sessionId}`,
        (event) => {
          const bytes = new Uint8Array(event.payload);
          const text = new TextDecoder().decode(bytes);

          // Write to terminal
          term.write(bytes);

          // Process for block detection
          detector.processOutput(text);
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
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (terminalContainerRef.current) {
      resizeObserver.observe(terminalContainerRef.current);
    }

    // Cleanup
    return () => {
      inputDisposable.dispose();
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
    createBlock,
    appendOutput,
    completeBlock,
  ]);

  return (
    <div ref={containerRef} className="block-terminal">
      {/* Historical blocks - scrollable area above terminal */}
      <div ref={blockListRef} className="block-list-container">
        <BlockList blocks={blocks} onToggle={handleBlockToggle} />
      </div>

      {/* Fish-like command overlay (Ctrl+Space to toggle) */}
      <InputOverlay
        history={commandHistory}
        currentInput={overlayInput}
        onSubmit={handleOverlaySubmit}
        onInputChange={setOverlayInput}
        visible={overlayVisible}
      />

      {/* xterm.js handles all input directly */}
      <div
        ref={terminalContainerRef}
        className="terminal-main-container"
      />
    </div>
  );
}

export default BlockTerminal;
