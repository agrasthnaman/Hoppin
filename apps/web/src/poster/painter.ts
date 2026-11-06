import type { Frame, PhotoSource } from "./types";

export interface Gradient {
  kind: "linear" | "radial";
  /** Linear: x0, y0, x1, y1. Radial: x0, y0, r0, x1, y1, r1. */
  coords: number[];
  stops: [number, string][];
}
export type Paint = string | Gradient;

export type FontRole = "display" | "sans" | "serif";
export interface TextStyle {
  font: FontRole;
  /** Pixels. */
  size: number;
  weight?: number;
  color: string;
  align?: "left" | "center" | "right";
  /** In em. */
  letterSpacing?: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The only way templates draw. One implementation paints a real canvas; the other records every call so the brand
 * rules can be tested without pixels.
 */
export interface Painter {
  readonly frame: Frame;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(radians: number): void;
  scale(s: number): void;
  alpha(a: number): void;
  shadow(color: string, blur: number, ox: number, oy: number): void;
  noShadow(): void;
  begin(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadTo(cx: number, cy: number, x: number, y: number): void;
  bezierTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  ellipse(cx: number, cy: number, rx: number, ry: number): void;
  rectPath(x: number, y: number, w: number, h: number): void;
  roundRectPath(x: number, y: number, w: number, h: number, r: number): void;
  close(): void;
  fill(paint: Paint): void;
  stroke(paint: string, width: number, dash?: number[], cap?: "round" | "butt"): void;
  clip(): void;
  rect(x: number, y: number, w: number, h: number, paint: Paint): void;
  /** Draws with the top of the text at `y`. */
  text(str: string, x: number, y: number, style: TextStyle): void;
  measure(str: string, style: TextStyle): number;
  image(src: PhotoSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
  /** Tells the tests what a group of calls was: the lockup, a hop route, the web address. */
  mark(kind: "lockup" | "hop" | "address", box: Box): void;
}

export const FONT_FAMILY: Record<FontRole, string> = {
  display: '"Bricolage Grotesque Variable", "Bricolage Grotesque", "Inter Variable", sans-serif',
  sans: '"Inter Variable", Inter, system-ui, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
};

export function fontString(style: TextStyle): string {
  const weight = style.weight ?? (style.font === "display" ? 800 : style.font === "serif" ? 500 : 500);
  return `${style.font === "serif" ? "italic " : ""}${weight} ${style.size}px ${FONT_FAMILY[style.font]}`;
}

const defaultSpacing = (style: TextStyle) => style.letterSpacing ?? (style.font === "display" ? -0.04 : style.font === "serif" ? -0.02 : 0);

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Paints a real canvas. Coordinates are poster pixels; `scale` maps them onto a smaller preview canvas. */
export class CanvasPainter implements Painter {
  private gAlpha: number[] = [1];
  constructor(
    private readonly ctx: Ctx2D,
    readonly frame: Frame,
    scale = 1,
  ) {
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.textBaseline = "top";
    ctx.imageSmoothingQuality = "high";
  }
  save() {
    this.ctx.save();
    this.gAlpha.push(this.ctx.globalAlpha);
  }
  restore() {
    this.ctx.restore();
    this.gAlpha.pop();
  }
  translate(x: number, y: number) {
    this.ctx.translate(x, y);
  }
  rotate(r: number) {
    this.ctx.rotate(r);
  }
  scale(s: number) {
    this.ctx.scale(s, s);
  }
  alpha(a: number) {
    this.ctx.globalAlpha = this.ctx.globalAlpha * a;
  }
  shadow(color: string, blur: number, ox: number, oy: number) {
    const m = this.ctx.getTransform();
    const k = Math.hypot(m.a, m.b) || 1; // shadows ignore the transform, so scale them by hand
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = blur * k;
    this.ctx.shadowOffsetX = ox * k;
    this.ctx.shadowOffsetY = oy * k;
  }
  noShadow() {
    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;
    this.ctx.shadowOffsetX = 0;
    this.ctx.shadowOffsetY = 0;
  }
  begin() {
    this.ctx.beginPath();
  }
  moveTo(x: number, y: number) {
    this.ctx.moveTo(x, y);
  }
  lineTo(x: number, y: number) {
    this.ctx.lineTo(x, y);
  }
  quadTo(cx: number, cy: number, x: number, y: number) {
    this.ctx.quadraticCurveTo(cx, cy, x, y);
  }
  bezierTo(a: number, b: number, c: number, d: number, x: number, y: number) {
    this.ctx.bezierCurveTo(a, b, c, d, x, y);
  }
  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false) {
    this.ctx.arc(cx, cy, Math.max(0, r), a0, a1, ccw);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number) {
    this.ctx.ellipse(cx, cy, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  }
  rectPath(x: number, y: number, w: number, h: number) {
    this.ctx.rect(x, y, w, h);
  }
  roundRectPath(x: number, y: number, w: number, h: number, r: number) {
    const rr = Math.max(0, Math.min(r, w / 2, h / 2));
    this.ctx.moveTo(x + rr, y);
    this.ctx.arcTo(x + w, y, x + w, y + h, rr);
    this.ctx.arcTo(x + w, y + h, x, y + h, rr);
    this.ctx.arcTo(x, y + h, x, y, rr);
    this.ctx.arcTo(x, y, x + w, y, rr);
    this.ctx.closePath();
  }
  close() {
    this.ctx.closePath();
  }
  private paint(p: Paint): string | CanvasGradient {
    if (typeof p === "string") return p;
    const c = p.coords;
    const g =
      p.kind === "linear"
        ? this.ctx.createLinearGradient(c[0]!, c[1]!, c[2]!, c[3]!)
        : this.ctx.createRadialGradient(c[0]!, c[1]!, c[2]!, c[3]!, c[4]!, c[5]!);
    for (const [at, color] of p.stops) g.addColorStop(at, color);
    return g;
  }
  fill(p: Paint) {
    this.ctx.fillStyle = this.paint(p);
    this.ctx.fill();
  }
  stroke(p: string, width: number, dash: number[] = [], cap: "round" | "butt" = "round") {
    this.ctx.strokeStyle = p;
    this.ctx.lineWidth = width;
    this.ctx.lineCap = cap;
    this.ctx.lineJoin = "round";
    this.ctx.setLineDash(dash);
    this.ctx.stroke();
    this.ctx.setLineDash([]);
  }
  clip() {
    this.ctx.clip();
  }
  rect(x: number, y: number, w: number, h: number, p: Paint) {
    this.ctx.fillStyle = this.paint(p);
    this.ctx.fillRect(x, y, w, h);
  }
  private font(style: TextStyle) {
    this.ctx.font = fontString(style);
    if ("letterSpacing" in this.ctx) (this.ctx as { letterSpacing: string }).letterSpacing = `${defaultSpacing(style) * style.size}px`;
  }
  text(str: string, x: number, y: number, style: TextStyle) {
    this.font(style);
    this.ctx.fillStyle = style.color;
    this.ctx.textAlign = style.align ?? "left";
    this.ctx.fillText(str, x, y);
  }
  measure(str: string, style: TextStyle) {
    this.font(style);
    return this.ctx.measureText(str).width;
  }
  image(src: PhotoSource, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) {
    this.ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  mark() {}
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export type Recorded =
  | { op: "text"; str: string; box: Box; style: TextStyle }
  | { op: "image"; box: Box }
  | { op: "fill" | "stroke"; colors: string[] }
  | { op: "mark"; kind: "lockup" | "hop" | "address"; box: Box };

/** Records what a template drew, in poster coordinates, so tests can check the brand rules. Text width is estimated. */
export class RecordingPainter implements Painter {
  readonly calls: Recorded[] = [];
  private m: Matrix = [1, 0, 0, 1, 0, 0];
  private stack: Matrix[] = [];
  constructor(readonly frame: Frame) {}
  private boxOf(x: number, y: number, w: number, h: number): Box {
    const pts = [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ].map(([px, py]) => [this.m[0] * px! + this.m[2] * py! + this.m[4], this.m[1] * px! + this.m[3] * py! + this.m[5]] as const);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }
  save() {
    this.stack.push(this.m);
  }
  restore() {
    this.m = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
  }
  translate(x: number, y: number) {
    this.m = multiply(this.m, [1, 0, 0, 1, x, y]);
  }
  rotate(r: number) {
    this.m = multiply(this.m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
  }
  scale(s: number) {
    this.m = multiply(this.m, [s, 0, 0, s, 0, 0]);
  }
  alpha() {}
  shadow() {}
  noShadow() {}
  begin() {}
  moveTo() {}
  lineTo() {}
  quadTo() {}
  bezierTo() {}
  arc() {}
  ellipse() {}
  rectPath() {}
  roundRectPath() {}
  close() {}
  private colorsOf(p: Paint): string[] {
    return typeof p === "string" ? [p] : p.stops.map((s) => s[1]);
  }
  fill(p: Paint) {
    this.calls.push({ op: "fill", colors: this.colorsOf(p) });
  }
  stroke(p: string) {
    this.calls.push({ op: "stroke", colors: [p] });
  }
  clip() {}
  rect(_x: number, _y: number, _w: number, _h: number, p: Paint) {
    this.calls.push({ op: "fill", colors: this.colorsOf(p) });
  }
  text(str: string, x: number, y: number, style: TextStyle) {
    const w = this.measure(str, style);
    const left = style.align === "center" ? x - w / 2 : style.align === "right" ? x - w : x;
    this.calls.push({ op: "text", str, box: this.boxOf(left, y, w, style.size), style });
    this.calls.push({ op: "fill", colors: [style.color] });
  }
  measure(str: string, style: TextStyle) {
    const per = style.font === "display" ? 0.56 : style.font === "serif" ? 0.48 : 0.55;
    return str.length * style.size * (per + (style.letterSpacing ?? 0));
  }
  image(_src: PhotoSource, _sx: number, _sy: number, _sw: number, _sh: number, dx: number, dy: number, dw: number, dh: number) {
    this.calls.push({ op: "image", box: this.boxOf(dx, dy, dw, dh) });
  }
  mark(kind: "lockup" | "hop" | "address", box: Box) {
    this.calls.push({ op: "mark", kind, box: this.boxOf(box.x, box.y, box.w, box.h) });
  }
}
