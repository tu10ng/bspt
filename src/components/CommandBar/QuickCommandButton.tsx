import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { QuickCommand } from "../../stores/commandBarStore";

interface QuickCommandButtonProps {
  command: QuickCommand;
  sessionId: string | null;
  disabled?: boolean;
}

export function QuickCommandButton({
  command,
  sessionId,
  disabled = false,
}: QuickCommandButtonProps) {
  const handleClick = useCallback(async () => {
    if (!sessionId) return;

    try {
      const encoder = new TextEncoder();
      const bytes = Array.from(encoder.encode(command.command + "\r"));
      await invoke("send_input", { sessionId, data: bytes });
    } catch (error) {
      console.error("Failed to send quick command:", error);
    }
  }, [sessionId, command.command]);

  return (
    <button
      className="quick-command-btn"
      onClick={handleClick}
      disabled={disabled || !sessionId}
      title={command.command}
    >
      {command.label}
    </button>
  );
}

export default QuickCommandButton;
