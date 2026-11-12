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

describe("production builds", () => {
  it("leave out the design-system preview, which runs on stand-in services", () => {
    expect(readFileSync(join(src, "app/routes.tsx"), "utf8")).toMatch(/import\.meta\.env\.DEV \? \[\{ path: "\/gallery"/);
  });
});

describe("main bundle stays small", () => {
  it("only the landing page and the lazy wrapper import the 3D mascot directly (it carries three.js)", () => {
    const direct = files(src).filter((f) => /from ["'][^"']*\/silk-spider-cursor["']/.test(readFileSync(f, "utf8")));
    expect(direct.map((f) => f.slice(src.length + 1)).sort()).toEqual(["routes/Landing.tsx"]);
  });

  it("poster code loads only with the studio, and never pulls in the 3D mascot", () => {
    const posterFiles = files(join(src, "poster"));
    for (const file of posterFiles) expect(readFileSync(file, "utf8")).not.toMatch(/from ["'](three|[^"']*hop-mascot|[^"']*silk-spider)/);
    const importers = files(src).filter((file) => !file.includes(`${join(src, "poster")}`) && !file.includes(join(src, "components/poster")) && /from ["'][^"']*\/poster\//.test(readFileSync(file, "utf8")));
    expect(importers.map((file) => file.slice(src.length + 1))).toEqual(["routes/Posters.tsx"]);
    expect(readFileSync(join(src, "app/routes.tsx"), "utf8")).toMatch(/import\(["']\.\.\/routes\/Posters["']\)/);
  });

  it("only the map view loads maplibre, and only when a map is opened", () => {
    const hits = files(src).filter((file) => readFileSync(file, "utf8").includes("maplibre-gl"));
    expect(hits.map((file) => file.slice(src.length + 1)).sort()).toEqual(["components/map/MapView.tsx"]);
    const source = readFileSync(join(src, "components/map/MapView.tsx"), "utf8");
    expect(source).not.toMatch(/from ["']maplibre-gl["']/);
    expect(source).toMatch(/import\(["']maplibre-gl["']\)/);
  });
});
