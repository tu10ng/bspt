import { create } from "zustand";
import { persist } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { v4 as uuidv4 } from "uuid";
import {
  RouterNode,
  LinuxBoardNode,
  FolderNode,
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
  folders: Map<string, FolderNode>;
  activeNodeId: string | null;
  activeSessionId: string | null;

  // VRP event listeners
  vrpListeners: Map<string, UnlistenFn>;

  // Actions - CRUD Routers
  addRouter: (router: Omit<RouterNode, "id" | "type" | "boards" | "connectionState" | "sessionId" | "vrpView" | "parentId" | "order">) => string;
  updateRouter: (id: string, updates: Partial<RouterNode>) => void;
  removeRouter: (id: string) => void;

  // Actions - CRUD Boards
  addBoard: (routerId: string, board: Omit<LinuxBoardNode, "id" | "type" | "connectionState" | "sessionId">) => string | null;
  updateBoard: (routerId: string, boardId: string, updates: Partial<LinuxBoardNode>) => void;
  removeBoard: (routerId: string, boardId: string) => void;

  // Actions - CRUD Folders
  addFolder: (name: string, parentId?: string | null) => string;
  updateFolder: (id: string, updates: Partial<FolderNode>) => void;
  removeFolder: (id: string) => void;

  // Actions - Drag & Drop
  moveNode: (nodeId: string, targetParentId: string | null, insertIndex: number) => void;

  // Actions - Rename
  renameNode: (nodeId: string, newName: string) => void;

  // Actions - Connection
  connectNode: (nodeId: string) => Promise<void>;
  disconnectNode: (nodeId: string) => Promise<void>;
  setActiveNode: (nodeId: string | null) => void;

  // Actions - VRP
  scanBoards: (routerId: string) => Promise<void>;
  switchProtocol: (nodeId: string, protocol: Protocol) => void;

  // Helpers
  getTreeData: () => TreeNodeData[];
  findNodeById: (id: string) => RouterNode | LinuxBoardNode | FolderNode | null;
  getActiveSession: () => { node: RouterNode | LinuxBoardNode; sessionId: string } | null;
  getNextOrder: (parentId: string | null) => number;
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
      folders: new Map(),
      activeNodeId: null,
      activeSessionId: null,
      vrpListeners: new Map(),

      // Helper to get next order number
      getNextOrder: (parentId: string | null): number => {
        const { routers, folders } = get();
        let maxOrder = -1;

        // Check routers with this parent
        for (const router of routers.values()) {
          if (router.parentId === parentId) {
            maxOrder = Math.max(maxOrder, router.order);
          }
        }

        // Check folders with this parent
        for (const folder of folders.values()) {
          if (folder.parentId === parentId) {
            maxOrder = Math.max(maxOrder, folder.order);
          }
        }

        return maxOrder + 1;
      },

      // CRUD - Routers
      addRouter: (routerData) => {
        const id = uuidv4();
        const { getNextOrder } = get();
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
          parentId: null,
          order: getNextOrder(null),
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

      // CRUD - Folders
      addFolder: (name: string, parentId: string | null = null): string => {
        const id = uuidv4();
        const { getNextOrder } = get();
        const folder: FolderNode = {
          id,
          type: "folder",
          name,
          parentId,
          order: getNextOrder(parentId),
        };

        set((state) => {
          const folders = new Map(state.folders);
          folders.set(id, folder);
          return { folders };
        });

        return id;
      },

      updateFolder: (id: string, updates: Partial<FolderNode>) => {
        set((state) => {
          const folders = new Map(state.folders);
          const folder = folders.get(id);
          if (folder) {
            folders.set(id, { ...folder, ...updates });
          }
          return { folders };
        });
      },

      removeFolder: (id: string) => {
        const { routers, folders, removeRouter, removeFolder } = get();

        // Remove all children (routers and subfolders)
        for (const router of routers.values()) {
          if (router.parentId === id) {
            removeRouter(router.id);
          }
        }
        for (const folder of folders.values()) {
          if (folder.parentId === id) {
            removeFolder(folder.id);
          }
        }

        set((state) => {
          const newFolders = new Map(state.folders);
          newFolders.delete(id);
          return { folders: newFolders };
        });
      },

      // Drag & Drop
      moveNode: (nodeId: string, targetParentId: string | null, insertIndex: number) => {
        const { routers, folders, updateRouter, updateFolder } = get();

        // Check if it's a router
        const router = routers.get(nodeId);
        if (router) {
          // Validate target: must be folder or null (root)
          if (targetParentId !== null && !folders.has(targetParentId)) {
            return; // Invalid target
          }

          // Get siblings at target location
          const siblings: { id: string; order: number }[] = [];
          for (const r of routers.values()) {
            if (r.parentId === targetParentId && r.id !== nodeId) {
              siblings.push({ id: r.id, order: r.order });
            }
          }
          for (const f of folders.values()) {
            if (f.parentId === targetParentId) {
              siblings.push({ id: f.id, order: f.order });
            }
          }

          // Sort siblings by order
          siblings.sort((a, b) => a.order - b.order);

          // Calculate new order
          let newOrder: number;
          if (siblings.length === 0) {
            newOrder = 0;
          } else if (insertIndex <= 0) {
            newOrder = siblings[0].order - 1;
          } else if (insertIndex >= siblings.length) {
            newOrder = siblings[siblings.length - 1].order + 1;
          } else {
            // Insert between two siblings
            const prevOrder = siblings[insertIndex - 1].order;
            const nextOrder = siblings[insertIndex].order;
            newOrder = (prevOrder + nextOrder) / 2;
          }

          updateRouter(nodeId, { parentId: targetParentId, order: newOrder });
          return;
        }

        // Check if it's a folder
        const folder = folders.get(nodeId);
        if (folder) {
          // Prevent moving folder into itself or its descendants
          let checkId: string | null = targetParentId;
          while (checkId !== null) {
            if (checkId === nodeId) {
              return; // Would create a cycle
            }
            checkId = folders.get(checkId)?.parentId ?? null;
          }

          // Validate target: must be folder or null (root)
          if (targetParentId !== null && !folders.has(targetParentId)) {
            return; // Invalid target
          }

          // Get siblings at target location
          const siblings: { id: string; order: number }[] = [];
          for (const r of routers.values()) {
            if (r.parentId === targetParentId) {
              siblings.push({ id: r.id, order: r.order });
            }
          }
          for (const f of folders.values()) {
            if (f.parentId === targetParentId && f.id !== nodeId) {
              siblings.push({ id: f.id, order: f.order });
            }
          }

          // Sort siblings by order
          siblings.sort((a, b) => a.order - b.order);

          // Calculate new order
          let newOrder: number;
          if (siblings.length === 0) {
            newOrder = 0;
          } else if (insertIndex <= 0) {
            newOrder = siblings[0].order - 1;
          } else if (insertIndex >= siblings.length) {
            newOrder = siblings[siblings.length - 1].order + 1;
          } else {
            const prevOrder = siblings[insertIndex - 1].order;
            const nextOrder = siblings[insertIndex].order;
            newOrder = (prevOrder + nextOrder) / 2;
          }

          updateFolder(nodeId, { parentId: targetParentId, order: newOrder });
        }
      },

      // Rename
      renameNode: (nodeId: string, newName: string) => {
        const { routers, folders, updateRouter, updateFolder, updateBoard } = get();

        // Check routers
        if (routers.has(nodeId)) {
          updateRouter(nodeId, { name: newName });
          return;
        }

        // Check folders
        if (folders.has(nodeId)) {
          updateFolder(nodeId, { name: newName });
          return;
        }

        // Check boards
        const parentRouter = findRouterByBoardId(routers, nodeId);
        if (parentRouter) {
          updateBoard(parentRouter.id, nodeId, { name: newName });
        }
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
        const { routers, folders } = get();

        // Build tree recursively
        const buildChildren = (parentId: string | null): TreeNodeData[] => {
          const children: TreeNodeData[] = [];

          // Add folders with this parent
          for (const folder of folders.values()) {
            if (folder.parentId === parentId) {
              children.push({
                id: folder.id,
                name: folder.name,
                nodeData: folder,
                children: buildChildren(folder.id),
              });
            }
          }

          // Add routers with this parent
          for (const router of routers.values()) {
            // Handle legacy routers without parentId (treat as root)
            const routerParentId = router.parentId ?? null;
            if (routerParentId === parentId) {
              children.push({
                id: router.id,
                name: router.name,
                nodeData: router,
                children: router.boards.map((board) => ({
                  id: board.id,
                  name: board.name,
                  nodeData: board,
                })),
              });
            }
          }

          // Sort by order
          children.sort((a, b) => {
            const aOrder = "order" in a.nodeData ? (a.nodeData as { order: number }).order : 0;
            const bOrder = "order" in b.nodeData ? (b.nodeData as { order: number }).order : 0;
            return aOrder - bOrder;
          });

          return children;
        };

        return buildChildren(null);
      },

      findNodeById: (id: string): RouterNode | LinuxBoardNode | FolderNode | null => {
        const { routers, folders } = get();

        // Check folders
        const folder = folders.get(id);
        if (folder) return folder;

        // Check routers
        const router = routers.get(id);
        if (router) return router;

        // Check boards
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
        if (!node || node.type === "folder") return null;

        return { node, sessionId: activeSessionId };
      },
    }),
    {
      name: "bspt-session-tree",
      partialize: (state) => ({
        // Persist routers with reset connection state
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
        // Persist folders
        folders: Array.from(state.folders.entries()),
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as {
          routers?: [string, RouterNode][];
          folders?: [string, FolderNode][];
        };
        const result = { ...current };

        if (persistedState?.routers) {
          // Migrate old routers that don't have parentId/order fields
          const migratedRouters = persistedState.routers.map(([id, router], index) => {
            return [id, {
              ...router,
              parentId: router.parentId ?? null,  // Default to root if missing
              order: router.order ?? index,       // Use index as default order
            }] as [string, RouterNode];
          });
          result.routers = new Map(migratedRouters);
        }
        if (persistedState?.folders) {
          result.folders = new Map(persistedState.folders);
        }

        return result;
      },
    }
  )
);
