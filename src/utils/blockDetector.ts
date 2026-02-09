import { BlockStatus } from "../types/session";

// Prompt patterns for detecting command completion
const PROMPT_PATTERNS = {
  // VRP User View: <Huawei> or <hostname>
  vrpUser: /<[^>]+>\s*$/,
  // VRP System View: [Huawei] or [hostname]
  vrpSystem: /\[[^\]]+\]\s*$/,
  // VRP Interface View: [Huawei-GigabitEthernet0/0/0]
  vrpInterface: /\[[^\]]+-.+\]\s*$/,
  // Linux prompts: $, #, or %
  linux: /[$#%]\s*$/,
  // Common shell prompt with username@host
  shell: /[a-zA-Z0-9_-]+@[a-zA-Z0-9_-]+[:#$%]\s*$/,
};

// Error patterns for detecting command failures
const ERROR_PATTERNS = [
  /^error:/im,
  /^failed:/im,
  /command not found/i,
  /permission denied/i,
  /no such file or directory/i,
  /operation not permitted/i,
  /syntax error/i,
  /invalid/i,
  /^Error:/m,
  /^\s*\^$/m, // VRP error indicator
  /% Unrecognized command/i,
  /% Incomplete command/i,
  /% Ambiguous command/i,
];

export interface BlockDetectorState {
  isCapturing: boolean;
  currentMarkerId: string | null;
  currentCommand: string;
  buffer: string;
  lastOutputTime: number;
  startLine: number;
  currentLine: number;
}

// New callback interface - emits line numbers instead of storing output
export interface BlockDetectorCallbacks {
  onBlockStart: (command: string, startLine: number) => string; // Returns marker ID
  onBlockComplete: (markerId: string, endLine: number, status: BlockStatus) => void;
  // Get current line from terminal
  getCurrentLine: () => number;
}

export class BlockDetector {
  private state: BlockDetectorState;
  private callbacks: BlockDetectorCallbacks;
  private completionTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly COMPLETION_DELAY = 500; // ms

  constructor(callbacks: BlockDetectorCallbacks) {
    this.callbacks = callbacks;
    this.state = {
      isCapturing: false,
      currentMarkerId: null,
      currentCommand: "",
      buffer: "",
      lastOutputTime: 0,
      startLine: 0,
      currentLine: 0,
    };
  }

  /**
   * Process user input to detect command starts
   */
  processInput(data: string): void {
    // Check for Enter key (command submission)
    if (data.includes("\r") || data.includes("\n")) {
      const command = this.state.currentCommand.trim();
      if (command.length > 0 && !this.state.isCapturing) {
        this.startBlock(command);
      }
      this.state.currentCommand = "";
    } else if (data === "\x7f" || data === "\b") {
      // Backspace
      this.state.currentCommand = this.state.currentCommand.slice(0, -1);
    } else if (data === "\x03") {
      // Ctrl+C - cancel current block
      if (this.state.isCapturing && this.state.currentMarkerId) {
        this.completeBlock("error");
      }
      this.state.currentCommand = "";
    } else if (data === "\x15") {
      // Ctrl+U - clear line
      this.state.currentCommand = "";
    } else if (!data.startsWith("\x1b")) {
      // Regular character (not escape sequence)
      this.state.currentCommand += data;
    }
  }

  /**
   * Process terminal output to detect command completion
   */
  processOutput(data: string): void {
    if (!this.state.isCapturing || !this.state.currentMarkerId) {
      return;
    }

    this.state.buffer += data;
    this.state.lastOutputTime = Date.now();

    // Update current line position
    this.state.currentLine = this.callbacks.getCurrentLine();

    // Reset completion timeout
    this.resetCompletionTimeout();

    // Check for prompt (command completion)
    if (this.detectPrompt(this.state.buffer)) {
      this.completeBlock(this.detectError(this.state.buffer) ? "error" : "success");
    }
  }

  /**
   * Start capturing a new command block
   */
  private startBlock(command: string): void {
    // Complete any existing block first
    if (this.state.isCapturing && this.state.currentMarkerId) {
      this.completeBlock("success");
    }

    const startLine = this.callbacks.getCurrentLine();
    const markerId = this.callbacks.onBlockStart(command, startLine);

    this.state = {
      isCapturing: true,
      currentMarkerId: markerId,
      currentCommand: "",
      buffer: "",
      lastOutputTime: Date.now(),
      startLine,
      currentLine: startLine,
    };

    this.resetCompletionTimeout();
  }

  /**
   * Complete the current block
   */
  private completeBlock(status: BlockStatus): void {
    if (this.completionTimeout) {
      clearTimeout(this.completionTimeout);
      this.completionTimeout = null;
    }

    if (this.state.currentMarkerId) {
      const endLine = this.callbacks.getCurrentLine();
      this.callbacks.onBlockComplete(this.state.currentMarkerId, endLine, status);
    }

    this.state = {
      isCapturing: false,
      currentMarkerId: null,
      currentCommand: "",
      buffer: "",
      lastOutputTime: 0,
      startLine: 0,
      currentLine: 0,
    };
  }

  /**
   * Set timeout for block completion fallback
   */
  private resetCompletionTimeout(): void {
    if (this.completionTimeout) {
      clearTimeout(this.completionTimeout);
    }

    this.completionTimeout = setTimeout(() => {
      if (this.state.isCapturing && this.state.currentMarkerId) {
        // Use timeout-based completion
        const status = this.detectError(this.state.buffer) ? "error" : "success";
        this.completeBlock(status);
      }
    }, this.COMPLETION_DELAY);
  }

  /**
   * Detect if output ends with a prompt
   */
  private detectPrompt(output: string): boolean {
    // Get last few lines for prompt detection
    const lines = output.split("\n");
    const lastLines = lines.slice(-3).join("\n");

    return Object.values(PROMPT_PATTERNS).some((pattern) =>
      pattern.test(lastLines)
    );
  }

  /**
   * Detect if output contains error patterns
   */
  private detectError(output: string): boolean {
    return ERROR_PATTERNS.some((pattern) => pattern.test(output));
  }

  /**
   * Get current command being typed
   */
  getCurrentCommand(): string {
    return this.state.currentCommand;
  }

  /**
   * Check if currently capturing a block
   */
  isCapturing(): boolean {
    return this.state.isCapturing;
  }

  /**
   * Get current marker ID if capturing
   */
  getCurrentMarkerId(): string | null {
    return this.state.currentMarkerId;
  }

  /**
   * Force complete current block
   */
  forceComplete(status: BlockStatus = "success"): void {
    if (this.state.isCapturing) {
      this.completeBlock(status);
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.completionTimeout) {
      clearTimeout(this.completionTimeout);
      this.completionTimeout = null;
    }
  }
}

/**
 * Strip ANSI escape sequences from output for display
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Format timestamp for display
 */
export function formatBlockTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
