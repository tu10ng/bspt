import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Protocol } from "../types/session";
import { v4 as uuidv4 } from "uuid";

// Connection configuration saved for reconnection (without password in some cases)
export interface ConnectionConfig {
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  password: string; // Stored for reconnection in internal network environment
}

export interface Tab {
  id: string;
  nodeId: string;       // Session tree node ID
  sessionId: string;    // Backend session ID
  label: string;        // hostname:port
  protocol: Protocol;
  order: number;
  // Reconnection support
  wasConnected: boolean;        // Whether this tab had an active connection before app restart
  connectionConfig?: ConnectionConfig;  // Saved connection config for reconnection
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  openTab: (nodeId: string, sessionId: string, label: string, protocol: Protocol, connectionConfig?: ConnectionConfig) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  reorderTabs: (dragId: string, dropId: string) => void;
  getTabByNodeId: (nodeId: string) => Tab | undefined;
  getTabBySessionId: (sessionId: string) => Tab | undefined;
  updateTabSessionId: (tabId: string, sessionId: string) => void;
  updateTabConnectionConfig: (tabId: string, config: ConnectionConfig) => void;
  getDisconnectedTabs: () => Tab[];
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (nodeId: string, sessionId: string, label: string, protocol: Protocol, connectionConfig?: ConnectionConfig) => {
        // Always create a new tab - one node can have multiple tabs (different sessions)
        const tabId = uuidv4();
        const maxOrder = Math.max(0, ...get().tabs.map((t) => t.order));
        const tab: Tab = {
          id: tabId,
          nodeId,
          sessionId,
          label,
          protocol,
          order: maxOrder + 1,
          wasConnected: true,
          connectionConfig,
        };

        set((state) => ({
          tabs: [...state.tabs, tab],
          activeTabId: tabId,
        }));

        return tabId;
      },

      closeTab: (tabId: string) => {
        const tab = get().tabs.find((t) => t.id === tabId);

        // Dispatch cleanup event before removing the tab
        if (tab && tab.sessionId) {
          window.dispatchEvent(
            new CustomEvent("bspt:tab-closed", {
              detail: { sessionId: tab.sessionId },
            })
          );
        }

        set((state) => {
          const tabIndex = state.tabs.findIndex((t) => t.id === tabId);
          if (tabIndex === -1) return state;

          const newTabs = state.tabs.filter((t) => t.id !== tabId);
          let newActiveTabId = state.activeTabId;

          // If closing active tab, switch to adjacent tab
          if (state.activeTabId === tabId) {
            if (newTabs.length === 0) {
              newActiveTabId = null;
            } else if (tabIndex < newTabs.length) {
              newActiveTabId = newTabs[tabIndex].id;
            } else {
              newActiveTabId = newTabs[newTabs.length - 1].id;
            }
          }

          return { tabs: newTabs, activeTabId: newActiveTabId };
        });
      },

      setActiveTab: (tabId: string | null) => {
        set({ activeTabId: tabId });
      },

      reorderTabs: (dragId: string, dropId: string) => {
        set((state) => {
          const dragIndex = state.tabs.findIndex((t) => t.id === dragId);
          const dropIndex = state.tabs.findIndex((t) => t.id === dropId);
          if (dragIndex === -1 || dropIndex === -1) return state;

          const newTabs = [...state.tabs];
          const [dragTab] = newTabs.splice(dragIndex, 1);
          newTabs.splice(dropIndex, 0, dragTab);

          // Recalculate order
          return {
            tabs: newTabs.map((t, i) => ({ ...t, order: i })),
          };
        });
      },

      getTabByNodeId: (nodeId: string) => {
        return get().tabs.find((t) => t.nodeId === nodeId);
      },

      getTabBySessionId: (sessionId: string) => {
        return get().tabs.find((t) => t.sessionId === sessionId);
      },

      updateTabSessionId: (tabId: string, sessionId: string) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, sessionId, wasConnected: true } : t
          ),
        }));
      },

      updateTabConnectionConfig: (tabId: string, config: ConnectionConfig) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabId ? { ...t, connectionConfig: config } : t
          ),
        }));
      },

      getDisconnectedTabs: () => {
        return get().tabs.filter((t) => t.wasConnected && !t.sessionId && t.connectionConfig);
      },
    }),
    {
      name: "bspt-tabs",
      partialize: (state) => ({
        // Persist tab metadata including connection config for reconnection
        // Session IDs will be stale on reload, so we clear them but keep wasConnected flag
        tabs: state.tabs.map((t) => ({
          ...t,
          sessionId: "",
          // Keep wasConnected true so we know this tab needs reconnection
        })),
        activeTabId: state.activeTabId,
      }),
      merge: (persisted, current) => {
        const persistedState = persisted as { tabs?: Tab[]; activeTabId?: string | null };
        return {
          ...current,
          tabs: (persistedState?.tabs || []).map((t) => ({
            ...t,
            wasConnected: t.wasConnected ?? true, // Default old tabs to true for migration
          })),
          activeTabId: persistedState?.activeTabId ?? null,
        };
      },
    }
  )
);
