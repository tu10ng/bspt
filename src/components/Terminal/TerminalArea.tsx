import { useCallback } from "react";
import { useTabStore } from "../../stores/tabStore";
import { useBlockStore } from "../../stores/blockStore";
import { TabBar } from "./TabBar";
import { UnifiedTerminal } from "./UnifiedTerminal";

interface TerminalAreaProps {
  activeMarkerId?: string | null;
}

export function TerminalArea({ activeMarkerId }: TerminalAreaProps) {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useTabStore();
  const { activeMarkerId: blockActiveMarkerId } = useBlockStore();

  const activeTab = tabs.find((t) => t.id === activeTabId);

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
        {activeTab && activeTab.sessionId ? (
          <UnifiedTerminal
            sessionId={activeTab.sessionId}
            activeMarkerId={effectiveMarkerId}
          />
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
