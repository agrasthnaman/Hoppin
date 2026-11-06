import type { ItemKind } from "@hoppin/core";
import { Camera, type LucideIcon } from "lucide-react";
import { createRoot, type Root } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
import { drawnAt, legMs, legsFor, totalMs, type LngLat } from "../../lib/map-arc";
import { KIND_STYLE } from "../kind";
import { Banner } from "../ui/Banner";
import "./map.css";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const MAP_NOTICE = "The map needs a connection. Your stops are listed below.";

export interface MapPoint {
  id: string;
  lat: number;
  lon: number;
  /** Plan name. */
  title: string;
  /** Place name, when the pin has one. */
  place?: string;
  /** Clock time in the plan's own zone, for the pin's name. */
  time?: string;
  kind: "stop" | "stay" | "moment";
  /** What sort of plan a stop is, for its icon. */
  plan?: ItemKind;
  day: number;
  order?: number;
  color: string;
  /** Directions link, when the plan has one. */
  directions?: string;
  /** The plan's own page. */
  planHref?: string;
  /** A small photo of the place (a moment's picture). It takes the icon's place in the pin. */
  photo?: string;
}

/** The stops of one day in order. The map joins them with curved hops and draws them one after another. */
export interface MapLine {
  color: string;
  coords: [number, number][];
  /** Which day this is, so a replay can run the days one after another and move each pin with its day. */
  day?: number;
}

export interface MapViewProps {
  points: MapPoint[];
  lines: MapLine[];
  onSelect: (id: string) => void;
  selectedId?: string | null;
  height: number | string;
  /** Days map: one finger scrolls the page. The trip map can be dragged freely. */
  cooperativeGestures?: boolean;
  /** False for a small preview that only looks: no dragging, no tapping. Default true. */
  interactive?: boolean;
  /** Tip the map back this many degrees for a 3D look. Default 0 (flat). */
  tilt?: number;
  /** Raise this number to replay the trip: the days draw one after another and the camera follows from stop to stop. */
  playKey?: number;
  onFailed?: () => void;
}

function iconFor(point: MapPoint): LucideIcon {
  if (point.kind === "moment") return Camera;
  if (point.kind === "stay") return KIND_STYLE.stay.icon;
  return KIND_STYLE[point.plan ?? "plan"].icon;
}

/** The name of the icon, so a pin can be told apart from its shape. */
function pinIconName(point: MapPoint): string {
  if (point.kind === "moment") return "moment";
  if (point.kind === "stay") return "stay";
  return point.plan ?? "plan";
}

/** A map pin: the tip sits on the place, and the head carries that plan's icon. */
function PinFace({ point }: { point: MapPoint }) {
  const Icon = iconFor(point);
  return (
    <span className="relative block h-[52px] w-11 text-white">
      <svg viewBox="0 0 44 52" className="map-pin-shape absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          d="M22 49.5C22 49.5 6.5 34.2 6.5 20.5a15.5 15.5 0 0 1 31 0C37.5 34.2 22 49.5 22 49.5z"
          fill={point.color}
          stroke="#fff"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      {point.photo ? (
        <img src={point.photo} alt="" className="absolute left-1/2 top-[5px] size-[26px] -translate-x-1/2 rounded-full object-cover ring-2 ring-white" />
      ) : (
        <Icon aria-hidden="true" className="absolute left-1/2 top-[11px] size-[18px] -translate-x-1/2" strokeWidth={2.4} />
      )}
      {point.kind === "stop" && point.order !== undefined && (
        <span aria-hidden="true" className="absolute -right-1 top-0 inline-flex size-5 items-center justify-center rounded-full bg-white text-[11px] font-black leading-none shadow" style={{ color: point.color }}>
          {point.order}
        </span>
      )}
    </span>
  );
}

function reducedMotion(): boolean {
  try {
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function pinHeading(point: MapPoint): string {
  if (point.kind === "stay") return "Stay";
  if (point.kind === "moment") return "Moment";
  if (point.order === 1) return "Start";
  return `Stop ${point.order}`;
}

function kindLabel(point: MapPoint): string {
  if (point.kind === "moment") return "Moment";
  return KIND_STYLE[point.plan ?? "plan"].label;
}

function pinLabel(point: MapPoint): string {
  return `${pinHeading(point)}: ${point.title}${point.time ? `, ${point.time}` : ""}`;
}

function textLine(className: string, text: string): HTMLParagraphElement {
  const line = document.createElement("p");
  line.className = className;
  line.textContent = text;
  return line;
}

/** The note that sits on a pin: what it is, when, and where. Built without a second React root, so the map can move the pin freely. */
function pinCard(point: MapPoint): HTMLDivElement {
  const card = document.createElement("div");
  card.className = "map-pin-card rounded-2xl bg-surface px-3 py-2 text-left text-fg shadow-card";
  card.append(textLine("text-[11px] font-semibold uppercase tracking-[0.12em] text-muted", `${pinHeading(point)} · ${kindLabel(point)}`));
  card.append(textLine("font-semibold leading-snug", point.title));
  if (point.time) card.append(textLine("text-sm tabular-nums", point.time));
  if (point.place && point.place !== point.title) card.append(textLine("text-sm text-muted", point.place));
  if (point.directions || point.planHref) {
    const row = document.createElement("p");
    row.className = "mt-1.5 flex flex-wrap gap-x-3 gap-y-1";
    const add = (href: string, name: string) => {
      const link = document.createElement("a");
      link.href = href;
      link.className = "text-sm font-semibold text-link";
      link.textContent = name;
      row.append(link);
    };
    if (point.directions) add(point.directions, "Get directions");
    if (point.planHref) add(point.planHref, "Open plan");
    card.append(row);
  }
  return card;
}

/** True when this browser can draw a WebGL map. */
export function mapCanDraw(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

/** The map, or a short note when it cannot be drawn. The stop list below stays usable either way. */
export function MapFrame({ online, ...props }: MapViewProps & { online: boolean }) {
  const [gl] = useState(mapCanDraw);
  const [failed, setFailed] = useState(false);
  if (!online || !gl || failed) return <Banner kind="info" text={MAP_NOTICE} />;
  return <MapView {...props} onFailed={() => setFailed(true)} />;
}

/** OpenFreeMap tiles. This file is the only place that loads maplibre. */
export function MapView({ points, lines, onSelect, selectedId, height, cooperativeGestures = false, interactive = true, tilt = 0, playKey = 0, onFailed }: MapViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ easeTo: (options: { center: [number, number]; duration: number }) => void } | null>(null);
  const select = useRef(onSelect);
  const fail = useRef(onFailed);
  const data = useRef({ points, lines, selectedId });
  select.current = onSelect;
  fail.current = onFailed;
  data.current = { points, lines, selectedId };
  // Selecting a pin must not rebuild the map. Rebuilding flies in from the whole world again.
  const signature = JSON.stringify({ points, lines, cooperativeGestures, interactive, tilt, playKey });

  useEffect(() => {
    const container = host.current;
    const { points: pins, lines: legs, selectedId: current } = data.current;
    if (!container) return;
    let cancelled = false;
    let map: { remove: () => void } | null = null;
    const roots: Root[] = [];
    const frames: number[] = [];
    const timeouts: number[] = [];
    const still = reducedMotion();
    // A replay runs the days one after another. Each day starts when the one before it has finished.
    const replay = playKey > 0 && !still;
    const dayStart = new Map<number, number>();
    if (replay) {
      let clock = 0;
      for (const line of lines) {
        dayStart.set(line.day ?? 0, clock);
        clock += totalMs(legsFor(line.coords)) + 500;
      }
    }
    const timer = window.setTimeout(() => fail.current?.(), 10_000);

    void (async () => {
      const ml = await import("maplibre-gl");
      await import("maplibre-gl/dist/maplibre-gl.css");
      // Vite serves a prebundled copy of maplibre, which looks for its worker beside that copy. The worker lives with the package.
      const worker = await import("maplibre-gl/dist/maplibre-gl-worker.mjs?url");
      if (cancelled || !host.current) return;
      if (typeof worker.default === "string" && typeof ml.setWorkerUrl === "function") ml.setWorkerUrl(worker.default);
      const first = pins[0];
      const next = new ml.Map({
        container: host.current,
        style: STYLE,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        cooperativeGestures,
        interactive,
        ...(tilt > 0 ? { pitch: tilt } : {}),
        ...(first ? { center: [first.lon, first.lat] as [number, number], zoom: pins.length === 1 ? 14 : 11 } : {}),
      });
      map = next;
      mapRef.current = next;
      next.dragRotate.disable();
      next.touchZoomRotate.disableRotation();
      next.keyboard.disableRotation();
      let ready = false;
      const stopWaiting = () => window.clearTimeout(timer);
      next.on("load", () => {
        ready = true;
        stopWaiting();
        legs.forEach((line, index) => {
          const hops = legsFor(line.coords);
          if (hops.length === 0) return;
          const id = `leg-${index}`;
          const shape = (drawn: LngLat[][]) => ({
            type: "Feature" as const,
            properties: {},
            geometry: { type: "MultiLineString" as const, coordinates: drawn.filter((hop) => hop.length >= 2) },
          });
          next.addSource(id, { type: "geojson", data: shape(still ? hops : []) });
          const round = { "line-cap": "round" as const, "line-join": "round" as const };
          // A soft shadow under a white edge under the colour: the route looks lifted off the map.
          next.addLayer({ id: `${id}-shadow`, type: "line", source: id, layout: round, paint: { "line-color": "#000000", "line-opacity": 0.22, "line-width": 7, "line-blur": 4, "line-translate": [0, 5] } });
          next.addLayer({ id: `${id}-edge`, type: "line", source: id, layout: round, paint: { "line-color": "#ffffff", "line-width": 7 } });
          next.addLayer({ id, type: "line", source: id, layout: round, paint: { "line-color": line.color, "line-width": 4 } });
          if (still) return;
          // The route draws itself hop by hop (A to B, then B to C) once, and then stays.
          const began = performance.now() + (dayStart.get(line.day ?? 0) ?? 0);
          const step = () => {
            if (cancelled) return;
            const elapsed = performance.now() - began;
            if (elapsed < 0) {
              frames.push(requestAnimationFrame(step));
              return;
            }
            const source = (next as unknown as { getSource?: (name: string) => { setData?: (data: unknown) => void } | undefined }).getSource?.(id);
            source?.setData?.(shape(drawnAt(hops, elapsed)));
            if (elapsed < totalMs(hops)) frames.push(requestAnimationFrame(step));
          };
          frames.push(requestAnimationFrame(step));
        });
        if (pins.length === 1) {
          const only = pins[0]!;
          // One move, so zoom is not applied at the map's old centre.
          next.jumpTo({ center: [only.lon, only.lat], zoom: 14 });
        } else if (pins.length > 1) {
          const bounds = new ml.LngLatBounds();
          for (const point of pins) bounds.extend([point.lon, point.lat]);
          next.fitBounds(bounds, { padding: { top: 112, right: 48, bottom: 48, left: 48 }, maxZoom: 15, duration: 0 });
        }
      });
      next.on("error", (event) => {
        if (ready) return;
        const message = event.error instanceof Error ? event.error.message : "";
        // A missing worker cannot draw tiles. A single tile error can still leave the map usable.
        if (/worker/i.test(message)) {
          stopWaiting();
          fail.current?.();
        }
      });
      const stopsPerDay = new Map<number, number>();
      for (const point of pins) if (point.kind === "stop") stopsPerDay.set(point.day, (stopsPerDay.get(point.day) ?? 0) + 1);
      if (replay && pins.length > 1) {
        const finish = [...dayStart.entries()].reduce((latest, [, start]) => Math.max(latest, start), 0);
        const total = lines.reduce((sum, line) => sum + totalMs(legsFor(line.coords)) + 500, 0);
        timeouts.push(
          window.setTimeout(() => {
            const bounds = new ml.LngLatBounds();
            for (const point of pins) bounds.extend([point.lon, point.lat]);
            (next as unknown as { fitBounds?: (b: unknown, o: unknown) => void }).fitBounds?.(bounds, { padding: { top: 112, right: 48, bottom: 48, left: 48 }, maxZoom: 15, duration: 900 });
          }, Math.max(total, finish) + 600),
        );
      }
      for (const point of pins) {
        const wrap = document.createElement("div");
        wrap.className = "map-marker";
        const button = document.createElement(interactive ? "button" : "span");
        if (button instanceof HTMLButtonElement) button.type = "button";
        button.dataset.pin = point.id;
        button.dataset.pinIcon = pinIconName(point);
        if (interactive) button.setAttribute("aria-label", pinLabel(point));
        else button.setAttribute("aria-hidden", "true");
        button.className = "map-pin inline-flex rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";
        // Each pin lands as the route reaches it.
        const hops = Math.max(0, (stopsPerDay.get(point.day) ?? 1) - 1);
        const delay = still || point.kind !== "stop" ? 0 : Math.max(0, (point.order ?? 1) - 1) * legMs(hops) + (dayStart.get(point.day) ?? 0);
        if (replay && point.kind === "stop") {
          // The camera hops to each stop as the route reaches it.
          timeouts.push(window.setTimeout(() => (next as unknown as { easeTo?: (o: unknown) => void }).easeTo?.({ center: [point.lon, point.lat], zoom: 12.5, duration: 700 }), delay));
        }
        button.style.animationDelay = `${Math.round(delay)}ms`;
        if (point.id === current) {
          button.setAttribute("aria-current", "true");
          wrap.setAttribute("data-open", "true");
        }
        if (interactive) {
          button.addEventListener("click", () => {
            wrap.parentElement?.querySelectorAll(".map-marker").forEach((node) => {
              node.removeAttribute("data-open");
              node.querySelector("[data-pin]")?.removeAttribute("aria-current");
            });
            wrap.setAttribute("data-open", "true");
            button.setAttribute("aria-current", "true");
            select.current(point.id);
          });
        }
        const root = createRoot(button);
        root.render(<PinFace point={point} />);
        roots.push(root);
        wrap.append(button);
        if (point.kind === "stop" && point.order === 1) {
          const start = document.createElement("span");
          start.className = "map-pin-start";
          start.textContent = "Start";
          wrap.append(start);
        }
        if (interactive) wrap.append(pinCard(point));
        new ml.Marker({ element: wrap, anchor: "bottom" }).setLngLat([point.lon, point.lat]).addTo(next);
      }
    })().catch(() => {
      window.clearTimeout(timer);
      fail.current?.();
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      for (const frame of frames) cancelAnimationFrame(frame);
      for (const id of timeouts) window.clearTimeout(id);
      for (const root of roots) root.unmount();
      mapRef.current = null;
      map?.remove();
    };
  }, [signature, cooperativeGestures, interactive, tilt, playKey]);

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.querySelectorAll<HTMLElement>(".map-marker").forEach((marker) => {
      const button = marker.querySelector<HTMLButtonElement>("[data-pin]");
      const chosen = Boolean(selectedId) && button?.dataset.pin === selectedId;
      if (chosen) {
        button?.setAttribute("aria-current", "true");
        marker.setAttribute("data-open", "true");
      } else {
        button?.removeAttribute("aria-current");
        marker.removeAttribute("data-open");
      }
    });
    // Bring the chosen pin into view, so choosing a stop from the list shows where it is.
    const chosen = data.current.points.find((point) => point.id === selectedId);
    if (chosen) mapRef.current?.easeTo({ center: [chosen.lon, chosen.lat], duration: 500 });
  }, [selectedId]);

  const heightCss = typeof height === "number" ? `${height}px` : height;
  return <div ref={host} role="region" aria-label="Map" className="w-full overflow-hidden rounded-card" style={{ height: heightCss }} />;
}
