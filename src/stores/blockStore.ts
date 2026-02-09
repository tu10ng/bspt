import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Block, BlockStatus } from "../types/session";
import { v4 as uuidv4 } from "uuid";

interface BlockState {
  // Blocks per session
  blocks: Record<string, Block[]>;
  // Maximum blocks to keep per session
  maxBlocksPerSession: number;

  // Actions
  createBlock: (sessionId: string, command: string) => string;
  appendOutput: (blockId: string, output: string) => void;
  completeBlock: (blockId: string, status: BlockStatus) => void;
  toggleCollapse: (blockId: string) => void;
  collapseAll: (sessionId: string) => void;
  expandAll: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
  getBlock: (blockId: string) => Block | undefined;
  getSessionBlocks: (sessionId: string) => Block[];
  getCommandHistory: (sessionId: string) => string[];
}

export const useBlockStore = create<BlockState>()(
  persist(
    (set, get) => ({
      blocks: {},
      maxBlocksPerSession: 500,

      createBlock: (sessionId: string, command: string) => {
        const blockId = uuidv4();
        const block: Block = {
          id: blockId,
          sessionId,
          command,
          timestamp: new Date(),
          status: "running",
          output: "",
          collapsed: false,
          lineCount: 0,
        };

        set((state) => {
          const sessionBlocks = state.blocks[sessionId] || [];
          let newBlocks = [...sessionBlocks, block];

          // Enforce max blocks limit
          if (newBlocks.length > state.maxBlocksPerSession) {
            newBlocks = newBlocks.slice(-state.maxBlocksPerSession);
          }

          return {
            blocks: {
              ...state.blocks,
              [sessionId]: newBlocks,
            },
          };
        });

        return blockId;
      },

      appendOutput: (blockId: string, output: string) => {
        set((state) => {
          const newBlocks = { ...state.blocks };

          for (const sessionId of Object.keys(newBlocks)) {
            const blocks = newBlocks[sessionId];
            const blockIndex = blocks.findIndex((b) => b.id === blockId);

            if (blockIndex !== -1) {
              const block = blocks[blockIndex];
              const newOutput = block.output + output;
              const lineCount = (newOutput.match(/\n/g) || []).length + 1;

              newBlocks[sessionId] = [
                ...blocks.slice(0, blockIndex),
                { ...block, output: newOutput, lineCount },
                ...blocks.slice(blockIndex + 1),
              ];
              break;
            }
          }

          return { blocks: newBlocks };
        });
      },

      completeBlock: (blockId: string, status: BlockStatus) => {
        set((state) => {
          const newBlocks = { ...state.blocks };

          for (const sessionId of Object.keys(newBlocks)) {
            const blocks = newBlocks[sessionId];
            const blockIndex = blocks.findIndex((b) => b.id === blockId);

            if (blockIndex !== -1) {
              newBlocks[sessionId] = [
                ...blocks.slice(0, blockIndex),
                { ...blocks[blockIndex], status },
                ...blocks.slice(blockIndex + 1),
              ];
              break;
            }
          }

          return { blocks: newBlocks };
        });
      },

      toggleCollapse: (blockId: string) => {
        set((state) => {
          const newBlocks = { ...state.blocks };

          for (const sessionId of Object.keys(newBlocks)) {
            const blocks = newBlocks[sessionId];
            const blockIndex = blocks.findIndex((b) => b.id === blockId);

            if (blockIndex !== -1) {
              const block = blocks[blockIndex];
              newBlocks[sessionId] = [
                ...blocks.slice(0, blockIndex),
                { ...block, collapsed: !block.collapsed },
                ...blocks.slice(blockIndex + 1),
              ];
              break;
            }
          }

          return { blocks: newBlocks };
        });
      },

      collapseAll: (sessionId: string) => {
        set((state) => {
          const blocks = state.blocks[sessionId];
          if (!blocks) return state;

          return {
            blocks: {
              ...state.blocks,
              [sessionId]: blocks.map((b) => ({ ...b, collapsed: true })),
            },
          };
        });
      },

      expandAll: (sessionId: string) => {
        set((state) => {
          const blocks = state.blocks[sessionId];
          if (!blocks) return state;

          return {
            blocks: {
              ...state.blocks,
              [sessionId]: blocks.map((b) => ({ ...b, collapsed: false })),
            },
          };
        });
      },

      clearSession: (sessionId: string) => {
        set((state) => {
          const newBlocks = { ...state.blocks };
          delete newBlocks[sessionId];
          return { blocks: newBlocks };
        });
      },

      getBlock: (blockId: string) => {
        const state = get();
        for (const sessionId of Object.keys(state.blocks)) {
          const block = state.blocks[sessionId].find((b) => b.id === blockId);
          if (block) return block;
        }
        return undefined;
      },

      getSessionBlocks: (sessionId: string) => {
        return get().blocks[sessionId] || [];
      },

      getCommandHistory: (sessionId: string) => {
        const blocks = get().blocks[sessionId] || [];
        return blocks
          .map((b) => b.command)
          .filter((cmd) => cmd.trim().length > 0);
      },
    }),
    {
      name: "bspt-blocks",
      // Custom serialization for Date objects
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;
          const parsed = JSON.parse(str);
          // Convert timestamp strings back to Date objects
          if (parsed.state?.blocks) {
            for (const sessionId of Object.keys(parsed.state.blocks)) {
              parsed.state.blocks[sessionId] = parsed.state.blocks[sessionId].map(
                (block: Block & { timestamp: string }) => ({
                  ...block,
                  timestamp: new Date(block.timestamp),
                })
              );
            }
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
