import { formatTimeRange, pollOnPlan, stayNote, tallyPoll, type DayLayout, type Item, type Poll, type Vote } from "@hoppin/core";
import { m } from "motion/react";
import { BedDouble, ChevronDown, Navigation, Vote as VoteIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/cn";
import { springSoft } from "../lib/motion";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { BinButton, ConfirmDelete } from "./ConfirmDelete";
import { KindTag } from "./kind";
import { Sheet } from "./ui/Sheet";

export interface Person {
  name: string;
  color: string;
}

export interface DayViewProps {
  /** Calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Time zone the day is shown in (also the zone of the clock times on the group blocks). */
  tz: string;
  layout: DayLayout;
  people: Record<string, Person>;
  viewerId: string;
  /** User ids who said "I'm in", by item id. */
  goingByItem: Record<string, string[]>;
  onJoin: (itemId: string) => void | Promise<void>;
  /** Drops the viewer's RSVP for an optional plan they already joined. */
  onLeave: (itemId: string) => void | Promise<void>;
  /** The plan to spotlight with the big colour block (the one happening now, or next up). */
  highlightId?: string | null;
  /** Shown at the right of the day heading (for example an "Add plan" button). */
  headerAction?: React.ReactNode;
  /** Lets the app turn a block's title into a link to its detail page. */
  renderBlockTitle?: (item: Item) => React.ReactNode;
  /** Shows an Edit button on each plan this returns true for, and calls `onEdit` with it. */
  canEditItem?: (item: Item) => boolean;
  onEdit?: (item: Item) => void;
  /** Removes a plan this person may change. Shown beside Edit. */
  onRemove?: (item: Item) => void;
  /** Polls in this trip, so a plan that came from one can show each option's votes. */
  polls?: Poll[];
  votes?: Vote[];
}

const LIST = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } } };
const ITEM = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: springSoft } };

const UNKNOWN: Person = { name: "Someone", color: "#475569" };
/** Faces on a day card before the rest collapse into +N. */
const CARD_FACES = 4;

/** Overlapping member faces. Extra people become a +N chip when they would not fit. */
function FacePile({ ids, person, limit }: { ids: string[]; person: (id: string) => Person; limit: number }) {
  if (ids.length === 0) return null;
  const shown = ids.length > limit ? ids.slice(0, limit) : ids;
  const extra = ids.length - shown.length;
  return (
    <div className="flex -space-x-2" role="group" aria-label={`${ids.length} going`}>
      {shown.map((id) => {
        const who = person(id);
        return (
          <m.span key={id} role="img" aria-label={who.name} initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex">
            <Avatar name={who.name} color={who.color} className="size-8 ring-2 ring-surface" />
          </m.span>
        );
      })}
      {extra > 0 && (
        <span
          aria-label={`${extra} more`}
          className="z-10 inline-flex size-8 items-center justify-center rounded-full bg-raised text-xs font-semibold ring-2 ring-surface"
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

function timeLabel(item: Item, zone: string): string {
  return formatTimeRange(item.startsAt, item.endsAt, zone, zone);
}

/** Cities a traveller is likely to read a day in, plus whatever zone a plan on the day already uses. */
const TRAVEL_ZONES = [
  "Pacific/Honolulu",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Istanbul",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function zoneOffsetMinutes(zone: string, date: string): number {
  try {
    const name = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset", hour: "2-digit" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")?.value ?? "";
    const match = /GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?/.exec(name);
    if (!match?.[1]) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    return sign * (Number(match[2]) * 60 + Number(match[3] ?? "0"));
  } catch {
    return 0;
  }
}

function zoneChoices(date: string, fallback: string, items: Item[]): string[] {
  const zones = new Set<string>([fallback, ...TRAVEL_ZONES]);
  for (const item of items) {
    zones.add(item.tz);
    if (item.endTz) zones.add(item.endTz);
  }
  return [...zones]
    .filter(knownZone)
    .sort((a, b) => zoneOffsetMinutes(a, date) - zoneOffsetMinutes(b, date) || a.localeCompare(b));
}

function zoneLabel(zone: string, date: string): string {
  const city = zone === "UTC" ? "UTC" : (zone.split("/").pop() ?? zone).replaceAll("_", " ");
  try {
    const name = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset", hour: "2-digit" })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((part) => part.type === "timeZoneName")?.value;
    return name ? `${city} · ${name}` : city;
  } catch {
    return city;
  }
}

function hourOf(iso: string, zone: string): number {
  const value = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return Number(value);
}

/** Hours that have a plan, in order. An hour with nothing planned is left off the timeline. */
function hourMarks(hours: number[]): number[] {
  return [...new Set(hours)].sort((a, b) => a - b);
}

function hourText(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "Wednesday" and "4 November", shown as a small line above a big one. */
function dateParts(date: string): { weekday: string; rest: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(at);
  return { weekday: fmt({ weekday: "long" }), rest: fmt({ day: "numeric", month: "long" }) };
}

/** "Get directions" for a plan with a map link, right on its card so nobody has to open the plan first. */
function Directions({ item, tone = "light" }: { item: Item; tone?: "light" | "dark" }) {
  if (!item.locationUrl) return null;
  return (
    <a
      href={item.locationUrl}
      target="_blank"
      rel="noreferrer"
      aria-label={`Get directions to ${item.title}`}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent",
        tone === "dark" ? "bg-white/15 text-hero-fg hover:bg-white/25" : "bg-raised text-link hover:bg-line",
      )}
    >
      <Navigation aria-hidden="true" className="size-4" />
      Get directions
    </a>
  );
}

function PollTag({ onHero }: { onHero: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", onHero ? "bg-white/20 text-hero-fg" : "bg-accent-soft text-accent-soft-fg")}>
      <VoteIcon aria-hidden="true" className="size-3.5" />
      Poll
    </span>
  );
}

/** The question and how many votes each option has, on the day the poll was added to. */
function PollResults({ poll, votes, onHero }: { poll: Poll; votes: Vote[]; onHero: boolean }) {
  const tally = tallyPoll(poll, votes);
  const countOf = (optionId: string) => tally.find((line) => line.option === optionId)?.count ?? 0;
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {poll.question && (
        <p className={cn("text-sm", onHero ? "text-hero-muted" : "text-muted")}>{poll.question}</p>
      )}
      <ul className="flex flex-col gap-1">
        {poll.options.map((option) => {
          const count = countOf(option.id);
          return (
            <li key={option.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">{option.label}</span>
              <span className={cn("shrink-0 tabular-nums", onHero ? "text-hero-muted" : "text-muted")}>
                {count} {count === 1 ? "vote" : "votes"}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function planNotes(item: Item): string {
  const notes = item.details.notes;
  return typeof notes === "string" ? notes.trim() : "";
}

/** One day of the trip: group blocks, optional plans as their own cards, and the viewer's private plans. */
export function DayView({ date, tz, layout, people, viewerId, goingByItem, onJoin, onLeave, renderBlockTitle, highlightId, headerAction, canEditItem, onEdit, onRemove, polls = [], votes = [] }: DayViewProps) {
  const [zone, setZone] = useState(tz);
  useEffect(() => setZone(tz), [tz]);
  const [selected, setSelected] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const [pending, setPending] = useState<{ id: string; going: boolean } | null>(null);
  useEffect(() => {
    if (!pending) return;
    const joined = (goingByItem[pending.id] ?? []).includes(viewerId);
    if (joined === pending.going) setPending(null);
  }, [pending, goingByItem, viewerId]);
  const person = (id: string) => people[id] ?? UNKNOWN;

  const empty =
    layout.blocks.length === 0 && layout.privateLines.length === 0 && Object.keys(layout.chips).length === 0;
  const going = selected ? (goingByItem[selected.id] ?? []) : [];
  const stays = layout.blocks.filter((block) => block.kind === "stay");
  const others = layout.blocks.filter((block) => block.kind !== "stay");
  const optionals = Object.values(layout.chips).flat();
  type Slot = { item: Item; kind: "group" | "optional" | "private" };
  const slots: Slot[] = [
    ...others.map((item) => ({ item, kind: "group" as const })),
    ...optionals.map((item) => ({ item, kind: "optional" as const })),
    ...layout.privateLines.map((item) => ({ item, kind: "private" as const })),
  ].sort((a, b) => Date.parse(a.item.startsAt) - Date.parse(b.item.startsAt) || a.item.title.localeCompare(b.item.title));
  const byHour = new Map<number, Slot[]>();
  for (const slot of slots) {
    const hour = hourOf(slot.item.startsAt, zone);
    byHour.set(hour, [...(byHour.get(hour) ?? []), slot]);
  }
  const marks = hourMarks([...byHour.keys()]);
  const zones = zoneChoices(date, tz, [...layout.blocks, ...optionals, ...layout.privateLines]);
  const allowed = (item: Item) => (canEditItem ? canEditItem(item) : true);
  const editable = (item: Item) => !!onEdit && allowed(item);
  const removable = (item: Item) => !!onRemove && allowed(item);
  const pollOf = (item: Item) => pollOnPlan(item, polls);
  const removeButton = (item: Item, tone: "light" | "dark" = "light") => (
    <BinButton label={`Delete ${item.title}`} onHero={tone === "dark"} onClick={() => setConfirming(item)} />
  );
  const editButton = (item: Item, tone: "light" | "dark" = "light") => (
    <button
      type="button"
      aria-label={`Edit ${item.title}`}
      onClick={() => onEdit?.(item)}
      className={cn(
        "-my-1 min-h-11 shrink-0 rounded-full px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent",
        tone === "dark" ? "text-hero-fg hover:bg-white/10" : "text-link hover:bg-raised",
      )}
    >
      Edit
    </button>
  );
  const choose = (id: string, going: boolean) => {
    setPending({ id, going });
    const action = going ? onJoin(id) : onLeave(id);
    void Promise.resolve(action).catch(() => setPending((current) => (current?.id === id ? null : current)));
  };
  const rsvpButton = (item: Item) => {
    const joined = (goingByItem[item.id] ?? []).includes(viewerId);
    const mine = pending?.id === item.id ? pending : null;
    if (mine && mine.going !== joined) {
      const label = mine.going ? `Joining ${item.title}` : `Leaving ${item.title}`;
      return (
        <Button busy aria-label={label}>
          {mine.going ? "Joining" : "Leaving"}
        </Button>
      );
    }
    if (joined) {
      return (
        <>
          <span className="text-sm font-semibold">You're in</span>
          <Button variant="secondary" aria-label={`Opt out of ${item.title}`} onClick={() => choose(item.id, false)}>
            Opt out
          </Button>
        </>
      );
    }
    return (
      <Button aria-label={`Join ${item.title}`} onClick={() => choose(item.id, true)}>
        Join
      </Button>
    );
  };
  const planActions = (item: Item, tone: "light" | "dark" = "light") =>
    editable(item) || removable(item) ? (
      <div className="flex shrink-0">
        {editable(item) && editButton(item, tone)}
        {removable(item) && removeButton(item, tone)}
      </div>
    ) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2>
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted">{dateParts(date).weekday}</span>{" "}
          <span className="editorial mt-1 block text-4xl leading-none">{dateParts(date).rest}</span>
        </h2>
        {headerAction}
      </div>

      {empty && <p className="text-muted">Nothing planned for this day yet.</p>}

      <m.div key={date} className="flex flex-col gap-3" variants={LIST} initial="hidden" animate="show">
      {stays.map((stay) => (
        <m.section key={stay.id} aria-label={stay.title} variants={ITEM}>
          <div className="rounded-card border-l-8 border-info-fg bg-info-bg p-4 text-info-fg">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <BedDouble aria-hidden="true" className="size-4 shrink-0" />
                  <span>Where you're staying</span>
                  <span aria-hidden="true">·</span>
                  <span>{stayNote(stay, date)}</span>
                </p>
                <p className="mt-1 font-display text-lg font-bold">{renderBlockTitle ? renderBlockTitle(stay) : stay.title}</p>
                <p className="text-sm font-medium">{timeLabel(stay, zone)}</p>
              </div>
              {planActions(stay)}
            </div>
            {pollOf(stay) && <PollResults poll={pollOf(stay)!} votes={votes} onHero={false} />}
            <div className="mt-1">
              <Directions item={stay} />
            </div>
          </div>
        </m.section>
      ))}

      {marks.length > 0 && (
        <div className="mt-1">
          <div className="grid grid-cols-[3.25rem_1.25rem_minmax(0,1fr)] items-center">
            <span />
            <div className="relative flex h-8 justify-center" aria-hidden="true">
              <span className="absolute inset-y-0 w-px bg-line" />
              <span className="relative z-10 mt-2 size-2.5 rounded-full bg-accent ring-4 ring-bg" />
            </div>
            <div className="relative min-w-0 justify-self-start">
              <select
                aria-label="Time zone"
                value={zones.includes(zone) ? zone : tz}
                onChange={(event) => setZone(event.target.value)}
                className="max-w-full appearance-none rounded-full border border-line bg-raised py-1.5 pl-3 pr-8 text-xs font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent"
              >
                {zones.map((choice) => (
                  <option key={choice} value={choice}>
                    {zoneLabel(choice, date)}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted" />
            </div>
          </div>
          <ol aria-label="Timeline">
            {marks.map((hour) => {
              const plans = byHour.get(hour) ?? [];
              const marked = plans.some((slot) => slot.item.id === highlightId);
              return (
                <li key={hour} className="grid grid-cols-[3.25rem_1.25rem_minmax(0,1fr)]">
                  <time dateTime={hourText(hour)} className="pt-1.5 pr-2 text-right text-[11px] font-medium tabular-nums leading-none text-muted">
                    {hourText(hour)}
                  </time>
                  <div className="relative flex justify-center" aria-hidden="true">
                    <span className="absolute inset-y-0 w-px bg-line" />
                    {plans.length > 0 && (
                      <span className={cn("relative z-10 mt-1.5 size-2 rounded-full ring-4 ring-bg", marked ? "bg-accent" : "bg-fg")} />
                    )}
                  </div>
                  <div className={cn("min-h-8 pb-1", plans.length > 0 && "flex flex-col gap-3 pb-3")}>
                    {plans.map((slot) => {
                      const block = slot.item;
                      if (slot.kind === "optional") {
                        return (
                          <m.section key={block.id} aria-label={block.title} variants={ITEM}>
                            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
                              <div className="flex items-start justify-between gap-2">
                                <button
                                  type="button"
                                  aria-label={`Open ${block.title}`}
                                  onClick={() => setSelected(block)}
                                  className="min-w-0 text-left focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                  <p className="flex flex-wrap items-center gap-2">
                                    {pollOf(block) ? <PollTag onHero={false} /> : <KindTag kind={block.kind} />}
                                    <span className="text-xs font-semibold text-muted">{timeLabel(block, zone)}</span>
                                    <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold">Optional</span>
                                  </p>
                                  <p className="mt-1 font-display text-lg font-bold">{block.title}</p>
                                  <p className="text-sm text-muted">Added by {person(block.ownerId).name}</p>
                                </button>
                                {planActions(block)}
                              </div>
                              {pollOf(block) && <PollResults poll={pollOf(block)!} votes={votes} onHero={false} />}
                              {block.locationUrl && (
                                <div className="mt-1">
                                  <Directions item={block} />
                                </div>
                              )}
                              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                <FacePile ids={goingByItem[block.id] ?? []} person={person} limit={CARD_FACES} />
                                <div className="flex flex-wrap items-center gap-2">{rsvpButton(block)}</div>
                              </div>
                            </div>
                          </m.section>
                        );
                      }
                      if (slot.kind === "private") {
                        return (
                          <m.section key={block.id} aria-label={block.title} variants={ITEM}>
                            <div className="rounded-card border border-dashed border-line bg-surface p-4">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-2">
                                    {pollOf(block) ? <PollTag onHero={false} /> : <KindTag kind={block.kind} />}
                                    <span className="text-xs font-semibold text-muted">{timeLabel(block, zone)}</span>
                                    <span className="rounded-full bg-raised px-2 py-0.5 text-xs font-semibold">Only you</span>
                                  </p>
                                  <p className="mt-1 font-display text-lg font-bold">{renderBlockTitle ? renderBlockTitle(block) : block.title}</p>
                                </div>
                                {planActions(block)}
                              </div>
                              {pollOf(block) && <PollResults poll={pollOf(block)!} votes={votes} onHero={false} />}
                              {block.locationUrl && (
                                <div className="mt-1">
                                  <Directions item={block} />
                                </div>
                              )}
                            </div>
                          </m.section>
                        );
                      }
                      const spotlight = block.id === highlightId;
                      return (
                        <m.section key={block.id} aria-label={block.title} variants={ITEM}>
                          <div className={cn("rounded-card p-4", spotlight ? "bg-hero text-hero-fg" : "border border-line bg-surface shadow-card")}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-2">
                                  {pollOf(block) ? <PollTag onHero={spotlight} /> : <KindTag kind={block.kind} onHero={spotlight} />}
                                  <span className={cn("text-xs font-semibold", spotlight ? "text-hero-muted" : "text-muted")}>{timeLabel(block, zone)}</span>
                                </p>
                                <p className="mt-1 font-display text-lg font-bold">{renderBlockTitle ? renderBlockTitle(block) : block.title}</p>
                              </div>
                              {planActions(block, spotlight ? "dark" : "light")}
                            </div>
                            {pollOf(block) && <PollResults poll={pollOf(block)!} votes={votes} onHero={spotlight} />}
                            {block.locationUrl && (
                              <div className="mt-1">
                                <Directions item={block} tone={spotlight ? "dark" : "light"} />
                              </div>
                            )}
                          </div>
                        </m.section>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
      </m.div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.title ?? ""}
        description={selected ? `Added by ${person(selected.ownerId).name} · ${timeLabel(selected, zone)}` : undefined}
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {pollOf(selected) && <PollResults poll={pollOf(selected)!} votes={votes} onHero={false} />}
            {planNotes(selected) && <p className="text-sm">{planNotes(selected)}</p>}
            {selected.locationUrl && (
              <a
                href={selected.locationUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-link underline"
              >
                <Navigation aria-hidden="true" className="size-4" />
                Get directions
              </a>
            )}
            <div>
              <p className="text-sm font-medium">Who joined</p>
              {going.length === 0 ? (
                <p className="mt-1 text-sm text-muted">No one yet</p>
              ) : (
                <>
                  <div className="mt-2 flex items-center gap-2">
                    <FacePile ids={going} person={person} limit={8} />
                    <span className="text-sm text-muted">{going.length} going</span>
                  </div>
                  <ul aria-label="Who joined" className="mt-2 flex flex-col gap-1 text-sm">
                    {going.map((id) => (
                      <li key={id}>{person(id).name}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {(editable(selected) || removable(selected)) && (
              <div className="flex items-center gap-2">
                {editable(selected) && (
                  <Button
                    variant="secondary"
                    className="min-w-0 flex-1"
                    onClick={() => {
                      const item = selected;
                      setSelected(null);
                      onEdit?.(item);
                    }}
                  >
                    Edit plan
                  </Button>
                )}
                {removable(selected) && (
                  <BinButton
                    label={`Delete ${selected.title}`}
                    onClick={() => {
                      const item = selected;
                      setSelected(null);
                      setConfirming(item);
                    }}
                  />
                )}
              </div>
            )}
            {pending?.id === selected.id && pending.going !== going.includes(viewerId) ? (
              <Button busy aria-label={pending.going ? `Joining ${selected.title}` : `Leaving ${selected.title}`}>
                {pending.going ? "Joining" : "Leaving"}
              </Button>
            ) : going.includes(viewerId) ? (
              <Button variant="secondary" onClick={() => choose(selected.id, false)}>
                Opt out
              </Button>
            ) : (
              <Button onClick={() => choose(selected.id, true)}>I'm in</Button>
            )}
          </div>
        )}
      </Sheet>
      <ConfirmDelete
        name={confirming?.title ?? ""}
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          const item = confirming;
          setConfirming(null);
          if (item) onRemove?.(item);
        }}
      />
    </div>
  );
}
