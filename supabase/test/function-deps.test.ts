import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("../../", import.meta.url);
const lockfile = JSON.parse(readFileSync(new URL("package-lock.json", root), "utf8")) as { packages: Record<string, { version: string }> };
const functionsDir = new URL("supabase/functions/", root);

describe("Edge Function dependencies", () => {
  it("use exactly the supabase-js version the app and the tests are locked to", () => {
    const locked = lockfile.packages["node_modules/@supabase/supabase-js"]!.version;
    const imports = readdirSync(functionsDir).flatMap((fn) =>
      [...readFileSync(new URL(`${fn}/index.ts`, functionsDir), "utf8").matchAll(/npm:@supabase\/supabase-js@([^"']+)/g)].map((m) => `${fn}: ${m[1]}`),
    );
    expect(imports.length).toBeGreaterThan(0);
    expect(imports).toEqual(imports.map((line) => line.replace(/: .*/, `: ${locked}`)));
  });
});
