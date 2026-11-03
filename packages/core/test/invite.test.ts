import { describe, expect, it } from "vitest";
import { inviteUrl, parseInviteToken } from "../src/invite";

const TOKEN = "a1".repeat(32);

describe("inviteUrl", () => {
  it("builds the join link and ignores a trailing slash on the origin", () => {
    expect(inviteUrl("https://hoppin.app", TOKEN)).toBe(`https://hoppin.app/join/${TOKEN}`);
    expect(inviteUrl("https://hoppin.app/", TOKEN)).toBe(`https://hoppin.app/join/${TOKEN}`);
  });
});

describe("parseInviteToken", () => {
  it("finds the token in a full link, a path, or when pasted bare", () => {
    expect(parseInviteToken(`https://hoppin.app/join/${TOKEN}`)).toBe(TOKEN);
    expect(parseInviteToken(`/join/${TOKEN}?utm=x#top`)).toBe(TOKEN);
    expect(parseInviteToken(`  ${TOKEN}\n`)).toBe(TOKEN);
  });

  it("lower-cases the token", () => {
    expect(parseInviteToken(TOKEN.toUpperCase())).toBe(TOKEN);
  });

  it("rejects anything that is not a 64-character hex token", () => {
    for (const bad of ["", "join", "a1".repeat(10), "zz".repeat(32), `${TOKEN}00`, "https://hoppin.app/join/"]) {
      expect(parseInviteToken(bad), bad).toBeNull();
    }
  });
});
