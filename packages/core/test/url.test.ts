import { describe, expect, it } from "vitest";
import { safeWebUrl } from "../src/url";

describe("safeWebUrl", () => {
  it("keeps web addresses as typed (trimmed)", () => {
    expect(safeWebUrl("https://maps.google.com/?q=Goa")).toBe("https://maps.google.com/?q=Goa");
    expect(safeWebUrl("  http://example.com/a  ")).toBe("http://example.com/a");
  });
  it("refuses anything that could run code or leave the web", () => {
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>1</script>", "vbscript:x", "file:///etc/passwd", "ftp://x.example", "//evil.example", "mailto:a@b.c", "blob:https://x/1"]) {
      expect(safeWebUrl(bad), bad).toBeNull();
    }
  });
  it("refuses empty, missing, malformed and oversized values", () => {
    expect(safeWebUrl(null)).toBeNull();
    expect(safeWebUrl(undefined)).toBeNull();
    expect(safeWebUrl("   ")).toBeNull();
    expect(safeWebUrl("not a url")).toBeNull();
    expect(safeWebUrl(`https://x.example/${"a".repeat(2000)}`)).toBeNull();
  });
});
