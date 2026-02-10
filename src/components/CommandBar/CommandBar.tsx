import { useCommandBarStore } from "../../stores/commandBarStore";
import { useTabStore } from "../../stores/tabStore";
import { QuickCommandButton } from "./QuickCommandButton";
import { ClipboardHistoryDropdown } from "./ClipboardHistoryDropdown";

export function CommandBar() {
  const { quickCommands } = useCommandBarStore();
  const { tabs, activeTabId } = useTabStore();

  // Get active session ID
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const sessionId = activeTab?.sessionId || null;

  return (
    <div className="command-bar">
      <div className="quick-commands">
        {quickCommands.map((cmd) => (
          <QuickCommandButton
            key={cmd.id}
            command={cmd}
            sessionId={sessionId}
          />
        ))}
      </div>

      <ClipboardHistoryDropdown sessionId={sessionId} />
    </div>
  );
}

export default CommandBar;
