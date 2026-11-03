import { formatTime, formatTimeRange, UNANCHORED, type DayLayout, type Item } from "@hoppin/core";
import { m } from "motion/react";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { cn } from "../lib/cn";
import { springSoft } from "../lib/motion";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
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
}

const LIST = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } } };
const ITEM = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: springSoft } };

const UNKNOWN: Person = { name: "Someone", color: "#475569" };

function timeLabel(item: Item): string {
  return formatTimeRange(item.startsAt, item.endsAt, item.tz);
}

/** "Wednesday" and "4 November", shown as a small line above a big one. */
function dateParts(date: string): { weekday: string; rest: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...o }).format(at);
  return { weekday: fmt({ weekday: "long" }), rest: fmt({ day: "numeric", month: "long" }) };
}

/** One day of the trip: group blocks, members' optional plans as chips, and the viewer's private plans. */
export function DayView({ date, layout, people, viewerId, goingByItem, onJoin, renderBlockTitle, highlightId, headerAction }: DayViewProps) {
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display">
          <span className="block text-sm font-semibold text-muted">{dateParts(date).weekday}</span>{" "}
          <span className="block text-3xl font-extrabold leading-none">{dateParts(date).rest}</span>
        </h2>
        {headerAction}
      </div>

      {empty && <p className="text-muted">Nothing planned for this day yet.</p>}

      <m.div key={date} className="flex flex-col gap-3" variants={LIST} initial="hidden" animate="show">
      {layout.blocks.map((block) => {
        const spotlight = block.id === highlightId;
        return (
          <m.section key={block.id} aria-label={block.title} variants={ITEM}>
            <div className={cn("rounded-card p-4", spotlight ? "bg-hero text-hero-fg" : "border border-line bg-surface shadow-card")}>
              <p className={cn("text-xs font-semibold", spotlight ? "text-hero-muted" : "text-muted")}>{timeLabel(block)}</p>
              <p className="font-display text-lg font-bold">{renderBlockTitle ? renderBlockTitle(block) : block.title}</p>
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
          <span className="text-sm">{formatTime(line.startsAt, line.tz)}</span>
          <span>{line.title}</span>
          <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs">Only you</span>
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
                <MapPin aria-hidden="true" className="size-4" />
                Open location
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
            <Button disabled={going.includes(viewerId)} onClick={() => onJoin(selected.id)}>
              {going.includes(viewerId) ? "You're in" : "I'm in"}
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}
