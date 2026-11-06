import data from "../theme/palettes.json";
import type { PosterPalette } from "./types";

/** A palette's light colours for posters. Unknown ids fall back to the default palette. */
export function posterPalette(id: string): PosterPalette {
  const info = data.palettes.find((p) => p.id === id) ?? data.palettes.find((p) => p.id === data.defaultPalette)!;
  const c = info.light;
  return {
    id: info.id,
    name: info.name,
    bg: c.bg,
    surface: c.surface,
    s2: c.surface2,
    ink: c.ink,
    muted: c.muted,
    line: c.line,
    accent: c.accent,
    accentFg: c.accentFg,
    asoft: c.accentSoft,
    hero: c.hero,
    heroFg: c.heroFg,
    heroMuted: c.heroMuted,
    hl: c.highlight,
  };
}

export const POSTER_PALETTES = data.palettes.map((p) => p.id);

/** A colour with an alpha, as 8-digit hex. */
export const withAlpha = (hex: string, a: number) => hex.slice(0, 7) + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, "0");
