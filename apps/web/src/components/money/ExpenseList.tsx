import { canEditExpense, convertMinor, netFor, type ExpenseRecord } from "@hoppin/core";
import { Info, Loader, Pencil, Upload } from "lucide-react";
import { m } from "motion/react";
import { useState } from "react";
import { moneyName, type MoneyPerson } from "../../app/people";
import { useOnline } from "../../hooks/useOnline";
import { cn } from "../../lib/cn";
import { currencyName, formatMoneyShort } from "../../lib/money";
import type { MoneyView } from "../../lib/money-view";
import { springSoft } from "../../lib/motion";
import { CATEGORY_ICON } from "./categories";
import { GuestTag } from "./PersonDot";

export interface ExpenseListProps {
  expenses: ExpenseRecord[];
  base: string | null;
  view: MoneyView;
  viewerId: string;
  people: Map<string, MoneyPerson>;
  /** Expenses with a change still waiting on this phone. */
  pending: ReadonlySet<string>;
  /** Expenses that were changed after they were added. */
  edited: ReadonlySet<string>;
  today: string;
  onInfo: (expense: ExpenseRecord) => void;
  onEdit: (expense: ExpenseRecord) => void;
  onUndoPayment: (expense: ExpenseRecord) => void;
}

const dayLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00Z`));

/** Every expense and payment, newest day first, in the person's currency. Tap one to see what was actually paid. */
export function ExpenseList({ expenses, base, view, viewerId, people, pending, edited, today, onInfo, onEdit, onUndoPayment }: ExpenseListProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(new Set());
  const days = new Map<string, ExpenseRecord[]>();
  for (const e of expenses) days.set(e.spentOn, [...(days.get(e.spentOn) ?? []), e]);

  const flip = (id: string) =>
    setFlipped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-labelledby="expenses-heading" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="expenses-heading" className="font-display text-2xl font-bold">
          Expenses
        </h2>
        {expenses.length > 0 && (
          <button
            type="button"
            role="switch"
            aria-checked={showOriginal}
            onClick={() => {
              setShowOriginal((v) => !v);
              setFlipped(new Set());
            }}
            className="group inline-flex min-h-11 items-center gap-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Show original amounts
            <span aria-hidden="true" className="relative h-6.5 w-11 shrink-0 rounded-full border border-line bg-raised transition-colors group-aria-checked:border-accent group-aria-checked:bg-accent">
              <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow-card transition-transform duration-300 group-aria-checked:translate-x-[18px]" />
            </span>
          </button>
        )}
      </div>
      {expenses.length === 0 ? (
        <div className="rounded-card border border-line bg-surface p-4">
          <p className="font-semibold">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted">Paid for something the group shares? Add it, and the app works out who owes whom.</p>
        </div>
      ) : (
        <>
          <p className="-mt-1 text-xs text-muted">
            {showOriginal ? `Showing what was actually paid. Tap a bill to see it in ${view.currency}.` : `Shown in ${currencyName(view.currency)}. Tap a bill to see what was actually paid.`}
          </p>
          {[...days].map(([day, list]) => (
            <div key={day} className="flex flex-col gap-2">
              <h3 className="mt-1 text-sm font-semibold text-muted">
                {dayLabel(day)}
                {day === today && " · Today"}
              </h3>
              <ul className="flex flex-col gap-2">
                {list.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    base={base}
                    original={showOriginal !== flipped.has(e.id)}
                    view={view}
                    viewerId={viewerId}
                    people={people}
                    pending={pending.has(e.id)}
                    edited={edited.has(e.id)}
                    onFlip={() => flip(e.id)}
                    onInfo={() => onInfo(e)}
                    onEdit={() => onEdit(e)}
                    onUndoPayment={() => onUndoPayment(e)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

interface RowProps {
  expense: ExpenseRecord;
  base: string | null;
  original: boolean;
  view: MoneyView;
  viewerId: string;
  people: Map<string, MoneyPerson>;
  pending: boolean;
  edited: boolean;
  onFlip: () => void;
  onInfo: () => void;
  onEdit: () => void;
  onUndoPayment: () => void;
}

function ExpenseRow({ expense: e, base, original, view, viewerId, people, pending, edited, onFlip, onInfo, onEdit, onUndoPayment }: RowProps) {
  const online = useOnline();
  const name = (id: string, you = "You") => moneyName(people, id, viewerId, you);
  const isPayment = e.kind === "payment";
  const Icon = CATEGORY_ICON[e.category];
  const counted = e.rate !== null && base !== null ? convertMinor(e.amount, e.rate, e.currency, base) : null;
  // A bill already in the person's currency is shown as entered, never round-tripped through another currency.
  const asEntered = original || counted === null || e.currency === view.currency;
  const entered = (minor: number) => formatMoneyShort(minor, e.currency);
  const viewed = (minor: number) => (asEntered ? entered(minor) : view.show(minor));
  const total = asEntered ? e.amount : (counted as number);

  const main = viewed(total);
  let sub = "";
  if (counted === null) sub = "Rate added when online";
  else if (!isPayment && e.currency !== view.currency) sub = asEntered ? `${view.show(counted)} for you` : `Paid in ${e.currency}`;

  let you: React.ReactNode = null;
  if (isPayment) you = <span className="font-medium text-muted">Settled up</span>;
  else {
    const net = netFor(e, viewerId, total);
    if (e.paidBy === viewerId) you = <span className="font-semibold text-link">{net > 0 ? `You lent ${viewed(net)}` : "Just you"}</span>;
    else if (net < 0) you = <span className="font-semibold">Your share {viewed(-net)}</span>;
    else you = <span className="font-medium text-muted">Not part of this one</span>;
  }

  const title = isPayment ? `${name(e.paidBy)} → ${name(e.split[0]?.who ?? "")}` : e.title;
  const mine = canEditExpense(e, viewerId);
  return (
    <m.li
      layout="position"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springSoft}
      className={cn(
        "flex gap-2.5 rounded-[22px] p-2",
        isPayment ? "bg-raised" : "border bg-surface shadow-card",
        !isPayment && (pending ? "border-info-fg" : "border-line"),
      )}
    >
      <button
        type="button"
        onClick={onInfo}
        aria-haspopup="dialog"
        aria-label={`How ${isPayment ? "this payment" : e.title} was worked out`}
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          isPayment ? "bg-surface" : "bg-raised",
        )}
      >
        <Info aria-hidden="true" className="size-5" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <button
          type="button"
          onClick={onFlip}
          aria-pressed={original}
          className="flex items-start justify-between gap-3 rounded-2xl py-1 pr-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 font-semibold">
              <Icon aria-hidden="true" className="size-4 shrink-0 text-muted" />
              <span className="truncate">{title}</span>
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
              {isPayment ? (
                <>
                  {name(e.paidBy)} paid {name(e.split[0]?.who ?? "", "you")} back · marked by {name(e.createdBy, "you")}
                </>
              ) : (
                <>
                  {name(e.paidBy)} paid
                  {people.get(e.paidBy)?.guest && <GuestTag />}
                  <span aria-hidden="true">·</span>
                  {e.split.length} {e.split.length === 1 ? "person" : "people"}
                  {e.split.some((s) => s.share !== undefined) && <> · exact amounts</>}
                </>
              )}
            </span>
          </span>
          <m.span key={`${e.id}-${asEntered}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={springSoft} className="shrink-0 text-right">
            <span className="block whitespace-nowrap font-display text-lg font-bold">{main}</span>
            {sub && <span className="block whitespace-nowrap text-[11px] font-semibold text-muted">{sub}</span>}
          </m.span>
          <span className="sr-only">{original ? `Show in ${view.currency}` : "Show the amount actually paid"}</span>
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 pr-1 text-sm">
          <span className="whitespace-nowrap">{you}</span>
          <span className="flex flex-wrap items-center justify-end gap-1.5">
            {pending && (
              <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-[11px] font-semibold text-info-fg">
                {online ? <Loader aria-hidden="true" className="size-3 animate-spin" /> : <Upload aria-hidden="true" className="size-3" />}
                {online ? "Sending" : "Waiting to send"}
              </span>
            )}
            {e.rateSaved && <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn-fg">Saved rate</span>}
            {edited && !isPayment && <span className="rounded-full bg-raised px-2 py-0.5 text-[11px] font-semibold">Edited</span>}
            {mine && (
              <button
                type="button"
                onClick={isPayment ? onUndoPayment : onEdit}
                aria-label={isPayment ? "Undo this payment" : `Edit ${e.title}`}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
              >
                {!isPayment && <Pencil aria-hidden="true" className="size-3.5" />}
                {isPayment ? "Undo" : "Edit"}
              </button>
            )}
          </span>
        </div>
      </div>
    </m.li>
  );
}
