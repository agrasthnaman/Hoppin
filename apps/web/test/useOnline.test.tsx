import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnline } from "../src/hooks/useOnline";

function setOnline(value: boolean) {
  vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(value);
}

afterEach(() => vi.restoreAllMocks());

describe("useOnline", () => {
  it("starts with the browser's current state", () => {
    setOnline(false);
    expect(renderHook(() => useOnline()).result.current).toBe(false);
  });

  it("follows the online and offline events", () => {
    setOnline(true);
    const { result } = renderHook(() => useOnline());
    expect(result.current).toBe(true);
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(result.current).toBe(false);
    act(() => {
      setOnline(true);
      window.dispatchEvent(new Event("online"));
    });
    expect(result.current).toBe(true);
  });
});
