import { addr, barcode, card, dotJoin, dots, fade, fillAll, gridLines, hops, lockup, pill, postmark, scallopRect, sticker, txt } from "../kit";
import type { TextStyle } from "../painter";
import { withAlpha } from "../palette";
import type { Ctx, PosterTemplate } from "../types";

// One-photo templates, after the most-used single-photo story formats: instant photo, boarding pass, sticky note,
// cinema still, magazine cover and postage stamp.

const stat = (c: Ctx, i: number) => c.d.stats[i] ?? { n: "", l: "" };
const statLine = (c: Ctx) => c.d.stats.map((s) => `${s.n} ${s.l.split(" ")[0]}`).join(" · ");

export const instant: PosterTemplate = {
  id: "instant",
  name: "Big Polaroid",
  mood: "funky",
  photos: 1,
  isNew: true,
  jitter: 2,
  blurb: "One big tilted instant photo with tape and a handwritten caption.",
  slots: (c) => [c.sq ? { x: 22, y: 8, w: 56, h: 70, r: -4, f: "polaroid", tape: c.P.accent } : { x: 12, y: 21, w: 76, h: 50, r: -4, f: "polaroid", tape: c.P.accent }],
  under: (p, c) => {
    fillAll(p, c, c.P.s2);
    dots(p, c, { color: withAlpha(c.P.accent, 0.2), r: 0.5, gap: 4.5 });
    hops(p, c, { x: 4, y: c.v(18, 6), w: 92, h: c.v(58, 76) }, [{ pts: [[0.03, 0.92], [0.12, 0.04], [0.88, 0.02], [0.98, 0.8]], col: c.P.accent }], { sw: 0.8, bend: 0.25 });
  },
  over: (p, c) => {
    const { P, d } = c;
    lockup(p, c, c.sq ? { x: 5, y: 4, col: P.ink, bg: P.surface, size: 3.4, rot: -3 } : { x: 7, y: 13.8, col: P.ink, bg: P.surface, size: 3.8, rot: -3 });
    sticker(p, c, { x: c.v(71, 78), y: c.v(15.5, 4), w: c.v(16, 13), bg: P.accent, col: P.accentFg, rot: 12, big: String(stat(c, 0).n), small: stat(c, 0).l });
    txt(p, c, d.title, { x: 0, w: 100, al: "center", y: c.v(72.6, 80.5), size: c.v(9, 6), font: "i", col: P.ink, rot: -2, ell: true });
    txt(p, c, dotJoin(d.dates, statLine(c)), { x: c.v(7, 5), y: c.v(79, 92), size: c.v(2.6, 2.4), col: P.muted, wt: 600, w: c.v(52, 55), ell: true });
    addr(p, c, { r: c.v(7, 5), y: c.v(78.6, 91.5), col: P.ink });
  },
};

export const pass: PosterTemplate = {
  id: "pass",
  name: "Boarding Pass",
  mood: "funky",
  photos: 1,
  isNew: true,
  blurb: "A boarding pass with your photo as the header, codes, gates and a barcode.",
  slots: (c) => [{ x: 11, y: c.v(19.5, 6.5), w: 78, h: c.v(20, 26), f: "plain", rad: 1.6 }],
  under: (p, c) => {
    const { P } = c;
    fillAll(p, c, P.hero);
    dots(p, c, { color: withAlpha(P.heroMuted, 0.2), r: 0.42, gap: 4 });
    card(p, c, { x: 8, y: c.v(17, 4), w: 84, h: c.v(64, 91), fill: P.surface, radius: 3 });
    const ty = c.v(66.5, 68);
    for (const x of [8, 92]) {
      p.begin();
      p.arc(c.X(x), c.Y(ty), c.U(2.8), 0, Math.PI * 2);
      p.fill(P.hero);
    }
    p.begin();
    p.moveTo(c.X(12), c.Y(ty));
    p.lineTo(c.X(88), c.Y(ty));
    p.stroke(P.line, c.U(0.4), [c.U(1.2), c.U(1)], "butt");
  },
  over: (p, c) => {
    const { P, d } = c;
    const y = c.sq ? { bp: 34.5, title: 37.3, label: 45, code: 46.8, name: 55.2, fl: 58.6, fv: 60.6, bar: 70.8, addr: 85 } : { bp: 41.6, title: 44.3, label: 50.2, code: 51.8, name: 57.8, fl: 60.4, fv: 61.8, bar: 68.6, addr: 75.4 };
    txt(p, c, "BOARDING PASS", { x: 11, y: y.bp, size: 2.3, col: P.muted, ls: 0.22, wt: 700 });
    lockup(p, c, { r: 11, y: y.bp - 0.6, col: P.ink, size: 3.4 });
    txt(p, c, d.title, { x: 11, y: y.title, size: c.v(8, 6.5), font: "d", col: P.ink, w: 78, ell: true });
    txt(p, c, "FROM", { x: 11, y: y.label, size: 2.1, col: P.muted, ls: 0.2, wt: 700 });
    txt(p, c, "TO", { r: 11, y: y.label, size: 2.1, col: P.muted, ls: 0.2, wt: 700 });
    txt(p, c, d.from[0], { x: 11, y: y.code, size: c.v(10, 8), font: "d", col: P.ink });
    txt(p, c, d.to[0], { r: 11, y: y.code, size: c.v(10, 8), font: "d", col: P.ink });
    txt(p, c, d.from[1], { x: 11, y: y.name, size: 2.4, col: P.muted, w: 28, ell: true });
    txt(p, c, d.to[1], { r: 11, y: y.name, size: 2.4, col: P.muted, w: 28, ell: true });
    hops(p, c, { x: 34, y: y.code + c.v(0.6, 1), w: 32, h: c.v(3.4, 5) }, [{ pts: [[0, 0.9], [1, 0.9]], col: P.accent }], { sw: 1.6, bend: 0.4 });
    d.fields.forEach(([k, v], i) => {
      txt(p, c, k, { x: 11 + i * 20, y: y.fl, size: 2, col: P.muted, ls: 0.18, wt: 700 });
      txt(p, c, v, { x: 11 + i * 20, y: y.fv, size: c.v(5, 4.4), font: "d", col: P.ink });
    });
    barcode(p, c, { x: 11, y: y.bar, w: 48, h: c.v(4.6, 7), seed: d.title + d.dates, col: P.ink });
    txt(p, c, `GATE ${Math.max(1, d.stops.length)} · SEAT 1A`, { r: 11, y: y.bar + 0.3, size: 2.4, col: P.ink, wt: 700, ls: 0.1 });
    if (d.dates) txt(p, c, d.dates, { r: 11, y: y.bar + c.v(2.6, 4), size: 2.2, col: P.muted, w: 26, ell: true });
    addr(p, c, { x: 11, y: y.addr, col: P.ink });
  },
};

export const sticky: PosterTemplate = {
  id: "sticky",
  name: "Sticky Note",
  mood: "funky",
  photos: 1,
  isNew: true,
  blurb: "A big taped photo with a sticky note slapped on top, written like a diary.",
  slots: (c) => [c.sq ? { x: 6, y: 6, w: 60, h: 72, r: -2, f: "inset", tape: withAlpha(c.P.accent, 0.85) } : { x: 7, y: 18, w: 86, h: 44, r: 2, f: "inset", tape: withAlpha(c.P.accent, 0.85) }],
  under: (p, c) => {
    fillAll(p, c, c.P.bg);
    gridLines(p, c, withAlpha(c.P.line, 0.6), 4);
  },
  over: (p, c) => {
    const { P, d } = c;
    const n = c.sq ? { x: 56, y: 48, w: 39 } : { x: 47, y: 55.5, w: 45 };
    const nw = c.X(n.w);
    const nx = c.X(n.x);
    const ny = c.Y(n.y);
    p.save();
    p.translate(nx + nw / 2, ny + nw / 2);
    p.rotate((4 * Math.PI) / 180);
    p.shadow("rgba(0,0,0,0.22)", c.U(2.6), c.U(0.6), c.U(1.6));
    p.rect(-nw / 2, -nw / 2, nw, nw, P.hl);
    p.noShadow();
    p.rect(-nw / 2, -nw / 2, nw, nw * 0.12, withAlpha(P.ink, 0.06));
    const pad = c.U(3.2);
    let y = -nw / 2 + nw * 0.16;
    const head: TextStyle = { font: "serif", size: c.U(c.v(7.5, 6)), color: P.ink };
    const title = d.title.length > 16 ? d.dest : d.title;
    p.text(title, -nw / 2 + pad, y, head);
    y += head.size * 1.25;
    const line: TextStyle = { font: "sans", size: c.U(c.v(3.2, 2.7)), weight: 700, color: P.ink };
    for (const s of d.stats) {
      p.text(`✓ ${s.n} ${s.l}`, -nw / 2 + pad, y, line);
      y += line.size * 1.45;
    }
    if (d.dates) p.text(d.dates, -nw / 2 + pad, y + c.U(0.6), { font: "serif", size: c.U(c.v(2.6, 2.3)), color: P.muted });
    p.restore();

    lockup(p, c, c.sq ? { x: 6, y: 82.5, col: P.ink, size: 3.8 } : { x: 7, y: 13.6, col: P.ink, size: 3.8 });
    if (!c.sq && d.who) {
      txt(p, c, `with ${d.who}`, { x: 7, y: 65.5, size: 3.4, font: "i", col: P.ink, w: 38, wrap: true, lh: 1.3 });
      hops(p, c, { x: 26, y: 72.5, w: 20, h: 4 }, [{ pts: [[0, 0.2], [1, 0.6]], col: P.ink }], { sw: 2, bend: 0.5 });
    }
    addr(p, c, c.sq ? { x: 6, y: 90.5, col: P.ink } : { x: 7, y: 78.6, col: P.ink });
    if (c.sq) hops(p, c, { x: 30, y: 86, w: 20, h: 4 }, [{ pts: [[0, 0.8], [1, 0.3]], col: P.accent }], { sw: 2, bend: 0.5 });
  },
};

export const cinema: PosterTemplate = {
  id: "cinema",
  name: "Cinema Still",
  mood: "aesthetic",
  photos: 1,
  isNew: true,
  blurb: "Your photo as a widescreen movie still, with a subtitle and opening credits.",
  // Drawn full-bleed under the letterbox bars, so moving or zooming the photo always fills the frame.
  slots: () => [{ x: 0, y: 0, w: 100, h: 100, f: "plain", back: true }],
  under: (p, c) => fillAll(p, c, c.P.ink),
  over: (p, c) => {
    const { P, d } = c;
    const W = "#ffffff";
    const top = c.v(28, 20);
    const h = c.v(36, 52);
    lockup(p, c, { center: true, y: c.v(14, 3.5), col: P.bg, size: 4 });
    txt(p, c, `${d.crew} TRAVELLERS PRESENT`, { x: 0, w: 100, al: "center", y: c.v(19.4, 9.6), size: 2.1, col: P.bg, ls: 0.3, wt: 600, op: 0.7 });
    txt(p, c, d.title, { x: 5, w: 90, al: "center", y: c.v(22.2, 12.4), size: c.v(8.5, 6.5), font: "d", wt: 500, col: P.bg, ell: true });
    const sub = d.dates ? `${d.dest}, ${d.dates}` : d.dest;
    const subStyle: TextStyle = { font: "sans", size: c.U(c.v(3.2, 2.8)), weight: 600, color: P.hl, align: "center" };
    const subW = Math.min(c.X(86), p.measure(sub, subStyle) + c.U(4));
    const subY = c.Y(top + h) - c.U(c.v(9, 8));
    p.rect(c.f.w / 2 - subW / 2, subY - c.U(1), subW, subStyle.size + c.U(2), "rgba(0,0,0,0.5)");
    txt(p, c, sub, { x: 7, w: 86, al: "center", y: (subY / c.f.h) * 100, size: c.v(3.2, 2.8), col: P.hl, wt: 600, ell: true });
    const m = c.U(3);
    const k = c.U(5);
    const x0 = m;
    const x1 = c.f.w - m;
    const y0 = c.Y(top) + m;
    const y1 = c.Y(top + h) - m;
    p.save();
    p.alpha(0.75);
    for (const [cx, cy, dx, dy] of [
      [x0, y0, 1, 1],
      [x1, y0, -1, 1],
      [x0, y1, 1, -1],
      [x1, y1, -1, -1],
    ] as const) {
      p.begin();
      p.moveTo(cx, cy + dy * k);
      p.lineTo(cx, cy);
      p.lineTo(cx + dx * k, cy);
      p.stroke(W, c.U(0.4), [], "butt");
    }
    p.restore();
    if (d.stamp) txt(p, c, d.stamp, { r: 6, y: top + 2.2, size: 2.2, col: P.accent, wt: 700, ls: 0.1 });
    txt(p, c, statLine(c).toUpperCase(), { x: 0, w: 100, al: "center", y: c.v(67.5, 77), size: c.v(2.4, 2.2), col: P.bg, ls: 0.25, wt: 600, op: 0.8 });
    hops(p, c, { x: 30, y: c.v(72, 84), w: 40, h: c.v(1.6, 2.4) }, [{ pts: [[0, 0.9], [0.5, 0.9], [1, 0.9]], col: P.accent }], { sw: 1.4, bend: 0.2 });
    addr(p, c, { x: 0, w: 100, al: "center", y: c.v(78.4, 89.5), col: P.bg });
  },
  mid: (p, c) => {
    // Letterbox: black bars cover the full-bleed photo above and below the widescreen frame.
    const top = c.Y(c.v(28, 20));
    const bottom = c.Y(c.v(64, 72));
    p.rect(0, 0, c.f.w, top, c.P.ink);
    p.rect(0, bottom, c.f.w, c.f.h - bottom, c.P.ink);
  },
};

export const solo: PosterTemplate = {
  id: "solo",
  name: "Solo Cover",
  mood: "aesthetic",
  photos: 1,
  isNew: true,
  blurb: "One full-bleed photo as a magazine cover: big masthead, headline and cover lines.",
  slots: () => [{ x: 0, y: 0, w: 100, h: 100, f: "plain", back: true }],
  under: (p, c) => fillAll(p, c, c.P.ink),
  mid: (p, c) => fade(p, c, c.P.ink, [[0, 0.65], [0.3, 0], [0.5, 0], [1, 0.88]]),
  over: (p, c) => {
    const { P, d } = c;
    const W = "#ffffff";
    lockup(p, c, { center: true, y: c.v(13.4, 3.5), col: W, size: c.v(19, 15) });
    txt(p, c, dotJoin(d.dest.toUpperCase(), d.short, "THE TRAVEL ISSUE"), { x: 0, w: 100, al: "center", y: c.v(24.4, 20), size: 2.4, col: W, ls: 0.3, wt: 700, op: 0.9 });
    hops(p, c, { x: 32, y: c.v(26.6, 24.5), w: 36, h: c.v(2, 3) }, [{ pts: [[0, 0.8], [0.5, 0.8], [1, 0.8]], col: P.accent }], { sw: 1.3, bend: 0.5 });
    pill(p, c, { x: 6, y: c.v(51.6, 50.5), text: "COVER STORY", size: 2.4, bg: P.accent, col: P.accentFg });
    txt(p, c, d.title, { x: 6, y: c.v(56, 57.5), size: c.v(13, 10), font: "d", col: W, w: 88, ell: true });
    txt(p, c, statLine(c), { x: 6, y: c.v(64.6, 69), size: c.v(3.4, 3), col: W, wt: 700, w: 88, ell: true });
    if (d.stops.length) txt(p, c, `Inside: ${d.stops.join(", ")}`, { x: 6, y: c.v(68.8, 74.5), size: c.v(2.8, 2.6), col: W, w: c.v(62, 58), wrap: true, lh: 1.35, op: 0.9 });
    barcode(p, c, { r: 6, y: c.v(74.8, 87), w: c.v(22, 20), h: c.v(2.4, 3.5), seed: d.title, col: W, op: 0.9 });
    addr(p, c, { x: 6, y: c.v(78.6, 91), col: W });
  },
};

export const postage: PosterTemplate = {
  id: "postage",
  name: "Postage Stamp",
  mood: "aesthetic",
  photos: 1,
  isNew: true,
  blurb: "Your photo on a big perforated stamp, cancelled with the trip's postmark.",
  slots: (c) => [c.sq ? { x: 27.5, y: 13.5, w: 45, h: 61, f: "plain" } : { x: 17, y: 24, w: 66, h: 44, f: "plain" }],
  under: (p, c) => {
    fillAll(p, c, { kind: "linear", coords: [0, 0, c.f.w * 0.3, c.f.h], stops: [[0, c.P.s2], [1, c.P.bg]] });
    if (c.sq) scallopRect(p, c, { x: 24, y: 10, w: 52, h: 68, color: c.P.surface, r: 1.3 });
    else scallopRect(p, c, { x: 13.5, y: 21.5, w: 73, h: 49, color: c.P.surface, r: 1.3 });
  },
  over: (p, c) => {
    const { P, d } = c;
    const W = "#ffffff";
    const ph = c.sq ? { x: 27.5, y: 13.5, w: 45, h: 61 } : { x: 17, y: 24, w: 66, h: 44 };
    sticker(p, c, { x: ph.x + ph.w - c.v(14, 11), y: ph.y + c.v(1.5, 2), w: c.v(12, 9.5), bg: P.accent, col: P.accentFg, rot: 8, big: String(stat(c, 0).n), small: stat(c, 0).l });
    p.save();
    p.shadow("rgba(0,0,0,0.5)", c.U(1.2), 0, c.U(0.3));
    txt(p, c, d.dest.toUpperCase(), { x: ph.x + 2.5, y: ph.y + ph.h - c.v(6.4, 9.6), size: c.v(7.5, 5.5), font: "d", col: W, w: ph.w - 5, ell: true });
    txt(p, c, d.year, { x: ph.x + 2.5, y: ph.y + ph.h - c.v(2.4, 3.6), size: 2.2, col: W, wt: 700, ls: 0.2 });
    p.restore();
    postmark(p, c, { x: c.v(62, 66), y: c.v(15.6, 3), d: c.v(24, 18), col: withAlpha(P.ink, 0.7), lines: [d.dest.toUpperCase().slice(0, 12), d.short || d.year], size: c.v(2.4, 2), rot: -12 });
    for (const dy of [0, c.v(2.4, 3)]) {
      hops(p, c, { x: c.v(28, 34), y: c.v(19.4, 7) + dy, w: c.v(34, 32), h: c.v(2, 2.6) }, [{ pts: [[0, 0.5], [0.33, 0.5], [0.66, 0.5], [1, 0.5]], col: withAlpha(P.ink, 0.55) }], { sw: 1, bend: 0.45, dots: false });
    }
    lockup(p, c, { center: true, y: c.v(72.8, 82), col: P.ink, size: c.v(4.4, 4) });
    if (!c.sq && (d.dates || d.who)) txt(p, c, dotJoin(d.dates, d.who && `with ${d.who}`), { x: 6, w: 88, al: "center", y: 76.3, size: 2.6, col: P.muted, ell: true });
    addr(p, c, { x: 0, w: 100, al: "center", y: c.v(79.3, 89.6), col: P.muted });
  },
};
