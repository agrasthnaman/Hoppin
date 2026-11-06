import { overAlpha } from "./kit";
import { CanvasPainter, type Painter } from "./painter";
import { posterPalette } from "./palette";
import { drawOrder, drawSlot, placeSlots, type SlotEdits } from "./slots";
import type { Ctx, Frame, PosterData, PosterPalette, PosterSize, PosterTemplate } from "./types";

export const SIZES: Record<PosterSize, { w: number; h: number; label: string }> = {
  story: { w: 1080, h: 1920, label: "Story" },
  square: { w: 1080, h: 1080, label: "Square" },
  poster: { w: 2480, h: 3508, label: "Print A4" },
};

export function frameFor(size: PosterSize): Frame {
  const { w, h } = SIZES[size];
  return { w, h, size, sq: size === "square", u: w / 100 };
}

/** White border around the art on an A4 print, in page pixels (1 cm at 300 dpi). Home printers can't print to the edge. */
export const PRINT_MARGIN = 118;

/**
 * Where the template's layout sits on the page. Story and Square fill the page. A4 is shorter than 9:16, so the Story
 * layout is placed in the middle at its true shape (never squashed), on a white sheet.
 */
export function artArea(size: PosterSize): { frame: Frame; x: number; y: number; scale: number } {
  if (size !== "poster") return { frame: frameFor(size), x: 0, y: 0, scale: 1 };
  const page = frameFor("poster");
  const story = frameFor("story");
  const scale = (page.h - 2 * PRINT_MARGIN) / story.h;
  return { frame: story, x: (page.w - story.w * scale) / 2, y: PRINT_MARGIN, scale };
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
  if (p.frame.size !== "poster") return drawLayout(p, p.frame, tpl, d, P, opts);
  const art = artArea("poster");
  const w = art.frame.w * art.scale;
  const h = art.frame.h * art.scale;
  p.save();
  p.rect(0, 0, p.frame.w, p.frame.h, "#ffffff");
  p.shadow("rgba(0,0,0,0.18)", 30, 0, 10);
  p.rect(art.x, art.y, w, h, P.bg);
  p.noShadow();
  p.translate(art.x, art.y);
  p.scale(art.scale);
  p.begin();
  p.rectPath(0, 0, art.frame.w, art.frame.h);
  p.clip();
  const c = drawLayout(p, art.frame, tpl, d, P, opts);
  p.restore();
  return c;
}

function drawLayout(p: Painter, frame: Frame, tpl: PosterTemplate, d: PosterData, P: PosterPalette, opts: DrawOptions): Ctx {
  const c = makeCtx(frame, P, d, opts);
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
