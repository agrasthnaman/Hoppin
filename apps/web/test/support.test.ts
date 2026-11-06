import { describe, expect, it } from "vitest";
import { SUPPORT_EMAIL, supportMailto } from "../src/lib/support";

describe("support link", () => {
  it("opens an email to the support address with a subject and a note to fill in", () => {
    const href = supportMailto();
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("subject")).toBe("Help with Hoppin");
    expect(params.get("body")).toContain("Tell us what happened");
  });

  it("adds the trip's name when there is one, and nothing else about the person", () => {
    const href = supportMailto({ trip: "Bali Bros & friends", subject: "Question" });
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect(params.get("subject")).toBe("Question");
    expect(params.get("body")).toContain("Trip: Bali Bros & friends");
    expect(params.get("body")).not.toMatch(/@|password|token/i);
  });
});
