import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface QuickCommand {
  id: string;
  label: string;
  command: string;
}

export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: Date;
}

interface CommandBarState {
  quickCommands: QuickCommand[];
  clipboardHistory: ClipboardEntry[];
  maxClipboardEntries: number;

  // Actions
  addQuickCommand: (label: string, command: string) => string;
  removeQuickCommand: (id: string) => void;
  updateQuickCommand: (id: string, label: string, command: string) => void;
  reorderQuickCommands: (dragId: string, dropId: string) => void;
  addClipboardEntry: (text: string) => void;
  removeClipboardEntry: (id: string) => void;
  clearClipboardHistory: () => void;
  setMaxClipboardEntries: (max: number) => void;
}

// Default quick commands for VRP routers
const DEFAULT_QUICK_COMMANDS: QuickCommand[] = [
  { id: "default-1", label: "dis cur", command: "display current-configuration" },
  { id: "default-2", label: "undo t m", command: "undo terminal monitor" },
  { id: "default-3", label: "save", command: "save" },
  { id: "default-4", label: "dis int", command: "display interface brief" },
  { id: "default-5", label: "dis ver", command: "display version" },
];

export const useCommandBarStore = create<CommandBarState>()(
  persist(
    (set) => ({
      quickCommands: DEFAULT_QUICK_COMMANDS,
      clipboardHistory: [],
      maxClipboardEntries: 20,

      addQuickCommand: (label: string, command: string) => {
        const id = uuidv4();
        set((state) => ({
          quickCommands: [...state.quickCommands, { id, label, command }],
        }));
        return id;
      },

      removeQuickCommand: (id: string) => {
        set((state) => ({
          quickCommands: state.quickCommands.filter((cmd) => cmd.id !== id),
        }));
      },

      updateQuickCommand: (id: string, label: string, command: string) => {
        set((state) => ({
          quickCommands: state.quickCommands.map((cmd) =>
            cmd.id === id ? { ...cmd, label, command } : cmd
          ),
        }));
      },

      reorderQuickCommands: (dragId: string, dropId: string) => {
        set((state) => {
          const dragIndex = state.quickCommands.findIndex((cmd) => cmd.id === dragId);
          const dropIndex = state.quickCommands.findIndex((cmd) => cmd.id === dropId);
          if (dragIndex === -1 || dropIndex === -1) return state;

          const newCommands = [...state.quickCommands];
          const [dragCmd] = newCommands.splice(dragIndex, 1);
          newCommands.splice(dropIndex, 0, dragCmd);

          return { quickCommands: newCommands };
        });
      },

      addClipboardEntry: (text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;

        set((state) => {
          // Remove duplicate if exists
          const filtered = state.clipboardHistory.filter((e) => e.text !== trimmed);
          const newEntry: ClipboardEntry = {
            id: uuidv4(),
            text: trimmed,
            timestamp: new Date(),
          };

          // Add to front and enforce max limit
          const newHistory = [newEntry, ...filtered].slice(0, state.maxClipboardEntries);
          return { clipboardHistory: newHistory };
        });
      },

      removeClipboardEntry: (id: string) => {
        set((state) => ({
          clipboardHistory: state.clipboardHistory.filter((e) => e.id !== id),
        }));
      },

      clearClipboardHistory: () => {
        set({ clipboardHistory: [] });
      },

      setMaxClipboardEntries: (max: number) => {
        set((state) => ({
          maxClipboardEntries: Math.max(1, max),
          clipboardHistory: state.clipboardHistory.slice(0, max),
        }));
      },
    }),
    {
      name: "bspt-commandbar",
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Convert timestamp strings back to Date objects
          if (parsed.state?.clipboardHistory) {
            parsed.state.clipboardHistory = parsed.state.clipboardHistory.map(
              (entry: ClipboardEntry & { timestamp: string }) => ({
                ...entry,
                timestamp: new Date(entry.timestamp),
              })
            );
          }
          return parsed;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
