import { describe, expect, it, vi } from "vitest";
import { hapticTap } from "../src/lib/haptic";

describe("hapticTap", () => {
  it("does nothing on the website", async () => {
    const impact = vi.fn(async () => {});
    await hapticTap(false, impact);
    expect(impact).not.toHaveBeenCalled();
  });

  it("taps on the phone", async () => {
    const impact = vi.fn(async () => {});
    await hapticTap(true, impact);
    expect(impact).toHaveBeenCalledOnce();
  });

  it("ignores a phone with no vibrator", async () => {
    const impact = vi.fn(async () => {
      throw new Error("no vibrator");
    });
    await expect(hapticTap(true, impact)).resolves.toBeUndefined();
  });
});
