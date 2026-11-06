import { overAlpha } from "./kit";
import { CanvasPainter, type Painter } from "./painter";
import { posterPalette } from "./palette";
import { drawOrder, drawSlot, placeSlots, type SlotEdits } from "./slots";
import type { Ctx, Frame, PosterData, PosterPalette, PosterSize, PosterTemplate } from "./types";

export const SIZES: Record<PosterSize, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: "Story" },
  square: { w: 1080, h: 1080, label: "Square" },
  poster: { w: 2480, h: 3508, label: "Poster" },
};

export function frameFor(size: PosterSize): Frame {
  const { w, h } = SIZES[size];
  return { w, h, size, sq: size === "square", u: w / 100 };
}

export interface DrawOptions {
  seed: number;
  edits?: SlotEdits;
  /** Entrance animation progress; leave out for the finished picture. */
  t?: number;
  editing?: boolean;
}

export function makeCtx(frame: Frame, P: PosterPalette, d: PosterData, opts: DrawOptions): Ctx {
  return {
    P,
    d,
    f: frame,
    sq: frame.sq,
    seed: opts.seed,
    t: opts.t ?? 1,
    editing: Boolean(opts.editing),
    v: (story, square) => (frame.sq ? square : story),
    q: (w) => (w * frame.w) / frame.h,
    X: (pct) => (pct / 100) * frame.w,
    Y: (pct) => (pct / 100) * frame.h,
    U: (n) => n * frame.u,
  };
}

/** Draws a whole poster through a painter: background, photos, then the brand and text on top. */
export function drawPoster(p: Painter, tpl: PosterTemplate, d: PosterData, P: PosterPalette, opts: DrawOptions): Ctx {
  const c = makeCtx(p.frame, P, d, opts);
  const edits = opts.edits ?? [];
  p.save();
  p.rect(0, 0, c.f.w, c.f.h, P.bg);
  tpl.under?.(p, c);
  const ordered = drawOrder(placeSlots(tpl, c, edits), edits);
  for (const slot of ordered.filter((s) => s.spec.back)) drawSlot(p, c, slot, d.photos[slot.index]);
  tpl.mid?.(p, c);
  for (const slot of ordered.filter((s) => !s.spec.back)) drawSlot(p, c, slot, d.photos[slot.index]);
  p.save();
  p.alpha(overAlpha(c.t));
  tpl.over(p, c);
  p.restore();
  p.restore();
  return c;
}

/** Releases a canvas's pixel memory now instead of waiting for garbage collection (Safari keeps it otherwise). */
export function freeCanvas(canvas: HTMLCanvasElement | OffscreenCanvas) {
  canvas.width = 0;
  canvas.height = 0;
}

/** Draws the full-size picture and returns it as a PNG. The big canvas is freed before this returns. */
export async function renderPosterBlob(tpl: PosterTemplate, d: PosterData, paletteId: string, size: PosterSize, opts: DrawOptions): Promise<Blob> {
  const frame = frameFor(size);
  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(frame.w, frame.h) : Object.assign(document.createElement("canvas"), { width: frame.w, height: frame.h });
  try {
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) throw new Error("no canvas");
    drawPoster(new CanvasPainter(ctx, frame), tpl, d, posterPalette(paletteId), { seed: opts.seed, edits: opts.edits ?? [] });
    if ("convertToBlob" in canvas) return await canvas.convertToBlob({ type: "image/png" });
    return await new Promise<Blob>((resolve, reject) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? resolve(b) : reject(new Error("no picture"))), "image/png"));
  } finally {
    freeCanvas(canvas);
  }
}

let fontsReady: Promise<void> | null = null;

/** Loads the poster fonts before the first draw, so the first picture doesn't use a fallback font. */
export function ensurePosterFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return Promise.resolve();
  fontsReady ??= Promise.all([
    document.fonts.load('800 40px "Bricolage Grotesque Variable"'),
    document.fonts.load('500 40px "Bricolage Grotesque Variable"'),
    document.fonts.load('500 20px "Inter Variable"'),
    document.fonts.load('700 20px "Inter Variable"'),
  ]).then(
    () => undefined,
    () => undefined,
  );
  return fontsReady;
}
