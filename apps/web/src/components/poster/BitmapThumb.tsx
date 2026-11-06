import { useEffect, useRef } from "react";
import { freeCanvas } from "../../poster/render";
import { drawCover } from "../../poster/slots";
import { CanvasPainter } from "../../poster/painter";
import type { PhotoSource } from "../../poster/types";

/** A small square preview of a photo already in memory (no copy of the file, no object URL). */
export function BitmapThumb({ photo, size, label }: { photo: PhotoSource; size: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext?.("2d") ?? null;
    if (ctx) drawCover(new CanvasPainter(ctx, { w: size, h: size, size: "square", sq: true, u: size / 100 }, dpr), photo, 0, 0, size, size);
    return () => freeCanvas(canvas);
  }, [photo, size]);
  return <canvas ref={ref} role="img" aria-label={label} style={{ width: size, height: size }} className="block" />;
}
