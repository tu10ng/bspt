import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import type { TraceEvent, SourceLocation, IndexStats, TracerStats } from "../types";

export interface TracerState {
  // State
  indexed: boolean;
  indexing: boolean;
  sourcePath: string | null;
  patternCount: number;
  traceEvents: TraceEvent[];
  error: string | null;

  // Actions
  indexDirectory: (path: string) => Promise<IndexStats | null>;
  matchLine: (line: string, sessionId: string) => Promise<SourceLocation | null>;
  addTraceEvent: (event: TraceEvent) => void;
  clearTraces: () => void;
  refreshStats: () => Promise<void>;
  setError: (error: string | null) => void;
}

export const useTracerStore = create<TracerState>()(
  persist(
    (set, get) => ({
      // Initial state
      indexed: false,
      indexing: false,
      sourcePath: null,
      patternCount: 0,
      traceEvents: [],
      error: null,

      // Index a source directory
      indexDirectory: async (path: string) => {
        set({ indexing: true, error: null });
        try {
          const stats = await invoke<IndexStats>("index_source_directory", { path });
          set({
            indexed: true,
            indexing: false,
            sourcePath: path,
            patternCount: stats.patterns_indexed,
          });
          return stats;
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          set({ indexing: false, error: errorMsg });
          return null;
        }
      },

      // Match a log line against indexed patterns
      matchLine: async (line: string, sessionId: string) => {
        const { indexed } = get();
        if (!indexed) return null;

        try {
          const location = await invoke<SourceLocation | null>("match_log_line", { line });
          if (location) {
            // Auto-create trace event when match is found
            const event: TraceEvent = {
              id: uuidv4(),
              file: location.file,
              line: location.line,
              function: location.function,
              timestamp: new Date(),
              matched_text: line.substring(0, 50),
              log_line: line,
              session_id: sessionId,
            };
            get().addTraceEvent(event);
          }
          return location;
        } catch (e) {
          console.error("Error matching log line:", e);
          return null;
        }
      },

      // Add a trace event
      addTraceEvent: (event: TraceEvent) => {
        set((state) => ({
          traceEvents: [...state.traceEvents.slice(-99), event], // Keep last 100 events
        }));
      },

      // Clear all trace events
      clearTraces: () => {
        set({ traceEvents: [] });
      },

      // Refresh stats from backend
      refreshStats: async () => {
        try {
          const stats = await invoke<TracerStats>("get_tracer_stats");
          set({
            indexed: stats.indexed,
            patternCount: stats.pattern_count,
            sourcePath: stats.source_path,
          });
        } catch (e) {
          console.error("Error refreshing tracer stats:", e);
        }
      },

      // Set error message
      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: "bspt-tracer",
      partialize: (state) => ({
        // Only persist source path, not trace events or indexing state
        sourcePath: state.sourcePath,
      }),
    }
  )
);
