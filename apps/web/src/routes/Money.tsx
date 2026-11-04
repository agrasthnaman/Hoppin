import {
  chooseBaseCurrency,
  localDate,
  partitionPayments,
  pendingMoneyIds,
  tripSettlement,
  type ExpenseRecord,
  type MoneyRecord,
  type Payment,
} from "@hoppin/core";
import { TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { useHomeCurrency } from "../app/home-currency";
import { moneyName, moneyPeople, type MoneyPerson } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { CurrencyPicker } from "../components/HomeCurrencyCard";
import { BalanceHero } from "../components/money/BalanceHero";
import { ExpenseForm, type ExpenseFormValues } from "../components/money/ExpenseForm";
import { ExpenseInfo } from "../components/money/ExpenseInfo";
import { ExpenseList } from "../components/money/ExpenseList";
import { MarkPaid } from "../components/money/MarkPaid";
import { SettleUp } from "../components/money/SettleUp";
import { PageHeading } from "../components/PageHeading";
import { Sheet } from "../components/ui/Sheet";
import { Toast, useToast } from "../components/ui/Toast";
import { PERSON_COLORS } from "../lib/colors";
import { useMoneyView } from "../lib/money-view";

type Open =
  | { kind: "add" }
  | { kind: "edit"; expense: ExpenseRecord }
  | { kind: "info"; expenseId: string }
  | { kind: "pay"; payment: Payment }
  | { kind: "currency" }
  | null;

/**
 * The group's money: what each person paid, how bills are split (members and guests, any currency), and who pays whom
 * to settle up, shown in each person's own currency. Works from the copy on this phone, and changes made offline are
 * sent later. Nothing here moves money.
 */
export default function Money() {
  const trip = useTripData();
  const { rates, clock } = useServices();
  const [home, setHome] = useHomeCurrency();
  const [open, setOpen] = useState<Open>(null);
  const [toast, showToast, closeToast] = useToast();
  const snapshot = trip.snapshot;
  const base = snapshot?.trip.baseCurrency ?? null;
  const view = useMoneyView(base, home);
  const expenses = useMemo(() => snapshot?.expenses ?? [], [snapshot]);
  const settlement = useMemo(() => tripSettlement(expenses, base), [expenses, base]);

  const gate = tripGate(trip);
  if (gate || !snapshot) return gate;

  const viewerId = trip.viewerId;
  const people = moneyPeople(snapshot);
  const guests = snapshot.guests ?? [];
  const pickable = [...people.values()].filter((p) => p.active);
  const { mine, others } = partitionPayments(settlement.payments, viewerId, guests);
  const pending = pendingMoneyIds(trip.moneyChanges);
  const edited = new Set((snapshot.expenseHistory ?? []).filter((h) => h.op === "update").map((h) => h.expenseId));
  const refused = trip.moneyChanges.filter((r) => r.error);
  const today = localDate(clock.now(), clock.timeZone);
  const sorted = [...expenses].sort((a, b) => b.spentOn.localeCompare(a.spentOn) || (b.createdAt ?? "\uffff").localeCompare(a.createdAt ?? "\uffff"));
  const lastUsed = sorted.find((e) => e.createdBy === viewerId && e.kind === "expense")?.currency;
  const close = () => setOpen(null);

  /** Builds the expense to store, capturing the rate to the counting currency now so balances never move later. */
  async function save(values: ExpenseFormValues, existing?: ExpenseRecord) {
    const tripBase = chooseBaseCurrency(base, home, values.currency);
    let priced: Pick<ExpenseRecord, "rate" | "rateDate" | "rateSaved">;
    const unchanged = existing && existing.rate !== null && existing.currency === values.currency && existing.spentOn === values.spentOn && existing.baseCurrency === tripBase;
    if (unchanged) priced = { rate: existing.rate, rateDate: existing.rateDate, ...(existing.rateSaved ? { rateSaved: true } : {}) };
    else if (values.currency === tripBase) priced = { rate: 1, rateDate: values.spentOn };
    else {
      try {
        const quote = await rates.quote(values.currency, tripBase, values.spentOn);
        priced = { rate: quote.rate, rateDate: quote.date, ...(quote.old ? { rateSaved: true } : {}) };
      } catch {
        priced = { rate: null, rateDate: null };
      }
    }
    await trip.saveExpense({
      id: existing?.id ?? crypto.randomUUID(),
      tripId: trip.tripId,
      kind: "expense",
      title: values.title,
      category: values.category,
      paidBy: values.paidBy,
      amount: values.amount,
      currency: values.currency,
      ...priced,
      baseCurrency: tripBase,
      spentOn: values.spentOn,
      split: values.split,
      createdBy: viewerId,
      version: existing?.version ?? 0,
      ...(existing?.createdAt ? { createdAt: existing.createdAt } : {}),
    });
    close();
    const where = navigator.onLine ? "" : " It's saved on this phone and sent when you're back online.";
    showToast(existing ? `Saved. Everyone's balances are updated.${where}` : `Added "${values.title}".${where || " Everyone can see it."}`);
  }

  async function remove(expense: ExpenseRecord) {
    await trip.deleteExpense(expense);
    close();
    showToast(`Deleted "${expense.title}".`, () => void trip.saveExpense({ ...expense, version: 0 }));
  }

  async function markPaid(payment: Payment, amount: number) {
    if (!base) return;
    const record: ExpenseRecord = {
      id: crypto.randomUUID(),
      tripId: trip.tripId,
      kind: "payment",
      title: "Paid back",
      category: "payment",
      paidBy: payment.from,
      amount,
      currency: base,
      rate: 1,
      rateDate: today,
      baseCurrency: base,
      spentOn: today,
      split: [{ who: payment.to }],
      createdBy: viewerId,
      version: 0,
    };
    await trip.saveExpense(record);
    close();
    showToast(`Marked as paid: ${moneyName(people, payment.from, viewerId)} → ${moneyName(people, payment.to, viewerId, "you")}`, () => void trip.deleteExpense(record));
  }

  async function undoPayment(payment: ExpenseRecord) {
    await trip.deleteExpense(payment);
    close();
    showToast("Payment removed. The amount is owed again.", () => void trip.saveExpense({ ...payment, version: 0 }));
  }

  const info = open?.kind === "info" ? expenses.find((e) => e.id === open.expenseId) : undefined;
  const formProps = {
    people: pickable,
    viewerId,
    defaultCurrency: lastUsed ?? home ?? base ?? "INR",
    previewCurrency: home ?? base,
    pinnedCurrencies: [...new Set(expenses.map((e) => e.currency))],
    today,
    onCancel: close,
    onAddGuest: async (name: string) => (await trip.addGuest(name)).id,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeading title="Money" lede="Who paid, who shares, and who pays whom. Hoppin doesn't move any money." />

      {refused.map((r) => (
        <RefusedChange key={r.id} record={r} onRetry={() => void trip.retryMoney(r.id)} onDiscard={() => void trip.discardMoney(r.id)} />
      ))}

      <BalanceHero
        viewerId={viewerId}
        people={people}
        balance={settlement.balances[viewerId] ?? 0}
        mine={mine}
        view={view}
        hasExpenses={expenses.length > 0}
        waiting={settlement.waiting}
        onAdd={() => setOpen({ kind: "add" })}
        onChangeCurrency={() => setOpen({ kind: "currency" })}
      />

      {expenses.length > 0 && (
        <SettleUp viewerId={viewerId} people={people} guests={guests} mine={mine} others={others} view={view} onMarkPaid={(payment) => setOpen({ kind: "pay", payment })} />
      )}

      <ExpenseList
        expenses={sorted}
        base={base}
        view={view}
        viewerId={viewerId}
        people={people}
        pending={pending}
        edited={edited}
        today={today}
        onInfo={(e) => setOpen({ kind: "info", expenseId: e.id })}
        onEdit={(e) => setOpen({ kind: "edit", expense: e })}
        onUndoPayment={(e) => void undoPayment(e)}
      />

      <Sheet open={open?.kind === "add"} onOpenChange={(v) => !v && close()} title="Add expense">
        <ExpenseForm {...formProps} onSubmit={(values) => save(values)} />
      </Sheet>

      <Sheet open={open?.kind === "edit"} onOpenChange={(v) => !v && close()} title="Edit expense">
        {open?.kind === "edit" && (
          <ExpenseForm
            {...formProps}
            people={withPeopleOn(open.expense, pickable, people)}
            initial={open.expense}
            onSubmit={(values) => save(values, open.expense)}
            onDelete={() => void remove(open.expense)}
          />
        )}
      </Sheet>

      <Sheet open={!!info} onOpenChange={(v) => !v && close()} title={info ? (info.kind === "payment" ? "Payment" : info.title) : "Expense"}>
        {info && (
          <ExpenseInfo
            expense={info}
            history={snapshot.expenseHistory ?? []}
            view={view}
            viewerId={viewerId}
            people={people}
            rateSource={rates.source}
            onEdit={() => setOpen({ kind: "edit", expense: info })}
            onUndoPayment={() => void undoPayment(info)}
            onClose={close}
          />
        )}
      </Sheet>

      <Sheet open={open?.kind === "pay"} onOpenChange={(v) => !v && close()} title="Mark as paid">
        {open?.kind === "pay" && base && (
          <MarkPaid payment={open.payment} base={base} view={view} viewerId={viewerId} people={people} onConfirm={(amount) => markPaid(open.payment, amount)} onCancel={close} />
        )}
      </Sheet>

      <CurrencyPicker
        open={open?.kind === "currency"}
        onOpenChange={(v) => !v && close()}
        value={home}
        title="Show amounts in"
        description="Only changes what you see. What people entered never changes."
        onPick={(currency) => {
          setHome(currency);
          showToast(currency ? `Showing amounts in ${currency}.` : "Showing amounts in the trip's currency.");
        }}
      />

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}

/** When editing, keep people already on the bill pickable even if they have since left. */
function withPeopleOn(expense: ExpenseRecord, pickable: MoneyPerson[], all: Map<string, MoneyPerson>): MoneyPerson[] {
  const ids = new Set(pickable.map((p) => p.id));
  const extra = [expense.paidBy, ...expense.split.map((s) => s.who)]
    .filter((id) => !ids.has(id))
    .map((id): MoneyPerson => all.get(id) ?? { id, name: "Someone who left", color: PERSON_COLORS[PERSON_COLORS.length - 1] as string, guest: false, active: false });
  return [...pickable, ...new Map(extra.map((p) => [p.id, p])).values()];
}

function RefusedChange({ record, onRetry, onDiscard }: { record: MoneyRecord; onRetry: () => void; onDiscard: () => void }) {
  const what = record.kind === "guest" ? `the guest ${record.guest.name}` : record.kind === "save" ? `"${record.expense.title}"` : `the deletion of "${record.title}"`;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-card bg-danger-bg px-4 py-3 text-sm text-danger-fg">
      <p className="flex items-start gap-2 font-medium">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Couldn't save {what}: {record.error}
        </span>
      </p>
      <div className="flex gap-2 pl-6">
        <button type="button" onClick={onRetry} className="min-h-9 rounded-full px-3 font-semibold underline focus-visible:outline-2 focus-visible:outline-current">
          Try again
        </button>
        <button type="button" onClick={onDiscard} className="min-h-9 rounded-full px-3 font-semibold underline focus-visible:outline-2 focus-visible:outline-current">
          Discard
        </button>
      </div>
    </div>
  );
}
