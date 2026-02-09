import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "glass" | "image" | "solid";

export interface ThemeState {
  mode: ThemeMode;
  opacity: number;
  blur: number;
  fontFamily: string;
  backgroundImage: string | null;
  blockMode: boolean;

  // Actions
  setMode: (mode: ThemeMode) => void;
  setOpacity: (opacity: number) => void;
  setBlur: (blur: number) => void;
  setFontFamily: (fontFamily: string) => void;
  setBackgroundImage: (url: string | null) => void;
  setBlockMode: (enabled: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "glass",
      opacity: 0.8,
      blur: 12,
      fontFamily: "JetBrains Mono, Consolas, monospace",
      backgroundImage: null,
      blockMode: true,

      setMode: (mode) => set({ mode }),
      setOpacity: (opacity) => set({ opacity: Math.max(0, Math.min(1, opacity)) }),
      setBlur: (blur) => set({ blur: Math.max(0, Math.min(50, blur)) }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setBackgroundImage: (backgroundImage) => set({ backgroundImage }),
      setBlockMode: (blockMode) => set({ blockMode }),
    }),
    {
      name: "bspt-theme",
    }
  )
);
