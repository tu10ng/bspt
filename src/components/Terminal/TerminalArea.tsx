import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTabStore } from "../../stores/tabStore";
import { useBlockStore } from "../../stores/blockStore";
import { useSessionTreeStore } from "../../stores/sessionTreeStore";
import { RouterNode, LinuxBoardNode } from "../../types/session";
import { setupTabCloseListener } from "../../hooks";
import { TabBar } from "./TabBar";
import { UnifiedTerminal } from "./UnifiedTerminal";

interface TerminalAreaProps {
  activeMarkerId?: string | null;
}

export function TerminalArea({ activeMarkerId }: TerminalAreaProps) {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs, updateTabSessionId } = useTabStore();
  const { activeMarkerId: blockActiveMarkerId } = useBlockStore();
  const { connectNode, findNodeById } = useSessionTreeStore();

  // Setup tab close listener for terminal pool cleanup
  useEffect(() => {
    const cleanup = setupTabCloseListener();
    return cleanup;
  }, []);

  // Filter tabs with valid sessionIds for rendering
  const validTabs = tabs.filter((tab) => tab.sessionId);

  const handleTabClick = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
    },
    [setActiveTab]
  );

  const handleTabClose = useCallback(
    (tabId: string) => {
      closeTab(tabId);
    },
    [closeTab]
  );

  const handleTabReorder = useCallback(
    (dragId: string, dropId: string) => {
      reorderTabs(dragId, dropId);
    },
    [reorderTabs]
  );

  const handleTabReconnect = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;

      // Use the existing connectNode which creates a new session
      await connectNode(tab.nodeId);

      // Wait for session ID to be set on the node
      const waitForSession = async (): Promise<string | null> => {
        for (let i = 0; i < 50; i++) {
          const node = findNodeById(tab.nodeId);
          if (node && node.type !== "folder") {
            const sessionId = (node as RouterNode | LinuxBoardNode).sessionId;
            if (sessionId) {
              return sessionId;
            }
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      };

      const newSessionId = await waitForSession();
      if (newSessionId) {
        updateTabSessionId(tabId, newSessionId);
      }
    },
    [tabs, connectNode, findNodeById, updateTabSessionId]
  );

  const handleTabDisconnect = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab || !tab.sessionId) return;

      // Disconnect only this specific session, not the entire node
      // This prevents disconnecting all tabs that share the same nodeId
      try {
        await invoke("disconnect_session", { sessionId: tab.sessionId });
      } catch (error) {
        console.error("Failed to disconnect session:", error);
      }

      // Clear the tab's sessionId to mark it as disconnected
      updateTabSessionId(tabId, "");
    },
    [tabs, updateTabSessionId]
  );

  // Use passed activeMarkerId or fall back to blockStore's activeMarkerId
  const effectiveMarkerId = activeMarkerId ?? blockActiveMarkerId;

  return (
    <div className="terminal-area-container">
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
        onTabReconnect={handleTabReconnect}
        onTabDisconnect={handleTabDisconnect}
      />
      <div className="terminal-content">
        {validTabs.length > 0 ? (
          /* Render all terminals, control visibility with CSS */
          validTabs.map((tab) => (
            <div
              key={tab.id}
              className="terminal-tab-panel"
              style={{ display: tab.id === activeTabId ? "block" : "none" }}
            >
              <UnifiedTerminal
                sessionId={tab.sessionId}
                activeMarkerId={tab.id === activeTabId ? effectiveMarkerId : null}
              />
            </div>
          ))
        ) : (
          <div className="terminal-placeholder">
            {tabs.length === 0
              ? "Connect to a server to start a session"
              : "Select a tab or click the reconnect button to continue"}
          </div>
        )}
      </div>
    </div>
  );
}

export default TerminalArea;
