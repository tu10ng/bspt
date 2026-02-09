import "./App.css";
import { useThemeStore } from "./stores/themeStore";
import { useSessionStore, SessionConfig } from "./stores/sessionStore";
import { ThemeControls } from "./components/ThemeControls";
import { TerminalView } from "./components/Terminal";
import { useState } from "react";

function App() {
  const { opacity, blur } = useThemeStore();
  const { sessions, activeSessionId, createSession, setActiveSession } =
    useSessionStore();

  // Quick connect form state
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [protocol, setProtocol] = useState<"ssh" | "telnet">("ssh");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!host || !username) return;

    setIsConnecting(true);
    try {
      const config: SessionConfig = {
        host,
        port: parseInt(port) || (protocol === "ssh" ? 22 : 23),
        protocol,
        username,
        password,
        cols: 80,
        rows: 24,
      };

      await createSession(config);
    } catch (error) {
      console.error("Failed to create session:", error);
    } finally {
      setIsConnecting(false);
    }
  };

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
            onChange={(e) => setProtocol(e.target.value as "ssh" | "telnet")}
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

        {/* Session List */}
        <div className="session-tree">
          {Array.from(sessions.values()).map((session) => (
            <div
              key={session.id}
              className={`session-item ${
                activeSessionId === session.id ? "active" : ""
              }`}
              onClick={() => setActiveSession(session.id)}
            >
              <span className="session-icon">
                {session.state === "ready" ? "*" : "o"}
              </span>
              <span className="session-name">{session.name}</span>
            </div>
          ))}
        </div>
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
            {activeSessionId
              ? sessions.get(activeSessionId)?.state || "Ready"
              : "No session"}
          </span>
        </div>
        <div className="footer-right">
          <span>{activeSessionId ? protocol.toUpperCase() : "-"}</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
