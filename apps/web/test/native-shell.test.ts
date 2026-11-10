import { describe, expect, it } from "vitest";
import { apiBase, shouldRegisterServiceWorker } from "../src/lib/native-shell";

describe("native shell", () => {
  it("calls the website for /api when the app is the native shell, and stays relative on the web", () => {
    expect(apiBase(true)).toBe("https://hoppinclub.com");
    expect(apiBase(false)).toBe("");
  });

  it("does not install the service worker inside the native shell", () => {
    expect(shouldRegisterServiceWorker(true)).toBe(false);
    expect(shouldRegisterServiceWorker(false)).toBe(true);
  });
});
