import { describe, expect, it } from "vitest";
import { demoPosterData } from "../src/poster/demo";
import { RecordingPainter, type Recorded } from "../src/poster/painter";
import { POSTER_PALETTES, posterPalette } from "../src/poster/palette";
import { TEMPLATES } from "../src/poster/registry";
import { artArea, drawPoster, frameFor } from "../src/poster/render";
import type { PhotoSource, PosterSize, PosterTemplate } from "../src/poster/types";

const photo = { width: 1200, height: 900 } as unknown as PhotoSource;
const SIZES: PosterSize[] = ["story", "square", "poster"];
const day = demoPosterData({ kind: "day", title: "Day 3 in Ubud", dates: "Tue 30 Mar 2027", short: "30 MAR", stops: ["Tegallalang 07:30", "Tirta Empul 10:00", "Ubud Market 15:30"] });

function draw(tpl: PosterTemplate, size: PosterSize, paletteId: string, photos: number, data = demoPosterData()) {
  const rec = new RecordingPainter(frameFor(size));
  drawPoster(rec, tpl, { ...data, photos: Array.from({ length: photos }, () => photo) }, posterPalette(paletteId), { seed: 3 });
  return rec;
}

function allowedColors(paletteId: string): Set<string> {
  const { id: _id, name: _name, ...colors } = posterPalette(paletteId);
  return new Set([...Object.values(colors).map((c) => c.toLowerCase()), "#ffffff", "#000000"]);
}

function base(color: string): string {
  const c = color.trim().toLowerCase();
  if (c === "transparent") return "transparent";
  if (/^#[0-9a-f]{8}$/.test(c)) return c.slice(0, 7);
  const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (rgba) return rgba.slice(1, 4).every((v) => v === "0") ? "#000000" : rgba.slice(1, 4).every((v) => v === "255") ? "#ffffff" : c;
  return c;
}

const marks = (calls: Recorded[], kind: "lockup" | "hop" | "address") => calls.filter((c): c is Extract<Recorded, { op: "mark" }> => c.op === "mark" && c.kind === kind);

describe.each(TEMPLATES.map((t) => [t.id, t] as const))("brand rules: %s", (_id, tpl) => {
  for (const size of SIZES) {
    for (const [kindName, data] of [["trip", demoPosterData()], ["day", day]] as const) {
      it(`${size}, ${kindName}: lockup, address, hop and safe zones, with 0 and ${tpl.photos} photos`, () => {
        for (const count of [0, tpl.photos]) {
          const rec = draw(tpl, size, "cobalt", count, data);
          const { w, h } = rec.frame;
          const lockups = marks(rec.calls, "lockup");
          expect(lockups.length, "draws the lockup").toBeGreaterThan(0);
          expect(Math.max(...lockups.map((l) => l.box.w)) / w, "lockup is at least 7% of the width").toBeGreaterThanOrEqual(0.07);
          const addresses = marks(rec.calls, "address");
          expect(addresses.length, "draws hoppinclub.com").toBeGreaterThan(0);
          const art = artArea(size);
          const artH = art.frame.h * art.scale; // an A4 print measures against its artwork, not the white border
          expect(Math.max(...addresses.map((a) => a.box.h)) / artH, "address is at least 2.2% of the height").toBeGreaterThanOrEqual(0.0219);
          expect(marks(rec.calls, "hop").length, "draws a hop").toBeGreaterThan(0);
          expect(rec.calls.some((c) => c.op === "text" && c.str === "hoppinclub.com")).toBe(true);
          if (size === "story") {
            const boxes = [...rec.calls.filter((c) => c.op === "text").map((c) => (c as { box: { y: number; h: number } }).box), ...lockups.map((l) => l.box)];
            for (const box of boxes) {
              expect(box.y, "clear of Instagram's top bar").toBeGreaterThanOrEqual(250 - 1);
              expect(box.y + box.h, "clear of Instagram's bottom bar").toBeLessThanOrEqual(h - 340 + 1);
            }
          }
          for (const t of rec.calls.filter((c): c is Extract<Recorded, { op: "text" }> => c.op === "text")) {
            expect(["display", "sans", "serif"]).toContain(t.style.font);
          }
        }
      });
    }
  }

  it.each(POSTER_PALETTES)("uses only the %s palette's colours", (paletteId) => {
    const allowed = allowedColors(paletteId);
    for (const size of SIZES) {
      const rec = draw(tpl, size, paletteId, tpl.photos);
      const used = rec.calls.flatMap((c) => (c.op === "fill" || c.op === "stroke" ? c.colors : [])).map(base);
      const strays = [...new Set(used)].filter((c) => c !== "transparent" && !allowed.has(c));
      expect(strays).toEqual([]);
    }
  });

  it("prints on A4 at the Story layout's true shape, inside a white border", () => {
    const story = draw(tpl, "story", "cobalt", tpl.photos);
    const a4 = draw(tpl, "poster", "cobalt", tpl.photos);
    const art = artArea("poster");
    const boxes = (calls: Recorded[]) => calls.filter((c): c is Extract<Recorded, { op: "image" }> => c.op === "image").map((c) => c.box);
    const expected = boxes(story.calls).map((b) => ({ x: art.x + b.x * art.scale, y: art.y + b.y * art.scale, w: b.w * art.scale, h: b.h * art.scale }));
    boxes(a4.calls).forEach((b, i) => {
      expect(b.x).toBeCloseTo(expected[i]!.x, 3);
      expect(b.y).toBeCloseTo(expected[i]!.y, 3);
      expect(b.w / b.h).toBeCloseTo(expected[i]!.w / expected[i]!.h, 6);
    });
    for (const t of a4.calls.filter((c): c is Extract<Recorded, { op: "text" }> => c.op === "text")) {
      expect(t.box.y).toBeGreaterThanOrEqual(art.y - 1);
      expect(t.box.y + t.box.h).toBeLessThanOrEqual(art.y + art.frame.h * art.scale + 1);
    }
  });

  it("never lets a photo cover the lockup", () => {
    const rec = draw(tpl, "story", "cobalt", tpl.photos);
    const lastImage = rec.calls.map((c) => c.op).lastIndexOf("image");
    const firstLockup = rec.calls.findIndex((c) => c.op === "mark" && c.kind === "lockup");
    expect(firstLockup).toBeGreaterThan(lastImage);
  });

  it("keeps a 60-character title inside the poster", () => {
    const long = demoPosterData({ title: "The Very Long Trip Name That Goes On And On For Sixty Chars" });
    for (const size of SIZES) {
      const rec = draw(tpl, size, "rose", 0, long);
      for (const t of rec.calls.filter((c): c is Extract<Recorded, { op: "text" }> => c.op === "text" && !c.str.startsWith("12") && c.str.length > 1)) {
        expect(t.box.x, t.str).toBeGreaterThanOrEqual(-2);
        expect(t.box.x + t.box.w, t.str).toBeLessThanOrEqual(rec.frame.w + 2);
      }
    }
  });
});
