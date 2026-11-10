import { describe, expect, it } from "vitest";
import { pathFromPush } from "../src/lib/push-open";

describe("pathFromPush", () => {
  it("opens a trip link carried on the notification", () => {
    expect(pathFromPush({ url: "https://hoppinclub.com/trips/demo-goa/days" })).toBe("/trips/demo-goa/days");
  });

  it("accepts a path on our site", () => {
    expect(pathFromPush({ url: "/trips/demo-goa/days?day=1" })).toBe("/trips/demo-goa/days?day=1");
  });

  it("ignores a notification with no link", () => {
    expect(pathFromPush({})).toBeNull();
    expect(pathFromPush(null)).toBeNull();
    expect(pathFromPush({ url: 4 })).toBeNull();
  });

  it("ignores a link to some other site", () => {
    expect(pathFromPush({ url: "https://evil.example/trips/demo-goa/days" })).toBeNull();
  });
});
