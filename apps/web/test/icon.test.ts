import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : import.meta.url);
const read = (name: string) => readFileSync(join(testDir, "../public", name), "utf8");

describe("app icon", () => {
  it("uses the landing blue, cream, and orange", () => {
    for (const name of ["icon.svg", "icon-maskable.svg"]) {
      const svg = read(name);
      expect(svg).toContain("#0d22ee");
      expect(svg).toContain("#f6f3ec");
      expect(svg).toContain("#ff6b4a");
      expect(svg).not.toContain("#0f766e");
    }
  });
});
