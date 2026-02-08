import "./App.css";
import { useThemeStore } from "./stores/themeStore";
import { ThemeControls } from "./components/ThemeControls";

function App() {
  const { opacity, blur } = useThemeStore();

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
        <div className="session-tree">
          <div className="session-item">
            <span className="session-icon">*</span>
            <span className="session-name">Router 192.168.1.1</span>
          </div>
          <div className="session-item">
            <span className="session-icon">*</span>
            <span className="session-name">Board 10.0.0.1</span>
          </div>
        </div>
      </aside>

      {/* Terminal - Main Content Area */}
      <main className="terminal">
        <div className="terminal-placeholder">
          Terminal will be rendered here (xterm.js)
        </div>
      </main>

      {/* Right Panel */}
      <aside className="panel">
        <div className="panel-title">Theme</div>
        <ThemeControls />
      </aside>

      {/* Footer */}
      <footer className="footer">
        <div className="footer-left">
          <span>Ready</span>
        </div>
        <div className="footer-right">
          <span>SSH</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  );
}

export default App;
