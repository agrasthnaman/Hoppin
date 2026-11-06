import { afterEach, describe, expect, it } from "vitest";
import { contrast } from "../src/lib/contrast";
import { colorsFrom, DAY_COLORS, dayColor, STAY_COLOR, themeDayColors } from "../src/lib/map-colors";
import data from "../src/theme/palettes.json";

describe("map colours", () => {
  it("keeps white numerals readable on every day colour and the stay pin", () => {
    expect(DAY_COLORS).toHaveLength(8);
    for (const color of [...DAY_COLORS, STAY_COLOR]) expect(contrast(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("day colours follow the theme", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty("--hero");
    document.documentElement.style.removeProperty("--accent");
  });

  it.each(data.palettes.flatMap((p) => (["light", "dark"] as const).map((mode) => [p.name, mode, p[mode].hero, p[mode].accent] as const)))(
    "%s (%s): eight different colours, all readable under white numerals",
    (_name, _mode, hero, accent) => {
      const colors = colorsFrom(hero, accent);
      expect(colors).toHaveLength(8);
      expect(new Set(colors).size).toBe(8);
      for (const color of colors) expect(contrast(color, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("starts from the palette's own main colour and its pop colour", () => {
    const colors = colorsFrom("#0d22ee", "#e11d74");
    expect(colors[0]).toBe("#0d22ee");
    expect(colors[1]).not.toBe(colors[0]);
  });

  it("reads the colours of the theme on screen, and falls back to the default palette without one", () => {
    expect(themeDayColors()).toEqual(DAY_COLORS);
    document.documentElement.style.setProperty("--hero", "#7c1d9c");
    document.documentElement.style.setProperty("--accent", "#16a34a");
    expect(dayColor(0)).not.toBe(DAY_COLORS[0]);
    expect(themeDayColors()).toEqual(colorsFrom("#7c1d9c", "#16a34a"));
  });
});
