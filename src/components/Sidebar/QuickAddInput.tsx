import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useSessionTreeStore } from "../../stores/sessionTreeStore";
import { useTabStore } from "../../stores/tabStore";
import { Protocol, RouterNode } from "../../types/session";

interface QuickAddInputProps {
  onConnect?: (nodeId: string) => void;
}

interface ParsedInput {
  username: string;
  host: string;
  port: number;
  protocol: Protocol;
  password?: string;
}

function parseConnectionString(input: string): ParsedInput | null {
  // Format: [user@]host[:port][/password]
  // Examples:
  //   192.168.1.1
  //   root@192.168.1.1
  //   root@192.168.1.1:22
  //   root@192.168.1.1:23
  //   admin@10.0.0.1/password123

  const trimmed = input.trim();
  if (!trimmed) return null;

  let username = "";
  let host = "";
  let port = 22;
  let password: string | undefined;

  // Extract password if present (after /)
  const [mainPart, passwordPart] = trimmed.split("/");
  if (passwordPart) {
    password = passwordPart;
  }

  // Extract username if present (before @)
  const atIndex = mainPart.indexOf("@");
  let hostPort: string;
  if (atIndex !== -1) {
    username = mainPart.slice(0, atIndex);
    hostPort = mainPart.slice(atIndex + 1);
  } else {
    hostPort = mainPart;
  }

  // Extract port if present (after :)
  const colonIndex = hostPort.lastIndexOf(":");
  if (colonIndex !== -1) {
    host = hostPort.slice(0, colonIndex);
    const portStr = hostPort.slice(colonIndex + 1);
    const parsedPort = parseInt(portStr, 10);
    if (!isNaN(parsedPort) && parsedPort > 0 && parsedPort < 65536) {
      port = parsedPort;
    }
  } else {
    host = hostPort;
  }

  if (!host) return null;

  // Auto-detect protocol based on port
  const protocol: Protocol = port === 23 ? "telnet" : "ssh";

  return { username, host, port, protocol, password };
}

export function QuickAddInput({ onConnect }: QuickAddInputProps) {
  const [input, setInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { routers, addRouter, connectNode, findNodeById } = useSessionTreeStore();
  const { openTab } = useTabStore();

  // Get existing sessions for fuzzy search
  const existingSessions = useMemo(() => {
    const sessions: { nodeId: string; label: string; node: RouterNode }[] = [];
    for (const router of routers.values()) {
      sessions.push({
        nodeId: router.id,
        label: `${router.username}@${router.mgmtIp}:${router.port}`,
        node: router,
      });
    }
    return sessions;
  }, [routers]);

  // Filter suggestions based on input
  const suggestions = useMemo(() => {
    if (!input.trim()) return existingSessions;

    const lower = input.toLowerCase();
    return existingSessions.filter(
      (s) =>
        s.label.toLowerCase().includes(lower) ||
        s.node.name.toLowerCase().includes(lower)
    );
  }, [input, existingSessions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    if (!showSuggestions) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.contains(e.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  const handleConnect = useCallback(async () => {
    const parsed = parseConnectionString(input);
    if (!parsed) return;

    setIsConnecting(true);
    try {
      // Create new router entry
      const routerId = addRouter({
        name: `${parsed.host}:${parsed.port}`,
        mgmtIp: parsed.host,
        port: parsed.port,
        protocol: parsed.protocol,
        authProfileId: null,
        username: parsed.username,
        password: parsed.password || "",
      });

      // Connect to the router
      await connectNode(routerId);

      // Wait briefly for state to update, then poll for session ID
      // connectNode updates state asynchronously
      const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
        for (let i = 0; i < maxAttempts; i++) {
          const node = findNodeById(routerId);
          if (node && node.type !== "folder" && node.sessionId) {
            return node.sessionId;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      };

      const sessionId = await waitForSession();
      if (sessionId) {
        openTab(
          routerId,
          sessionId,
          `${parsed.host}:${parsed.port}`,
          parsed.protocol
        );
      }

      // Clear input on success
      setInput("");
      setShowSuggestions(false);
      onConnect?.(routerId);
    } catch (error) {
      console.error("Failed to connect:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [input, addRouter, connectNode, findNodeById, openTab, onConnect]);

  const handleSelectSuggestion = useCallback(
    async (session: (typeof existingSessions)[0]) => {
      setIsConnecting(true);
      try {
        // Always create a new connection - each selection creates a new tab
        await connectNode(session.nodeId);

        // Wait for session ID to be available
        const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
          for (let i = 0; i < maxAttempts; i++) {
            const node = findNodeById(session.nodeId);
            if (node && node.type !== "folder" && node.sessionId) {
              return node.sessionId;
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          return null;
        };

        const sessionId = await waitForSession();
        if (sessionId) {
          openTab(
            session.nodeId,
            sessionId,
            session.label,
            session.node.protocol
          );
        }

        setInput("");
        setShowSuggestions(false);
        onConnect?.(session.nodeId);
      } catch (error) {
        console.error("Failed to connect:", error);
      } finally {
        setIsConnecting(false);
      }
    },
    [connectNode, findNodeById, openTab, onConnect]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions || suggestions.length === 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleConnect();
        }
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (suggestions[selectedIndex]) {
            handleSelectSuggestion(suggestions[selectedIndex]);
          } else {
            handleConnect();
          }
          break;
        case "Escape":
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex, handleConnect, handleSelectSuggestion]
  );

  const parsed = parseConnectionString(input);
  const canConnect = parsed !== null && parsed.host.length > 0;

  return (
    <div className="quick-add-input">
      <div className="quick-add-field-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="quick-add-field"
          placeholder="user@host:port"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
            setSelectedIndex(0);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          disabled={isConnecting}
        />
        <button
          className="quick-add-btn"
          onClick={handleConnect}
          disabled={isConnecting || !canConnect}
          title={parsed ? `Connect via ${parsed.protocol.toUpperCase()}` : "Enter connection details"}
        >
          {isConnecting ? "..." : "+"}
        </button>
      </div>

      {showSuggestions && suggestions.length > 0 && (
        <div className="quick-add-suggestions" ref={suggestionsRef}>
          {suggestions.map((s, i) => (
            <div
              key={s.nodeId}
              className={`quick-add-suggestion ${i === selectedIndex ? "selected" : ""} ${
                s.node.sessionId ? "connected" : ""
              }`}
              onClick={() => handleSelectSuggestion(s)}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <span
                className={`suggestion-status ${
                  s.node.connectionState === "ready" ? "state-connected" : "state-disconnected"
                }`}
              />
              <span className="suggestion-label">{s.label}</span>
              <span className={`suggestion-protocol protocol-${s.node.protocol}`}>
                [{s.node.protocol === "ssh" ? "S" : "T"}]
              </span>
            </div>
          ))}
        </div>
      )}

      {input && parsed && (
        <div className="quick-add-preview">
          {parsed.username && <span className="preview-user">{parsed.username}@</span>}
          <span className="preview-host">{parsed.host}</span>
          <span className="preview-port">:{parsed.port}</span>
          <span className={`preview-protocol protocol-${parsed.protocol}`}>
            {parsed.protocol.toUpperCase()}
          </span>
        </div>
      )}
    </div>
  );
}

export default QuickAddInput;
