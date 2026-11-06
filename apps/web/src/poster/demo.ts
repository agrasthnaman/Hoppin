import { mulberry32 } from "./rng";
import type { PhotoSource, PosterData } from "./types";

/** A Bali trip, for tests and the template previews. */
export function demoPosterData(over: Partial<PosterData> = {}): PosterData {
  return {
    kind: "trip",
    title: "Bali Bros",
    dest: "Bali",
    dates: "28 Mar – 5 Apr 2027",
    short: "MAR 2027",
    year: "2027",
    stats: [
      { n: 9, l: "days" },
      { n: 14, l: "places" },
      { n: 62, l: "km hopped" },
    ],
    crew: 6,
    stops: ["Uluwatu Temple", "Tegallalang Rice Terraces", "Nusa Penida"],
    from: ["ULU", "Uluwatu"],
    to: ["UBD", "Ubud"],
    who: "Asha, Ravi, Meera and 3 more",
    stamp: "'27 03 28",
    fields: [
      ["DAYS", "9"],
      ["PLACES", "14"],
      ["KM", "62"],
      ["CREW", "6"],
    ],
    route: [],
    photos: [],
    showNames: true,
    showDates: true,
    ...over,
  };
}

const SCENES = [
  ["#7fc8f8", "#ffe9b0", "#2e7d5b"],
  ["#ff9a76", "#ffd6a5", "#3d405b"],
  ["#5aa9e6", "#c1fba4", "#1b998b"],
  ["#f7b267", "#f4845f", "#355070"],
  ["#a0c4ff", "#fdffb6", "#43aa8b"],
  ["#ffafcc", "#ffc8dd", "#5e548e"],
  ["#90e0ef", "#caf0f8", "#0077b6"],
  ["#ffd166", "#ef476f", "#073b4c"],
] as const;

let cache: HTMLCanvasElement[] | null = null;

/** Simple drawn "photos" (sky, sun, hills) used before the person picks their own. No network, no files. */
export function demoPhotos(n: number): PhotoSource[] {
  if (typeof document === "undefined") return [];
  cache ??= SCENES.map(([sky, sun, land], i) => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 600;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const rnd = mulberry32(i + 7);
    const g = ctx.createLinearGradient(0, 0, 0, 600);
    g.addColorStop(0, sky);
    g.addColorStop(1, sun);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 480, 600);
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(120 + rnd() * 240, 170 + rnd() * 90, 60 + rnd() * 30, 0, Math.PI * 2);
    ctx.fill();
    for (let layer = 0; layer < 3; layer += 1) {
      ctx.fillStyle = land;
      ctx.globalAlpha = 0.45 + layer * 0.27;
      ctx.beginPath();
      ctx.moveTo(0, 600);
      const base = 360 + layer * 70;
      for (let x = 0; x <= 480; x += 40) ctx.lineTo(x, base - Math.sin(x / 70 + rnd() * 3) * (30 + rnd() * 30));
      ctx.lineTo(480, 600);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return canvas;
  });
  return Array.from({ length: n }, (_, i) => cache![i % cache!.length]!);
}
