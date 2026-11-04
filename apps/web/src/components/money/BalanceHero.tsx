import type { Payment } from "@hoppin/core";
import { Plus } from "lucide-react";
import { moneyName, type MoneyPerson } from "../../app/people";
import { currencyName } from "../../lib/money";
import type { MoneyView } from "../../lib/money-view";
import { Button } from "../ui/Button";
import { PersonDot } from "./PersonDot";

export interface BalanceHeroProps {
  viewerId: string;
  people: Map<string, MoneyPerson>;
  /** What the viewer is owed (+) or owes (-), in the counting currency. */
  balance: number;
  /** Payments the viewer makes or gets. */
  mine: Payment[];
  view: MoneyView;
  hasExpenses: boolean;
  /** Expenses waiting on this phone for an exchange rate (not in the totals yet). */
  waiting: number;
  onAdd: () => void;
  onChangeCurrency: () => void;
}

/** The screen's spotlight: what this person gets back or owes, in their own currency, and the main action. */
export function BalanceHero({ viewerId, people, balance, mine, view, hasExpenses, waiting, onAdd, onChangeCurrency }: BalanceHeroProps) {
  const label = balance > 0 ? "You get back" : balance < 0 ? "You owe" : "You're all square";
  return (
    <section aria-labelledby="balance-heading" className="flex flex-col gap-3 rounded-card bg-hero p-5 text-hero-fg">
      <h2 id="balance-heading" className="border-b border-dashed border-current/25 pb-2 text-xs font-semibold uppercase tracking-[0.14em]">
        Your balance
      </h2>
      {hasExpenses ? (
        <>
          <p className="text-sm font-medium text-hero-muted">{label}</p>
          <p className="page-title text-5xl" aria-live="polite">
            {balance === 0 ? "Nothing to settle" : view.show(Math.abs(balance))}
          </p>
          {mine.length > 0 && (
            <ul className="flex flex-col gap-1.5 text-sm">
              {mine.map((p) => {
                const other = p.to === viewerId ? p.from : p.to;
                return (
                  <li key={`${p.from}>${p.to}`} className="flex items-center gap-2">
                    <PersonDot person={people.get(other)} size="sm" />
                    {p.to === viewerId ? (
                      <span>
                        <b>{moneyName(people, p.from, viewerId)}</b> pays you {view.show(p.amount)}
                      </span>
                    ) : p.from === viewerId ? (
                      <span>
                        You pay <b>{moneyName(people, p.to, viewerId)}</b> {view.show(p.amount)}
                      </span>
                    ) : (
                      <span>
                        <b>{moneyName(people, p.from, viewerId)}</b> pays <b>{moneyName(people, p.to, viewerId)}</b> {view.show(p.amount)}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="page-title text-4xl">No expenses yet</p>
          <p className="text-sm text-hero-muted">Add the first one. Everyone sees it in their own currency.</p>
        </>
      )}
      {waiting > 0 && (
        <p className="text-xs text-hero-muted">
          {waiting === 1 ? "1 expense is" : `${waiting} expenses are`} waiting for an exchange rate and not counted yet. It's added when you're back online.
        </p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onAdd}>
          <Plus aria-hidden="true" className="size-4" />
          Add expense
        </Button>
        <button
          type="button"
          onClick={onChangeCurrency}
          aria-haspopup="dialog"
          aria-label={`Amounts shown in ${currencyName(view.currency)}. Change`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-current/30 px-4 text-sm font-semibold transition-colors hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Shown in {view.currency}
          <span aria-hidden="true">·</span>
          <span>Change</span>
        </button>
      </div>
    </section>
  );
}
