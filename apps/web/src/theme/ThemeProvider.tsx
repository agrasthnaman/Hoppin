import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import data from "./palettes.json";

/** Light is our signature look and the default. The phone's own light or dark setting is deliberately not followed. */
export type Mode = "light" | "dark";
export type PaletteInfo = (typeof data.palettes)[number];

const KEY_PALETTE = "hoppin.palette";
const KEY_MODE = "hoppin.mode";
const MODES: Mode[] = ["light", "dark"];

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // private windows and blocked storage: carry on without remembering
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered, but the choice still applies for this visit */
  }
}

/** Puts the choice on <html> (the stylesheet does the rest) and colours the browser's address bar to match. */
function apply(palette: string, mode: Mode) {
  const root = document.documentElement;
  root.dataset.palette = palette;
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  const info = data.palettes.find((p) => p.id === palette);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", info ? info[mode].bg : "#ffffff");
}

export interface ThemeState {
  palette: string;
  mode: Mode;
  palettes: PaletteInfo[];
  setPalette: (id: string) => void;
  setMode: (mode: Mode) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [palette, setPaletteState] = useState(() => {
    const stored = read(KEY_PALETTE);
    return data.palettes.some((p) => p.id === stored) ? (stored as string) : data.defaultPalette;
  });
  const [mode, setModeState] = useState<Mode>(() => {
    const stored = read(KEY_MODE);
    return MODES.includes(stored as Mode) ? (stored as Mode) : "light"; // anything else, including an old "system" choice, becomes light
  });

  useEffect(() => {
    apply(palette, mode);
  }, [palette, mode]);

  const setPalette = useCallback((id: string) => {
    if (!data.palettes.some((p) => p.id === id)) return;
    setPaletteState(id);
    write(KEY_PALETTE, id);
  }, []);
  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    write(KEY_MODE, next);
  }, []);

  const value = useMemo(() => ({ palette, mode, palettes: data.palettes, setPalette, setMode }), [palette, mode, setPalette, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme must be used inside a ThemeProvider");
  return theme;
}
