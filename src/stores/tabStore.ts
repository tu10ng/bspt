import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Protocol } from "../types/session";
import { v4 as uuidv4 } from "uuid";

export interface Tab {
  id: string;
  nodeId: string;       // Session tree node ID
  sessionId: string;    // Backend session ID
  label: string;        // hostname:port
  protocol: Protocol;
  order: number;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;

  // Actions
  openTab: (nodeId: string, sessionId: string, label: string, protocol: Protocol) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string | null) => void;
  reorderTabs: (dragId: string, dropId: string) => void;
  getTabByNodeId: (nodeId: string) => Tab | undefined;
  getTabBySessionId: (sessionId: string) => Tab | undefined;
  updateTabSessionId: (tabId: string, sessionId: string) => void;
}

export const useTabStore = create<TabState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeTabId: null,

      openTab: (nodeId: string, sessionId: string, label: string, protocol: Protocol) => {
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
            t.id === tabId ? { ...t, sessionId } : t
          ),
        }));
      },
    }),
    {
      name: "bspt-tabs",
      partialize: (state) => ({
        // Only persist tab metadata, not connection state
        // Session IDs will be stale on reload, so we clear them
        tabs: state.tabs.map((t) => ({ ...t, sessionId: "" })),
        activeTabId: state.activeTabId,
      }),
    }
  )
);
