import { shareText, tripRecap, tripStops, type TripSnapshot } from "@hoppin/core";
import { ArrowLeft, Dices, ImagePlus, Lock, Plus, Share2, Shuffle, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { BitmapThumb } from "../components/poster/BitmapThumb";
import { EditTools } from "../components/poster/EditTools";
import { PosterCanvas } from "../components/poster/PosterCanvas";
import { SlotHandles, type EditMode } from "../components/poster/SlotHandles";
import { Banner } from "../components/ui/Banner";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { cn } from "../lib/cn";
import { downloadBlob, safeFileName } from "../lib/download";
import { loadForPoster, PhotoProblem } from "../lib/photo-process";
import { demoPhotos } from "../poster/demo";
import { posterData } from "../poster/from-recap";
import { POSTER_PALETTES, posterPalette } from "../poster/palette";
import { getTemplate, MAX_PHOTOS, PHOTO_COUNTS, TEMPLATES } from "../poster/registry";
import { artArea, ensurePosterFonts, frameFor, makeCtx, renderPosterBlob, SIZES } from "../poster/render";
import { editAt, placeSlots, type SlotEdits } from "../poster/slots";
import type { PosterSize, SlotEdit } from "../poster/types";
import { useTheme } from "../theme/ThemeProvider";

type Kind = "trip" | "day";
type Step = "browse" | "editor";
interface Picked {
  id: number;
  bitmap: ImageBitmap;
}

const KINDS: [Kind, string][] = [
  ["trip", "Trip poster"],
  ["day", "Day card"],
];
const MEMORY_KEY = "hoppin.poster";
const photoWord = (n: number) => (n === 1 ? "1 photo" : `${n} photos`);

function remembered(): { tpl?: string; palette?: string; size?: PosterSize } {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? "{}") as { tpl?: string; palette?: string; size?: PosterSize };
  } catch {
    return {};
  }
}
function remember(value: { tpl: string; palette: string; size: PosterSize }) {
  try {
    localStorage.setItem(MEMORY_KEY, JSON.stringify(value));
  } catch {
    /* not remembered, still works */
  }
}

/** Measures an element, so the preview can be as large as the space allows. */
function useSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 320, h: 420 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => entry && setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

function Chip({ on, children, onClick, label }: { on: boolean; children: ReactNode; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-all active:scale-95 focus-visible:outline-2 focus-visible:outline-accent",
        on ? "border-fg bg-fg text-bg" : "border-line bg-surface text-muted",
      )}
    >
      {children}
    </button>
  );
}

function Switch({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-accent", on ? "bg-link" : "bg-line")}
      >
        <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
      </button>
    </div>
  );
}

/** Make a poster or card from the trip and share it. Everything is drawn on the phone; picked photos are never uploaded. */
export default function Posters() {
  const trip = useTripData();
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  return <Studio snapshot={trip.snapshot} tripId={trip.tripId} />;
}

function Studio({ snapshot, tripId }: { snapshot: TripSnapshot; tripId: string }) {
  const { clock } = useServices();
  const { palette: appPalette } = useTheme();
  const navigate = useNavigate();
  const memory = useMemo(remembered, []);

  const [step, setStep] = useState<Step>("browse");
  const [kind, setKind] = useState<Kind>("trip");
  const [tplId, setTplId] = useState(memory.tpl ?? "stickers");
  const [paletteId, setPaletteId] = useState(memory.palette && POSTER_PALETTES.includes(memory.palette) ? memory.palette : appPalette);
  const [size, setSize] = useState<PosterSize>(memory.size ?? "story");
  const [seed, setSeed] = useState(1);
  const [animate, setAnimate] = useState(true);
  const [playKey, setPlayKey] = useState(0);
  const [showNames, setShowNames] = useState(true);
  const [showDates, setShowDates] = useState(true);
  const [countFilter, setCountFilter] = useState<number | null>(null);
  const [moodFilter, setMoodFilter] = useState<"funky" | "aesthetic" | null>(null);
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [edits, setEdits] = useState<Record<string, SlotEdits>>({});
  const [selected, setSelected] = useState(-1);
  const [mode, setMode] = useState<EditMode>("move");
  const [tab, setTab] = useState<"photos" | "look" | "share">("photos");
  const [adding, setAdding] = useState(false);
  const [preparing, setPreparing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [readout, setReadout] = useState<{ text: string; snapped: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [done, setDone] = useState<"shared" | "saved" | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [stageRef, stage] = useSize<HTMLDivElement>();
  const fileInput = useRef<HTMLInputElement>(null);
  const target = useRef<number | "add">("add");
  const frontCounter = useRef(1);
  const nextId = useRef(1);
  const photosRef = useRef<Picked[]>([]);
  photosRef.current = photos;

  // Photos live only in this screen's memory: freed when the screen closes.
  useEffect(() => () => photosRef.current.forEach((p) => p.bitmap.close()), []);
  useEffect(() => {
    let live = true;
    void ensurePosterFonts().then(() => live && setFontsReady(true));
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => remember({ tpl: tplId, palette: paletteId, size }), [tplId, paletteId, size]);

  const tz = clock.timeZone;
  const recap = useMemo(
    () => tripRecap({ items: snapshot.items, rsvps: snapshot.rsvps, members: snapshot.members, startDate: snapshot.trip.startDate, endDate: snapshot.trip.endDate, tz }),
    [snapshot, tz],
  );
  const days = useMemo(() => tripStops(snapshot.items, "\u0000poster", new Set(), snapshot.trip.startDate, snapshot.trip.endDate, tz).map((d) => d.date), [snapshot, tz]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(clock.now()));
  const [date, setDate] = useState(() => (days.includes(today) ? today : (recap.busiest?.date ?? days[0] ?? today)));

  const tpl = getTemplate(tplId);
  const sources = useMemo(() => photos.map((p) => p.bitmap), [photos]);
  const data = useMemo(
    () => posterData(snapshot, { kind: kind === "day" ? "day" : "trip", date, tz, photos: sources, showNames, showDates }),
    [snapshot, kind, date, tz, sources, showNames, showDates],
  );
  const previewData = useMemo(() => (photos.length ? data : { ...data, photos: demoPhotos(MAX_PHOTOS) }), [data, photos.length]);
  const tplEdits = useMemo(() => edits[tplId] ?? [], [edits, tplId]);
  const frame = useMemo(() => frameFor(size), [size]);
  const art = useMemo(() => artArea(size), [size]);
  const ctx = useMemo(() => makeCtx(art.frame, posterPalette(paletteId), data, { seed }), [art, paletteId, data, seed]);
  const placed = useMemo(() => placeSlots(tpl, ctx, tplEdits), [tpl, ctx, tplEdits]);
  const previewW = Math.max(160, Math.min(stage.w * 0.94, (stage.h - 8) * (frame.w / frame.h)));
  const scale = previewW / frame.w;
  const hasRoute = recap.routes.some((r) => r.stops.length > 0);

  const edit = useCallback(
    (index: number, change: Partial<SlotEdit> & { front?: number }) =>
      setEdits((all) => {
        const list = [...(all[tplId] ?? [])];
        list[index] = { ...editAt(list, index), ...(list[index]?.front ? { front: list[index]!.front } : {}), ...change };
        return { ...all, [tplId]: list };
      }),
    [tplId],
  );

  function chooseTemplate(id: string, replay = true) {
    setTplId(id);
    setSelected(-1);
    setMode("move");
    if (replay) setPlayKey((k) => k + 1);
  }

  function pick(forSlot: number | "add") {
    target.current = forSlot;
    fileInput.current?.click();
  }

  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    setNotice(null);
    const into = target.current;
    const room = into === "add" ? MAX_PHOTOS - photosRef.current.length : files.length;
    const list = into === "add" ? files.slice(0, Math.max(0, room)) : files.slice(0, 1);
    if (into === "add" && files.length > room) setNotice(room > 0 ? `Up to ${MAX_PHOTOS} photos. The first ${room} were added.` : `You already have ${MAX_PHOTOS} photos. Remove one to add another.`);
    const problems: string[] = [];
    for (let i = 0; i < list.length; i += 1) {
      setPreparing(`Preparing ${i + 1} of ${list.length}`);
      try {
        const bitmap = await loadForPoster(list[i]!);
        const fresh = { id: nextId.current++, bitmap };
        setPhotos((current) => {
          if (typeof into === "number" && into < current.length) {
            current[into]!.bitmap.close();
            return current.map((p, k) => (k === into ? fresh : p));
          }
          return [...current, fresh];
        });
        if (typeof into === "number") edit(into, { ox: 50, oy: 50, z: 1 });
      } catch (error) {
        problems.push(error instanceof PhotoProblem ? error.message : "Couldn't open that photo. Try another one.");
      }
    }
    setPreparing(null);
    if (problems.length) setNotice(problems.length === 1 ? problems[0]! : `${problems.length} photos couldn't be used. ${problems[0]}`);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      current[index]?.bitmap.close();
      return current.filter((_, k) => k !== index);
    });
    setEdits({});
    setSelected(-1);
  }

  function swap(a: number, b: number) {
    if (a === b || !photos[a] || !photos[b]) return;
    setPhotos((current) => current.map((p, k) => (k === a ? current[b]! : k === b ? current[a]! : p)));
  }

  /** Lets go of every photo now (they stay in the phone's gallery). */
  function freePhotos() {
    photosRef.current.forEach((p) => p.bitmap.close());
    photosRef.current = [];
    setPhotos([]);
    setEdits({});
  }

  async function makePicture(action: "share" | "save") {
    setBusy(true);
    setShareError(null);
    setSelected(-1);
    try {
      // The full-size picture exists only inside this function; its canvas is freed by renderPosterBlob.
      const blob = await renderPosterBlob(tpl, data, paletteId, size, { seed, edits: tplEdits });
      const name = `${safeFileName(snapshot.trip.name)}-${tpl.id}.png`;
      const file = new File([blob], name, { type: "image/png" });
      let shared = false;
      if (action === "share" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: shareText(recap, snapshot.trip.name) });
          shared = true;
        } catch (error) {
          if ((error as { name?: string }).name === "AbortError") return;
          throw error;
        }
      } else downloadBlob(name, blob);
      setDone(shared ? "shared" : "saved");
    } catch {
      setShareError("Couldn't make the picture just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const visible = TEMPLATES.filter((t) => (countFilter == null || t.photos === countFilter) && (moodFilter == null || t.mood === moodFilter));
  const sel = selected >= 0 ? placed[selected] : undefined;
  const label = (name: string) => `${name} poster preview`;

  const header = (
    <div className="flex flex-col gap-3">
      <Link to={`/trips/${tripId}/more`} className="w-fit text-sm font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
        Back to More
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="page-title text-5xl">Make a poster</h2>
        <p className="text-sm text-muted">Drawn on your phone from the trip's plan. Photos you pick stay on your phone.</p>
      </div>
      <div role="radiogroup" aria-label="Kind of poster" className="flex rounded-full bg-raised p-1">
        {KINDS.map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={kind === value}
            onClick={() => {
              setKind(value);
              setPlayKey((k) => k + 1);
            }}
            className={cn(
              "min-h-10 flex-1 rounded-full text-sm font-semibold text-muted transition-all focus-visible:outline-2 focus-visible:outline-accent",
              kind === value && "bg-surface text-fg shadow-card",
            )}
          >
            {text}
          </button>
        ))}
      </div>
      {kind === "day" && days.length > 0 && (
        <label className="flex items-center gap-3 text-sm font-medium">
          Day
          <select value={date} onChange={(e) => setDate(e.target.value)} className="min-h-11 flex-1 rounded-2xl border border-line bg-surface px-3">
            {days.map((d, i) => (
              <option key={d} value={d}>
                Day {i + 1} · {new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`))}
              </option>
            ))}
          </select>
        </label>
      )}
      {!hasRoute && <p className="text-sm text-muted">Add places to your plans and your real route shows on the poster.</p>}
    </div>
  );

  const fileField = (
    <input
      ref={fileInput}
      type="file"
      accept="image/*"
      multiple
      hidden
      data-testid="poster-photos"
      onChange={(e) => {
        const files = [...(e.target.files ?? [])];
        e.target.value = "";
        void addFiles(files);
      }}
    />
  );

  const photoSheet = (
    <Sheet open={adding} onOpenChange={setAdding} title={tpl.photos === 1 ? "Add a photo" : `Add ${tpl.photos} photos`} description={`${tpl.name} fits ${photoWord(tpl.photos)}. Pick ${tpl.photos === 1 ? "it" : "them"} from your phone's gallery or your computer.`}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: Math.max(tpl.photos, photos.length) }, (_, i) => (
            <div key={i} className={cn("relative grid size-16 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-line bg-raised font-bold text-muted", photos[i] && "border-0", i >= tpl.photos && "opacity-60")}>
              {photos[i] ? <BitmapThumb photo={photos[i]!.bitmap} size={64} label={`Photo ${i + 1}`} /> : i + 1}
            </div>
          ))}
        </div>
        <Button variant="secondary" onClick={() => pick("add")} disabled={photos.length >= MAX_PHOTOS || Boolean(preparing)}>
          <ImagePlus aria-hidden="true" className="size-4" />
          {photos.length ? "Add more photos" : "Choose photos"}
        </Button>
        {preparing && <p role="status" className="text-center text-sm text-muted">{preparing}</p>}
        {notice && <p role="alert" className="text-sm text-danger-fg">{notice}</p>}
        <Button
          disabled={Boolean(preparing)}
          onClick={() => {
            setAdding(false);
            setStep("editor");
            setTab("photos");
            setPlayKey((k) => k + 1);
          }}
        >
          {photos.length === 0 ? "Continue without photos" : photos.length < tpl.photos ? `Continue with ${photos.length} of ${tpl.photos}` : "Make my poster"}
        </Button>
        <p className="flex items-center justify-center gap-2 text-xs text-muted">
          <Lock aria-hidden="true" className="size-3.5" />
          Photos from your phone stay on your phone. Nothing is uploaded.
        </p>
      </div>
    </Sheet>
  );

  if (step === "browse") {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Number of photos">
          <Chip on={countFilter == null} onClick={() => setCountFilter(null)}>
            Any number
          </Chip>
          {PHOTO_COUNTS.map((n) => (
            <Chip key={n} on={countFilter === n} onClick={() => setCountFilter(countFilter === n ? null : n)}>
              {photoWord(n)}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2" role="group" aria-label="Style">
          <Chip on={moodFilter == null} onClick={() => setMoodFilter(null)}>
            All styles
          </Chip>
          <Chip on={moodFilter === "funky"} onClick={() => setMoodFilter(moodFilter === "funky" ? null : "funky")}>
            Funky
          </Chip>
          <Chip on={moodFilter === "aesthetic"} onClick={() => setMoodFilter(moodFilter === "aesthetic" ? null : "aesthetic")}>
            Aesthetic
          </Chip>
        </div>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
          {visible.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  chooseTemplate(t.id);
                  setAdding(true);
                }}
                className="flex w-full flex-col items-center gap-2 rounded-2xl text-left transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="overflow-hidden rounded-2xl shadow-card">
                  {fontsReady && <PosterCanvas tpl={t} data={previewData} paletteId={paletteId} size="story" seed={seed} width={150} label={label(t.name)} />}
                  {!fontsReady && <span className="block h-[267px] w-[150px] animate-pulse bg-raised" />}
                </span>
                <span className="flex w-[150px] items-start justify-between gap-1">
                  <span>
                    <span className="block text-sm font-semibold">{t.name}</span>
                    <span className="block text-xs text-muted">
                      {photoWord(t.photos)} · {t.mood === "funky" ? "Funky" : "Aesthetic"}
                    </span>
                  </span>
                  {t.isNew && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase text-accent-soft-fg">New</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {visible.length === 0 && <p className="text-sm text-muted">No templates match. Try another filter.</p>}
        {fileField}
        {photoSheet}
      </div>
    );
  }

  const tabs = (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Poster options" className="flex gap-1 rounded-full bg-raised p-1">
        {(
          [
            ["photos", "Photos"],
            ["look", "Look"],
            ["share", "Share"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn("min-h-10 flex-1 rounded-full text-sm font-semibold text-muted focus-visible:outline-2 focus-visible:outline-accent", tab === value && "bg-surface text-fg shadow-card")}
          >
            {text}
          </button>
        ))}
      </div>

      {tab === "photos" && (
        <div role="tabpanel" aria-label="Photos" className="flex flex-col gap-3">
          <ul className="-mx-1 flex gap-2.5 overflow-x-auto px-1.5 pb-1 pt-2">
            {photos.map((p, i) => (
              <li key={p.id} className={cn("relative shrink-0", i >= tpl.photos && "opacity-60")}>
                <button
                  type="button"
                  aria-label={i < tpl.photos ? `Edit photo ${i + 1}` : `Spare photo ${i + 1}`}
                  onClick={() => (i < tpl.photos ? setSelected(i) : selected >= 0 ? swap(i, selected) : setNotice("Spare photo. Tap a frame, then this photo, to swap it in."))}
                  className="block overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <BitmapThumb photo={p.bitmap} size={62} label="" />
                </button>
                <span aria-hidden="true" className="pointer-events-none absolute left-1 top-1 z-[3] grid size-5 place-items-center rounded-full bg-fg text-[11px] font-bold text-bg">
                  {i + 1}
                </span>
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => removePhoto(i)} className="!absolute -right-1.5 -top-1.5 !z-[3] grid size-6 place-items-center rounded-full bg-fg text-bg shadow">
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              </li>
            ))}
            {photos.length < MAX_PHOTOS && (
              <li className="shrink-0">
                <button type="button" aria-label="Add photos" onClick={() => pick("add")} className="grid size-[62px] place-items-center rounded-2xl border-2 border-dashed border-line text-muted focus-visible:outline-2 focus-visible:outline-accent">
                  <Plus aria-hidden="true" className="size-5" />
                </button>
              </li>
            )}
          </ul>
          {preparing && <p role="status" className="text-sm text-muted">{preparing}</p>}
          {notice && <p role="alert" className="text-sm text-danger-fg">{notice}</p>}
          <p className="text-sm text-muted">
            {photos.length < tpl.photos ? `${tpl.photos - photos.length} empty ${tpl.photos - photos.length === 1 ? "frame" : "frames"}. Tap + on the poster to fill it.` : "Tap a photo on the poster to move, turn or resize it."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={photos.length < 2}
              onClick={() => {
                setPhotos((current) => [...current.slice(1), current[0]!]);
                setPlayKey((k) => k + 1);
              }}
            >
              <Shuffle aria-hidden="true" className="size-4" />
              Shuffle photos
            </Button>
            <Button variant="ghost" onClick={() => setEdits((all) => ({ ...all, [tplId]: [] }))}>
              Reset edits
            </Button>
          </div>
          <p className="flex items-center gap-2 text-xs text-muted">
            <Lock aria-hidden="true" className="size-3.5" />
            Photos from your phone stay on your phone.
          </p>
        </div>
      )}

      {tab === "look" && (
        <div role="tabpanel" aria-label="Look" className="flex flex-col gap-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Template</p>
          <ul className="flex gap-2.5 overflow-x-auto pb-1">
            {[...TEMPLATES]
              .sort((a, b) => Number(b.photos === tpl.photos) - Number(a.photos === tpl.photos))
              .map((t) => (
                <li key={t.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={t.id === tplId}
                    onClick={() => chooseTemplate(t.id)}
                    className="flex w-[68px] flex-col items-center gap-1 text-center focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <span className={cn("overflow-hidden rounded-xl ring-1 ring-line transition-all", t.id === tplId && "-translate-y-0.5 ring-[3px] ring-link")}>
                      <PosterCanvas tpl={t} data={previewData} paletteId={paletteId} size={size} seed={seed} width={68} label={label(t.name)} />
                    </span>
                    <span className="w-full truncate text-[11px] font-semibold">{t.name}</span>
                  </button>
                </li>
              ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                const others = TEMPLATES.filter((t) => t.id !== tplId);
                chooseTemplate(others[Math.floor(Math.random() * others.length)]!.id);
              }}
            >
              <Dices aria-hidden="true" className="size-4" />
              Surprise me
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setSeed((s) => s + 1);
                setPlayKey((k) => k + 1);
              }}
            >
              <Sparkles aria-hidden="true" className="size-4" />
              Shuffle the look
            </Button>
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Colours</p>
          <div role="radiogroup" aria-label="Colours" className="flex gap-3">
            {POSTER_PALETTES.map((id) => {
              const p = posterPalette(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={id === paletteId}
                  aria-label={p.name}
                  onClick={() => setPaletteId(id)}
                  className={cn("size-11 rounded-full transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-accent", id === paletteId && "ring-2 ring-fg ring-offset-2 ring-offset-surface")}
                  style={{ background: `conic-gradient(${p.hero} 0 50%, ${p.accent} 0 75%, ${p.hl} 0)` }}
                />
              );
            })}
          </div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Size</p>
          <div role="radiogroup" aria-label="Size" className="flex rounded-2xl bg-raised p-1">
            {(Object.keys(SIZES) as PosterSize[]).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={size === s}
                onClick={() => {
                  // Story and A4 share one layout, so edits carry over; Square has its own.
                  if ((s === "square") !== (size === "square")) setEdits((all) => ({ ...all, [tplId]: [] }));
                  setSize(s);
                }}
                className={cn("min-h-10 flex-1 rounded-xl text-sm font-semibold text-muted focus-visible:outline-2 focus-visible:outline-accent", size === s && "bg-surface text-fg shadow-card")}
              >
                {SIZES[s].label}
              </button>
            ))}
          </div>
          <Switch label="Animate the preview" hint="Photos drop in and the route draws itself" on={animate} onChange={(on) => { setAnimate(on); if (on) setPlayKey((k) => k + 1); }} />
          <Switch label="Show names" hint="First names only" on={showNames} onChange={setShowNames} />
          <Switch label="Show dates" on={showDates} onChange={setShowDates} />
        </div>
      )}

      {tab === "share" && (
        <div role="tabpanel" aria-label="Share" className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            {SIZES[size].label} · {SIZES[size].w} × {SIZES[size].h}. The picture is exactly the preview, drawn at full size on your phone.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button busy={busy} onClick={() => void makePicture("share")}>
              <Share2 aria-hidden="true" className="size-4" />
              Share
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => void makePicture("save")}>
              Save picture
            </Button>
          </div>
          {busy && <p role="status" className="text-sm text-muted">Making your poster…</p>}
          {shareError && <Banner kind="info" text={shareError} />}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back to templates"
          onClick={() => {
            setSelected(-1);
            setStep("browse");
          }}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-raised focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden="true" className="size-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <h2 className="truncate font-semibold">{tpl.name}</h2>
          <p className="text-xs text-muted">
            {SIZES[size].label} · {SIZES[size].w} × {SIZES[size].h}
          </p>
        </div>
        <Button className="min-h-10 px-4" busy={busy} onClick={() => void makePicture("share")}>
          <Share2 aria-hidden="true" className="size-4" />
          Share
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div ref={stageRef} className="relative flex h-[52dvh] min-h-[340px] items-center justify-center rounded-card bg-raised md:order-2 md:h-[70dvh]">
          <div className="relative" style={{ width: previewW, height: (previewW * frame.h) / frame.w }}>
            {fontsReady && (
              <PosterCanvas
                tpl={tpl}
                data={data}
                paletteId={paletteId}
                size={size}
                seed={seed}
                edits={tplEdits}
                editing
                width={previewW}
                playKey={`${playKey}-${tplId}`}
                animate={animate}
                label={`${tpl.name} poster. ${photos.length} of ${tpl.photos} photos.`}
                className="rounded-lg shadow-[0_24px_40px_-18px_rgba(16,20,40,0.5)]"
              />
            )}
            <div
              className="absolute"
              style={{ left: art.x * scale, top: art.y * scale, width: art.frame.w * art.scale * scale, height: art.frame.h * art.scale * scale }}
            >
            <SlotHandles
              slots={placed}
              scale={scale * art.scale}
              posterW={art.frame.w}
              posterH={art.frame.h}
              selected={selected}
              mode={mode}
              filled={(i) => Boolean(photos[i])}
              onSelect={(i) => {
                setSelected(i);
                if (i < 0) setMode("move");
              }}
              onPickFor={(i) => pick(i < photos.length ? i : "add")}
              onEdit={edit}
              onToggleMode={() => setMode((m) => (m === "move" ? "crop" : "move"))}
              onReadout={(text, snapped) => setReadout(text ? { text, snapped: Boolean(snapped) } : null)}
            />
            </div>
          </div>
          {readout && (
            <span role="status" className={cn("absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1 text-xs font-bold text-white", readout.snapped ? "bg-link" : "bg-fg")}>
              {readout.text}
            </span>
          )}
        </div>

        <div className="md:order-1">
          {sel ? (
            <EditTools
              index={sel.index}
              photo={photos[sel.index]?.bitmap}
              edit={sel.edit}
              baseRot={sel.baseRot}
              mode={mode}
              canSwap={Math.min(photos.length, tpl.photos) > 1}
              onMode={setMode}
              onEdit={(change) => edit(sel.index, change)}
              onReplace={() => pick(sel.index)}
              onSwap={() => swap(sel.index, (sel.index + 1) % Math.min(photos.length, tpl.photos))}
              onFront={() => edit(sel.index, { front: frontCounter.current++ })}
              onReset={() => setEdits((all) => ({ ...all, [tplId]: (all[tplId] ?? []).map((e, k) => (k === sel.index ? null : e)) }))}
              onRemove={() => removePhoto(sel.index)}
              onDone={() => setSelected(-1)}
            />
          ) : (
            tabs
          )}
        </div>
      </div>

      {fileField}
      {photoSheet}
      <Sheet open={done != null} onOpenChange={(open) => !open && setDone(null)} title="Your poster is ready" description={done === "shared" ? "Shared. The full-size picture has already been cleared from memory." : "Saved to your downloads. The full-size picture has already been cleared from memory."}>
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              setDone(null);
              freePhotos();
              navigate(`/trips/${tripId}/more`);
            }}
          >
            Done
          </Button>
          <Button variant="secondary" onClick={() => setDone(null)}>
            Make another
          </Button>
          <p className="text-xs text-muted">Done also lets go of the photos you picked. They're still in your gallery.</p>
        </div>
      </Sheet>
    </div>
  );
}
