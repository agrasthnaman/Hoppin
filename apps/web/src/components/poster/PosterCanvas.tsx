import { useEffect, useMemo, useRef } from "react";
import { cn } from "../../lib/cn";
import { CanvasPainter } from "../../poster/painter";
import { posterPalette } from "../../poster/palette";
import { drawPoster, frameFor, freeCanvas } from "../../poster/render";
import type { SlotEdits } from "../../poster/slots";
import type { PosterData, PosterSize, PosterTemplate } from "../../poster/types";

const ENTRANCE_MS = 1300;
const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface PosterCanvasProps {
  tpl: PosterTemplate;
  data: PosterData;
  paletteId: string;
  size: PosterSize;
  seed: number;
  edits?: SlotEdits;
  editing?: boolean;
  /** Width on screen, in CSS pixels. */
  width: number;
  /** Changing this replays the entrance animation (when `animate` is on). */
  playKey?: string | number;
  animate?: boolean;
  className?: string;
  label: string;
}

/** A poster drawn live at screen resolution. Exactly the same drawing as the exported picture, just smaller. */
export function PosterCanvas({ tpl, data, paletteId, size, seed, edits, editing, width, playKey, animate, className, label }: PosterCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const frame = useMemo(() => frameFor(size), [size]);
  const height = Math.round((width * frame.h) / frame.w);
  const progress = useRef(1);
  const lastKey = useRef<string | number | undefined>(undefined);
  const latest = useRef({ tpl, data, paletteId, seed, edits, editing });
  latest.current = { tpl, data, paletteId, seed, edits, editing };

  useEffect(() => {
    const canvas = ref.current;
    return () => {
      if (canvas) freeCanvas(canvas);
    };
  }, []);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext?.("2d") ?? null;
    if (!ctx) return;
    const paint = (t: number) => {
      const s = latest.current;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawPoster(new CanvasPainter(ctx, frame, (width * dpr) / frame.w), s.tpl, s.data, posterPalette(s.paletteId), { seed: s.seed, edits: s.edits ?? [], editing: Boolean(s.editing), t });
    };
    const replay = animate && playKey !== undefined && playKey !== lastKey.current && !reducedMotion();
    lastKey.current = playKey;
    if (!replay) {
      paint(progress.current);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      progress.current = Math.min(1, (now - start) / ENTRANCE_MS);
      paint(progress.current);
      if (progress.current < 1) raf = requestAnimationFrame(step);
    };
    progress.current = 0;
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      progress.current = 1;
    };
    // Redraw whenever anything that changes the picture changes.
  }, [tpl, data, paletteId, seed, edits, editing, width, height, size, playKey, animate, frame]);

  return <canvas ref={ref} role="img" aria-label={label} style={{ width, height }} className={cn("block", className)} />;
}
