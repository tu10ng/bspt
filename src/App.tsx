import "./App.css";
import { useThemeStore } from "./stores/themeStore";
import { useSessionTreeStore } from "./stores/sessionTreeStore";
import { ThemeControls } from "./components/ThemeControls";
import { TerminalView } from "./components/Terminal";
import { SessionTree } from "./components/Sidebar";
import { useState } from "react";
import { Protocol } from "./types/session";

function App() {
  const { opacity, blur } = useThemeStore();
  const {
    activeSessionId,
    activeNodeId,
    addRouter,
    findNodeById,
    connectNode,
  } = useSessionTreeStore();

  // Quick connect form state
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [protocol, setProtocol] = useState<Protocol>("ssh");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!host || !username) return;

    setIsConnecting(true);
    try {
      // Add router to tree
      const routerId = addRouter({
        name: `${host}:${port}`,
        mgmtIp: host,
        port: parseInt(port) || (protocol === "ssh" ? 22 : 23),
        protocol,
        authProfileId: null,
        username,
        password,
      });

      // Connect to the new router
      await connectNode(routerId);

      // Clear form
      setHost("");
      setPort(protocol === "ssh" ? "22" : "23");
      setUsername("");
      setPassword("");
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Get active node info for footer
  const activeNode = activeNodeId ? findNodeById(activeNodeId) : null;

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

        {/* Quick Connect Form */}
        <div className="quick-connect">
          <input
            type="text"
            placeholder="Host"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="input-field"
          />
          <input
            type="text"
            placeholder="Port"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="input-field"
          />
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
          <select
            value={protocol}
            onChange={(e) => {
              const newProtocol = e.target.value as Protocol;
              setProtocol(newProtocol);
              // Auto-update port when switching protocol
              if (port === "22" || port === "23") {
                setPort(newProtocol === "ssh" ? "22" : "23");
              }
            }}
            className="input-field"
          >
            <option value="ssh">SSH</option>
            <option value="telnet">Telnet</option>
          </select>
          <button
            onClick={handleConnect}
            disabled={isConnecting || !host || !username}
            className="connect-button"
          >
            {isConnecting ? "Connecting..." : "Connect"}
          </button>
        </div>

        {/* Session Tree */}
        <SessionTree />
      </aside>

      {/* Terminal - Main Content Area */}
      <main className="terminal">
        {activeSessionId ? (
          <TerminalView sessionId={activeSessionId} />
        ) : (
          <div className="terminal-placeholder">
            Connect to a server to start a session
          </div>
        )}
      </main>

      {/* Right Panel */}
      <aside className="panel">
        <div className="panel-title">Theme</div>
        <ThemeControls />
      </aside>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <span>
            {activeNode
              ? activeNode.connectionState
              : "No session"}
          </span>
        </div>
        <div className="footer-right">
          <span>{activeNode ? activeNode.protocol.toUpperCase() : "-"}</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
