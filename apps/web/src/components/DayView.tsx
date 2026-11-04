import { formatTime, formatTimeRange, localDate, UNANCHORED, type DayLayout, type Item } from "@hoppin/core";
import { m } from "motion/react";
import { BedDouble, MapPin, Navigation } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { springSoft } from "../lib/motion";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { KindTag } from "./kind";
import { Chip } from "./ui/Chip";
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
  /** The plan to spotlight with the big colour block (the one happening now, or next up). */
  highlightId?: string | null;
  /** Shown at the right of the day heading (for example an "Add plan" button). */
  headerAction?: React.ReactNode;
  /** Lets the app turn a block's title into a link to its detail page. */
  renderBlockTitle?: (item: Item) => React.ReactNode;
  /** Shows an Edit button on each plan this returns true for, and calls `onEdit` with it. */
  canEditItem?: (item: Item) => boolean;
  onEdit?: (item: Item) => void;
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

/** One day of the trip: group blocks, members' optional plans as chips, and the viewer's private plans. */
export function DayView({ date, layout, people, viewerId, goingByItem, onJoin, renderBlockTitle, highlightId, headerAction, canEditItem, onEdit }: DayViewProps) {
  const [selected, setSelected] = useState<Item | null>(null);
  const person = (id: string) => people[id] ?? UNKNOWN;
  const initial = (id: string) => person(id).name.trim().charAt(0).toUpperCase();

  const chipRow = (chips: Item[]) => (
    <div className="mt-2 flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Chip
          key={chip.id}
          initial={initial(chip.ownerId)}
          title={chip.title}
          color={person(chip.ownerId).color}
          onOpen={() => setSelected(chip)}
        />
      ))}
    </div>
  );

  const empty =
    layout.blocks.length === 0 && layout.privateLines.length === 0 && Object.keys(layout.chips).length === 0;
  const going = selected ? (goingByItem[selected.id] ?? []) : [];
  const stays = layout.blocks.filter((block) => block.kind === "stay");
  const others = layout.blocks.filter((block) => block.kind !== "stay");
  const editable = (item: Item) => !!onEdit && (canEditItem ? canEditItem(item) : true);
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
              {editable(stay) && editButton(stay)}
            </div>
            <div className="mt-1">
              <Directions item={stay} />
            </div>
            {layout.chips[stay.id] && chipRow(layout.chips[stay.id] ?? [])}
          </div>
        </m.section>
      ))}

      {others.map((block) => {
        const spotlight = block.id === highlightId;
        return (
          <m.section key={block.id} aria-label={block.title} variants={ITEM}>
            <div className={cn("rounded-card p-4", spotlight ? "bg-hero text-hero-fg" : "border border-line bg-surface shadow-card")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <KindTag kind={block.kind} onHero={spotlight} />
                    <span className={cn("text-xs font-semibold", spotlight ? "text-hero-muted" : "text-muted")}>{timeLabel(block)}</span>
                  </p>
                  <p className="mt-1 font-display text-lg font-bold">{renderBlockTitle ? renderBlockTitle(block) : block.title}</p>
                </div>
                {editable(block) && editButton(block, spotlight ? "dark" : "light")}
              </div>
              {block.locationUrl && (
                <div className="mt-1">
                  <Directions item={block} tone={spotlight ? "dark" : "light"} />
                </div>
              )}
              {layout.chips[block.id] && chipRow(layout.chips[block.id] ?? [])}
            </div>
          </m.section>
        );
      })}

      {layout.chips[UNANCHORED] && (
        <m.section aria-label="Optional plans" variants={ITEM}>
          <p className="text-sm font-medium text-muted">Optional plans</p>
          {chipRow(layout.chips[UNANCHORED] ?? [])}
        </m.section>
      )}

      {layout.privateLines.map((line) => (
        <m.div key={line.id} variants={ITEM} className="flex flex-wrap items-center gap-x-3 rounded-card border border-dashed border-line p-3 text-muted">
          <KindTag kind={line.kind} />
          <span className="text-sm">{formatTime(line.startsAt, line.tz)}</span>
          <span>{line.title}</span>
          <Directions item={line} />
          <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs">Only you</span>
          {editable(line) && editButton(line)}
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
            {going.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {going.map((id) => (
                    <m.span key={id} initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      <Avatar name={person(id).name} color={person(id).color} className="size-8 ring-2 ring-surface" />
                    </m.span>
                  ))}
                </div>
                <span className="text-sm text-muted">{going.length} going</span>
              </div>
            )}
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
            <Button disabled={going.includes(viewerId)} onClick={() => onJoin(selected.id)}>
              {going.includes(viewerId) ? "You're in" : "I'm in"}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
