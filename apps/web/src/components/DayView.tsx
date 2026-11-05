import { formatTime, formatTimeRange, localDate, pollOnPlan, tallyPoll, type DayLayout, type Item, type Poll, type Vote } from "@hoppin/core";
import { m } from "motion/react";
import { BedDouble, MapPin, Navigation, Vote as VoteIcon } from "lucide-react";
import { useState } from "react";
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
  onJoin: (itemId: string) => void;
  /** Drops the viewer's RSVP for an optional plan they already joined. */
  onLeave: (itemId: string) => void;
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

function timeLabel(item: Item): string {
  return formatTimeRange(item.startsAt, item.endsAt, item.tz, item.endTz);
}

/** "Wednesday" and "4 November", shown as a small line above a big one. */
function dateParts(date: string): { weekday: string; rest: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(at);
  return { weekday: fmt({ weekday: "long" }), rest: fmt({ day: "numeric", month: "long" }) };
}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);

/** What to say about a stay on this day: when to check in or out, or which night it is. */
function stayNote(item: Item, date: string): string {
  const first = localDate(Date.parse(item.startsAt), item.tz);
  const last = item.endsAt ? localDate(Date.parse(item.endsAt), item.tz) : first;
  const nights = dayNumber(last) - dayNumber(first);
  if (date === first && (!item.endsAt || nights > 0)) return `Check-in ${formatTime(item.startsAt, item.tz)}`;
  if (item.endsAt && date === last && nights > 0) return `Check-out ${formatTime(item.endsAt, item.tz)}`;
  if (nights > 1 && date > first && date < last) return `Night ${dayNumber(date) - dayNumber(first) + 1} of ${nights}`;
  return "Staying here";
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
export function DayView({ date, layout, people, viewerId, goingByItem, onJoin, onLeave, renderBlockTitle, highlightId, headerAction, canEditItem, onEdit, onRemove, polls = [], votes = [] }: DayViewProps) {
  const [selected, setSelected] = useState<Item | null>(null);
  const [confirming, setConfirming] = useState<Item | null>(null);
  const person = (id: string) => people[id] ?? UNKNOWN;

  const empty =
    layout.blocks.length === 0 && layout.privateLines.length === 0 && Object.keys(layout.chips).length === 0;
  const going = selected ? (goingByItem[selected.id] ?? []) : [];
  const stays = layout.blocks.filter((block) => block.kind === "stay");
  const others = layout.blocks.filter((block) => block.kind !== "stay");
  const optionals = Object.values(layout.chips).flat();
  const timed = [
    ...others.map((item) => ({ item, optional: false as const })),
    ...optionals.map((item) => ({ item, optional: true as const })),
  ].sort((a, b) => Date.parse(a.item.startsAt) - Date.parse(b.item.startsAt) || a.item.title.localeCompare(b.item.title));
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
                <p className="text-sm font-medium">{timeLabel(stay)}</p>
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

      {timed.map(({ item: block, optional }) => {
        if (optional) {
          const joined = (goingByItem[block.id] ?? []).includes(viewerId);
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
                      <span className="text-xs font-semibold text-muted">{timeLabel(block)}</span>
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
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {joined ? (
                    <>
                      <span className="text-sm font-semibold">You're in</span>
                      <Button variant="secondary" aria-label={`Opt out of ${block.title}`} onClick={() => onLeave(block.id)}>
                        Opt out
                      </Button>
                    </>
                  ) : (
                    <Button aria-label={`Join ${block.title}`} onClick={() => onJoin(block.id)}>
                      Join
                    </Button>
                  )}
                </div>
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
                    <span className={cn("text-xs font-semibold", spotlight ? "text-hero-muted" : "text-muted")}>{timeLabel(block)}</span>
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

      {layout.privateLines.map((line) => (
        <m.div key={line.id} variants={ITEM} className="flex flex-wrap items-center gap-x-3 rounded-card border border-dashed border-line p-3 text-muted">
          {pollOf(line) ? <PollTag onHero={false} /> : <KindTag kind={line.kind} />}
          <span className="text-sm">{formatTime(line.startsAt, line.tz)}</span>
          <span>{line.title}</span>
          {pollOf(line) && <PollResults poll={pollOf(line)!} votes={votes} onHero={false} />}
          <Directions item={line} />
          <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs">Only you</span>
          {planActions(line)}
        </m.div>
      ))}
      </m.div>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected?.title ?? ""}
        description={selected ? `Added by ${person(selected.ownerId).name} · ${timeLabel(selected)}` : undefined}
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
                    <div className="flex -space-x-2">
                      {going.map((id) => (
                        <m.span key={id} initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Avatar name={person(id).name} color={person(id).color} className="size-8 ring-2 ring-surface" />
                        </m.span>
                      ))}
                    </div>
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
            {editable(selected) && (
              <Button
                variant="secondary"
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
            {going.includes(viewerId) ? (
              <Button variant="secondary" onClick={() => onLeave(selected.id)}>
                Opt out
              </Button>
            ) : (
              <Button onClick={() => onJoin(selected.id)}>I'm in</Button>
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
