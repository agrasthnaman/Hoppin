import type { Box, FontRole, Paint, Painter, TextStyle } from "./painter";
import { withAlpha } from "./palette";
import { hashString, mulberry32 } from "./rng";
import { ellipsize, wrapLines } from "./text";
import type { Ctx, RoutePoints } from "./types";

// Drawing helpers for templates. Positions are percentages of the poster, sizes are in `u` (1% of the width), like the
// design prototype, so a template reads as a list of placements.

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const ROLE: Record<"d" | "s" | "i", FontRole> = { d: "display", s: "sans", i: "serif" };

export interface TextOpts {
  x?: number;
  /** Right edge, in percent from the right. */
  r?: number;
  y: number;
  /** Width in percent, for wrapping, ellipsis or centring. */
  w?: number;
  size: number;
  font?: "d" | "s" | "i";
  wt?: number;
  col: string;
  al?: "left" | "center" | "right";
  rot?: number;
  ls?: number;
  lh?: number;
  op?: number;
  ell?: boolean;
  wrap?: boolean;
}

/** Text placed like the prototype's absolutely positioned lines. Returns the box it took. */
export function txt(p: Painter, c: Ctx, str: string, o: TextOpts): Box {
  const font = o.font ?? "s";
  const style: TextStyle = { font: ROLE[font], size: c.U(o.size), color: o.col, ...(o.wt ? { weight: o.wt } : {}), ...(o.ls != null ? { letterSpacing: o.ls } : {}) };
  const maxW = o.w ? c.X(o.w) : Infinity;
  let lines = str.split("\n");
  if (o.wrap && o.w) lines = wrapLines(p, str, style, maxW);
  if (o.ell && o.w) lines = lines.map((l) => ellipsize(p, l, style, maxW));
  const lh = style.size * (o.lh ?? (font === "d" ? 0.92 : 1.12));
  const widths = lines.map((l) => p.measure(l, style));
  const blockW = Math.max(0, ...widths);
  const blockH = lh * (lines.length - 1) + style.size;
  const align = o.al ?? (o.r != null ? "right" : "left");
  let anchorX: number;
  if (o.r != null) anchorX = c.f.w - c.X(o.r);
  else if (align === "center") anchorX = c.X(o.x ?? 0) + (o.w ? c.X(o.w) / 2 : 0);
  else anchorX = c.X(o.x ?? 0);
  const top = c.Y(o.y);
  const left = align === "right" ? anchorX - blockW : align === "center" ? anchorX - blockW / 2 : anchorX;
  p.save();
  if (o.op != null) p.alpha(o.op);
  if (o.rot) {
    p.translate(left + blockW / 2, top + blockH / 2);
    p.rotate((o.rot * Math.PI) / 180);
    p.translate(-(left + blockW / 2), -(top + blockH / 2));
  }
  lines.forEach((line, i) => p.text(line, anchorX, top + i * lh, { ...style, align }));
  p.restore();
  return { x: left, y: top, w: blockW, h: blockH };
}

/** The lucide map pin, drawn into a `size` square with its top-left at x, y. */
export function drawPin(p: Painter, x: number, y: number, size: number, color: string, weight = 2.6) {
  p.save();
  p.translate(x, y);
  p.scale(size / 24);
  p.begin();
  p.moveTo(20, 10);
  p.bezierTo(20, 14.993, 14.461, 20.193, 12.601, 21.799);
  p.quadTo(12, 22.3, 11.399, 21.799);
  p.bezierTo(9.539, 20.193, 4, 14.993, 4, 10);
  p.arc(12, 10, 8, Math.PI, Math.PI * 2);
  p.stroke(color, weight);
  p.begin();
  p.arc(12, 10, 3, 0, Math.PI * 2);
  p.stroke(color, weight);
  p.restore();
}

export interface LockupOpts {
  x?: number;
  r?: number;
  /** Centred horizontally. */
  center?: boolean;
  y: number;
  size?: number;
  col: string;
  bg?: string;
  /** A rubber-stamp outline instead of a filled pill. */
  outline?: string;
  rot?: number;
}

/** The Hoppin lockup: map pin plus lowercase "hoppin". Every template draws it through here. */
export function lockup(p: Painter, c: Ctx, o: LockupOpts): Box {
  const fs = c.U(o.size ?? 4.4);
  const style: TextStyle = { font: "display", size: fs, color: o.col, letterSpacing: -0.04 };
  const textW = p.measure("hoppin", style);
  const gap = fs * 0.16;
  const padded = Boolean(o.bg || o.outline);
  const pad = padded ? { l: fs * 0.45, r: fs * 0.62, t: fs * 0.32, b: fs * 0.38 } : { l: 0, r: 0, t: 0, b: 0 };
  const w = pad.l + fs + gap + textW + pad.r;
  const h = pad.t + fs + pad.b;
  const left = o.center ? c.f.w / 2 - w / 2 : o.r != null ? c.f.w - c.X(o.r) - w : c.X(o.x ?? 0);
  const top = c.Y(o.y);
  p.save();
  if (o.rot) {
    p.translate(left + w / 2, top + h / 2);
    p.rotate((o.rot * Math.PI) / 180);
    p.translate(-(left + w / 2), -(top + h / 2));
  }
  if (o.bg) {
    p.shadow("rgba(0,0,0,0.18)", c.U(1.2), 0, c.U(0.5));
    p.begin();
    p.roundRectPath(left, top, w, h, h / 2);
    p.fill(o.bg);
    p.noShadow();
  }
  if (o.outline) {
    p.begin();
    p.roundRectPath(left, top, w, h, h / 2);
    p.stroke(o.outline, c.U(0.5));
  }
  drawPin(p, left + pad.l, top + pad.t, fs, o.col);
  p.text("hoppin", left + pad.l + fs + gap, top + pad.t + fs * 0.02, style);
  p.mark("lockup", { x: left, y: top, w, h });
  p.restore();
  return { x: left, y: top, w, h };
}

/** "hoppinclub.com", at least 2.2% of the poster's height tall. */
export function addr(p: Painter, c: Ctx, o: Omit<TextOpts, "size"> & { size?: number }): Box {
  const box = txt(p, c, "hoppinclub.com", { font: "s", wt: 700, ...o, size: o.size ?? c.v(4, 3) });
  p.mark("address", box);
  return box;
}

export interface PillOpts {
  x?: number;
  r?: number;
  y: number;
  text: string;
  size: number;
  bg: string;
  col: string;
  rot?: number;
  radius?: number;
  /** It carries the web address (brand rule). */
  address?: boolean;
}

/** Text on a rounded label. */
export function pill(p: Painter, c: Ctx, o: PillOpts): Box {
  const style: TextStyle = { font: "sans", size: c.U(o.size), color: o.col, weight: 700 };
  const tw = p.measure(o.text, style);
  const padX = style.size * 0.7;
  const padY = style.size * 0.38;
  const w = tw + padX * 2;
  const h = style.size + padY * 2;
  const left = o.r != null ? c.f.w - c.X(o.r) - w : c.X(o.x ?? 0);
  const top = c.Y(o.y);
  p.save();
  if (o.rot) {
    p.translate(left + w / 2, top + h / 2);
    p.rotate((o.rot * Math.PI) / 180);
    p.translate(-(left + w / 2), -(top + h / 2));
  }
  p.shadow("rgba(0,0,0,0.15)", c.U(1), 0, c.U(0.4));
  p.begin();
  p.roundRectPath(left, top, w, h, o.radius != null ? c.U(o.radius) : h / 2);
  p.fill(o.bg);
  p.noShadow();
  p.text(o.text, left + padX, top + padY, style);
  const box = { x: left + padX, y: top + padY, w: tw, h: style.size };
  if (o.address) p.mark("address", box);
  p.restore();
  return box;
}

/** Three big numbers with small labels under them. */
export function statRow(p: Painter, c: Ctx, o: { x?: number; y: number; col: string; sub?: string; size?: number }) {
  const size = o.size ?? 7;
  const num: TextStyle = { font: "display", size: c.U(size), color: o.col };
  const lab: TextStyle = { font: "sans", size: c.U(size * 0.38), color: o.sub ?? o.col, weight: 600 };
  let x = c.X(o.x ?? 7);
  const y = c.Y(o.y);
  for (const s of c.d.stats) {
    const n = String(s.n);
    p.text(n, x, y, num);
    p.text(s.l, x, y + num.size * 0.98, lab);
    x += Math.max(p.measure(n, num), p.measure(s.l, lab)) + c.U(5);
  }
}

/** A round sticker with a number and a small word. */
export function sticker(p: Painter, c: Ctx, o: { x: number; y: number; w: number; bg: string; col: string; rot?: number; big: string; small: string }) {
  const d = c.U(o.w);
  const cx = c.X(o.x) + d / 2;
  const cy = c.Y(o.y) + d / 2;
  const big: TextStyle = { font: "display", size: d * 0.36, color: o.col, align: "center", letterSpacing: -0.03 };
  const small: TextStyle = { font: "sans", size: d * 0.36 * 0.42, color: o.col, align: "center", weight: 700 };
  p.save();
  p.translate(cx, cy);
  p.rotate(((o.rot ?? 0) * Math.PI) / 180);
  p.shadow("rgba(0,0,0,0.2)", c.U(1.6), 0, c.U(0.8));
  p.begin();
  p.arc(0, 0, d / 2, 0, Math.PI * 2);
  p.fill(o.bg);
  p.noShadow();
  const total = big.size * 0.92 + small.size * 1.1;
  p.text(o.big, 0, -total / 2, big);
  p.text(o.small, 0, -total / 2 + big.size * 0.95, small);
  p.restore();
}

export interface HopRoute {
  pts: RoutePoints;
  col: string;
  dot?: string;
  op?: number;
}

/**
 * The hop route: curved dashed hops between points that bow upwards like the map's arcs. `box` is in percent;
 * points are 0..1 inside it; `sw` is the line width as a share (per 100) of the box width. It draws itself in as the
 * entrance animation plays.
 */
export function hops(p: Painter, c: Ctx, box: { x: number; y: number; w: number; h: number }, routes: HopRoute[], o: { sw?: number; bend?: number; dots?: boolean; dotR?: number } = {}) {
  const bx = c.X(box.x);
  const by = c.Y(box.y);
  const bw = c.X(box.w);
  const bh = c.Y(box.h);
  const sw = ((o.sw ?? 0.9) / 100) * bw;
  const k = o.bend ?? 0.3;
  const progress = easeOut(clamp01((c.t - 0.12) / 0.6));
  for (const rt of routes) {
    if (rt.pts.length < 2) continue;
    const pts = rt.pts.map(([x, y]) => [bx + x * bw, by + y * bh] as const);
    const samples: [number, number][] = [[pts[0]![0], pts[0]![1]]];
    const reachedAt: number[] = [0];
    let length = 0;
    for (let i = 1; i < pts.length; i += 1) {
      const [ax, ay] = pts[i - 1]!;
      const [ex, ey] = pts[i]!;
      const L = Math.hypot(ex - ax, ey - ay) || 1;
      let nx = -(ey - ay) / L;
      let ny = (ex - ax) / L;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const qx = (ax + ex) / 2 + nx * L * k;
      const qy = (ay + ey) / 2 + ny * L * k;
      for (let s = 1; s <= 24; s += 1) {
        const t = s / 24;
        const u = 1 - t;
        const x = u * u * ax + 2 * u * t * qx + t * t * ex;
        const y = u * u * ay + 2 * u * t * qy + t * t * ey;
        const last = samples.at(-1)!;
        length += Math.hypot(x - last[0], y - last[1]);
        samples.push([x, y]);
      }
      reachedAt.push(length);
    }
    const upTo = length * progress;
    p.save();
    if (rt.op != null) p.alpha(rt.op);
    if (upTo > 0) {
      p.begin();
      p.moveTo(samples[0]![0], samples[0]![1]);
      let walked = 0;
      for (let i = 1; i < samples.length; i += 1) {
        const [x, y] = samples[i]!;
        const [px, py] = samples[i - 1]!;
        walked += Math.hypot(x - px, y - py);
        if (walked > upTo) break;
        p.lineTo(x, y);
      }
      p.stroke(rt.col, sw, [sw * 2.4, sw * 2.2]);
    }
    if (o.dots !== false) {
      pts.forEach(([x, y], i) => {
        if (reachedAt[i]! > upTo + 0.01) return;
        p.begin();
        p.arc(x, y, sw * (o.dotR ?? 1.7), 0, Math.PI * 2);
        p.fill(rt.dot ?? rt.col);
      });
    }
    p.restore();
  }
  p.mark("hop", { x: bx, y: by, w: bw, h: bh });
}

/** The trip's real route when there is one, else the template's own decorative shape. */
export const routeOr = (c: Ctx, fallback: RoutePoints): RoutePoints => (c.d.route.length >= 2 ? c.d.route : fallback);

// Backgrounds and decorations.

export function fillAll(p: Painter, c: Ctx, paint: Paint) {
  p.rect(0, 0, c.f.w, c.f.h, paint);
}

export function dots(p: Painter, c: Ctx, o: { color: string; r: number; gap: number; dx?: number; dy?: number }) {
  const g = c.U(o.gap);
  const r = c.U(o.r);
  for (let y = (o.dy ?? 0.5) * g; y < c.f.h + g; y += g) {
    for (let x = (o.dx ?? 0.5) * g; x < c.f.w + g; x += g) {
      p.begin();
      p.arc(x, y, r, 0, Math.PI * 2);
      p.fill(o.color);
    }
  }
}

export function gridLines(p: Painter, c: Ctx, color: string, gap: number) {
  const g = c.U(gap);
  const w = Math.max(1, c.U(0.1));
  for (let x = 0; x < c.f.w; x += g) p.rect(x, 0, w, c.f.h, color);
  for (let y = 0; y < c.f.h; y += g) p.rect(0, y, c.f.w, w, color);
}

export function stripes(p: Painter, c: Ctx, a: string, b: string, width: number) {
  p.rect(0, 0, c.f.w, c.f.h, a);
  const w = c.U(width);
  const d = Math.hypot(c.f.w, c.f.h);
  p.save();
  p.translate(c.f.w / 2, c.f.h / 2);
  p.rotate(Math.PI / 4);
  for (let x = -d; x < d; x += w * 2) p.rect(x + w, -d, w, d * 2, b);
  p.restore();
}

/** A soft glow, for clouds and light. */
export function glow(p: Painter, c: Ctx, o: { x: number; y: number; rx: number; color: string }) {
  const cx = c.X(o.x);
  const cy = c.Y(o.y);
  const r = c.X(o.rx);
  p.rect(cx - r, cy - r, r * 2, r * 2, { kind: "radial", coords: [cx, cy, 0, cx, cy, r], stops: [[0, o.color], [1, withAlpha(o.color, 0)]] });
}

/** A card with a soft shadow, and an optional thin inner border. */
export function card(p: Painter, c: Ctx, o: { x: number; y: number; w: number; h: number; fill: string; radius?: number; inner?: string; shadow?: boolean }) {
  const x = c.X(o.x);
  const y = c.Y(o.y);
  const w = c.X(o.w);
  const h = c.Y(o.h);
  const r = c.U(o.radius ?? 1);
  if (o.shadow !== false) p.shadow("rgba(0,0,0,0.22)", c.U(4), 0, c.U(1.6));
  p.begin();
  p.roundRectPath(x, y, w, h, r);
  p.fill(o.fill);
  p.noShadow();
  if (o.inner) {
    const i = c.U(1.6);
    p.begin();
    p.roundRectPath(x + i, y + i, w - 2 * i, h - 2 * i, c.U(0.6));
    p.stroke(o.inner, c.U(0.3));
  }
}

/** A block with a zig-zag top (and bottom), full width. */
export function zigzag(p: Painter, c: Ctx, o: { y: number; h: number; color: string; bottom?: boolean }) {
  const top = c.Y(o.y);
  const bot = c.Y(o.y + o.h);
  const a = c.U(4);
  const n = 20;
  const step = c.f.w / n;
  p.begin();
  p.moveTo(0, top + a);
  for (let i = 0; i < n; i += 1) {
    p.lineTo(i * step + step / 2, top);
    p.lineTo((i + 1) * step, top + a);
  }
  if (o.bottom) {
    p.lineTo(c.f.w, bot - a);
    for (let i = n; i > 0; i -= 1) {
      p.lineTo(i * step - step / 2, bot);
      p.lineTo((i - 1) * step, bot - a);
    }
  } else {
    p.lineTo(c.f.w, bot);
    p.lineTo(0, bot);
  }
  p.close();
  p.fill(o.color);
}

/** A postage stamp with scalloped edges, the pin and the year. */
export function stamp(p: Painter, c: Ctx, o: { x: number; y: number; w: number; bg: string; col: string; year: string }) {
  const x = c.X(o.x);
  const y = c.Y(o.y);
  const w = c.X(o.w);
  const h = w / 0.82;
  const r = c.U(0.9);
  p.shadow("rgba(0,0,0,0.2)", c.U(0.8), 0, c.U(0.5));
  p.rect(x + r, y + r, w - 2 * r, h - 2 * r, o.bg);
  p.noShadow();
  for (let px = x + r; px <= x + w - r + 0.1; px += 2 * r) {
    for (const py of [y + r, y + h - r]) {
      p.begin();
      p.arc(px, py, r, 0, Math.PI * 2);
      p.fill(o.bg);
    }
  }
  for (let py = y + r; py <= y + h - r + 0.1; py += 2 * r) {
    for (const px of [x + r, x + w - r]) {
      p.begin();
      p.arc(px, py, r, 0, Math.PI * 2);
      p.fill(o.bg);
    }
  }
  p.begin();
  p.rectPath(x + 2 * r, y + 2 * r, w - 4 * r, h - 4 * r);
  p.stroke("rgba(255,255,255,0.7)", c.U(0.35), [], "butt");
  const pin = c.U(5) * (w / c.X(14));
  drawPin(p, x + w / 2 - pin / 2, y + h * 0.26, pin, o.col);
  p.text(o.year, x + w / 2, y + h * 0.26 + pin + c.U(0.6), { font: "display", size: c.U(3) * (w / c.X(14)), color: o.col, align: "center" });
}

/** A round postmark with two short lines of text. */
export function postmark(p: Painter, c: Ctx, o: { x: number; y: number; d: number; col: string; lines: string[]; size: number; rot?: number }) {
  const d = c.U(o.d);
  const cx = c.X(o.x) + d / 2;
  const cy = c.Y(o.y) + d / 2;
  p.save();
  p.translate(cx, cy);
  p.rotate(((o.rot ?? 0) * Math.PI) / 180);
  p.begin();
  p.arc(0, 0, d / 2, 0, Math.PI * 2);
  p.stroke(o.col, c.U(0.45));
  const style: TextStyle = { font: "sans", size: c.U(o.size), color: o.col, weight: 700, align: "center", letterSpacing: 0.12 };
  const lh = style.size * 1.3;
  o.lines.forEach((line, i) => p.text(line, 0, -((o.lines.length * lh) / 2) + i * lh, style));
  p.restore();
}

/** Barcode bars made from text, the same every time for the same text. */
export function barcode(p: Painter, c: Ctx, o: { x?: number; r?: number; y: number; w: number; h: number; seed: string; col: string; op?: number }) {
  const w = c.X(o.w);
  const x0 = o.r != null ? c.f.w - c.X(o.r) - w : c.X(o.x ?? 0);
  const y = c.Y(o.y);
  const h = c.Y(o.h);
  const rnd = mulberry32(hashString(o.seed));
  p.save();
  if (o.op != null) p.alpha(o.op);
  let at = 0;
  while (at < 100) {
    const bar = 0.6 + rnd() * 2.2;
    const gap = 0.5 + rnd() * 1.6;
    p.rect(x0 + (at / 100) * w, y, (Math.min(bar, 100 - at) / 100) * w, h, o.col);
    at += bar + gap;
  }
  p.restore();
}

/** A strip of film with sprocket holes on both long edges. */
export function filmStrip(p: Painter, c: Ctx, o: { x: number; y: number; w: number; h: number; vertical: boolean; color: string; hole: string }) {
  const x = c.X(o.x);
  const y = c.Y(o.y);
  const w = c.X(o.w);
  const h = c.Y(o.h);
  p.begin();
  p.roundRectPath(x, y, w, h, c.U(0.6));
  p.fill(o.color);
  const hole = c.U(1.6);
  const step = c.U(3.6);
  const inset = c.U(1.2);
  if (o.vertical) {
    for (let py = y + c.U(1); py < y + h - hole; py += step) {
      p.rect(x + inset, py, c.U(2.2), hole, o.hole);
      p.rect(x + w - inset - c.U(2.2), py, c.U(2.2), hole, o.hole);
    }
  } else {
    for (let px = x + c.U(1); px < x + w - hole; px += step) {
      p.rect(px, y + inset, hole, c.U(2.2), o.hole);
      p.rect(px, y + h - inset - c.U(2.2), hole, c.U(2.2), o.hole);
    }
  }
}

/** A vertical fade, for legible text over a full-bleed photo. */
export function fade(p: Painter, c: Ctx, color: string, stops: [number, number][]) {
  p.rect(0, 0, c.f.w, c.f.h, { kind: "linear", coords: [0, 0, 0, c.f.h], stops: stops.map(([at, a]) => [at, withAlpha(color, a)] as [number, string]) });
}

/** A title split over at most two lines, as evenly as the words allow. */
export function twoLines(title: string): string {
  const words = title.split(/\s+/).filter(Boolean);
  if (words.length < 2) return title;
  let best = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i += 1) {
    const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (diff < bestDiff) {
      best = i;
      bestDiff = diff;
    }
  }
  return `${words.slice(0, best).join(" ")}\n${words.slice(best).join(" ")}`;
}

/** Joins the parts that are present with " · ". */
export const dotJoin = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** The over layer fades in at the end of the entrance animation. */
export const overAlpha = (t: number) => clamp01((t - 0.45) / 0.35);
