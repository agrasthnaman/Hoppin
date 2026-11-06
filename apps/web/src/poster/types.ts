import type { Painter } from "./painter";

export type PosterSize = "story" | "square" | "poster";
export type PosterKind = "trip" | "day";

/** The picture being drawn, in pixels. Templates design in percentages of `w` and `h`, and size type in `u` (1% of the width). */
export interface Frame {
  w: number;
  h: number;
  size: PosterSize;
  /** Square layouts differ; Story and Poster share the tall layout. */
  sq: boolean;
  u: number;
}

/** A palette's light colours, the only colours a poster may use besides white, black and the photos. */
export interface PosterPalette {
  id: string;
  name: string;
  bg: string;
  surface: string;
  s2: string;
  ink: string;
  muted: string;
  line: string;
  accent: string;
  accentFg: string;
  asoft: string;
  hero: string;
  heroFg: string;
  heroMuted: string;
  hl: string;
}

/** A picture to draw: an ImageBitmap from the phone, or a canvas (demo photos). */
export type PhotoSource = CanvasImageSource & { width: number; height: number };

/** Route points already fitted into a 0..1 box, one list per day. */
export type RoutePoints = [number, number][];

/** Everything a template may put on a poster. Built only from group plans and photos the person picked. */
export interface PosterData {
  kind: PosterKind;
  title: string;
  dest: string;
  dates: string;
  /** "MAR 2027" or "30 MAR". */
  short: string;
  stats: { n: string | number; l: string }[];
  crew: number;
  stops: string[];
  from: [string, string];
  to: [string, string];
  who: string;
  /** A film-style date stamp, e.g. '27 03 28. */
  stamp: string;
  year: string;
  fields: [string, string][];
  /** The real route, fitted to 0..1. Fewer than two points means templates draw their own decorative hops. */
  route: RoutePoints;
  photos: (PhotoSource | null)[];
  showNames: boolean;
  showDates: boolean;
}

export type FrameStyle = "plain" | "hair" | "polaroid" | "pinned" | "round" | "blob" | "window" | "tag" | "torn" | "film" | "booth" | "inset";

/** Where one photo goes, in percentages of the poster. `r` is a tilt in degrees. */
export interface SlotSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  f: FrameStyle;
  cap?: string;
  tape?: string;
  pin?: string;
  /** Drawn under the other photos (a full-bleed cover photo). */
  back?: boolean;
  /** Corner radius in `u`. */
  rad?: number;
  /** Frame-specific colours: tag card, hole, string and caption; window frame; hairline; date stamp. */
  colors?: Partial<Record<"card" | "hole" | "string" | "cap" | "frame" | "hair" | "stamp", string>>;
  /** Seed for a torn edge. */
  tear?: number;
}

/** How the person moved one photo. Offsets in percent of the poster, angle in degrees, crop centre 0..100. */
export interface SlotEdit {
  tx: number;
  ty: number;
  rot: number;
  sc: number;
  ox: number;
  oy: number;
  z: number;
}

export const NO_EDIT: SlotEdit = { tx: 0, ty: 0, rot: 0, sc: 1, ox: 50, oy: 50, z: 1 };

/** What every drawing step gets. */
export interface Ctx {
  P: PosterPalette;
  d: PosterData;
  f: Frame;
  sq: boolean;
  seed: number;
  /** Entrance animation progress, 0 to 1. Exports always use 1. */
  t: number;
  /** In the studio: empty frames show a numbered "+". */
  editing: boolean;
  v<T>(story: T, square: T): T;
  /** Height in percent for a box `w` percent wide that should be square on the poster. */
  q(w: number): number;
  X(pct: number): number;
  Y(pct: number): number;
  U(n: number): number;
}

export interface PosterTemplate {
  id: string;
  name: string;
  mood: "funky" | "aesthetic";
  /** How many photos it is designed for. Fewer leave tidy empty frames. */
  photos: number;
  blurb: string;
  /** A new idea, not one of the ten in the issues. */
  isNew?: boolean;
  /** Random tilt per photo, in degrees, re-rolled by Shuffle. */
  jitter?: number;
  slots(c: Ctx): SlotSpec[];
  under?(p: Painter, c: Ctx): void;
  mid?(p: Painter, c: Ctx): void;
  over(p: Painter, c: Ctx): void;
}
