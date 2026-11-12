import { describe, expect, it, vi } from "vitest";
import { isShortMapLink, resolveShortMapLink } from "../src/lib/expand-map-link";

function redirect(status: number, location?: string) {
  return { status, headers: { get: (name: string) => (name === "location" ? (location ?? null) : null) } };
}

describe("short map links", () => {
  it("recognises Google's short links and nothing else", () => {
    expect(isShortMapLink("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8")).toBe(true);
    expect(isShortMapLink("https://goo.gl/maps/abcd")).toBe(true);
    expect(isShortMapLink("https://www.google.com/maps/place/X/@1,2,17z")).toBe(false);
    expect(isShortMapLink("https://evil.example/maps.app.goo.gl/abc")).toBe(false);
  });

  it("follows the redirect to the full map address", async () => {
    const full = "https://www.google.com/maps/place/Calangute+Beach/@15.5439,73.7553,17z";
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(redirect(302, full))
      .mockResolvedValueOnce(redirect(200));
    expect(await resolveShortMapLink("https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8", fetchImpl)).toBe(full);
  });

  it("refuses a redirect that leaves Google", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirect(302, "https://evil.example/phish"));
    expect(await resolveShortMapLink("https://maps.app.goo.gl/abc", fetchImpl)).toBeNull();
  });

  it("refuses Google's block page instead of saving it as the place", async () => {
    const sorry = "https://www.google.com/sorry/index?continue=https://www.google.com/maps/place/PinkCoco";
    const fetchImpl = vi.fn().mockResolvedValueOnce(redirect(302, sorry));
    expect(await resolveShortMapLink("https://maps.app.goo.gl/abcdefgh", fetchImpl)).toBeNull();
  });
});
