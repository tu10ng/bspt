/**
 * Open a file in VS Code at a specific line
 *
 * Uses the VS Code URI handler: vscode://file/{path}:{line}
 */
export function openInVSCode(file: string, line: number, column?: number): void {
  // Build the VS Code URI
  let url = `vscode://file/${encodeURIComponent(file)}:${line}`;
  if (column !== undefined) {
    url += `:${column}`;
  }

  // Open using window.open (works in Tauri webview)
  window.open(url, "_blank");
}

/**
 * Open a file in VS Code via SSH Remote extension
 *
 * Uses the VS Code Remote URI handler:
 * vscode://vscode-remote/ssh-remote+{remote}{path}:{line}
 *
 * @param file - The absolute file path on the remote system
 * @param line - The line number to navigate to
 * @param remote - The SSH remote name (as configured in VS Code SSH config)
 * @param column - Optional column number
 */
export function openInVSCodeRemote(
  file: string,
  line: number,
  remote: string,
  column?: number
): void {
  // Build the VS Code Remote URI
  // Format: vscode://vscode-remote/ssh-remote+hostname/path/to/file:line:column
  let url = `vscode://vscode-remote/ssh-remote+${remote}${file}:${line}`;
  if (column !== undefined) {
    url += `:${column}`;
  }

  window.open(url, "_blank");
}

/**
 * Open a file in the default system editor via Tauri opener plugin
 *
 * Fallback when VS Code is not available or preferred
 */
export async function openInSystemEditor(file: string): Promise<void> {
  try {
    const { openPath } = await import("@tauri-apps/plugin-opener");
    await openPath(file);
  } catch (e) {
    console.error("Failed to open file in system editor:", e);
    // Fallback to VS Code
    openInVSCode(file, 1);
  }
}
