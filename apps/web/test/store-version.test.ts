import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function appVersion(): string {
  const parsed: unknown = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || typeof parsed.version !== "string") {
    throw new Error("apps/web/package.json has no version");
  }
  return parsed.version;
}

describe("store version", () => {
  it("matches the web package version on iOS and Android, and the first build is iPhone only", () => {
    const version = appVersion();
    const pbx = readFileSync(join(root, "ios/App/App.xcodeproj/project.pbxproj"), "utf8");
    const gradle = readFileSync(join(root, "android/app/build.gradle"), "utf8");
    const marketing = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((match) => match[1]?.trim());
    expect(marketing).toEqual([version, version]);
    expect(gradle).toContain(`versionName "${version}"`);
    expect(pbx).not.toContain('TARGETED_DEVICE_FAMILY = "1,2"');
    expect(pbx).toContain("TARGETED_DEVICE_FAMILY = 1;");
  });
});
