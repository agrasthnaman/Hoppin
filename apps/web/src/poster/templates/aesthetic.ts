import { addr, barcode, card, dotJoin, fade, fillAll, filmStrip, hops, lockup, postmark, routeOr, stamp, statRow, txt } from "../kit";
import { withAlpha } from "../palette";
import type { PosterTemplate, RoutePoints, SlotSpec } from "../types";

const ROUTE_FALLBACK: RoutePoints = [
  [0.06, 0.78],
  [0.25, 0.38],
  [0.44, 0.62],
  [0.62, 0.2],
  [0.8, 0.5],
  [0.95, 0.26],
];

export const route: PosterTemplate = {
  id: "route",
  name: "Route Poster",
  mood: "aesthetic",
  photos: 2,
  blurb: "Your whole route drawn large, photos sitting on the stops.",
  slots: (c) => {
    const pts = routeOr(c, ROUTE_FALLBACK);
    const box = { x: 4, y: c.v(33, 26), w: 92, h: c.v(30, 42) };
    const w = c.v(24, 19);
    const h = c.q(w);
    const n = pts.length;
    return [pts[Math.min(1, n - 1)]!, pts[Math.max(0, n - 2)]!].map(([px, py]) => ({ x: box.x + px * box.w - w / 2, y: box.y + py * box.h - h / 2, w, h, f: "round" as const }));
  },
  under: (p, c) => {
    fillAll(p, c, c.P.hero);
    const pts = routeOr(c, ROUTE_FALLBACK);
    const mid = Math.ceil(pts.length / 2);
    hops(p, c, { x: 4, y: c.v(33, 26), w: 92, h: c.v(30, 42) }, [
      { pts: pts.slice(0, mid), col: c.P.accent },
      { pts: pts.slice(mid - 1), col: c.P.heroFg, dot: c.P.hl },
    ], { sw: 1.1 });
  },
  over: (p, c) => {
    const { P, d } = c;
    lockup(p, c, { y: c.v(14, 5), r: 6, col: P.heroFg, size: c.v(4.4, 4) });
    txt(p, c, d.title, { x: 7, y: c.v(19.5, 5), size: c.v(12, 9.5), font: "d", col: P.heroFg, w: c.v(60, 56), ell: true });
    txt(p, c, dotJoin(d.dates, d.dest), { x: 7, y: c.v(27.6, 15), size: c.v(3.6, 3.2), font: "i", col: P.heroMuted, w: 86, ell: true });
    if (!c.sq) {
      const size = c.U(3.1);
      const lh = size * 1.6;
      d.stops.slice(0, 3).forEach((stop, i) => {
        const y = c.Y(60.5) + i * lh;
        p.begin();
        p.arc(c.X(7) + size * 0.72, y + size * 0.5, size * 0.72, 0, Math.PI * 2);
        p.fill(P.accent);
        p.text(String(i + 1), c.X(7) + size * 0.72, y + size * 0.08, { font: "sans", size: size * 0.8, weight: 700, color: P.accentFg, align: "center" });
        txt(p, c, stop, { x: 7 + (size * 1.9) / c.U(1), y: (y / c.f.h) * 100, size: 3.1, col: P.heroFg, w: 76, ell: true });
      });
    }
    statRow(p, c, { y: c.v(69.6, 72), col: P.heroFg, sub: P.heroMuted, size: c.v(6.4, 7) });
    addr(p, c, { x: 7, y: c.v(78.6, 91), col: P.heroMuted });
  },
};

export const postcard: PosterTemplate = {
  id: "postcard",
  name: "Postcard",
  mood: "aesthetic",
  photos: 2,
  blurb: '"Greetings from" on a paper postcard with a stamp and a postmark.',
  slots: (c) =>
    c.sq
      ? [
          { x: 10.5, y: 11.5, w: 43, h: 77, f: "plain", rad: 0.6 },
          { x: 57, y: 11.5, w: 20, h: 24, f: "plain", r: 3 },
        ]
      : [
          { x: 10, y: 21.4, w: 80, h: 27, f: "plain" },
          { x: 10, y: 51, w: 36, h: 22.5, f: "plain" },
        ],
  under: (p, c) => {
    fillAll(p, c, { kind: "linear", coords: [0, 0, c.f.w * 0.3, c.f.h], stops: [[0, c.P.s2], [1, c.P.bg]] });
    card(p, c, { x: 6, y: c.v(18, 7), w: 88, h: c.v(60, 86), fill: c.P.surface, inner: c.P.line });
  },
  over: (p, c) => {
    const { P, d } = c;
    const L = c.sq ? { x: 57, gy: 41, by: 44.5, iy: 56, sy: 69, w: 36 } : { x: 50, gy: 51.6, by: 54.4, iy: 62.3, sy: 70.6, w: 41 };
    lockup(p, c, { y: c.v(13.6, 82), x: c.v(6, 57), col: P.ink, size: c.v(4.4, 3.8) });
    stamp(p, c, { x: c.v(74, 80), y: c.v(19.6, 11), w: c.v(14, 10), bg: P.accent, col: P.accentFg, year: d.year });
    postmark(p, c, { x: c.v(60, 67), y: c.v(25.5, 20), d: c.v(19, 14), col: withAlpha(P.ink, 0.6), lines: [d.dest.toUpperCase().slice(0, 12), d.short], size: c.v(2, 1.6), rot: -14 });
    hops(p, c, { x: c.v(56, 62), y: c.v(31.5, 31), w: c.v(36, 30), h: c.v(3, 4) }, [{ pts: [[0, 0.5], [0.33, 0.5], [0.66, 0.5], [1, 0.5]], col: withAlpha(P.ink, 0.5) }], { sw: 1.1, bend: 0.45, dots: false });
    txt(p, c, "GREETINGS FROM", { x: L.x, y: L.gy, size: c.v(2.4, 2), col: P.muted, ls: 0.18, wt: 700 });
    txt(p, c, d.dest, { x: L.x, y: L.by, size: c.v(10, 9), font: "i", col: P.ink, w: L.w, ell: true });
    txt(p, c, d.stops.map((s) => `· ${s}`).join("\n"), { x: L.x, y: L.iy, size: c.v(2.7, 2.3), col: P.muted, lh: 1.55, w: L.w, ell: true });
    if (d.who) txt(p, c, `with ${d.who}`, { x: L.x, y: L.sy, size: c.v(2.8, 2.4), font: "i", col: P.ink, w: L.w, wrap: true });
    addr(p, c, { x: c.v(6, 57), y: c.v(79.4, 88), col: P.muted });
  },
};

export const cover: PosterTemplate = {
  id: "cover",
  name: "Magazine Cover",
  mood: "aesthetic",
  photos: 3,
  blurb: "One full-bleed photo, a big hoppin masthead and cover lines from the trip.",
  slots: (c) =>
    c.sq
      ? [
          { x: 0, y: 0, w: 100, h: 100, f: "plain", back: true },
          { x: 73, y: 50, w: 20, h: 15, f: "inset", r: 3 },
          { x: 73, y: 69, w: 20, h: 15, f: "inset", r: -2 },
        ]
      : [
          { x: 0, y: 0, w: 100, h: 100, f: "plain", back: true },
          { x: 68, y: 53.5, w: 25, h: 10.5, f: "inset", r: 3 },
          { x: 68, y: 65.5, w: 25, h: 10.5, f: "inset", r: -2 },
        ],
  under: (p, c) => fillAll(p, c, c.P.ink),
  mid: (p, c) => fade(p, c, c.P.ink, [[0, 0.72], [c.v(0.3, 0.34), 0], [0.46, 0], [1, 0.82]]),
  over: (p, c) => {
    const { P, d } = c;
    const W = "#ffffff";
    lockup(p, c, { center: true, y: c.v(13.4, 3.5), col: W, size: c.v(17, 13) });
    txt(p, c, dotJoin(d.dest.toUpperCase(), d.short, "ISSUE 01"), { x: 0, w: 100, al: "center", y: c.v(23.6, 18), size: 2.5, col: W, ls: 0.3, wt: 700, op: 0.9 });
    hops(p, c, { x: 30, y: c.v(25.6, 22.5), w: 40, h: c.v(2, 3) }, [{ pts: [[0, 0.8], [0.5, 0.8], [1, 0.8]], col: P.accent }], { sw: 1.3, bend: 0.5 });
    p.rect(c.X(6), c.Y(c.v(48.3, 42)), c.X(10), c.U(0.7), P.accent);
    txt(p, c, d.stats.map((s) => `${s.n} ${s.l.split(" ")[0]}.`).join("\n"), { x: 6, y: c.v(50, 45), size: c.v(8.6, 7), font: "d", col: W, lh: 0.98 });
    if (d.stops.length) txt(p, c, `Inside: ${d.stops.join(", ")}`, { x: 6, y: c.v(66, 71), size: c.v(3, 2.6), col: W, w: c.v(56, 60), wrap: true, lh: 1.35 });
    barcode(p, c, { r: 6, y: c.v(74.6, 87), w: c.v(22, 20), h: c.v(2.4, 3.5), seed: d.title, col: W, op: 0.9 });
    addr(p, c, { x: 6, y: c.v(78.6, 91), col: W });
  },
};

export const grid: PosterTemplate = {
  id: "grid",
  name: "Clean Grid",
  mood: "aesthetic",
  photos: 4,
  blurb: "Minimal and type-led: a 2 × 2 grid, lots of white space, one accent.",
  slots: (c) => {
    const [y0, y1] = c.v([30, 52.3], [25, 57]);
    const h = c.v(21, 30);
    return [
      [7, y0],
      [51, y0],
      [7, y1],
      [51, y1],
    ].map(([x, y]): SlotSpec => ({ x: x!, y: y!, w: 42, h, f: "hair", colors: { hair: c.P.line } }));
  },
  under: (p, c) => fillAll(p, c, c.P.surface),
  over: (p, c) => {
    const { P, d } = c;
    lockup(p, c, { x: 7, y: c.v(13.6, 4.5), col: P.ink, size: 3.6 });
    txt(p, c, dotJoin(d.short, d.dest.toUpperCase()), { r: 7, y: c.v(14.2, 5), size: 2.3, col: P.muted, ls: 0.2, wt: 700 });
    txt(p, c, d.title, { x: 7, y: c.v(17.4, 10), size: c.v(12, 8), font: "d", col: P.ink, w: c.v(56, 56), ell: true });
    if (d.dates) txt(p, c, d.dates, { x: 7, y: c.v(25, 19), size: 3, font: "i", col: P.muted });
    hops(p, c, { x: 66, y: c.v(18, 11), w: 27, h: c.v(8.5, 10) }, [{ pts: routeOr(c, [[0, 0.85], [0.35, 0.4], [0.7, 0.7], [1, 0.15]]), col: P.accent }], { sw: 1.6, bend: 0.35 });
    p.rect(c.X(7), c.Y(c.v(28.5, 23)), c.X(86), Math.max(1, c.U(0.12)), P.line);
    const line = d.stats.map((s) => `${s.n} ${s.l.split(" ")[0]}`).join(" · ") + (c.sq ? "" : ` · ${d.crew} travellers`);
    const dotY = c.Y(c.v(75.4, 90.6)) + c.U(c.v(2.9, 2.6)) * 0.5;
    p.begin();
    p.arc(c.X(7) + c.U(0.8), dotY, c.U(0.8), 0, Math.PI * 2);
    p.fill(P.accent);
    txt(p, c, line, { x: 9.5, y: c.v(75.4, 90.6), size: c.v(2.9, 2.6), col: P.muted, w: c.v(84, 52), ell: true });
    addr(p, c, { r: 7, y: c.v(78.6, 90.4), col: P.ink });
  },
};

export const film: PosterTemplate = {
  id: "film",
  name: "Film Roll",
  mood: "aesthetic",
  photos: 6,
  blurb: "Two film strips on a dark ground, with frame numbers and a light leak.",
  slots: (c) =>
    c.sq
      ? [[6.5, 24], [36.5, 24], [66.5, 24], [6.5, 58], [36.5, 58], [66.5, 58]].map(([x, y]): SlotSpec => ({ x: x!, y: y!, w: 27, h: 22, f: "film" }))
      : [[12.5, 20.9], [12.5, 38], [12.5, 55.1], [57.5, 22.9], [57.5, 40], [57.5, 57.1]].map(([x, y]): SlotSpec => ({ x: x!, y: y!, w: 30, h: 15.6, f: "film" })),
  under: (p, c) => {
    fillAll(p, c, c.P.ink);
    const strip = { color: "rgba(0,0,0,0.45)", hole: withAlpha(c.P.bg, 0.75) };
    if (c.sq) {
      filmStrip(p, c, { x: 0, y: 20, w: 100, h: 30, vertical: false, ...strip });
      filmStrip(p, c, { x: 0, y: 54, w: 100, h: 30, vertical: false, ...strip });
    } else {
      filmStrip(p, c, { x: 7, y: 19.4, w: 41, h: 53, vertical: true, ...strip });
      filmStrip(p, c, { x: 52, y: 21.4, w: 41, h: 53, vertical: true, ...strip });
    }
  },
  over: (p, c) => {
    const { P, d } = c;
    const labels = ["12A", "13", "13A", "14", "14A", "15"];
    labels.forEach((l, i) => {
      if (c.sq) txt(p, c, l, { x: [6.5, 36.5, 66.5][i % 3]! + 0.5, y: i < 3 ? 46.6 : 80.6, size: 1.9, col: P.accent, wt: 700, ls: 0.1 });
      else txt(p, c, l, { x: i < 3 ? 43.6 : 88.6, y: (i < 3 ? [20.9, 38, 55.1] : [22.9, 40, 57.1])[i % 3]! + 6, size: 1.9, col: P.accent, wt: 700, ls: 0.1, rot: 90 });
    });
    txt(p, c, d.title, { x: c.v(7, 6), y: c.v(13.6, 5), size: c.v(7.5, 6.5), font: "d", wt: 500, col: P.bg, w: 56, ell: true });
    lockup(p, c, { r: c.v(7, 6), y: c.v(13.8, 6), col: P.bg, size: 3.8 });
    txt(p, c, d.stamp, { x: c.v(30.5, 21), y: c.v(33.4, 42.4), size: 2.4, col: P.accent, wt: 700, ls: 0.1 });
    hops(p, c, { x: -5, y: c.v(26, 16), w: 110, h: c.v(40, 44) }, [{ pts: [[0, 0.95], [0.5, 0.15], [1, 0.75]], col: P.accent, op: 0.35 }], { sw: 2.2, bend: 0.35, dots: false });
    txt(p, c, d.fields.map(([k, v]) => `${k} ${v.padStart(2, "0")}`).join(" · "), { x: c.v(7, 6), y: c.v(75.2, 87), size: c.v(2.6, 2.3), col: P.bg, ls: 0.14, wt: 600, op: 0.8 });
    addr(p, c, { x: c.v(7, 6), y: c.v(78.6, 92), col: P.bg });
  },
};

export const dump: PosterTemplate = {
  id: "dump",
  name: "Photo Dump",
  mood: "aesthetic",
  photos: 8,
  isNew: true,
  blurb: 'A calm bento grid of eight photos, "bali, lately" in soft italic.',
  slots: (c) =>
    (c.sq
      ? [[5, 12, 44, 40], [51, 12, 22, 19], [75, 12, 20, 19], [51, 33, 44, 19], [5, 54, 22, 34], [29, 54, 20, 16], [29, 72, 20, 16], [51, 54, 44, 34]]
      : [[5, 21, 54, 24], [61, 21, 34, 11.5], [61, 33.5, 34, 11.5], [5, 47, 28, 14], [35, 47, 28, 14], [65, 47, 30, 28], [5, 63, 28, 12], [35, 63, 28, 12]]
    ).map(([x, y, w, h]): SlotSpec => ({ x: x!, y: y!, w: w!, h: h!, f: "plain", rad: 1.6 })),
  under: (p, c) => fillAll(p, c, c.P.bg),
  over: (p, c) => {
    const { P, d } = c;
    txt(p, c, `${d.dest.toLowerCase()}, lately`, { x: 5, y: c.v(13.4, 2.6), size: c.v(9, 6.5), font: "i", col: P.ink, w: 62, ell: true });
    lockup(p, c, { r: 5, y: c.v(14.4, 3.6), col: P.ink, size: 3.8 });
    txt(p, c, d.stats.map((s) => `${s.n} ${s.l.split(" ")[0]}`).join(" · "), { x: 5, y: c.v(76.6, 91.4), size: 2.8, col: P.muted, wt: 600, w: c.v(60, 42), ell: true });
    hops(p, c, { x: c.v(5, 50), y: c.v(79.6, 92), w: c.v(18, 12), h: c.v(2.2, 3) }, [{ pts: [[0, 0.9], [0.5, 0.9], [1, 0.9]], col: P.accent }], { sw: 2, bend: 0.5 });
    addr(p, c, { r: 5, y: c.v(78.6, 91), col: P.ink });
  },
};
