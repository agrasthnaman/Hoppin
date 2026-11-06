import type { Painter } from "./painter";
import { withAlpha } from "./palette";
import { mulberry32 } from "./rng";
import { NO_EDIT, type Ctx, type PhotoSource, type PosterTemplate, type SlotEdit, type SlotSpec } from "./types";

/** A photo frame where it ends up: base layout, Shuffle's tilt and the person's edits. Pixels and degrees. */
export interface PlacedSlot {
  index: number;
  spec: SlotSpec;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** Tilt from the layout and Shuffle, before the person turned it. */
  baseRot: number;
  rot: number;
  sc: number;
  edit: SlotEdit;
}

export type SlotEdits = (Partial<SlotEdit> & { front?: number } | null | undefined)[];

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function editAt(edits: SlotEdits, i: number): SlotEdit {
  return { ...NO_EDIT, ...(edits[i] ?? {}) };
}

/** Every frame of a template, placed. Drawing and the studio's touch handles both use this, so they always agree. */
export function placeSlots(tpl: PosterTemplate, c: Ctx, edits: SlotEdits = []): PlacedSlot[] {
  const rnd = mulberry32(c.seed * 977 + tpl.id.length * 13);
  return tpl.slots(c).map((spec, index) => {
    const jitter = tpl.jitter ? (rnd() - 0.5) * 2 * tpl.jitter : 0;
    const e = editAt(edits, index);
    const baseRot = (spec.r ?? 0) + jitter;
    return {
      index,
      spec,
      cx: c.X(spec.x + e.tx + spec.w / 2),
      cy: c.Y(spec.y + e.ty + spec.h / 2),
      w: c.X(spec.w),
      h: c.Y(spec.h),
      baseRot,
      rot: baseRot + e.rot,
      sc: e.sc,
      edit: e,
    };
  });
}

/** Back photos first, then by when they were brought to the front, then in layout order. */
export function drawOrder(placed: PlacedSlot[], edits: SlotEdits): PlacedSlot[] {
  return [...placed].sort((a, b) => {
    if (Boolean(a.spec.back) !== Boolean(b.spec.back)) return a.spec.back ? -1 : 1;
    return (edits[a.index]?.front ?? 0) - (edits[b.index]?.front ?? 0) || a.index - b.index;
  });
}

/** Draws a photo to fill a box (centre-crop), with the person's crop point and zoom. The caller clips. */
export function drawCover(p: Painter, src: PhotoSource, x: number, y: number, w: number, h: number, ox = 50, oy = 50, z = 1) {
  const s = Math.max(w / src.width, h / src.height) * Math.max(1, z);
  const dw = src.width * s;
  const dh = src.height * s;
  p.image(src, 0, 0, src.width, src.height, x + ((w - dw) * ox) / 100, y + ((h - dh) * oy) / 100, dw, dh);
}

function blobPath(p: Painter, w: number, h: number) {
  const rx = w / 2;
  const ry = h / 2;
  const f = [1, 0.93, 1.04, 0.95];
  const k = 0.5523;
  const pt = (i: number) => {
    const a = (i * Math.PI) / 2;
    return [Math.cos(a) * rx * f[i % 4]!, Math.sin(a) * ry * f[i % 4]!] as const;
  };
  const [sx, sy] = pt(0);
  p.moveTo(sx, sy);
  for (let i = 0; i < 4; i += 1) {
    const [ax, ay] = pt(i);
    const [bx, by] = pt(i + 1);
    const ta = (i * Math.PI) / 2 + Math.PI / 2;
    const tb = ((i + 1) * Math.PI) / 2 - Math.PI / 2;
    p.bezierTo(ax + Math.cos(ta) * rx * k, ay + Math.sin(ta) * ry * k, bx + Math.cos(tb) * rx * k, by + Math.sin(tb) * ry * k, bx, by);
  }
  p.close();
}

function tornPath(p: Painter, w: number, h: number, seed: number) {
  const rnd = mulberry32(seed);
  const j = () => rnd() * Math.min(w, h) * 0.026;
  const x0 = -w / 2;
  const y0 = -h / 2;
  p.moveTo(x0 + j(), y0 + j());
  for (let t = 0.06; t <= 1.001; t += 0.06) p.lineTo(x0 + w * Math.min(t, 1), y0 + j());
  for (let t = 0.06; t <= 1.001; t += 0.06) p.lineTo(x0 + w - j(), y0 + h * Math.min(t, 1));
  for (let t = 0.94; t >= -0.001; t -= 0.06) p.lineTo(x0 + w * Math.max(t, 0), y0 + h - j());
  for (let t = 0.94; t > 0; t -= 0.06) p.lineTo(x0 + j(), y0 + h * t);
  p.close();
}

/** The photo area inside a frame and the shape it is clipped to, in the frame's own centred coordinates. */
function photoArea(p: Painter, c: Ctx, s: SlotSpec, w: number, h: number) {
  const U = c.U;
  switch (s.f) {
    case "polaroid":
    case "pinned":
      return { x: -w / 2 + U(1.5), y: -h / 2 + U(1.5), w: w - U(3), h: h - U(6.7), shape: (x: number, y: number, ww: number, hh: number) => p.rectPath(x, y, ww, hh) };
    case "torn":
    case "inset": {
      const i = s.f === "torn" ? U(1.4) : U(0.8);
      return { x: -w / 2 + i, y: -h / 2 + i, w: w - 2 * i, h: h - 2 * i, shape: (x: number, y: number, ww: number, hh: number) => p.rectPath(x, y, ww, hh) };
    }
    case "tag": {
      const capH = s.cap ? U(4.6) : 0;
      return { x: -w / 2 + U(2), y: -h / 2 + U(7.4), w: w - U(4), h: h - U(9.4) - capH, shape: (x: number, y: number, ww: number, hh: number) => p.rectPath(x, y, ww, hh) };
    }
    case "window": {
      const i = U(1.8);
      const r = Math.min(w, h) * 0.46 - i;
      return { x: -w / 2 + i, y: -h / 2 + i, w: w - 2 * i, h: h - 2 * i, shape: (x: number, y: number, ww: number, hh: number) => p.roundRectPath(x, y, ww, hh, r) };
    }
    case "round":
      return { x: -w / 2, y: -h / 2, w, h, shape: () => p.ellipse(0, 0, Math.min(w, h) / 2, Math.min(w, h) / 2) };
    case "blob":
      return { x: -w / 2, y: -h / 2, w, h, shape: () => blobPath(p, w, h) };
    default: {
      const r = s.rad != null ? U(s.rad) : s.f === "film" ? U(0.5) : s.f === "booth" ? U(0.4) : s.f === "hair" ? U(0.8) : 0;
      return { x: -w / 2, y: -h / 2, w, h, shape: (x: number, y: number, ww: number, hh: number) => (r ? p.roundRectPath(x, y, ww, hh, r) : p.rectPath(x, y, ww, hh)) };
    }
  }
}

function frameBehind(p: Painter, c: Ctx, s: SlotSpec, w: number, h: number, index: number) {
  const U = c.U;
  const shadow = (blur: number, oy: number, a = 0.28) => p.shadow(`rgba(0,0,0,${a})`, U(blur), 0, U(oy));
  switch (s.f) {
    case "polaroid":
    case "pinned":
      shadow(2.6, 1);
      p.rect(-w / 2, -h / 2, w, h, "#ffffff");
      break;
    case "inset":
      shadow(2.4, 1, 0.4);
      p.rect(-w / 2, -h / 2, w, h, "#ffffff");
      break;
    case "torn":
      shadow(1.3, 0.9, 0.25);
      p.begin();
      tornPath(p, w, h, s.tear ?? 31 + index * 7);
      p.fill(c.P.surface);
      break;
    case "tag": {
      const col = s.colors ?? {};
      p.save();
      p.translate(0, -h / 2 + U(3.8));
      p.rotate((16 * Math.PI) / 180);
      p.rect(-U(0.25), -U(12), U(0.5), U(12), col.string ?? c.P.ink);
      p.restore();
      shadow(2.6, 1.4, 0.25);
      p.begin();
      p.roundRectPath(-w / 2, -h / 2, w, h, U(2.4));
      p.fill(col.card ?? c.P.surface);
      p.noShadow();
      p.begin();
      p.arc(0, -h / 2 + U(3.9), U(1.6), 0, Math.PI * 2);
      p.fill(col.hole ?? c.P.asoft);
      break;
    }
    case "window":
      shadow(2.6, 1.4, 0.3);
      p.begin();
      p.roundRectPath(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.46);
      p.fill(s.colors?.frame ?? c.P.surface);
      break;
    case "round":
    case "blob":
      shadow(3, 1.6);
      p.save();
      p.scale(1 + (U(2.2) / Math.min(w, h)));
      p.begin();
      if (s.f === "round") p.ellipse(0, 0, Math.min(w, h) / 2, Math.min(w, h) / 2);
      else blobPath(p, w, h);
      p.fill("#ffffff");
      p.restore();
      break;
    default:
      break;
  }
  p.noShadow();
}

function frameAfter(p: Painter, c: Ctx, s: SlotSpec, w: number, h: number, area: { x: number; y: number; w: number; h: number }) {
  const U = c.U;
  if (s.f === "window") {
    p.save();
    p.begin();
    p.roundRectPath(area.x, area.y, area.w, area.h, Math.min(w, h) * 0.46 - U(1.8));
    p.clip();
    const r = Math.max(area.w, area.h) * 0.7;
    p.rect(area.x, area.y, area.w, area.h, { kind: "radial", coords: [0, 0, r * 0.45, 0, 0, r], stops: [[0, "rgba(0,0,0,0)"], [1, "rgba(0,0,0,0.5)"]] });
    p.restore();
  }
  if (s.f === "hair") {
    p.begin();
    p.roundRectPath(area.x, area.y, area.w, area.h, U(0.8));
    p.stroke(s.colors?.hair ?? c.P.line, U(0.25));
  }
  if (s.cap && s.f === "tag") {
    p.text(s.cap, 0, area.y + area.h + U(1.6), { font: "display", size: U(2.3), color: s.colors?.cap ?? c.P.ink, align: "center", letterSpacing: 0.04 });
  }
  if (s.cap && s.f === "booth") {
    p.text(s.cap, w / 2 - U(1.6), h / 2 - U(1.1) - U(2.2), { font: "sans", size: U(2.2), weight: 700, color: s.colors?.stamp ?? c.P.accent, align: "right", letterSpacing: 0.08 });
  }
  if (s.tape) {
    p.save();
    p.translate(0, -h / 2);
    p.rotate((-5 * Math.PI) / 180);
    p.alpha(0.88);
    p.rect(-U(6.5), -U(2.1), U(13), U(4.2), s.tape);
    p.restore();
  }
  if (s.pin) {
    p.shadow("rgba(0,0,0,0.4)", U(0.9), 0, U(0.7));
    p.begin();
    p.arc(0, -h / 2 + U(0.5), U(1.8), 0, Math.PI * 2);
    p.fill(s.pin);
    p.noShadow();
    p.begin();
    p.arc(-U(0.5), -h / 2 + U(0.5) - U(0.6), U(0.55), 0, Math.PI * 2);
    p.fill("rgba(255,255,255,0.75)");
  }
}

/** Draws one frame with its photo (or a tidy empty frame), including the entrance animation. */
export function drawSlot(p: Painter, c: Ctx, slot: PlacedSlot, photo: PhotoSource | null | undefined) {
  const a = c.t >= 1 ? 1 : clamp01((c.t * 1.8 - slot.index * 0.09) / 0.6);
  if (a <= 0) return;
  const e = 1 + 2.7 * (a - 1) ** 3 + 1.7 * (a - 1) ** 2; // a little overshoot, like a spring
  const { spec: s, w, h } = slot;
  p.save();
  p.translate(slot.cx, slot.cy - (1 - e) * h * 0.16);
  p.rotate(((slot.rot - (1 - e) * 9) * Math.PI) / 180);
  p.scale(slot.sc * (0.82 + 0.18 * e));
  p.alpha(Math.min(1, a * 1.5));
  frameBehind(p, c, s, w, h, slot.index);
  const area = photoArea(p, c, s, w, h);
  p.save();
  p.begin();
  if (s.f === "torn") tornPath(p, w - c.U(2.8), h - c.U(2.8), (s.tear ?? 31 + slot.index * 7) + 1);
  else area.shape(area.x, area.y, area.w, area.h);
  p.clip();
  if (photo) {
    drawCover(p, photo, area.x, area.y, area.w, area.h, slot.edit.ox, slot.edit.oy, slot.edit.z);
  } else if (c.editing) {
    p.rect(area.x, area.y, area.w, area.h, withAlpha(c.P.accent, 0.16));
    const size = Math.min(area.w, area.h) * 0.32;
    p.text("+", 0, -size * 0.62, { font: "display", size, color: c.P.ink, align: "center" });
    p.text(String(slot.index + 1), 0, size * 0.4, { font: "sans", size: c.U(3), weight: 700, color: c.P.ink, align: "center" });
  } else {
    p.rect(area.x, area.y, area.w, area.h, withAlpha(c.P.accent, 0.14));
  }
  p.restore();
  frameAfter(p, c, s, w, h, area);
  p.restore();
}
