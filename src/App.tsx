import "./App.css";
import { useThemeStore } from "./stores/themeStore";
import { useSessionTreeStore } from "./stores/sessionTreeStore";
import { useBlockStore } from "./stores/blockStore";
import { useTabStore } from "./stores/tabStore";
import { ThemeControls } from "./components/ThemeControls";
import { Outline, TerminalArea } from "./components/Terminal";
import { SessionTree, QuickAddInput } from "./components/Sidebar";
import { CommandBar } from "./components/CommandBar";
import { FlowPanel } from "./components/Panel";
import { useState, useCallback, useEffect } from "react";
import { useTracerStore } from "./stores/tracerStore";

function App() {
  const { opacity, blur } = useThemeStore();
  const { findNodeById } = useSessionTreeStore();
  const { activeMarkerId, setActiveMarker } = useBlockStore();
  const { tabs, activeTabId, getDisconnectedTabs } = useTabStore();
  const { traceEvents, indexDirectory, indexed, indexing, sourcePath } = useTracerStore();

  // Panel mode state
  const [panelMode, setPanelMode] = useState<"outline" | "flow">("outline");

  // Startup reconnection check
  const [showReconnectBanner, setShowReconnectBanner] = useState(false);
  const [disconnectedCount, setDisconnectedCount] = useState(0);

  useEffect(() => {
    // Check for disconnected tabs on startup
    const disconnectedTabs = getDisconnectedTabs();
    if (disconnectedTabs.length > 0) {
      setDisconnectedCount(disconnectedTabs.length);
      setShowReconnectBanner(true);
    }
  }, [getDisconnectedTabs]);

  // Get active tab and session info
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSessionId = activeTab?.sessionId || null;
  const activeNodeId = activeTab?.nodeId || null;

  // Get active node info for footer
  const activeNode = activeNodeId ? findNodeById(activeNodeId) : null;

  // Handle marker selection from Outline
  const handleSelectMarker = useCallback((markerId: string) => {
    setActiveMarker(markerId);
    // Clear highlight after 2 seconds
    setTimeout(() => {
      setActiveMarker(null);
    }, 2000);
  }, [setActiveMarker]);

  // Apply dynamic CSS variables based on theme settings
  const dynamicStyles = {
    "--dynamic-opacity": opacity,
    "--dynamic-blur": `${blur}px`,
  } as React.CSSProperties;

  return (
    <div className="app-grid" style={dynamicStyles}>
      {/* Header */}
      <header className="header">
        <span className="header-title">BSPT</span>
        <div className="header-actions">
          {/* Window controls will go here */}
        </div>
      </header>

      {/* Sidebar - Session Tree */}
      <aside className="sidebar">
        <div className="sidebar-title">Sessions</div>

        {/* Quick Add Input - compact connection input */}
        <QuickAddInput />

        {/* Session Tree */}
        <SessionTree />
      </aside>

      {/* Terminal - Main Content Area with TabBar */}
      <main className="terminal">
        {/* Reconnection banner */}
        {showReconnectBanner && (
          <div className="reconnect-banner">
            <span>
              {disconnectedCount} disconnected tab{disconnectedCount > 1 ? "s" : ""} from previous session.
              Click the reconnect button (&#8635;) on each tab to restore connections.
            </span>
            <button
              className="reconnect-banner-close"
              onClick={() => setShowReconnectBanner(false)}
              title="Dismiss"
            >
              &times;
            </button>
          </div>
        )}
        <TerminalArea activeMarkerId={activeMarkerId} />
      </main>

      {/* Right Panel - Outline / Traces / Theme */}
      <aside className="panel">
        {activeSessionId ? (
          <>
            {/* Panel mode tabs */}
            <div className="panel-tabs">
              <button
                className={`panel-tab ${panelMode === "outline" ? "panel-tab-active" : ""}`}
                onClick={() => setPanelMode("outline")}
              >
                Outline
              </button>
              <button
                className={`panel-tab ${panelMode === "flow" ? "panel-tab-active" : ""}`}
                onClick={() => setPanelMode("flow")}
              >
                Traces {traceEvents.length > 0 && `(${traceEvents.length})`}
              </button>
            </div>

            {/* Panel content */}
            {panelMode === "outline" && (
              <Outline
                sessionId={activeSessionId}
                activeMarkerId={activeMarkerId ?? undefined}
                onSelectMarker={handleSelectMarker}
              />
            )}
            {panelMode === "flow" && (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                {/* Index source button */}
                {!indexed && !indexing && (
                  <div style={{ padding: "8px 12px" }}>
                    <button
                      className="connect-button"
                      style={{ width: "100%" }}
                      onClick={async () => {
                        // Prompt user for directory path
                        const path = prompt("Enter C source directory path:");
                        if (path) {
                          await indexDirectory(path);
                        }
                      }}
                    >
                      Index Source Directory
                    </button>
                  </div>
                )}
                {indexed && sourcePath && (
                  <div style={{ padding: "4px 12px", fontSize: "11px", color: "#757575" }}>
                    Indexed: {sourcePath.split("/").pop()}
                  </div>
                )}
                <FlowPanel sessionId={activeSessionId} />
              </div>
            )}
          </>
        ) : (
          <>
            <div className="panel-title">Theme</div>
            <ThemeControls />
          </>
        )}
      </aside>

      {/* CommandBar - Quick commands and clipboard */}
      <CommandBar />

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <span>
            {activeNode && activeNode.type !== "folder"
              ? activeNode.connectionState
              : "No session"}
          </span>
        </div>
        <div className="footer-right">
          <span>{activeNode && activeNode.type !== "folder" ? activeNode.protocol.toUpperCase() : "-"}</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
