import { describe, expect, it } from "vitest";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, validatePassword } from "../src/password";

describe("validatePassword", () => {
  it("needs at least 10 characters and allows up to 72", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(MAX_PASSWORD_LENGTH).toBe(72);
    expect(validatePassword("a".repeat(9))).toEqual({ ok: false, reason: "Use at least 10 characters" });
    expect(validatePassword("a".repeat(10))).toEqual({ ok: true });
    expect(validatePassword("a".repeat(72))).toEqual({ ok: true });
    expect(validatePassword("a".repeat(73))).toEqual({ ok: false, reason: "Use at most 72 characters" });
  });

  it("has no composition rules, so a long phrase of lowercase words is fine", () => {
    expect(validatePassword("correct horse battery staple")).toEqual({ ok: true });
  });

  it("counts a password of only spaces as too weak", () => {
    expect(validatePassword(" ".repeat(12)).ok).toBe(false);
  });

  it("measures bytes for the 72 limit (the hash only reads 72 bytes)", () => {
    expect(validatePassword("é".repeat(37)).ok).toBe(false); // 74 bytes
    expect(validatePassword("é".repeat(36)).ok).toBe(true); // 72 bytes
  });
});
