import { describe, expect, it, vi } from "vitest";
import { forgetStoredPushToken, PUSH_TOKEN_KEY, registerPushToken, shouldOfferPush } from "../src/lib/push-register";

describe("shouldOfferPush", () => {
  it("asks once, on the phone, after a trip exists", () => {
    expect(shouldOfferPush(true, false)).toBe(true);
    expect(shouldOfferPush(false, false)).toBe(false);
    expect(shouldOfferPush(true, true)).toBe(false);
  });
});

describe("registerPushToken", () => {
  const granted = () => ({
    platform: "ios" as const,
    requestPermission: vi.fn(async () => true),
    register: vi.fn(async () => {}),
    nextToken: vi.fn(async () => "device-token"),
    save: vi.fn(async () => {}),
  });

  it("saves the token after permission is granted", async () => {
    const deps = granted();
    await expect(registerPushToken(deps)).resolves.toBe("device-token");
    expect(deps.register).toHaveBeenCalledOnce();
    expect(deps.save).toHaveBeenCalledWith("device-token", "ios");
  });

  it("does not register when permission is refused", async () => {
    const deps = granted();
    deps.requestPermission.mockResolvedValue(false);
    await expect(registerPushToken(deps)).resolves.toBeNull();
    expect(deps.register).not.toHaveBeenCalled();
    expect(deps.save).not.toHaveBeenCalled();
  });
});

describe("forgetStoredPushToken", () => {
  it("deletes the saved token and forgets it on this device", async () => {
    const storage = { getItem: vi.fn(() => "device-token"), removeItem: vi.fn() };
    const remove = vi.fn(async () => {});
    await forgetStoredPushToken(storage, remove);
    expect(remove).toHaveBeenCalledWith("device-token");
    expect(storage.removeItem).toHaveBeenCalledWith(PUSH_TOKEN_KEY);
  });

  it("does nothing when this device never registered", async () => {
    const storage = { getItem: vi.fn(() => null), removeItem: vi.fn() };
    const remove = vi.fn(async () => {});
    await forgetStoredPushToken(storage, remove);
    expect(remove).not.toHaveBeenCalled();
  });
});
