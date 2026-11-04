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
});
