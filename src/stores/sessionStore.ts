import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

export type Protocol = "ssh" | "telnet";

export type SessionState =
  | "connecting"
  | "connected"
  | "authenticating"
  | "ready"
  | "disconnected"
  | "error";

export interface SessionConfig {
  host: string;
  port: number;
  protocol: Protocol;
  username: string;
  password: string;
  cols: number;
  rows: number;
}

export interface Session {
  id: string;
  config: SessionConfig;
  state: SessionState;
  name: string;
}

interface SessionStore {
  sessions: Map<string, Session>;
  activeSessionId: string | null;

  // Actions
  createSession: (config: SessionConfig, name?: string) => Promise<string>;
  disconnectSession: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string | null) => void;
  updateSessionState: (sessionId: string, state: SessionState) => void;
  removeSession: (sessionId: string) => void;
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: new Map(),
  activeSessionId: null,

  createSession: async (config: SessionConfig, name?: string) => {
    const sessionId = await invoke<string>("create_session", { config });

    const session: Session = {
      id: sessionId,
      config,
      state: "connecting",
      name: name || `${config.host}:${config.port}`,
    };

    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.set(sessionId, session);
      return {
        sessions,
        activeSessionId: sessionId,
      };
    });

    return sessionId;
  },

  disconnectSession: async (sessionId: string) => {
    await invoke("disconnect_session", { sessionId });
    get().removeSession(sessionId);
  },

  setActiveSession: (sessionId: string | null) => {
    set({ activeSessionId: sessionId });
  },

  updateSessionState: (sessionId: string, state: SessionState) => {
    set((store) => {
      const sessions = new Map(store.sessions);
      const session = sessions.get(sessionId);
      if (session) {
        sessions.set(sessionId, { ...session, state });
      }
      return { sessions };
    });
  },

  removeSession: (sessionId: string) => {
    set((state) => {
      const sessions = new Map(state.sessions);
      sessions.delete(sessionId);
      return {
        sessions,
        activeSessionId:
          state.activeSessionId === sessionId ? null : state.activeSessionId,
      };
    });
  },
}));
