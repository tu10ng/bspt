import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { v4 as uuidv4 } from "uuid";
import {
  RouterNode,
  LinuxBoardNode,
  Protocol,
  ConnectionState,
  VrpView,
  TreeNodeData,
  SessionConfig,
  VrpEvent,
  VrpBoardInfo,
} from "../types/session";

interface SessionTreeState {
  // Data
  routers: Map<string, RouterNode>;
  activeNodeId: string | null;
  activeSessionId: string | null;

  // VRP event listeners
  vrpListeners: Map<string, UnlistenFn>;

  // Actions - CRUD
  addRouter: (router: Omit<RouterNode, "id" | "type" | "boards" | "connectionState" | "sessionId" | "vrpView">) => string;
  updateRouter: (id: string, updates: Partial<RouterNode>) => void;
  removeRouter: (id: string) => void;

  addBoard: (routerId: string, board: Omit<LinuxBoardNode, "id" | "type" | "connectionState" | "sessionId">) => string | null;
  updateBoard: (routerId: string, boardId: string, updates: Partial<LinuxBoardNode>) => void;
  removeBoard: (routerId: string, boardId: string) => void;

  // Actions - Connection
  connectNode: (nodeId: string) => Promise<void>;
  disconnectNode: (nodeId: string) => Promise<void>;
  setActiveNode: (nodeId: string | null) => void;

  // Actions - VRP
  scanBoards: (routerId: string) => Promise<void>;
  switchProtocol: (nodeId: string, protocol: Protocol) => void;

  // Helpers
  getTreeData: () => TreeNodeData[];
  findNodeById: (id: string) => RouterNode | LinuxBoardNode | null;
  getActiveSession: () => { node: RouterNode | LinuxBoardNode; sessionId: string } | null;
}

// Helper to find router containing a board
function findRouterByBoardId(
  routers: Map<string, RouterNode>,
  boardId: string
): RouterNode | null {
  for (const router of routers.values()) {
    if (router.boards.some((b) => b.id === boardId)) {
      return router;
    }
  }
  return null;
}

export const useSessionTreeStore = create<SessionTreeState>()(
  persist(
    (set, get) => ({
      routers: new Map(),
      activeNodeId: null,
      activeSessionId: null,
      vrpListeners: new Map(),

      // CRUD - Routers
      addRouter: (routerData) => {
        const id = uuidv4();
        const router: RouterNode = {
          id,
          type: "router",
          name: routerData.name,
          mgmtIp: routerData.mgmtIp,
          port: routerData.port,
          protocol: routerData.protocol,
          authProfileId: routerData.authProfileId,
          username: routerData.username,
          password: routerData.password,
          connectionState: "disconnected",
          sessionId: null,
          vrpView: "unknown",
          boards: [],
        };

        set((state) => {
          const routers = new Map(state.routers);
          routers.set(id, router);
          return { routers };
        });

        return id;
      },

      updateRouter: (id, updates) => {
        set((state) => {
          const routers = new Map(state.routers);
          const router = routers.get(id);
          if (router) {
            routers.set(id, { ...router, ...updates });
          }
          return { routers };
        });
      },

      removeRouter: (id) => {
        const { disconnectNode, vrpListeners } = get();
        const router = get().routers.get(id);

        // Disconnect if connected
        if (router?.sessionId) {
          disconnectNode(id);
        }

        // Clean up VRP listener
        const unlisten = vrpListeners.get(id);
        if (unlisten) {
          unlisten();
          vrpListeners.delete(id);
        }

        set((state) => {
          const routers = new Map(state.routers);
          routers.delete(id);
          return {
            routers,
            activeNodeId: state.activeNodeId === id ? null : state.activeNodeId,
          };
        });
      },

      // CRUD - Boards
      addBoard: (routerId, boardData) => {
        const router = get().routers.get(routerId);
        if (!router) return null;

        const id = uuidv4();
        const board: LinuxBoardNode = {
          id,
          type: "board",
          slotId: boardData.slotId,
          ip: boardData.ip,
          name: boardData.name,
          protocol: boardData.protocol,
          connectionState: "disconnected",
          sessionId: null,
        };

        set((state) => {
          const routers = new Map(state.routers);
          const r = routers.get(routerId);
          if (r) {
            routers.set(routerId, {
              ...r,
              boards: [...r.boards, board],
            });
          }
          return { routers };
        });

        return id;
      },

      updateBoard: (routerId, boardId, updates) => {
        set((state) => {
          const routers = new Map(state.routers);
          const router = routers.get(routerId);
          if (router) {
            const boards = router.boards.map((b) =>
              b.id === boardId ? { ...b, ...updates } : b
            );
            routers.set(routerId, { ...router, boards });
          }
          return { routers };
        });
      },

      removeBoard: (routerId, boardId) => {
        const { disconnectNode } = get();
        const router = get().routers.get(routerId);
        const board = router?.boards.find((b) => b.id === boardId);

        // Disconnect if connected
        if (board?.sessionId) {
          disconnectNode(boardId);
        }

        set((state) => {
          const routers = new Map(state.routers);
          const r = routers.get(routerId);
          if (r) {
            routers.set(routerId, {
              ...r,
              boards: r.boards.filter((b) => b.id !== boardId),
            });
          }
          return {
            routers,
            activeNodeId: state.activeNodeId === boardId ? null : state.activeNodeId,
          };
        });
      },

      // Connection
      connectNode: async (nodeId: string) => {
        const { routers, updateRouter, updateBoard, vrpListeners } = get();
        let node: RouterNode | LinuxBoardNode | null = null;
        let routerId: string | null = null;

        // Find the node
        const router = routers.get(nodeId);
        if (router) {
          node = router;
          routerId = nodeId;
        } else {
          const parentRouter = findRouterByBoardId(routers, nodeId);
          if (parentRouter) {
            node = parentRouter.boards.find((b) => b.id === nodeId) || null;
            routerId = parentRouter.id;
          }
        }

        if (!node) return;

        // Determine connection parameters
        const isRouter = node.type === "router";
        const host = isRouter ? (node as RouterNode).mgmtIp : (node as LinuxBoardNode).ip;
        const port = isRouter ? (node as RouterNode).port : (node.protocol === "ssh" ? 22 : 23);
        const username = isRouter ? (node as RouterNode).username : (routers.get(routerId!)?.username || "");
        const password = isRouter ? (node as RouterNode).password : (routers.get(routerId!)?.password || "");

        // Update state to connecting
        if (isRouter) {
          updateRouter(nodeId, { connectionState: "connecting" });
        } else {
          updateBoard(routerId!, nodeId, { connectionState: "connecting" });
        }

        try {
          const config: SessionConfig = {
            host,
            port,
            protocol: node.protocol,
            username,
            password,
            cols: 80,
            rows: 24,
          };

          const sessionId = await invoke<string>("create_session", { config });

          // Update state with session ID
          if (isRouter) {
            updateRouter(nodeId, {
              connectionState: "ready",
              sessionId,
            });

            // Set up VRP event listener for routers
            const unlisten = await listen<VrpEvent>(
              `session:${sessionId}:vrp`,
              (event) => {
                const vrpEvent = event.payload;

                if (vrpEvent.type === "view_change" && "view" in vrpEvent) {
                  const viewData = vrpEvent as unknown as { view: VrpView; hostname: string };
                  updateRouter(nodeId, { vrpView: viewData.view });
                }

                if (vrpEvent.type === "board_info" && "data" in vrpEvent) {
                  const boardInfo = (vrpEvent as { data: VrpBoardInfo }).data;
                  // Auto-add detected boards
                  if (boardInfo.ip && boardInfo.status === "Present") {
                    const existingBoard = (get().routers.get(nodeId)?.boards || [])
                      .find((b) => b.slotId === boardInfo.slot_id);

                    if (!existingBoard) {
                      get().addBoard(nodeId, {
                        slotId: boardInfo.slot_id,
                        ip: boardInfo.ip,
                        name: `Slot ${boardInfo.slot_id} (${boardInfo.board_type})`,
                        protocol: "ssh", // Default to SSH for Linux boards
                      });
                    }
                  }
                }
              }
            );

            vrpListeners.set(nodeId, unlisten);
          } else {
            updateBoard(routerId!, nodeId, {
              connectionState: "ready",
              sessionId,
            });
          }

          // Set as active
          set({ activeNodeId: nodeId, activeSessionId: sessionId });

          // Listen for state changes
          await listen<ConnectionState>(
            `session:${sessionId}:state`,
            (event) => {
              const state = event.payload;
              if (isRouter) {
                updateRouter(nodeId, { connectionState: state });
              } else {
                updateBoard(routerId!, nodeId, { connectionState: state });
              }

              // Clear session if disconnected
              if (state === "disconnected" || state === "error") {
                if (isRouter) {
                  updateRouter(nodeId, { sessionId: null });
                } else {
                  updateBoard(routerId!, nodeId, { sessionId: null });
                }
              }
            }
          );
        } catch (error) {
          console.error("Failed to connect:", error);
          if (isRouter) {
            updateRouter(nodeId, { connectionState: "error", sessionId: null });
          } else {
            updateBoard(routerId!, nodeId, { connectionState: "error", sessionId: null });
          }
        }
      },

      disconnectNode: async (nodeId: string) => {
        const { routers, updateRouter, updateBoard, vrpListeners } = get();
        let sessionId: string | null = null;
        let isRouter = false;
        let routerId: string | null = null;

        // Find the node and its session
        const router = routers.get(nodeId);
        if (router) {
          sessionId = router.sessionId;
          isRouter = true;
        } else {
          const parentRouter = findRouterByBoardId(routers, nodeId);
          if (parentRouter) {
            const board = parentRouter.boards.find((b) => b.id === nodeId);
            sessionId = board?.sessionId || null;
            routerId = parentRouter.id;
          }
        }

        if (!sessionId) return;

        try {
          await invoke("disconnect_session", { sessionId });
        } catch (error) {
          console.error("Failed to disconnect:", error);
        }

        // Update state
        if (isRouter) {
          updateRouter(nodeId, {
            connectionState: "disconnected",
            sessionId: null,
            vrpView: "unknown",
          });

          // Clean up VRP listener
          const unlisten = vrpListeners.get(nodeId);
          if (unlisten) {
            unlisten();
            vrpListeners.delete(nodeId);
          }
        } else if (routerId) {
          updateBoard(routerId, nodeId, {
            connectionState: "disconnected",
            sessionId: null,
          });
        }

        // Clear active if this was the active node
        const state = get();
        if (state.activeNodeId === nodeId) {
          set({ activeNodeId: null, activeSessionId: null });
        }
      },

      setActiveNode: (nodeId: string | null) => {
        if (!nodeId) {
          set({ activeNodeId: null, activeSessionId: null });
          return;
        }

        const { routers } = get();
        let sessionId: string | null = null;

        const router = routers.get(nodeId);
        if (router) {
          sessionId = router.sessionId;
        } else {
          const parentRouter = findRouterByBoardId(routers, nodeId);
          if (parentRouter) {
            const board = parentRouter.boards.find((b) => b.id === nodeId);
            sessionId = board?.sessionId || null;
          }
        }

        set({ activeNodeId: nodeId, activeSessionId: sessionId });
      },

      // VRP actions
      scanBoards: async (routerId: string) => {
        const router = get().routers.get(routerId);
        if (!router?.sessionId) return;

        try {
          await invoke("scan_boards", { sessionId: router.sessionId });
        } catch (error) {
          console.error("Failed to scan boards:", error);
        }
      },

      switchProtocol: (nodeId: string, protocol: Protocol) => {
        const { routers, updateRouter, updateBoard } = get();

        const router = routers.get(nodeId);
        if (router) {
          // Update port based on protocol
          const port = protocol === "ssh" ? 22 : 23;
          updateRouter(nodeId, { protocol, port });
        } else {
          const parentRouter = findRouterByBoardId(routers, nodeId);
          if (parentRouter) {
            updateBoard(parentRouter.id, nodeId, { protocol });
          }
        }
      },

      // Helpers
      getTreeData: (): TreeNodeData[] => {
        const { routers } = get();
        const treeData: TreeNodeData[] = [];

        for (const router of routers.values()) {
          const routerNode: TreeNodeData = {
            id: router.id,
            name: router.name,
            nodeData: router,
            children: router.boards.map((board) => ({
              id: board.id,
              name: board.name,
              nodeData: board,
            })),
          };
          treeData.push(routerNode);
        }

        return treeData;
      },

      findNodeById: (id: string): RouterNode | LinuxBoardNode | null => {
        const { routers } = get();

        const router = routers.get(id);
        if (router) return router;

        for (const r of routers.values()) {
          const board = r.boards.find((b) => b.id === id);
          if (board) return board;
        }

        return null;
      },

      getActiveSession: () => {
        const { activeNodeId, activeSessionId, findNodeById } = get();
        if (!activeNodeId || !activeSessionId) return null;

        const node = findNodeById(activeNodeId);
        if (!node) return null;

        return { node, sessionId: activeSessionId };
      },
    }),
    {
      name: "bspt-session-tree",
      partialize: (state) => ({
        // Only persist router data, not connection state
        routers: Array.from(state.routers.entries()).map(([id, router]) => [
          id,
          {
            ...router,
            connectionState: "disconnected" as ConnectionState,
            sessionId: null,
            vrpView: "unknown" as VrpView,
            boards: router.boards.map((b) => ({
              ...b,
              connectionState: "disconnected" as ConnectionState,
              sessionId: null,
            })),
          },
        ]),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as { routers?: [string, RouterNode][] };
        if (persistedState?.routers) {
          return {
            ...current,
            routers: new Map(persistedState.routers),
          };
        }
        return current;
      },
    }
  )
);
