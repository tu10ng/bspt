import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ParseResult, ParsedIP } from "../../utils/connectionParser";
import { Protocol } from "../../types/session";

interface ParseConfirmDialogProps {
  parseResult: ParseResult;
  onConfirm: (result: {
    ips: ParsedIP[];
    username: string;
    password: string;
    protocol: Protocol;
  }) => void;
  onCancel: () => void;
}

export function ParseConfirmDialog({
  parseResult,
  onConfirm,
  onCancel,
}: ParseConfirmDialogProps) {
  const [ips, setIps] = useState<ParsedIP[]>(parseResult.ips);
  const [username, setUsername] = useState(parseResult.username || "");
  const [password, setPassword] = useState(parseResult.password || "");
  const [protocol, setProtocol] = useState<Protocol>(parseResult.protocol || "ssh");
  const [showPassword, setShowPassword] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Update state when parseResult changes
  useEffect(() => {
    setIps(parseResult.ips);
    setUsername(parseResult.username || "");
    setPassword(parseResult.password || "");
    setProtocol(parseResult.protocol || "ssh");
  }, [parseResult]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onCancel]);

  const toggleIpSelection = (index: number) => {
    setIps((prev) =>
      prev.map((ip, i) =>
        i === index ? { ...ip, selected: !ip.selected } : ip
      )
    );
  };

  const changeIpType = (index: number, type: "mgmt" | "board") => {
    setIps((prev) =>
      prev.map((ip, i) => (i === index ? { ...ip, type } : ip))
    );
  };

  const handleConfirm = () => {
    const selectedIps = ips.filter((ip) => ip.selected);
    if (selectedIps.length === 0) return;

    onConfirm({
      ips: selectedIps,
      username,
      password,
      protocol,
    });
  };

  const hasSelectedIps = ips.some((ip) => ip.selected);

  return createPortal(
    <div className="parse-dialog-overlay">
      <div className="parse-dialog" ref={dialogRef}>
        <div className="parse-dialog-header">
          <h3 className="parse-dialog-title">Parse Result</h3>
          <button
            className="parse-dialog-close"
            onClick={onCancel}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="parse-dialog-content">
          <p className="parse-dialog-desc">Detected the following information:</p>

          <div className="parse-dialog-section">
            <label className="parse-dialog-label">Username</label>
            <input
              type="text"
              className="parse-dialog-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
            />
          </div>

          <div className="parse-dialog-section">
            <label className="parse-dialog-label">Password</label>
            <div className="parse-dialog-password-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                className="parse-dialog-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
              <button
                type="button"
                className="parse-dialog-password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="parse-dialog-section">
            <label className="parse-dialog-label">Protocol</label>
            <div className="parse-dialog-protocol-toggle">
              <button
                type="button"
                className={`parse-dialog-protocol-btn ${protocol === "ssh" ? "active" : ""}`}
                onClick={() => setProtocol("ssh")}
              >
                SSH
              </button>
              <button
                type="button"
                className={`parse-dialog-protocol-btn ${protocol === "telnet" ? "active" : ""}`}
                onClick={() => setProtocol("telnet")}
              >
                Telnet
              </button>
            </div>
          </div>

          <div className="parse-dialog-section">
            <label className="parse-dialog-label">IP Addresses</label>
            <div className="parse-dialog-ip-list">
              {ips.map((ip, index) => (
                <div key={ip.ip} className="parse-dialog-ip-item">
                  <label className="parse-dialog-checkbox">
                    <input
                      type="checkbox"
                      checked={ip.selected}
                      onChange={() => toggleIpSelection(index)}
                    />
                    <span className="parse-dialog-ip">{ip.ip}</span>
                  </label>
                  <select
                    className="parse-dialog-type-select"
                    value={ip.type}
                    onChange={(e) =>
                      changeIpType(index, e.target.value as "mgmt" | "board")
                    }
                  >
                    <option value="mgmt">Management</option>
                    <option value="board">Board</option>
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="parse-dialog-footer">
          <button className="parse-dialog-btn-cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="parse-dialog-btn-confirm"
            onClick={handleConfirm}
            disabled={!hasSelectedIps}
          >
            Create Devices
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default ParseConfirmDialog;
