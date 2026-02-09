import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import { useThemeStore } from "../../stores/themeStore";

interface TerminalViewProps {
  sessionId: string;
}

export function TerminalView({ sessionId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const { fontFamily } = useThemeStore();

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

    // Initialize addons
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
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

    // Handle terminal input
    const inputDisposable = term.onData((data) => {
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
          term.write(bytes);
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
    resizeObserver.observe(containerRef.current);

    // Focus terminal
    term.focus();

    // Cleanup
    return () => {
      inputDisposable.dispose();
      resizeObserver.disconnect();
      unlistenData?.();
      unlistenState?.();
      term.dispose();
    };
  }, [sessionId, fontFamily, handleResize]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{
        width: "100%",
        height: "100%",
        padding: "8px",
        boxSizing: "border-box",
      }}
    />
  );
}

export default TerminalView;
