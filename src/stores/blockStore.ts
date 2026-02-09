import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BlockMarker, BlockStatus } from "../types/session";
import { v4 as uuidv4 } from "uuid";

// Suggestion algorithm configuration
export type SuggestionSortBy = "recent" | "frequency" | "combined";

export interface SuggestionConfig {
  sortBy: SuggestionSortBy;
  maxSuggestions: number;
}

interface MarkerState {
  // Markers per session
  markers: Record<string, BlockMarker[]>;
  // Maximum markers to keep per session
  maxMarkersPerSession: number;
  // Active marker for Outline synchronization
  activeMarkerId: string | null;
  // Command frequency statistics (sessionId -> command -> count)
  commandFrequency: Record<string, Record<string, number>>;
  // Suggestion algorithm configuration
  suggestionConfig: SuggestionConfig;

  // Actions
  createMarker: (
    sessionId: string,
    command: string,
    startLine: number
  ) => string;
  completeMarker: (markerId: string, endLine: number, status: BlockStatus) => void;
  toggleCollapse: (markerId: string) => void;
  collapseAll: (sessionId: string) => void;
  expandAll: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
  setActiveMarker: (markerId: string | null) => void;
  getMarker: (markerId: string) => BlockMarker | undefined;
  getSessionMarkers: (sessionId: string) => BlockMarker[];
  getCommandHistory: (sessionId: string) => string[];
  // Update marker end line while running (for tracking scroll position)
  updateMarkerEndLine: (markerId: string, endLine: number) => void;
  // Get marker by line number (for gutter click)
  findMarkerByLine: (sessionId: string, line: number) => BlockMarker | undefined;
  // Expand blocks that contain a specific line (for search auto-expand)
  expandBlocksContainingLine: (sessionId: string, line: number) => void;
  // Suggestion config actions
  setSuggestionSortBy: (sortBy: SuggestionSortBy) => void;
  setMaxSuggestions: (max: number) => void;
}

export const useBlockStore = create<MarkerState>()(
  persist(
    (set, get) => ({
      markers: {},
      maxMarkersPerSession: 500,
      activeMarkerId: null,
      commandFrequency: {},
      suggestionConfig: {
        sortBy: "recent",
        maxSuggestions: 50,
      },

      createMarker: (sessionId: string, command: string, startLine: number) => {
        const markerId = uuidv4();
        const marker: BlockMarker = {
          id: markerId,
          sessionId,
          command,
          timestamp: new Date(),
          status: "running",
          collapsed: false,
          startLine,
          endLine: null,
        };

        set((state) => {
          const sessionMarkers = state.markers[sessionId] || [];
          let newMarkers = [...sessionMarkers, marker];

          // Enforce max markers limit
          if (newMarkers.length > state.maxMarkersPerSession) {
            newMarkers = newMarkers.slice(-state.maxMarkersPerSession);
          }

          // Update command frequency
          const trimmedCmd = command.trim();
          let newFrequency = state.commandFrequency;
          if (trimmedCmd) {
            const sessionFreq = state.commandFrequency[sessionId] || {};
            newFrequency = {
              ...state.commandFrequency,
              [sessionId]: {
                ...sessionFreq,
                [trimmedCmd]: (sessionFreq[trimmedCmd] || 0) + 1,
              },
            };
          }

          return {
            markers: {
              ...state.markers,
              [sessionId]: newMarkers,
            },
            commandFrequency: newFrequency,
          };
        });

        return markerId;
      },

      completeMarker: (markerId: string, endLine: number, status: BlockStatus) => {
        set((state) => {
          const newMarkers = { ...state.markers };

          for (const sessionId of Object.keys(newMarkers)) {
            const markers = newMarkers[sessionId];
            const markerIndex = markers.findIndex((m) => m.id === markerId);

            if (markerIndex !== -1) {
              newMarkers[sessionId] = [
                ...markers.slice(0, markerIndex),
                { ...markers[markerIndex], status, endLine },
                ...markers.slice(markerIndex + 1),
              ];
              break;
            }
          }

          return { markers: newMarkers };
        });
      },

      updateMarkerEndLine: (markerId: string, endLine: number) => {
        set((state) => {
          const newMarkers = { ...state.markers };

          for (const sessionId of Object.keys(newMarkers)) {
            const markers = newMarkers[sessionId];
            const markerIndex = markers.findIndex((m) => m.id === markerId);

            if (markerIndex !== -1) {
              const marker = markers[markerIndex];
              // Only update if running
              if (marker.status === "running") {
                newMarkers[sessionId] = [
                  ...markers.slice(0, markerIndex),
                  { ...marker, endLine },
                  ...markers.slice(markerIndex + 1),
                ];
              }
              break;
            }
          }

          return { markers: newMarkers };
        });
      },

      toggleCollapse: (markerId: string) => {
        set((state) => {
          const newMarkers = { ...state.markers };

          for (const sessionId of Object.keys(newMarkers)) {
            const markers = newMarkers[sessionId];
            const markerIndex = markers.findIndex((m) => m.id === markerId);

            if (markerIndex !== -1) {
              const marker = markers[markerIndex];
              newMarkers[sessionId] = [
                ...markers.slice(0, markerIndex),
                { ...marker, collapsed: !marker.collapsed },
                ...markers.slice(markerIndex + 1),
              ];
              break;
            }
          }

          return { markers: newMarkers };
        });
      },

      collapseAll: (sessionId: string) => {
        set((state) => {
          const markers = state.markers[sessionId];
          if (!markers) return state;

          return {
            markers: {
              ...state.markers,
              [sessionId]: markers.map((m) => ({ ...m, collapsed: true })),
            },
          };
        });
      },

      expandAll: (sessionId: string) => {
        set((state) => {
          const markers = state.markers[sessionId];
          if (!markers) return state;

          return {
            markers: {
              ...state.markers,
              [sessionId]: markers.map((m) => ({ ...m, collapsed: false })),
            },
          };
        });
      },

      clearSession: (sessionId: string) => {
        set((state) => {
          const newMarkers = { ...state.markers };
          delete newMarkers[sessionId];
          const newFrequency = { ...state.commandFrequency };
          delete newFrequency[sessionId];
          return {
            markers: newMarkers,
            commandFrequency: newFrequency,
            activeMarkerId: null,
          };
        });
      },

      setActiveMarker: (markerId: string | null) => {
        set({ activeMarkerId: markerId });
      },

      getMarker: (markerId: string) => {
        const state = get();
        for (const sessionId of Object.keys(state.markers)) {
          const marker = state.markers[sessionId].find((m) => m.id === markerId);
          if (marker) return marker;
        }
        return undefined;
      },

      getSessionMarkers: (sessionId: string) => {
        return get().markers[sessionId] || [];
      },

      getCommandHistory: (sessionId: string) => {
        const state = get();
        const markers = state.markers[sessionId] || [];
        const frequency = state.commandFrequency[sessionId] || {};
        const config = state.suggestionConfig;

        // 1. Deduplicate: use Map to keep only the most recent occurrence of each command
        // Iterate in reverse so the first occurrence in the Map is the most recent
        const commandMap = new Map<string, { command: string; timestamp: Date }>();

        for (let i = markers.length - 1; i >= 0; i--) {
          const m = markers[i];
          const cmd = m.command.trim();
          if (cmd && !commandMap.has(cmd)) {
            commandMap.set(cmd, { command: cmd, timestamp: m.timestamp });
          }
        }

        // 2. Convert to array and sort based on configuration
        let commands = Array.from(commandMap.values());

        switch (config.sortBy) {
          case "recent":
            // Already in most-recent-first order from reverse iteration
            break;
          case "frequency":
            commands.sort(
              (a, b) => (frequency[b.command] || 0) - (frequency[a.command] || 0)
            );
            break;
          case "combined":
            // Combined score: recency decay + frequency weight
            const now = Date.now();
            commands.sort((a, b) => {
              // Recency factor: exponential decay over hours
              const recencyA =
                1 / (1 + (now - a.timestamp.getTime()) / 3600000);
              const recencyB =
                1 / (1 + (now - b.timestamp.getTime()) / 3600000);
              const freqA = frequency[a.command] || 1;
              const freqB = frequency[b.command] || 1;
              // Higher score = more relevant
              return recencyB * freqB - recencyA * freqA;
            });
            break;
        }

        return commands.slice(0, config.maxSuggestions).map((c) => c.command);
      },

      findMarkerByLine: (sessionId: string, line: number) => {
        const markers = get().markers[sessionId] || [];
        // Find marker where startLine <= line <= endLine (or endLine is null for running)
        return markers.find((m) => {
          if (line < m.startLine) return false;
          if (m.endLine === null) return true; // Running marker
          return line <= m.endLine;
        });
      },

      expandBlocksContainingLine: (sessionId: string, line: number) => {
        set((state) => {
          const markers = state.markers[sessionId];
          if (!markers) return state;

          // Find and expand any collapsed blocks that contain the line
          const updatedMarkers = markers.map((m) => {
            // Check if block is collapsed and contains the line
            if (
              m.collapsed &&
              m.startLine < line &&
              (m.endLine === null || m.endLine > line)
            ) {
              return { ...m, collapsed: false };
            }
            return m;
          });

          // Only update if something changed
          const hasChanges = updatedMarkers.some(
            (m, i) => m.collapsed !== markers[i].collapsed
          );

          if (!hasChanges) return state;

          return {
            markers: {
              ...state.markers,
              [sessionId]: updatedMarkers,
            },
          };
        });
      },

      setSuggestionSortBy: (sortBy: SuggestionSortBy) => {
        set((state) => ({
          suggestionConfig: { ...state.suggestionConfig, sortBy },
        }));
      },

      setMaxSuggestions: (max: number) => {
        set((state) => ({
          suggestionConfig: {
            ...state.suggestionConfig,
            maxSuggestions: Math.max(1, max),
          },
        }));
      },
    }),
    {
      name: "bspt-markers",
      // Custom serialization for Date objects
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Convert timestamp strings back to Date objects
          if (parsed.state?.markers) {
            for (const sessionId of Object.keys(parsed.state.markers)) {
              parsed.state.markers[sessionId] = parsed.state.markers[
                sessionId
              ].map((marker: BlockMarker & { timestamp: string }) => ({
                ...marker,
                timestamp: new Date(marker.timestamp),
              }));
            }
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
