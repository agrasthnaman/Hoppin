import { convertMinor, parseMinor, type Payment } from "@hoppin/core";
import { ArrowRight, Check } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { moneyName, type MoneyPerson } from "../../app/people";
import { useOnline } from "../../hooks/useOnline";
import { inputClass } from "../../lib/forms";
import { formatMoneyShort } from "../../lib/money";
import type { MoneyView } from "../../lib/money-view";
import { Button } from "../ui/Button";
import { PersonDot } from "./PersonDot";

export interface MarkPaidProps {
  payment: Payment;
  base: string;
  view: MoneyView;
  viewerId: string;
  people: Map<string, MoneyPerson>;
  /** `amount` is in the counting currency. */
  onConfirm: (amount: number) => Promise<void>;
  onCancel: () => void;
}

/** Records that someone paid the viewer (or a guest the viewer looks after) back, in full or in part. */
export function MarkPaid({ payment, base, view, viewerId, people, onConfirm, onCancel }: MarkPaidProps) {
  const online = useOnline();
  const [partial, setPartial] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputId = useId();
  const name = (id: string, you = "You") => moneyName(people, id, viewerId, you);

  async function submit(event: FormEvent) {
    event.preventDefault();
    let amount = payment.amount;
    if (partial) {
      const typed = parseMinor(text, view.currency);
      if (!typed) return setError("Type how much they paid.");
      // Typed in the person's currency; recorded in the counting currency at today's rate.
      amount = view.approx && view.quote ? convertMinor(typed, 1 / view.quote.rate, view.currency, base) : typed;
      if (amount > payment.amount) return setError(`That's more than they owe (${view.show(payment.amount)}).`);
      if (amount <= 0) return setError("Type how much they paid.");
    }
    setSaving(true);
    try {
      await onConfirm(amount);
    } catch {
      setError("Couldn't save. Please try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex items-center gap-3" aria-hidden="true">
        <PersonDot person={people.get(payment.from)} size="lg" />
        <ArrowRight className="size-5 text-muted" />
        <PersonDot person={people.get(payment.to)} size="lg" />
      </div>
      <div>
        <p className="text-sm">
          Did <b>{name(payment.from)}</b> pay {payment.to === viewerId ? "you" : <b>{name(payment.to)}</b>} back?
        </p>
        <p className="page-title mt-1 text-5xl">{view.show(payment.amount)}</p>
        {view.approx && <p className="mt-1 text-xs text-muted">Exactly {formatMoneyShort(payment.amount, base)} in the trip's counting currency.</p>}
      </div>
      {partial ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-semibold">
            How much did they pay? ({view.currency})
          </label>
          <input
            id={inputId}
            autoFocus
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={text}
            aria-invalid={error ? true : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
            className={inputClass}
          />
          {error ? <span className="text-sm text-danger-fg">{error}</span> : <span className="text-xs text-muted">The rest stays open.</span>}
        </div>
      ) : (
        <button type="button" onClick={() => setPartial(true)} className="min-h-9 self-start text-sm font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
          They paid part of it
        </button>
      )}
      <p className="rounded-2xl bg-raised px-4 py-3 text-sm">
        This only records it in Hoppin. No money moves through the app.
        {!online && <span className="mt-1 block font-semibold">You're offline: it's saved here and sent when you're back online.</span>}
      </p>
      <div className="sticky bottom-0 z-20 -mx-5 flex gap-2 border-t border-line bg-surface px-5 pb-1 pt-3">
        <Button type="submit" busy={saving} className="flex-1">
          <Check aria-hidden="true" className="size-4" />
          Yes, mark as paid
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Not yet
        </Button>
      </div>
    </form>
  );
}
