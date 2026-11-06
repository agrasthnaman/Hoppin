import { contrast } from "./contrast";

/** Fallback pair (the default palette's blue and orange), used when the page has no theme colours to read. */
const FALLBACK: [string, string] = ["#0d22ee", "#ff6b4a"];

function rgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function toHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255] as const;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h * 60, s, l];
}

function fromHsl([h, s, l]: [number, number, number]): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** The same colour turned round the colour wheel. */
function rotate(hex: string, degrees: number): string {
  const [h, s, l] = toHsl(rgb(hex));
  return toHex(fromHsl([(h + degrees + 360) % 360, Math.max(s, 0.55), l]));
}

function darken(hex: string): string {
  const [r, g, b] = rgb(hex);
  return toHex([Math.round(r * 0.88), Math.round(g * 0.88), Math.round(b * 0.88)]);
}

/** Darken until white numerals on the colour clear WCAG AA (4.5:1). */
function readable(hex: string): string {
  let color = hex;
  for (let step = 0; step < 12 && contrast(color, "#ffffff") < 4.5; step += 1) color = darken(color);
  return color;
}

/**
 * Eight day colours built from a palette's two main colours and their turns round the wheel, so the map
 * wears the theme the person picked. Every colour keeps white numerals readable.
 */
export function colorsFrom(primary: string, pop: string): string[] {
  return [primary, pop, rotate(primary, 90), rotate(pop, 90), rotate(primary, 180), rotate(pop, 180), rotate(primary, -90), rotate(pop, -90)].map(readable);
}

export const DAY_COLORS = colorsFrom(...FALLBACK);
export const STAY_COLOR = readable("#5c564e");

function cssColor(name: string): string | null {
  try {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
  } catch {
    return null;
  }
}

let cached: { key: string; colors: string[] } | null = null;

/** The day colours for the theme on screen right now. */
export function themeDayColors(): string[] {
  const primary = cssColor("--hero") ?? FALLBACK[0];
  const pop = cssColor("--accent") ?? FALLBACK[1];
  const key = `${primary}|${pop}`;
  if (cached?.key !== key) cached = { key, colors: colorsFrom(primary, pop) };
  return cached.colors;
}

export function dayColor(index: number): string {
  const colors = themeDayColors();
  return colors[index % colors.length] ?? DAY_COLORS[0] ?? "#0d22ee";
}
