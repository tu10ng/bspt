import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { SearchAddon } from "@xterm/addon-search";
import { UnlistenFn } from "@tauri-apps/api/event";
import { BlockDetector } from "../utils/blockDetector";

/**
 * Terminal instance stored in the pool.
 * Each session gets its own terminal instance that persists across tab switches.
 */
export interface TerminalInstance {
  terminal: Terminal;
  containerDiv: HTMLDivElement;
  fitAddon: FitAddon;
  webglAddon: WebglAddon | null;
  searchAddon: SearchAddon;
  detector: BlockDetector;
  unlistenData?: UnlistenFn;
  unlistenState?: UnlistenFn;
  // Disposables for cleanup
  disposables: Array<{ dispose: () => void }>;
}

/**
 * Global terminal instance pool (module-level singleton).
 * Stores terminal instances keyed by sessionId.
 * Instances persist across tab switches to preserve buffer content.
 */
const terminalPool = new Map<string, TerminalInstance>();

/**
 * Hook to access the terminal instance pool.
 * Provides methods to get, set, check, and delete terminal instances.
 */
export function useTerminalPool() {
  return {
    /**
     * Get a terminal instance by sessionId.
     */
    get: (sessionId: string): TerminalInstance | undefined => {
      return terminalPool.get(sessionId);
    },

    /**
     * Store a terminal instance for a sessionId.
     */
    set: (sessionId: string, instance: TerminalInstance): void => {
      terminalPool.set(sessionId, instance);
    },

    /**
     * Check if a terminal instance exists for a sessionId.
     */
    has: (sessionId: string): boolean => {
      return terminalPool.has(sessionId);
    },

    /**
     * Delete and cleanup a terminal instance.
     * Called when a tab is closed to free resources.
     */
    delete: (sessionId: string): void => {
      const instance = terminalPool.get(sessionId);
      if (instance) {
        // Cleanup event listeners
        instance.unlistenData?.();
        instance.unlistenState?.();

        // Cleanup disposables (xterm event handlers)
        instance.disposables.forEach((d) => d.dispose());

        // Cleanup detector
        instance.detector.dispose();

        // Dispose terminal
        instance.terminal.dispose();

        // Remove from pool
        terminalPool.delete(sessionId);
      }
    },

    /**
     * Get all session IDs in the pool.
     */
    keys: (): string[] => {
      return Array.from(terminalPool.keys());
    },

    /**
     * Get the pool size.
     */
    size: (): number => {
      return terminalPool.size;
    },
  };
}

/**
 * Cleanup handler for tab close events.
 * Should be called when a tab is closed to free resources.
 */
export function cleanupTerminalInstance(sessionId: string): void {
  const pool = useTerminalPool();
  pool.delete(sessionId);
}

/**
 * Listen for tab close events and cleanup terminal instances.
 * Returns cleanup function.
 */
export function setupTabCloseListener(): () => void {
  const handler = (event: CustomEvent<{ sessionId: string }>) => {
    cleanupTerminalInstance(event.detail.sessionId);
  };

  window.addEventListener("bspt:tab-closed" as keyof WindowEventMap, handler as EventListener);

  return () => {
    window.removeEventListener("bspt:tab-closed" as keyof WindowEventMap, handler as EventListener);
  };
}

export default useTerminalPool;
