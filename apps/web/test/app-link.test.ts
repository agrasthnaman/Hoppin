import { describe, expect, it } from "vitest";
import { toAppPath } from "../src/lib/app-link";

describe("toAppPath", () => {
  it("keeps an invite, a confirm link and a password reset, including the token", () => {
    expect(toAppPath("https://hoppinclub.com/join/abc")).toBe("/join/abc");
    expect(toAppPath("https://hoppinclub.com/auth/confirm?code=1#access_token=tok")).toBe("/auth/confirm?code=1#access_token=tok");
    expect(toAppPath("https://hoppinclub.com/reset-password#type=recovery")).toBe("/reset-password#type=recovery");
  });

  it("opens a trip path inside the app", () => {
    expect(toAppPath("https://hoppinclub.com/trips/demo-goa/days")).toBe("/trips/demo-goa/days");
  });

  it("sends an unknown path on our site home", () => {
    expect(toAppPath("https://hoppinclub.com/nope")).toBe("/");
  });

  it("ignores any other host", () => {
    expect(toAppPath("https://evil.example/join/abc")).toBeNull();
    expect(toAppPath("https://hoppinclub.com.evil.example/join/abc")).toBeNull();
  });
});
