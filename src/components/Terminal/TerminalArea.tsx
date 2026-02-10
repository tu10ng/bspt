import { useCallback, useEffect } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useBlockStore } from "../../stores/blockStore";
import { setupTabCloseListener } from "../../hooks";
import { TabBar } from "./TabBar";
import { UnifiedTerminal } from "./UnifiedTerminal";

interface TerminalAreaProps {
  activeMarkerId?: string | null;
}

export function TerminalArea({ activeMarkerId }: TerminalAreaProps) {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useTabStore();
  const { activeMarkerId: blockActiveMarkerId } = useBlockStore();

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
              : "Select a tab or connect to continue"}
          </div>
        )}
      </div>
    </div>
  );
}

export default TerminalArea;
