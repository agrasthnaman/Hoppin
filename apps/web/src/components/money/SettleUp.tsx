import { canMarkPaid, type Payment, type TripGuest } from "@hoppin/core";
import { ChevronDown } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { useId, useState } from "react";
import { moneyName, type MoneyPerson } from "../../app/people";
import { cn } from "../../lib/cn";
import type { MoneyView } from "../../lib/money-view";
import { springSoft } from "../../lib/motion";
import { Button } from "../ui/Button";
import { PersonDot } from "./PersonDot";

export interface SettleUpProps {
  viewerId: string;
  people: Map<string, MoneyPerson>;
  guests: TripGuest[];
  mine: Payment[];
  others: Payment[];
  view: MoneyView;
  onMarkPaid: (payment: Payment) => void;
}

/** Who pays whom, in the fewest payments: the viewer's own first, everyone else's folded away until asked for. */
export function SettleUp({ viewerId, people, guests, mine, others, view, onMarkPaid }: SettleUpProps) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const row = (p: Payment) => <PaymentRow key={`${p.from}>${p.to}`} payment={p} viewerId={viewerId} people={people} guests={guests} view={view} onMarkPaid={onMarkPaid} />;
  const othersFaces = [...new Set(others.flatMap((p) => [p.from, p.to]))].slice(0, 4);

  return (
    <section aria-labelledby="settle-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="settle-heading" className="font-display text-2xl font-bold">
          Settle up
        </h2>
        <span className="text-xs text-muted">Fewest payments</span>
      </div>

      {mine.length + others.length === 0 ? (
        <Empty title="Everyone's square." hint="Nothing to pay back right now." />
      ) : mine.length > 0 ? (
        <ul className="flex flex-col gap-2">{mine.map(row)}</ul>
      ) : (
        <Empty title="You're all square." hint="Nothing for you to pay or collect." />
      )}

      {others.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
            className="flex min-h-14 w-full items-center gap-3 rounded-2xl bg-raised px-4 py-2.5 text-left text-sm transition-transform active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex shrink-0">
              {othersFaces.map((id, i) => (
                <PersonDot key={id} person={people.get(id)} size="sm" className={cn(i > 0 && "-ml-2 ring-2 ring-raised")} />
              ))}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-semibold">Everyone else</span> <span className="text-muted">({others.length})</span>
              <span className="block text-xs text-muted">{open ? "Tap to hide" : "Payments between other people in the trip"}</span>
            </span>
            <ChevronDown aria-hidden="true" className={cn("size-5 shrink-0 transition-transform duration-300", open && "rotate-180")} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <m.ul
                id={listId}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={springSoft}
                className="flex flex-col gap-2 overflow-hidden"
              >
                {others.map(row)}
              </m.ul>
            )}
          </AnimatePresence>
        </>
      )}
      <p className="text-xs text-muted">Hoppin doesn't send money. Pay each other your usual way, then mark it paid.</p>
    </section>
  );
}

function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
}

interface PaymentRowProps {
  payment: Payment;
  viewerId: string;
  people: Map<string, MoneyPerson>;
  guests: TripGuest[];
  view: MoneyView;
  onMarkPaid: (payment: Payment) => void;
}

function PaymentRow({ payment: p, viewerId, people, guests, view, onMarkPaid }: PaymentRowProps) {
  const involved = p.from === viewerId || p.to === viewerId;
  const name = (id: string, you = "You") => moneyName(people, id, viewerId, you);
  const guardian = (id: string) => {
    const g = guests.find((x) => x.id === id);
    return g ? { guest: g, by: g.addedBy === viewerId ? "you" : name(g.addedBy) } : null;
  };
  const toGuest = guardian(p.to);
  const fromGuest = guardian(p.from);
  let hint = "";
  if (p.from === viewerId) hint = `Pay ${name(p.to)} your usual way. ${toGuest ? `${toGuest.by === "you" ? "You" : toGuest.by} mark${toGuest.by === "you" ? "" : "s"} it paid.` : "They mark it paid."}`;
  else if (toGuest && toGuest.by !== "you") hint = `${toGuest.by} marks it paid for ${toGuest.guest.name}.`;
  else if (fromGuest) hint = `${fromGuest.guest.name} is ${fromGuest.by === "you" ? "your" : `${fromGuest.by}'s`} guest.`;

  return (
    <li className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", involved ? "bg-accent-soft text-accent-soft-fg" : "border border-line bg-surface")}>
      <span className="flex shrink-0">
        <PersonDot person={people.get(p.from)} />
        <PersonDot person={people.get(p.to)} className={cn("-ml-2 ring-2", involved ? "ring-accent-soft" : "ring-surface")} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <b>{name(p.from)}</b> {p.from === viewerId ? "pay" : "pays"} <b>{name(p.to, "you")}</b>
        </p>
        <p className="font-display text-lg font-bold">{view.show(p.amount)}</p>
        {hint && <p className={cn("text-xs", involved ? "opacity-85" : "text-muted")}>{hint}</p>}
      </div>
      {canMarkPaid(p.to, viewerId, guests) && (
        <Button className="min-h-10 px-4" onClick={() => onMarkPaid(p)}>
          Mark as paid
        </Button>
      )}
    </li>
  );
}
