import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = join(dirname(fileURLToPath(import.meta.url)), "../src");
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
  });

describe("main bundle stays small", () => {
  it("only the landing page and the lazy wrapper import the 3D mascot directly (it carries three.js)", () => {
    const direct = files(src).filter((f) => /from ["'][^"']*\/silk-spider-cursor["']/.test(readFileSync(f, "utf8")));
    expect(direct.map((f) => f.slice(src.length + 1)).sort()).toEqual(["routes/Landing.tsx"]);
  });

  it("only the map view loads maplibre, and only when a map is opened", () => {
    const hits = files(src).filter((file) => readFileSync(file, "utf8").includes("maplibre-gl"));
    expect(hits.map((file) => file.slice(src.length + 1)).sort()).toEqual(["components/map/MapView.tsx"]);
    const source = readFileSync(join(src, "components/map/MapView.tsx"), "utf8");
    expect(source).not.toMatch(/from ["']maplibre-gl["']/);
    expect(source).toMatch(/import\(["']maplibre-gl["']\)/);
  });
});
