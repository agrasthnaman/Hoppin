import type { SlotEdit } from "./types";

const SNAPS = [0, 90, -90, 180];
const SNAP_WITHIN = 3;
export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;
export const MAX_ZOOM = 3;

/** An angle between -180 and 180. */
export const normAngle = (a: number) => ((((a % 360) + 540) % 360) - 180);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Turning a photo: it clicks straight when it comes within 3° of upright, sideways or upside down. */
export function snapTurn(baseRot: number, rot: number): { rot: number; shown: number; snapped: boolean } {
  const total = normAngle(baseRot + rot);
  for (const s of SNAPS) {
    const off = normAngle(total - s);
    if (Math.abs(off) < SNAP_WITHIN) return { rot: rot - off, shown: Math.round(normAngle(s)), snapped: true };
  }
  return { rot, shown: Math.round(total), snapped: false };
}

/** Dragging a photo by `dx, dy` screen pixels on a poster drawn `w` by `h` pixels on screen. */
export function moveBy(start: SlotEdit, dx: number, dy: number, w: number, h: number): Pick<SlotEdit, "tx" | "ty"> {
  return { tx: start.tx + (dx / w) * 100, ty: start.ty + (dy / h) * 100 };
}

/**
 * Sliding the picture inside its frame. The drag is turned into the frame's own direction, so dragging right on a
 * tilted photo still moves the picture right. `frameW` is the frame's width on screen.
 */
export function cropBy(start: SlotEdit, dx: number, dy: number, angleDeg: number, frameW: number): Pick<SlotEdit, "ox" | "oy"> {
  const a = (-angleDeg * Math.PI) / 180;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  const k = 160 / Math.max(1, frameW) / Math.max(1, start.z);
  return { ox: clamp(start.ox - rx * k, 0, 100), oy: clamp(start.oy - ry * k, 0, 100) };
}

export const clampScale = (s: number) => clamp(s, MIN_SCALE, MAX_SCALE);
export const clampZoom = (z: number) => clamp(z, 1, MAX_ZOOM);
