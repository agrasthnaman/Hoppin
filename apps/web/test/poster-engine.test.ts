import { afterEach, describe, expect, it, vi } from "vitest";
import { demoPosterData } from "../src/poster/demo";
import { dateRange, fitRoute, posterData, stopCode } from "../src/poster/from-recap";
import { twoLines } from "../src/poster/kit";
import { RecordingPainter } from "../src/poster/painter";
import { posterPalette } from "../src/poster/palette";
import { getTemplate } from "../src/poster/registry";
import { drawPoster, frameFor, makeCtx, renderPosterBlob } from "../src/poster/render";
import { drawCover, drawOrder, placeSlots } from "../src/poster/slots";
import { joinNames, wrapLines } from "../src/poster/text";
import type { PhotoSource } from "../src/poster/types";
import { item, snapshot } from "./helpers";

const photo = { width: 1000, height: 500 } as unknown as PhotoSource;
const photos = (n: number) => Array.from({ length: n }, () => photo);

function record(id: string, seed: number, edits = []) {
  const rec = new RecordingPainter(frameFor("story"));
  drawPoster(rec, getTemplate(id), demoPosterData({ photos: photos(6) }), posterPalette("cobalt"), { seed, edits });
  return rec.calls;
}

describe("drawing is repeatable", () => {
  it("the same seed draws the same picture, so the preview matches the export", () => {
    expect(record("stickers", 4)).toEqual(record("stickers", 4));
  });

  it("Shuffle (a new seed) moves the photos but never changes the words", () => {
    const a = record("stickers", 4);
    const b = record("stickers", 5);
    const words = (calls: typeof a) => calls.filter((c) => c.op === "text").map((c) => (c as { str: string }).str);
    expect(words(a)).toEqual(words(b));
    const images = (calls: typeof a) => calls.filter((c) => c.op === "image").map((c) => (c as { box: unknown }).box);
    expect(images(a)).not.toEqual(images(b));
  });
});

describe("photo edits", () => {
  const tpl = getTemplate("grid");
  const c = makeCtx(frameFor("story"), posterPalette("cobalt"), demoPosterData(), { seed: 1 });

  it("moving, turning and resizing changes only that photo", () => {
    const before = placeSlots(tpl, c);
    const after = placeSlots(tpl, c, [null, { tx: 10, ty: -5, rot: 30, sc: 1.5 }]);
    expect(after[0]).toEqual(before[0]);
    expect(after[1]!.cx - before[1]!.cx).toBeCloseTo(108);
    expect(after[1]!.cy - before[1]!.cy).toBeCloseTo(-96);
    expect(after[1]!.rot).toBe(before[1]!.rot + 30);
    expect(after[1]!.sc).toBe(1.5);
  });

  it("Bring to front draws that photo last", () => {
    const edits = [{ front: 2 }, null, { front: 1 }];
    expect(drawOrder(placeSlots(tpl, c, edits), edits).map((s) => s.index)).toEqual([1, 3, 2, 0]);
  });

  it("the crop point picks which part of the photo shows, and zoom never leaves a gap", () => {
    const rec = new RecordingPainter(frameFor("square"));
    drawCover(rec, photo, 0, 0, 100, 100, 0, 50, 1);
    drawCover(rec, photo, 0, 0, 100, 100, 100, 50, 1);
    drawCover(rec, photo, 0, 0, 100, 100, 50, 50, 2);
    const boxes = rec.calls.map((c) => (c as { box: { x: number; y: number; w: number; h: number } }).box);
    expect(boxes[0]).toEqual({ x: 0, y: 0, w: 200, h: 100 });
    expect(boxes[1]).toEqual({ x: -100, y: 0, w: 200, h: 100 });
    expect(boxes[2]).toEqual({ x: -150, y: -50, w: 400, h: 200 });
  });
});

describe("text helpers", () => {
  it("joins names and summarises the rest", () => {
    expect(joinNames(["Asha"])).toBe("Asha");
    expect(joinNames(["Asha", "Ravi", "Meera"])).toBe("Asha, Ravi and Meera");
    expect(joinNames(["Asha", "Ravi", "Meera", "Kabir", "Zoya", "Dev"])).toBe("Asha, Ravi, Meera and 3 more");
  });

  it("wraps and balances titles", () => {
    const rec = new RecordingPainter(frameFor("story"));
    expect(wrapLines(rec, "one two three four", { font: "sans", size: 10, color: "#000" }, 60)).toEqual(["one two", "three four"]);
    expect(twoLines("Bali Bros")).toBe("Bali\nBros");
    expect(twoLines("Goa")).toBe("Goa");
  });
});

describe("trip to poster", () => {
  const at = (hhmm: string, d: string) => new Date(`2026-12-${d}T${hhmm}:00+05:30`).toISOString();
  const placed = (id: string, title: string, when: string, lat: number, over = {}) =>
    item({ id, title, startsAt: when, details: { place: { lat, lon: 73.8 } }, ...over });
  const trip = snapshot({
    items: [
      placed("a", "Fort Aguada", at("10:00", "02"), 15.49),
      placed("b", "Baga Beach", at("16:00", "02"), 15.55),
      placed("secret", "My secret spa", at("12:00", "02"), 15.5, { visibility: "private", groupItem: false }),
      placed("c", "Old Goa Church", at("11:00", "03"), 15.5),
    ],
  });

  it("never puts a private plan on a poster, even the viewer's own", () => {
    const data = posterData(trip, { kind: "trip", tz: "Asia/Kolkata", photos: [], showNames: true, showDates: true });
    expect(JSON.stringify(data)).not.toContain("secret spa");
    expect(data.stats.map((s) => s.n)).toEqual([5, 3, expect.any(Number)]);
    expect(data.who).toBe("Neha, Aman and Riya");
    expect(data.from).toEqual(["FOR", "Fort Aguada"]);
    expect(data.route).toHaveLength(3);
  });

  it("hides names and dates when switched off", () => {
    const data = posterData(trip, { kind: "trip", tz: "Asia/Kolkata", photos: [], showNames: false, showDates: false });
    expect(data.who).toBe("");
    expect(data.dates).toBe("");
  });

  it("makes a day card for one day", () => {
    const data = posterData(trip, { kind: "day", date: "2026-12-02", tz: "Asia/Kolkata", photos: [], showNames: true, showDates: true });
    expect(data.title).toBe("Day 2 in Goa");
    expect(data.stops).toEqual(["Fort Aguada 10:00", "Baga Beach 16:00"]);
    expect(data.dates).toBe("Wed 2 Dec 2026");
  });

  it("formats dates, codes and routes", () => {
    expect(dateRange("2027-03-28", "2027-04-05")).toBe("28 Mar – 5 Apr 2027");
    expect(dateRange("2027-12-30", "2028-01-02")).toBe("30 Dec 2027 – 2 Jan 2028");
    expect(stopCode("Ubud Market")).toBe("UBU");
    expect(fitRoute([{ lat: 1, lon: 1 }])).toEqual([]);
    const fitted = fitRoute(Array.from({ length: 20 }, (_, i) => ({ lat: i, lon: i * 2 })));
    expect(fitted).toHaveLength(8);
    for (const [x, y] of fitted) {
      expect(x).toBeGreaterThanOrEqual(0.08 - 1e-9);
      expect(y).toBeLessThanOrEqual(0.92 + 1e-9);
    }
  });
});

describe("export", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns a PNG of the right size and frees the big canvas straight away", async () => {
    const made: { width: number; height: number }[] = [];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) => {
        if (key in target) return target[key];
        if (key === "measureText") return () => ({ width: 10 });
        if (key === "getTransform") return () => ({ a: 1, b: 0 });
        if (key === "createLinearGradient" || key === "createRadialGradient") return () => ({ addColorStop() {} });
        return () => {};
      },
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
    class FakeOffscreen {
      seen: { width: number; height: number } = { width: 0, height: 0 };
      constructor(
        public width: number,
        public height: number,
      ) {
        made.push(this);
      }
      getContext() {
        return ctx;
      }
      async convertToBlob() {
        this.seen = { width: this.width, height: this.height };
        return new Blob(["png"], { type: "image/png" });
      }
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreen);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const blob = await renderPosterBlob(getTemplate("ticket"), demoPosterData({ photos: photos(3) }), "rose", "poster", { seed: 1 });
    expect(blob.type).toBe("image/png");
    const canvas = made[0] as unknown as FakeOffscreen;
    expect(canvas.seen).toEqual({ width: 2480, height: 3508 });
    expect({ width: canvas.width, height: canvas.height }).toEqual({ width: 0, height: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
