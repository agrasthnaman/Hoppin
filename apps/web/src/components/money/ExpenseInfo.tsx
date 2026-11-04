import { canEditExpense, changedFields, convertMinor, sharesOf, type ExpenseChange, type ExpenseField, type ExpenseRecord } from "@hoppin/core";
import { History, Lock, Pencil } from "lucide-react";
import type { ReactNode } from "react";
import { moneyName, type MoneyPerson } from "../../app/people";
import { formatShortDate } from "../../lib/dates";
import { currencyName, formatMoneyShort, formatRate } from "../../lib/money";
import type { MoneyView } from "../../lib/money-view";
import { Button } from "../ui/Button";
import { GuestTag, PersonDot } from "./PersonDot";

export interface ExpenseInfoProps {
  expense: ExpenseRecord;
  history: ExpenseChange[];
  view: MoneyView;
  viewerId: string;
  people: Map<string, MoneyPerson>;
  rateSource: string;
  onEdit: () => void;
  onUndoPayment: () => void;
  onClose: () => void;
}

const FIELD_TEXT: Record<ExpenseField, string> = {
  amount: "the amount",
  title: "the name",
  paidBy: "who paid",
  split: "who shares it",
  spentOn: "the date",
  category: "the kind",
};

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** How a bill was worked out, step by step: what was paid, the rate locked with it, and what that is in your money. */
export function ExpenseInfo({ expense: e, history, view, viewerId, people, rateSource, onEdit, onUndoPayment, onClose }: ExpenseInfoProps) {
  const name = (id: string, you = "You") => moneyName(people, id, viewerId, you);
  const isPayment = e.kind === "payment";
  const base = e.baseCurrency;
  const counted = e.rate !== null ? convertMinor(e.amount, e.rate, e.currency, base) : null;
  const entered = (minor: number) => formatMoneyShort(minor, e.currency);
  const sharesEntered = sharesOf(e, e.amount);
  const sharesCounted = counted !== null ? sharesOf(e, counted) : null;
  const sameAsView = e.currency === view.currency;

  const steps: { title: string; value: string; note: ReactNode }[] = [
    { title: isPayment ? "Paid back" : "What was paid", value: entered(e.amount), note: `${name(e.paidBy)} paid on ${formatShortDate(e.spentOn)}` },
  ];
  if (e.currency !== base) {
    steps.push(
      counted === null || e.rate === null
        ? { title: "Exchange rate", value: "Not known yet", note: `Added offline. The ${formatShortDate(e.spentOn)} rate is added when the phone is back online.` }
        : {
            title: "Rate locked with the bill",
            value: `1 ${e.currency} = ${formatRate(e.rate, base)}`,
            note: `${e.rateSaved ? "A rate saved on the phone" : rateSource}, ${formatShortDate(e.rateDate ?? e.spentOn)}. That makes ${formatMoneyShort(counted, base)}. It never changes, so nobody's balance moves on its own.`,
          },
    );
  }
  if (counted !== null && view.approx && !sameAsView && view.quote) {
    steps.push({
      title: `Shown to you in ${currencyName(view.currency)}`,
      value: view.show(counted),
      note: `Today's rate: 1 ${base} = ${formatRate(view.quote.rate, view.currency)}. Only for viewing; it changes daily.`,
    });
  }

  const log = history.filter((h) => h.expenseId === e.id);
  const mine = canEditExpense(e, viewerId);

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-col">
        {steps.map((s, i) => (
          <li key={s.title} className="relative flex gap-3 pb-4 last:pb-0">
            {i < steps.length - 1 && <span aria-hidden="true" className="absolute bottom-1 left-4 top-9 w-0.5 bg-line" />}
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-soft-fg">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{s.title}</p>
              <p className="font-display text-lg font-bold">{s.value}</p>
              <p className="text-xs text-muted">{s.note}</p>
            </div>
          </li>
        ))}
      </ol>

      {!isPayment && (
        <div>
          <h3 className="mb-1 text-sm font-semibold">Who shares it</h3>
          <ul>
            {e.split.map((s) => (
              <li key={s.who} className="flex items-center gap-2.5 py-1.5 text-sm">
                <PersonDot person={people.get(s.who)} size="sm" />
                <span className="flex flex-1 items-center gap-1.5 font-semibold">
                  {name(s.who)}
                  {people.get(s.who)?.guest && <GuestTag />}
                </span>
                <span className="text-right font-semibold">
                  {sameAsView || !sharesCounted ? entered(sharesEntered[s.who] ?? 0) : view.show(sharesCounted[s.who] ?? 0)}
                  {!sameAsView && sharesCounted && <span className="block text-[11px] font-medium text-muted">{entered(sharesEntered[s.who] ?? 0)}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {log.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">History</h3>
          <ul className="flex flex-col gap-2 text-sm">
            {log.map((h) => (
              <li key={`${h.at}-${h.op}`} className="flex gap-2">
                <History aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted" />
                <span>
                  <b>{h.actorId ? name(h.actorId) : "Someone"}</b> · {when(h.at)}
                  <span className="block text-muted">{describe(h, isPayment)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!mine && (
        <p className="flex items-start gap-2 rounded-2xl bg-raised px-4 py-3 text-sm">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            Only <b>{name(e.createdBy)}</b> can change {isPayment ? "this payment" : "this bill"}. Something wrong? Ask them.
          </span>
        </p>
      )}
      {e.currency !== base && (
        <p className="text-xs text-muted">
          All bills are added up in one currency, {base}, so everyone's totals match exactly. The trip's first expense set it.
        </p>
      )}

      <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-line bg-surface px-5 pb-1 pt-3">
        {mine && !isPayment && (
          <Button className="flex-1" onClick={onEdit}>
            <Pencil aria-hidden="true" className="size-4" />
            Edit
          </Button>
        )}
        {mine && isPayment && (
          <Button variant="secondary" className="flex-1" onClick={onUndoPayment}>
            Undo this payment
          </Button>
        )}
        <Button variant={mine ? "ghost" : "secondary"} className={mine ? "" : "flex-1"} onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

function describe(change: ExpenseChange, isPayment: boolean): string {
  if (change.op === "insert") return isPayment ? "Marked it as paid" : "Added it";
  if (change.op === "delete") return "Deleted it";
  if (!change.before || !change.after) return "Changed it";
  const fields = changedFields(change.before, change.after);
  if (fields.length === 0) return "Changed it";
  const parts = fields.map((f) =>
    f === "amount"
      ? `the amount: ${formatMoneyShort(change.before!.amount, change.before!.currency)} → ${formatMoneyShort(change.after!.amount, change.after!.currency)}`
      : FIELD_TEXT[f],
  );
  return `Changed ${parts.join(", ")}`;
}
