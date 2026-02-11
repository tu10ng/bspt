import { Protocol } from "../types/session";

export interface ParsedIP {
  ip: string;
  type: "mgmt" | "board";
  selected: boolean;
}

export interface ParseResult {
  ips: ParsedIP[];
  username?: string;
  password?: string;
  protocol?: Protocol;
  port?: number;
}

// IPv4 regex pattern
const IPV4_REGEX = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;

// Common username patterns
const USERNAME_PATTERNS = [
  /用户[名]?\s*[:：]\s*(\S+)/i,
  /user(?:name)?\s*[:：]\s*(\S+)/i,
  /账[号户]\s*[:：]\s*(\S+)/i,
  /login\s*[:：]\s*(\S+)/i,
];

// Common password patterns
const PASSWORD_PATTERNS = [
  /密码\s*[:：]\s*(\S+)/i,
  /pass(?:word)?\s*[:：]\s*(\S+)/i,
  /pwd\s*[:：]\s*(\S+)/i,
];

// SSH connection string pattern: user@host:port
const SSH_STRING_REGEX = /(\w+)@([\d.]+)(?::(\d+))?/;

// Management IP keywords
const MGMT_KEYWORDS = [
  "管理",
  "mgmt",
  "management",
  "meth",
  "管理网口",
  "管理口",
];

// Board IP keywords
const BOARD_KEYWORDS = [
  "板卡",
  "board",
  "slot",
  "linux",
  "单板",
];

/**
 * Parse arbitrary text to extract connection information
 * Supports formats like:
 * - 管理网口: 6.1.11.71 root123/Root@123
 * - user: root, password: 123456, ip: 192.168.1.1
 * - root@192.168.1.1:22
 * - Multiple IPs on separate lines
 */
export function parseConnectionText(text: string): ParseResult {
  const result: ParseResult = {
    ips: [],
  };

  if (!text.trim()) {
    return result;
  }

  // Try to parse as SSH connection string first
  const sshMatch = text.match(SSH_STRING_REGEX);
  if (sshMatch) {
    const [, username, host, portStr] = sshMatch;
    result.username = username;
    result.protocol = "ssh";
    result.port = portStr ? parseInt(portStr, 10) : 22;
    result.ips.push({ ip: host, type: "mgmt", selected: true });
    return result;
  }

  // Extract all IP addresses
  const ipMatches = text.match(IPV4_REGEX) || [];
  const uniqueIps = [...new Set(ipMatches)];

  // Try to determine IP types from context
  const lines = text.split("\n");
  const ipTypeMap = new Map<string, "mgmt" | "board">();

  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    const lineIps = line.match(IPV4_REGEX) || [];

    for (const ip of lineIps) {
      // Check if line contains management keywords
      if (MGMT_KEYWORDS.some((kw) => lowerLine.includes(kw.toLowerCase()))) {
        ipTypeMap.set(ip, "mgmt");
      }
      // Check if line contains board keywords
      else if (BOARD_KEYWORDS.some((kw) => lowerLine.includes(kw.toLowerCase()))) {
        ipTypeMap.set(ip, "board");
      }
    }
  }

  // Build IP list with types
  for (const ip of uniqueIps) {
    // Default: first IP is mgmt, rest are boards
    const type = ipTypeMap.get(ip) || (result.ips.length === 0 ? "mgmt" : "board");
    result.ips.push({ ip, type, selected: true });
  }

  // Extract username
  for (const pattern of USERNAME_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.username = match[1];
      break;
    }
  }

  // Extract password
  for (const pattern of PASSWORD_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      result.password = match[1];
      break;
    }
  }

  // Try to extract username/password from format: username/password or username password
  if (!result.username || !result.password) {
    // Match patterns like "root123/Root@123" or "root Root@123"
    const credMatch = text.match(/\b(\w+)\s*[\/\s]\s*(\S+)\s*$/m);
    if (credMatch) {
      const [, maybeUser, maybePass] = credMatch;
      // Avoid matching IP addresses
      if (!maybeUser.match(/^\d+\.\d+\.\d+\.\d+$/) && !maybePass.match(/^\d+\.\d+\.\d+\.\d+$/)) {
        if (!result.username) result.username = maybeUser;
        if (!result.password) result.password = maybePass;
      }
    }
  }

  // Detect protocol from text
  if (text.toLowerCase().includes("telnet")) {
    result.protocol = "telnet";
    result.port = 23;
  } else if (text.toLowerCase().includes("ssh")) {
    result.protocol = "ssh";
    result.port = 22;
  }

  return result;
}

/**
 * Parse a simple SSH connection string: [user@]host[:port]
 */
export function parseSSHString(input: string): {
  username: string;
  host: string;
  port: number;
  protocol: Protocol;
} | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let username = "";
  let host = "";
  let port = 22;

  // Extract username if present (before @)
  const atIndex = trimmed.indexOf("@");
  let hostPort: string;
  if (atIndex !== -1) {
    username = trimmed.slice(0, atIndex);
    hostPort = trimmed.slice(atIndex + 1);
  } else {
    hostPort = trimmed;
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

  // Validate host is an IP or hostname
  if (!host || host.length === 0) return null;

  // Auto-detect protocol based on port
  const protocol: Protocol = port === 23 ? "telnet" : "ssh";

  return { username, host, port, protocol };
}
