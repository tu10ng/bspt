import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useDeviceTreeStore } from "../../stores/deviceTreeStore";
import { useTabStore, ConnectionConfig } from "../../stores/tabStore";
import { RouterNode } from "../../types/session";
import {
  parseConnectionText,
  parseSSHString,
  ParseResult,
  ParsedIP,
} from "../../utils/connectionParser";
import { Protocol } from "../../types/session";
import { ParseConfirmDialog } from "./ParseConfirmDialog";

interface AddDeviceInputsProps {
  onConnect?: (nodeId: string) => void;
}

export function AddDeviceInputs({ onConnect }: AddDeviceInputsProps) {
  // Auto-detect state
  const [autoDetectText, setAutoDetectText] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [showParseDialog, setShowParseDialog] = useState(false);

  // SSH quick connect state
  const [sshInput, setSshInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const sshInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const { routers, addRouter, addBoard, connectNode, findNodeById } = useDeviceTreeStore();
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
    if (!sshInput.trim()) return existingSessions;

    const lower = sshInput.toLowerCase();
    return existingSessions.filter(
      (s) =>
        s.label.toLowerCase().includes(lower) ||
        s.node.name.toLowerCase().includes(lower)
    );
  }, [sshInput, existingSessions]);

  // Close suggestions when clicking outside
  useEffect(() => {
    if (!showSuggestions) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        sshInputRef.current &&
        !sshInputRef.current.contains(e.target as Node) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showSuggestions]);

  // Handle auto-detect parse
  const handleAutoDetect = useCallback(() => {
    if (!autoDetectText.trim()) return;

    const result = parseConnectionText(autoDetectText);
    if (result.ips.length > 0) {
      setParseResult(result);
      setShowParseDialog(true);
    }
  }, [autoDetectText]);

  // Handle parse dialog confirm
  const handleParseConfirm = useCallback(
    async (result: { ips: ParsedIP[]; username: string; password: string; protocol: Protocol }) => {
      setShowParseDialog(false);
      setIsConnecting(true);

      try {
        // Find management IP and board IPs
        const mgmtIp = result.ips.find((ip) => ip.type === "mgmt");
        const boardIps = result.ips.filter((ip) => ip.type === "board");

        if (!mgmtIp) {
          console.error("No management IP selected");
          return;
        }

        // Create router with user-selected protocol
        const routerId = addRouter({
          name: `${mgmtIp.ip}`,
          mgmtIp: mgmtIp.ip,
          port: result.protocol === "telnet" ? 23 : 22,
          protocol: result.protocol,
          authProfileId: null,
          username: result.username,
          password: result.password,
        });

        // Add boards with same protocol
        for (const boardIp of boardIps) {
          addBoard(routerId, {
            slotId: null,
            ip: boardIp.ip,
            name: boardIp.ip,
            protocol: result.protocol,
          });
        }

        // Connect to router
        await connectNode(routerId);

        // Wait for session ID
        const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
          for (let i = 0; i < maxAttempts; i++) {
            const node = findNodeById(routerId);
            if (node && node.type === "router" && node.sessionId) {
              return node.sessionId;
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          return null;
        };

        const sessionId = await waitForSession();
        if (sessionId) {
          const router = findNodeById(routerId) as RouterNode;
          const connectionConfig: ConnectionConfig = {
            host: router.mgmtIp,
            port: router.port,
            protocol: router.protocol,
            username: router.username,
            password: router.password,
          };
          openTab(
            routerId,
            sessionId,
            `${mgmtIp.ip}:${router.port}`,
            router.protocol,
            connectionConfig
          );
        }

        // Clear input
        setAutoDetectText("");
        onConnect?.(routerId);
      } catch (error) {
        console.error("Failed to create devices:", error);
      } finally {
        setIsConnecting(false);
      }
    },
    [addRouter, addBoard, connectNode, findNodeById, openTab, onConnect]
  );

  // Handle SSH quick connect
  const handleSSHConnect = useCallback(async () => {
    const parsed = parseSSHString(sshInput);
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
        password: "",
      });

      // Connect to the router
      await connectNode(routerId);

      // Wait for session ID
      const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
        for (let i = 0; i < maxAttempts; i++) {
          const node = findNodeById(routerId);
          if (node && node.type !== "folder" && node.type !== "slot" && node.sessionId) {
            return node.sessionId;
          }
          await new Promise((r) => setTimeout(r, 100));
        }
        return null;
      };

      const sessionId = await waitForSession();
      if (sessionId) {
        const router = findNodeById(routerId) as RouterNode;
        const connectionConfig: ConnectionConfig = {
          host: router.mgmtIp,
          port: router.port,
          protocol: router.protocol,
          username: router.username,
          password: router.password,
        };
        openTab(
          routerId,
          sessionId,
          `${parsed.host}:${parsed.port}`,
          parsed.protocol,
          connectionConfig
        );
      }

      // Clear input
      setSshInput("");
      setShowSuggestions(false);
      onConnect?.(routerId);
    } catch (error) {
      console.error("Failed to connect:", error);
    } finally {
      setIsConnecting(false);
    }
  }, [sshInput, addRouter, connectNode, findNodeById, openTab, onConnect]);

  // Handle selecting existing session
  const handleSelectSuggestion = useCallback(
    async (session: (typeof existingSessions)[0]) => {
      setIsConnecting(true);
      try {
        await connectNode(session.nodeId);

        const waitForSession = async (maxAttempts = 10): Promise<string | null> => {
          for (let i = 0; i < maxAttempts; i++) {
            const node = findNodeById(session.nodeId);
            if (node && node.type !== "folder" && node.type !== "slot" && node.sessionId) {
              return node.sessionId;
            }
            await new Promise((r) => setTimeout(r, 100));
          }
          return null;
        };

        const sessionId = await waitForSession();
        if (sessionId) {
          const connectionConfig: ConnectionConfig = {
            host: session.node.mgmtIp,
            port: session.node.port,
            protocol: session.node.protocol,
            username: session.node.username,
            password: session.node.password,
          };
          openTab(
            session.nodeId,
            sessionId,
            session.label,
            session.node.protocol,
            connectionConfig
          );
        }

        setSshInput("");
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

  // SSH input keyboard handler
  const handleSSHKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions || suggestions.length === 0) {
        if (e.key === "Enter") {
          e.preventDefault();
          handleSSHConnect();
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
            handleSSHConnect();
          }
          break;
        case "Escape":
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex, handleSSHConnect, handleSelectSuggestion]
  );

  const parsed = parseSSHString(sshInput);
  const canSSHConnect = parsed !== null && parsed.host.length > 0;

  return (
    <div className="add-device-inputs">
      {/* Auto-detect input */}
      <div className="add-device-section">
        <div className="add-device-input-row">
          <input
            type="text"
            className="add-device-field"
            placeholder="Auto-detect (paste text)"
            value={autoDetectText}
            onChange={(e) => setAutoDetectText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && autoDetectText.trim()) {
                e.preventDefault();
                handleAutoDetect();
              }
            }}
            disabled={isConnecting}
          />
          <button
            className="add-device-btn"
            onClick={handleAutoDetect}
            disabled={isConnecting || !autoDetectText.trim()}
            title="Parse and detect IPs"
          >
            +
          </button>
        </div>
      </div>

      {/* SSH quick connect input */}
      <div className="add-device-section">
        <div className="add-device-input-row">
          <input
            ref={sshInputRef}
            type="text"
            className="add-device-field"
            placeholder="ssh (user@host:port)"
            value={sshInput}
            onChange={(e) => {
              setSshInput(e.target.value);
              setShowSuggestions(true);
              setSelectedIndex(0);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={handleSSHKeyDown}
            disabled={isConnecting}
          />
          <button
            className="add-device-btn"
            onClick={handleSSHConnect}
            disabled={isConnecting || !canSSHConnect}
            title={parsed ? `Connect via ${parsed.protocol.toUpperCase()}` : "Enter SSH details"}
          >
            {isConnecting ? "..." : "+"}
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="add-device-suggestions" ref={suggestionsRef}>
            {suggestions.map((s, i) => (
              <div
                key={s.nodeId}
                className={`add-device-suggestion ${i === selectedIndex ? "selected" : ""} ${
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
      </div>

      {/* Parse confirmation dialog */}
      {showParseDialog && parseResult && (
        <ParseConfirmDialog
          parseResult={parseResult}
          onConfirm={handleParseConfirm}
          onCancel={() => setShowParseDialog(false)}
        />
      )}
    </div>
  );
}

export default AddDeviceInputs;
