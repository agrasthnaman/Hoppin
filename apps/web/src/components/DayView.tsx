import { formatTime, formatTimeRange, UNANCHORED, type DayLayout, type Item } from "@hoppin/core";
import { MapPin } from "lucide-react";
import { useState } from "react";
import { Avatar } from "./ui/Avatar";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
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
  /** Lets the app turn a block's title into a link to its detail page. */
  renderBlockTitle?: (item: Item) => React.ReactNode;
}

const UNKNOWN: Person = { name: "Someone", color: "#475569" };

function timeLabel(item: Item): string {
  return formatTimeRange(item.startsAt, item.endsAt, item.tz);
}

function dateLabel(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** One day of the trip: group blocks, members' optional plans as chips, and the viewer's private plans. */
export function DayView({ date, layout, people, viewerId, goingByItem, onJoin, renderBlockTitle }: DayViewProps) {
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
      <h2 className="text-xl font-bold">{dateLabel(date)}</h2>

      {empty && <p className="text-muted">Nothing planned for this day yet.</p>}

      {layout.blocks.map((block) => (
        <section key={block.id} aria-label={block.title}>
          <Card className="border-l-4 border-l-accent">
            <p className="text-sm text-muted">{timeLabel(block)}</p>
            <p className="font-semibold">{renderBlockTitle ? renderBlockTitle(block) : block.title}</p>
            {layout.chips[block.id] && chipRow(layout.chips[block.id] ?? [])}
          </Card>
        </section>
      ))}

      {layout.chips[UNANCHORED] && (
        <section aria-label="Optional plans">
          <p className="text-sm font-medium text-muted">Optional plans</p>
          {chipRow(layout.chips[UNANCHORED] ?? [])}
        </section>
      )}

      {layout.privateLines.map((line) => (
        <div key={line.id} className="flex flex-wrap items-center gap-x-3 rounded-card border border-dashed border-line p-3 text-muted">
          <span className="text-sm">{formatTime(line.startsAt, line.tz)}</span>
          <span>{line.title}</span>
          <span className="ml-auto rounded-full bg-raised px-2 py-0.5 text-xs">Only you</span>
        </div>
      ))}

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
                className="inline-flex items-center gap-2 text-accent underline"
              >
                <MapPin aria-hidden="true" className="size-4" />
                Open location
              </a>
            )}
            {going.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex -space-x-2">
                  {going.map((id) => (
                    <Avatar key={id} name={person(id).name} color={person(id).color} className="size-8 ring-2 ring-surface" />
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
