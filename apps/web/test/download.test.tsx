import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText, safeFileName } from "../src/lib/download";

afterEach(() => vi.restoreAllMocks());

describe("safeFileName", () => {
  it("keeps letters, numbers and dashes only", () => {
    expect(safeFileName("Bali, 2026: Ubud/Gili trip!")).toBe("Bali-2026-Ubud-Gili-trip");
    expect(safeFileName("गोवा ट्रिप")).toBe("गोवा-ट्रिप");
    expect(safeFileName("../../etc")).toBe("etc");
    expect(safeFileName("  ***  ")).toBe("trip");
  });
});

describe("downloadText", () => {
  it("saves the text as a file with the given name and type, then frees the address", async () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    const create = vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
      blobs.push(b as Blob);
      return "blob:x";
    });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe("Bali.ics");
      expect(this.getAttribute("href")).toBe("blob:x");
    });
    downloadText("Bali.ics", "text/calendar;charset=utf-8", "BEGIN:VCALENDAR");
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(blobs[0]!.type).toBe("text/calendar;charset=utf-8");
    expect(await blobs[0]!.text()).toBe("BEGIN:VCALENDAR");
    expect(document.querySelector("a[download]")).toBeNull();
    vi.advanceTimersByTime(10_000);
    expect(revoke).toHaveBeenCalledWith("blob:x");
    vi.useRealTimers();
  });
});
