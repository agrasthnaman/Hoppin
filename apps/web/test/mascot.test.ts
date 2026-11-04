import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildHopMascot } from "../src/components/ui/hop-mascot";

const testDir = dirname(import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : import.meta.url);

describe("hop mascot", () => {
  it("is drawn in this repo and does not ship the third-party spider scan", () => {
    const src = readFileSync(join(testDir, "../src/components/ui/silk-spider-cursor.tsx"), "utf8");
    const mascot = readFileSync(join(testDir, "../src/components/ui/hop-mascot.ts"), "utf8");
    expect(src).toContain("buildHopMascot");
    expect(mascot).toContain("function buildHopMascot");
    expect(src + mascot).not.toMatch(/iRahul|sketchfab|gltf-binary|CC BY|silk-spider-assets/i);
    expect(existsSync(join(testDir, "../src/components/ui/silk-spider-assets.ts"))).toBe(false);
  });

  it("builds the eight-legged walker the silk rig expects", () => {
    const rig = buildHopMascot();
    expect(rig.legs).toHaveLength(8);
    expect(rig.lids).toHaveLength(2);
    expect(rig.palps).toHaveLength(2);
    expect(rig.spinneret.x).toBeLessThan(0);
    expect(rig.legs[3]?.l1).toBeGreaterThan(0);
    expect(rig.legs[7]?.l2).toBeGreaterThan(0);
  });
});
