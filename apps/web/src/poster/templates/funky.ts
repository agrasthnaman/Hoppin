import { addr, barcode, card, dotJoin, dots, fillAll, glow, gridLines, hops, lockup, pill, statRow, sticker, stripes, twoLines, txt, zigzag } from "../kit";
import type { TextStyle } from "../painter";
import { withAlpha } from "../palette";
import { wrapLines } from "../text";
import type { Ctx, PosterTemplate, SlotSpec } from "../types";

const stat = (c: Ctx, i: number) => c.d.stats[i] ?? { n: "", l: "" };

export const luggage: PosterTemplate = {
  id: "luggage",
  name: "Luggage Tags",
  mood: "funky",
  photos: 2,
  isNew: true,
  blurb: "Two photos as luggage tags on strings, with airport-style codes.",
  slots: (c) => {
    const colors = { card: c.P.surface, hole: c.P.asoft, string: c.P.ink, cap: c.P.ink };
    const cap = (pair: [string, string]) => `${pair[1].toUpperCase()} · ${pair[0]}`;
    return c.sq
      ? [
          { x: 7, y: 15, w: 40, h: 62, r: -7, f: "tag", cap: cap(c.d.from), colors },
          { x: 53, y: 20, w: 40, h: 62, r: 6, f: "tag", cap: cap(c.d.to), colors },
        ]
      : [
          { x: 6, y: 20.5, w: 46, h: 36, r: -7, f: "tag", cap: cap(c.d.from), colors },
          { x: 48, y: 29, w: 46, h: 36, r: 6, f: "tag", cap: cap(c.d.to), colors },
        ];
  },
  under: (p, c) => {
    fillAll(p, c, c.P.asoft);
    dots(p, c, { color: withAlpha(c.P.accent, 0.22), r: 0.55, gap: 5 });
    hops(p, c, { x: 22, y: c.v(61.5, 82), w: 56, h: c.v(4, 6) }, [{ pts: [[0, 0.8], [1, 0.8]], col: c.P.accent }], { sw: 1.2, bend: 0.25 });
  },
  over: (p, c) => {
    const { P, d } = c;
    lockup(p, c, c.sq ? { x: 6, y: 4, col: P.ink, size: 4.2 } : { r: 7, y: 13.6, col: P.ink, size: 4.2 });
    sticker(p, c, { x: c.v(68, 72), y: c.v(58, 70), w: c.v(20, 17), bg: P.accent, col: P.accentFg, rot: 12, big: String(stat(c, 2).n), small: stat(c, 2).l });
    txt(p, c, d.title, { x: c.v(7, 6), y: c.v(66.8, 84), size: c.v(10.5, 8), font: "d", col: P.ink, w: 60, ell: true });
    txt(p, c, dotJoin(d.dates, d.showNames && `${d.crew} travellers`), { x: c.v(7, 6), y: c.v(73.4, 92), size: c.v(3.2, 2.8), font: "i", col: P.muted, w: 60, ell: true });
    addr(p, c, c.sq ? { r: 6, y: 4.5, col: P.ink, size: 3 } : { x: 7, y: 78.6, col: P.ink });
  },
};

export const windows: PosterTemplate = {
  id: "windows",
  name: "Plane Windows",
  mood: "funky",
  photos: 3,
  isNew: true,
  blurb: "Three photos in a row of airplane windows: the window-seat view.",
  slots: (c) => [6, 36.5, 67].map((x): SlotSpec => ({ x, y: c.v(33, 30), w: 27, h: c.v(30, 46), f: "window", colors: { frame: c.P.surface } })),
  under: (p, c) => {
    fillAll(p, c, c.P.hero);
    glow(p, c, { x: 18, y: 88, rx: 40, color: withAlpha(c.P.heroMuted, 0.25) });
    glow(p, c, { x: 85, y: 12, rx: 35, color: withAlpha(c.P.heroMuted, 0.2) });
    hops(p, c, { x: 8, y: c.v(27.6, 23), w: 84, h: c.v(4, 5) }, [{ pts: [[0, 0.9], [0.5, 0.9], [1, 0.9]], col: c.P.accent, dot: c.P.hl }], { sw: 1, bend: 0.45 });
  },
  over: (p, c) => {
    const { P, d } = c;
    txt(p, c, "Window seat views", { x: 7, y: c.v(14.4, 4), size: c.v(4.2, 3.6), font: "i", col: P.heroMuted });
    lockup(p, c, { y: c.v(14, 4), r: 6, col: P.heroFg, size: 4.2 });
    txt(p, c, d.title, { x: 7, y: c.v(18.6, 9.5), size: c.v(11, 9), font: "d", col: P.heroFg, w: 86, ell: true });
    statRow(p, c, { y: c.v(66, 80), col: P.heroFg, sub: P.heroMuted, size: c.v(7, 6) });
    if (d.who) txt(p, c, `with ${d.who}`, { x: c.v(7, 52), y: c.v(75.2, 83), size: c.v(3, 2.6), col: P.heroMuted, w: c.v(86, 42), ell: true });
    addr(p, c, { x: c.v(7, 52), y: c.v(78.6, 90.5), col: P.heroFg });
  },
};

export const ticket: PosterTemplate = {
  id: "ticket",
  name: "Ticket Stub",
  mood: "funky",
  photos: 3,
  blurb: "The trip as a boarding pass, with a photo strip, gates and a route barcode.",
  slots: (c) => [11.5, 38, 64.5].map((x): SlotSpec => ({ x, y: c.v(50.6, 52), w: 24, h: c.v(15.5, 21), f: "plain", rad: 1.2 })),
  under: (p, c) => {
    const { P } = c;
    stripes(p, c, P.accent, withAlpha(P.accent, 0.88), 3);
    const y = c.v(17, 5);
    const h = c.v(62, 90);
    const bh = c.v(13.5, 20);
    const ty = c.v(68.2, 76.5);
    card(p, c, { x: 7, y, w: 86, h, fill: P.surface, radius: 3 });
    p.save();
    p.begin();
    p.roundRectPath(c.X(7), c.Y(y), c.X(86), c.Y(h), c.U(3));
    p.clip();
    p.rect(c.X(7), c.Y(y), c.X(86), c.Y(bh), P.hero);
    p.restore();
    for (const x of [7, 93]) {
      p.begin();
      p.arc(c.X(x), c.Y(ty), c.U(2.8), 0, Math.PI * 2);
      p.fill(P.accent);
    }
    p.begin();
    p.moveTo(c.X(11), c.Y(ty));
    p.lineTo(c.X(89), c.Y(ty));
    p.stroke(P.line, c.U(0.4), [c.U(1.2), c.U(1)], "butt");
  },
  over: (p, c) => {
    const { P, d } = c;
    const codes = c.sq ? { l: 27, c: 29.2, n: 38.4 } : { l: 31.6, c: 33.4, n: 39.4 };
    const f = c.sq ? { l: 42.4, v: 44.6 } : { l: 43.3, v: 45 };
    lockup(p, c, { y: c.v(19.2, 8), x: 11, col: P.heroFg, size: 3.8 });
    txt(p, c, "BOARDING PASS", { r: 11, y: c.v(19.8, 8.8), size: 2.3, col: P.heroMuted, ls: 0.22, wt: 700 });
    txt(p, c, d.title, { x: 11, y: c.v(24.6, 14), size: c.v(8.5, 7.5), font: "d", col: P.heroFg, w: 78, ell: true });
    txt(p, c, "FROM", { x: 11, y: codes.l, size: 2.1, col: P.muted, ls: 0.2, wt: 700 });
    txt(p, c, "TO", { r: 11, y: codes.l, size: 2.1, col: P.muted, ls: 0.2, wt: 700 });
    txt(p, c, d.from[0], { x: 11, y: codes.c, size: c.v(11, 9), font: "d", col: P.ink });
    txt(p, c, d.to[0], { r: 11, y: codes.c, size: c.v(11, 9), font: "d", col: P.ink });
    txt(p, c, d.from[1], { x: 11, y: codes.n, size: 2.5, col: P.muted, w: 28, ell: true });
    txt(p, c, d.to[1], { r: 11, y: codes.n, size: 2.5, col: P.muted, w: 28, ell: true });
    hops(p, c, { x: 34, y: c.v(34, 29.5), w: 32, h: c.v(3.6, 6) }, [{ pts: [[0, 0.9], [1, 0.9]], col: P.accent }], { sw: 1.6, bend: 0.4 });
    d.fields.forEach(([k, v], i) => {
      txt(p, c, k, { x: 11 + i * 20, y: f.l, size: 2, col: P.muted, ls: 0.18, wt: 700 });
      txt(p, c, v, { x: 11 + i * 20, y: f.v, size: c.v(5, 4.4), font: "d", col: P.ink });
    });
    barcode(p, c, { x: 11, y: c.v(70.6, 79.6), w: 50, h: c.v(4.6, 6), seed: d.title + d.dates, col: P.ink });
    txt(p, c, `GATE ${Math.max(1, d.stops.length)} · SEAT 1A`, { r: 11, y: c.v(71, 80), size: 2.4, col: P.ink, wt: 700, ls: 0.1 });
    txt(p, c, d.stops.slice(0, 2).map((s, i) => `${i + 1} ${s}`).join("\n"), { r: 11, y: c.v(73.4, 83.5), size: 2.1, col: P.muted, lh: 1.4, w: 24, ell: true });
    addr(p, c, { x: 11, y: c.v(76, 87), col: P.ink });
  },
};

export const booth: PosterTemplate = {
  id: "booth",
  name: "Photo Booth",
  mood: "funky",
  photos: 4,
  jitter: 1.4,
  blurb: "A cream photo-booth strip of four frames with date stamps.",
  slots: (c) =>
    c.v([17.6, 33.4, 49.2, 65], [6, 28.4, 50.8, 73.2]).map((y): SlotSpec => ({ x: c.v(12, 8.5), y, w: c.v(32, 25), h: c.v(14.6, 20.6), f: "booth", cap: c.d.stamp, colors: { stamp: c.P.accent } })),
  under: (p, c) => {
    fillAll(p, c, c.P.hl);
    dots(p, c, { color: withAlpha(c.P.ink, 0.12), r: 0.5, gap: 4.5 });
    card(p, c, { x: c.v(9, 6), y: c.v(15.6, 3.5), w: c.v(38, 30), h: c.v(66, 93), fill: c.P.surface, radius: 1.6 });
  },
  over: (p, c) => {
    const { P, d } = c;
    const x = c.v(52, 42);
    lockup(p, c, { x: c.v(13, 42), y: c.v(13.8, 5), col: P.hl, bg: P.ink, size: 3.4, rot: -5 });
    txt(p, c, twoLines(d.title).toUpperCase(), { x, y: c.v(22, 14), size: c.v(12.5, 10), font: "d", col: P.ink, lh: 0.86, w: c.v(44, 54), ell: true });
    if (d.dates) txt(p, c, d.dates, { x, y: c.v(37, 33), size: 3.2, font: "i", col: P.muted, w: c.v(44, 54), ell: true });
    sticker(p, c, { x: c.v(55, 44), y: c.v(44, 46), w: c.v(17, 15), bg: P.accent, col: P.accentFg, rot: -8, big: String(stat(c, 0).n), small: stat(c, 0).l });
    sticker(p, c, { x: c.v(74, 63), y: c.v(49.5, 51), w: c.v(17, 15), bg: P.ink, col: P.hl, rot: 6, big: String(stat(c, 1).n), small: stat(c, 1).l });
    sticker(p, c, { x: c.v(59, 50), y: c.v(56, 63), w: c.v(18, 16), bg: P.surface, col: P.ink, rot: -4, big: String(stat(c, 2).n), small: stat(c, 2).l.split(" ")[0] ?? "" });
    hops(p, c, { x: c.v(47, 40), y: c.v(65.5, 77), w: c.v(36, 30), h: c.v(6, 8) }, [{ pts: [[1, 0.1], [0.4, 0.5], [0, 0.95]], col: P.ink }], { sw: 1.1, bend: 0.35 });
    pill(p, c, { x, y: c.v(75.6, 89), text: "hoppinclub.com", size: c.v(4, 3), bg: P.surface, col: P.ink, rot: 3, address: true });
  },
};

export const burst: PosterTemplate = {
  id: "burst",
  name: "Stat Burst",
  mood: "funky",
  photos: 4,
  blurb: "Loud colour blocks, giant numbers, and photos in circles and blobs.",
  slots: (c) =>
    c.sq
      ? [
          { x: 66, y: 9, w: 27, h: 27, f: "round" },
          { x: 5, y: 40, w: 25, h: 25, f: "blob" },
          { x: 70, y: 46, w: 24, h: 24, f: "blob", r: 8 },
          { x: 40, y: 70, w: 22, h: 22, f: "round" },
        ]
      : [
          { x: 60, y: 16.6, w: 32, h: c.q(32), f: "round" },
          { x: 5, y: 36, w: 30, h: c.q(30), f: "blob" },
          { x: 63, y: 41, w: 31, h: c.q(31), f: "blob", r: 8 },
          { x: 62, y: 60.5, w: 26, h: c.q(26), f: "round" },
        ],
  under: (p, c) => {
    fillAll(p, c, c.P.hero);
    zigzag(p, c, { y: c.v(45.5, 47), h: c.v(30, 32), color: c.P.accent });
    zigzag(p, c, { y: c.v(70, 74), h: 40, color: c.P.asoft });
    hops(p, c, { x: 28, y: c.v(26, 20), w: 44, h: c.v(18, 24) }, [{ pts: [[0, 0.15], [0.5, 0.85], [1, 0.1]], col: c.P.hl }], { sw: 1.1, bend: 0.6 });
  },
  over: (p, c) => {
    const { P, d } = c;
    const big = (i: number, x: number, y: number, size: number, col: string, lc: string, ly: number) => {
      txt(p, c, String(stat(c, i).n), { x, y, size, font: "d", col });
      txt(p, c, stat(c, i).l, { x, y: ly, size: 3.2, col: lc, wt: 700 });
    };
    lockup(p, c, { r: 6, y: c.v(13.3, 3), col: P.ink, bg: P.surface, size: 3.6 });
    big(0, 7, c.v(15.2, 4), c.v(24, 20), P.heroFg, P.heroMuted, c.v(29.6, 21.5));
    big(1, c.v(40, 36), c.v(36.4, 29), c.v(17, 14), P.heroFg, P.accentFg, c.v(46.6, 42.5));
    big(2, 7, c.v(54, 68), c.v(19, 15), P.accentFg, P.accentFg, c.v(64.8, 81.5));
    txt(p, c, d.title, { x: c.v(7, 66), y: c.v(73.4, 77), size: c.v(7.5, 5), font: "d", col: P.ink, w: c.v(50, 28), ell: true });
    pill(p, c, { r: 6, y: c.v(77.2, 92), text: "hoppinclub.com", size: c.v(4, 3), bg: P.ink, col: P.asoft, address: true });
  },
};

export const stickers: PosterTemplate = {
  id: "stickers",
  name: "Hop Stickers",
  mood: "funky",
  photos: 6,
  jitter: 3,
  blurb: "Tilted polaroids with tape on a dotted board, and round stat stickers.",
  slots: (c) => {
    const tape = (i: number) => (i % 2 ? c.P.hl : c.P.accent);
    const layout = c.sq
      ? [[5, 17, -5], [37, 15, 4], [69, 18, -3], [6, 55, 4], [38, 57, -6], [69, 55, 5]].map(([x, y, r]) => ({ x: x!, y: y!, r: r!, w: 27, h: 33 }))
      : [[6, 22, -6], [54, 21, 7], [9, 43, 5], [52, 44, -5], [6, 63.5, -3], [55, 64, 6]].map(([x, y, r]) => ({ x: x!, y: y!, r: r!, w: 37, h: 26 }));
    return layout.map((s, i): SlotSpec => ({ ...s, f: "polaroid", tape: tape(i) }));
  },
  under: (p, c) => {
    fillAll(p, c, c.P.hero);
    dots(p, c, { color: withAlpha(c.P.heroMuted, 0.28), r: 0.42, gap: 4 });
    const pts: [number, number][] = c.sq
      ? [[0.18, 0.33], [0.5, 0.31], [0.82, 0.34], [0.82, 0.72], [0.5, 0.73], [0.19, 0.71]]
      : [[0.24, 0.34], [0.72, 0.33], [0.27, 0.55], [0.7, 0.56], [0.25, 0.76], [0.73, 0.77]];
    hops(p, c, { x: 0, y: 0, w: 100, h: 100 }, [{ pts, col: c.P.hl, op: 0.8 }], { sw: 0.55, bend: 0.25, dots: false });
  },
  over: (p, c) => {
    const { P, d } = c;
    lockup(p, c, { x: c.v(6, 5), y: c.v(13.8, 4), col: P.ink, bg: P.surface, size: 3.8, rot: -4 });
    txt(p, c, d.title, { r: c.v(6, 5), y: c.v(13.6, 4), size: c.v(9, 7), font: "d", col: P.heroFg, w: 50, ell: true });
    sticker(p, c, { x: c.v(41.5, 29), y: c.v(36.8, 46), w: c.v(16, 14), bg: P.accent, col: P.accentFg, rot: -12, big: String(stat(c, 0).n), small: stat(c, 0).l });
    sticker(p, c, { x: c.v(42, 61), y: c.v(59.5, 47), w: c.v(16, 14), bg: P.hl, col: P.ink, rot: 9, big: String(stat(c, 1).n), small: stat(c, 1).l });
    sticker(p, c, { x: c.v(76, 84), y: c.v(36, 44), w: c.v(15, 13), bg: P.surface, col: P.ink, rot: 14, big: String(stat(c, 2).n), small: stat(c, 2).l.split(" ")[0] ?? "" });
    pill(p, c, { r: c.v(6, 5), y: c.v(77, 91.5), text: "hoppinclub.com", size: c.v(4, 3), bg: P.surface, col: P.ink, rot: -3, address: true });
  },
};

export const scrapbook: PosterTemplate = {
  id: "scrapbook",
  name: "Scrapbook",
  mood: "funky",
  photos: 6,
  blurb: "Torn-paper photos, washi tape and a rubber-stamp hoppin logo.",
  slots: (c) => {
    const layout = c.sq
      ? [[5, 14, 40, 38, -3], [48, 10, 22, 24, 5], [73, 14, 22, 22, -4], [47, 40, 24, 24, 4], [73, 42, 22, 22, -6], [8, 56, 30, 26, 6]]
      : [[6, 21, 56, 25, -3], [60, 19.5, 34, 17, 5], [58, 38.5, 36, 18, -4], [7, 48.5, 32, 17, 4], [40, 51, 28, 15, -6], [66, 57, 28, 14, 6]];
    return layout.map(([x, y, w, h, r], i): SlotSpec => ({ x: x!, y: y!, w: w!, h: h!, r: r!, f: "torn", tear: 31 + i * 7, tape: i % 2 ? withAlpha(c.P.hl, 0.9) : withAlpha(c.P.accent, 0.75) }));
  },
  under: (p, c) => {
    fillAll(p, c, c.P.bg);
    gridLines(p, c, withAlpha(c.P.line, 0.55), 4);
    hops(p, c, { x: c.v(12, 14), y: c.v(44.5, 50), w: c.v(26, 30), h: c.v(5, 8) }, [{ pts: [[0.9, 0], [0.15, 1]], col: c.P.ink }], { sw: 1, bend: 0.4 });
  },
  over: (p, c) => {
    const { P, d } = c;
    txt(p, c, d.title, { x: c.v(7, 5), y: c.v(14.8, 2.5), size: c.v(8.5, 6.5), font: "i", col: P.ink, rot: -3, w: c.v(80, 60), ell: true });
    sticker(p, c, { x: c.v(8, 42), y: c.v(66.5, 70), w: c.v(14, 12), bg: P.accent, col: P.accentFg, rot: -10, big: String(stat(c, 0).n), small: stat(c, 0).l });
    sticker(p, c, { x: c.v(24, 56), y: c.v(69.5, 74), w: c.v(14, 12), bg: P.hl, col: P.ink, rot: 7, big: String(stat(c, 1).n), small: stat(c, 1).l });
    sticker(p, c, { x: c.v(40, 70), y: c.v(66.8, 70), w: c.v(14, 12), bg: P.hero, col: P.heroFg, rot: -4, big: String(stat(c, 2).n), small: stat(c, 2).l.split(" ")[0] ?? "" });
    lockup(p, c, { x: c.v(62, 72), y: c.v(72.5, 86), col: P.accent, size: c.v(4.4, 3.6), rot: -9, outline: P.accent });
    pill(p, c, { x: c.v(7, 5), y: c.v(77.2, 91), text: "hoppinclub.com", size: c.v(4, 3), bg: withAlpha(P.hl, 0.92), col: P.ink, rot: -2, radius: 0.4, address: true });
  },
};

const corkCells = (c: Ctx) => (c.sq ? { xs: [6, 37, 68], ys: [7, 37.5, 68], w: 26, h: 28.5 } : { xs: [6, 36.5, 67], ys: [20, 40.5, 61], w: 27, h: 19.5 });

export const cork: PosterTemplate = {
  id: "cork",
  name: "Cork Board",
  mood: "funky",
  photos: 8,
  isNew: true,
  jitter: 4,
  blurb: "Eight pinned polaroids joined by a string, with a sticky-note title.",
  slots: (c) => {
    const g = corkCells(c);
    const out: SlotSpec[] = [];
    g.ys.forEach((y, ri) =>
      g.xs.forEach((x, ci) => {
        if (ri === 1 && ci === 1) return;
        out.push({ x, y, w: g.w, h: g.h, f: "pinned", pin: out.length % 2 ? c.P.hero : c.P.accent });
      }),
    );
    return out;
  },
  under: (p, c) => {
    fillAll(p, c, c.P.s2);
    dots(p, c, { color: withAlpha(c.P.muted, 0.16), r: 0.33, gap: 2.2 });
    dots(p, c, { color: withAlpha(c.P.accent, 0.12), r: 0.3, gap: 2.6, dx: 0.42, dy: 0.5 });
  },
  over: (p, c) => {
    const { P, d } = c;
    const g = corkCells(c);
    const pins: [number, number][] = [];
    g.ys.forEach((y, ri) => g.xs.forEach((x, ci) => !(ri === 1 && ci === 1) && pins.push([(x + g.w / 2) / 100, (y + 1) / 100])));
    hops(p, c, { x: 0, y: 0, w: 100, h: 100 }, [{ pts: [0, 1, 2, 4, 7, 6, 5, 3].map((i) => pins[i]!), col: P.ink, op: 0.75 }], { sw: 0.4, bend: 0.12, dots: false });

    const nx = c.X(g.xs[1]! + 1);
    const ny = c.Y(g.ys[1]! + 0.5);
    const nw = c.X(g.w - 2);
    const nh = c.Y(g.h - 1);
    p.save();
    p.translate(nx + nw / 2, ny + nh / 2);
    p.rotate((-3 * Math.PI) / 180);
    p.shadow("rgba(0,0,0,0.22)", c.U(2.4), 0, c.U(1.4));
    p.rect(-nw / 2, -nh / 2, nw, nh, P.hl);
    p.noShadow();
    const title: TextStyle = { font: "display", size: c.U(c.v(5.4, 5)), color: P.ink };
    const lines = wrapLines(p, d.title, title, nw - c.U(6)).slice(0, 3);
    let y = -nh / 2 + c.U(3);
    for (const line of lines) {
      p.text(line, -nw / 2 + c.U(3), y, title);
      y += title.size * 0.95;
    }
    if (d.dates) p.text(d.dates, -nw / 2 + c.U(3), y + c.U(1), { font: "serif", size: c.U(2.4), color: P.ink });
    if (c.sq) {
      const style: TextStyle = { font: "sans", size: c.U(2.4), weight: 700, color: P.ink };
      p.text("hoppinclub.com", -nw / 2 + c.U(3), nh / 2 - c.U(5.4), style);
      p.mark("address", { x: -nw / 2 + c.U(3), y: nh / 2 - c.U(5.4), w: p.measure("hoppinclub.com", style), h: style.size });
    }
    p.restore();

    lockup(p, c, c.sq ? { x: 6, y: 1.6, col: P.ink, size: 3.2, bg: P.surface } : { x: 6, y: 13.6, col: P.ink, size: 4.2 });
    if (!c.sq) {
      txt(p, c, d.stats.map((s) => `${s.n} ${s.l.split(" ")[0]}`).join(" · "), { r: 6, y: 14.2, size: 2.8, col: P.muted, wt: 600 });
      pill(p, c, { r: 6, y: 77.2, text: "hoppinclub.com", size: 4, bg: P.surface, col: P.ink, rot: -2, address: true });
    }
  },
};