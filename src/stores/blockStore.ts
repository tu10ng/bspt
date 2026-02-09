import { create } from "zustand";
import { persist } from "zustand/middleware";
import { BlockMarker, BlockStatus } from "../types/session";
import { v4 as uuidv4 } from "uuid";

interface MarkerState {
  // Markers per session
  markers: Record<string, BlockMarker[]>;
  // Maximum markers to keep per session
  maxMarkersPerSession: number;
  // Active marker for Outline synchronization
  activeMarkerId: string | null;

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
}

export const useBlockStore = create<MarkerState>()(
  persist(
    (set, get) => ({
      markers: {},
      maxMarkersPerSession: 500,
      activeMarkerId: null,

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

          return {
            markers: {
              ...state.markers,
              [sessionId]: newMarkers,
            },
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
          return { markers: newMarkers, activeMarkerId: null };
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
        const markers = get().markers[sessionId] || [];
        return markers
          .map((m) => m.command)
          .filter((cmd) => cmd.trim().length > 0);
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
