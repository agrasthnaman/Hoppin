import { describe, expect, it } from "vitest";
import { contrast } from "../src/lib/contrast";
import data from "../src/theme/palettes.json";

type Colors = Record<string, string>;
const modes = ["light", "dark"] as const;

// [foreground, background, minimum contrast, why]
const PAIRS: [string, string, number, string][] = [
  ["ink", "bg", 7, "body text on the page"],
  ["ink", "surface", 7, "body text on cards"],
  ["ink", "surface2", 7, "body text on tinted areas"],
  ["muted", "bg", 4.5, "secondary text on the page"],
  ["muted", "surface", 4.5, "secondary text on cards"],
  ["muted", "surface2", 4.5, "secondary text on tinted areas"],
  ["accentFg", "accent", 4.5, "text on the pop colour (buttons, selected day)"],
  ["accentSoftFg", "accentSoft", 4.5, "text on the soft pop tint"],
  ["link", "bg", 4.5, "links on the page"],
  ["link", "surface", 4.5, "links on cards"],
  ["heroFg", "hero", 4.5, "text on the big colour block"],
  ["heroMuted", "hero", 4.5, "secondary text on the big colour block"],
  ["highlightFg", "highlight", 4.5, "text on the highlight colour (badges)"],
  ["navFg", "nav", 4.5, "inactive navigation labels"],
  ["navActive", "nav", 4.5, "active navigation label"],
];

describe.each(data.palettes)("palette $name", (palette) => {
  describe.each(modes)("%s mode", (mode) => {
    const c = palette[mode] as Colors;
    it.each(PAIRS)("%s on %s is at least %s:1 (%s)", (fg, bg, min) => {
      expect(contrast(c[fg]!, c[bg]!), `${c[fg]} on ${c[bg]}`).toBeGreaterThanOrEqual(min);
    });

    it("has every colour the stylesheet needs, as #rrggbb", () => {
      for (const key of Object.keys(data.palettes[0]!.light)) expect(c[key], key).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  it("looks different from the other palettes (the pop colour is its own)", () => {
    const others = data.palettes.filter((p) => p.id !== palette.id).map((p) => p.light.accent);
    expect(others).not.toContain(palette.light.accent);
  });
});

describe("status colours", () => {
  it.each(modes)("are readable in %s mode", (mode) => {
    const s = data.status[mode] as Colors;
    for (const kind of ["info", "warn", "danger"]) expect(contrast(s[`${kind}Fg`]!, s[`${kind}Bg`]!), kind).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the set of palettes", () => {
  it("offers the three chosen palettes, with a valid default", () => {
    expect(data.palettes.map((p) => p.id)).toEqual(["rose", "lilac", "tangerine"]);
    expect(data.palettes.map((p) => p.id)).toContain(data.defaultPalette);
  });

  it("every palette defines the same colours in light and dark", () => {
    for (const p of data.palettes) expect(Object.keys(p.dark).sort()).toEqual(Object.keys(p.light).sort());
  });
});

describe("generated stylesheet", () => {
  it("is up to date with palettes.json (run `npm run gen:theme -w apps/web` after editing the palettes)", async () => {
    const { readFileSync } = await import("node:fs");
    const { themeCss } = await import("../src/theme/theme-css.mjs");
    const { join } = await import("node:path");
    const committed = readFileSync(join(process.cwd(), "src/styles/theme.generated.css"), "utf8");
    expect(committed).toBe(themeCss(data));
  });

  it("defines each palette for light, explicit dark, and system dark, and makes the default palette the fallback", async () => {
    const { themeCss } = await import("../src/theme/theme-css.mjs");
    const css = themeCss(data);
    for (const p of data.palettes) {
      expect(css).toContain(`[data-palette="${p.id}"] {`);
      expect(css).toContain(`[data-palette="${p.id}"][data-theme="dark"] {`);
      expect(css).toContain(`:root[data-palette="${p.id}"]:not([data-theme])`);
    }
    expect(css).toContain(":root:not([data-palette]),\n[data-palette=\"rose\"] {");
    expect(css).toContain("prefers-color-scheme: dark");
  });
});
