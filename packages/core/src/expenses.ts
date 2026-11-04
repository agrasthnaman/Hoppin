import { parseMinor } from "./money";
import { computeSettlement, splitAmount, type Payment, type Settlement } from "./settlement";
import type { ExpenseCategory, ExpenseRecord, ExpenseShare, TripGuest } from "./types";

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = ["food", "stay", "transport", "activity", "shopping", "other"];

/**
 * Balances and who pays whom for a trip, in its counting currency, each bill converted with the rate stored on it.
 * Bills still waiting on this phone for a rate cannot be converted yet: they are left out and counted in `waiting`.
 */
export function tripSettlement(expenses: readonly ExpenseRecord[], base: string | null): Settlement & { waiting: number } {
  if (!base) return { balances: {}, payments: [], waiting: 0 };
  const counted = expenses.filter((e): e is ExpenseRecord & { rate: number } => e.rate !== null && e.baseCurrency === base);
  const settlement = computeSettlement(
    counted.map((e) => ({ paidBy: e.paidBy, amount: e.amount, currency: e.currency, rate: e.rate, split: e.split })),
    base,
  );
  return { ...settlement, waiting: expenses.length - counted.length };
}

/** Each person's part of `total` (the bill, or the bill converted into another currency). */
export function sharesOf(expense: Pick<ExpenseRecord, "split">, total: number): Record<string, number> {
  return splitAmount(total, expense.split);
}

/** What one bill means for one person, in the units of `total`: what they lent (+), what they owe (-), or 0. */
export function netFor(expense: Pick<ExpenseRecord, "split" | "paidBy">, who: string, total: number): number {
  const share = sharesOf(expense, total)[who] ?? 0;
  return (expense.paidBy === who ? total : 0) - share;
}

const looksAfter = (who: string, viewerId: string, guests: readonly TripGuest[]) => guests.some((g) => g.id === who && g.addedBy === viewerId);

/** The viewer's own payments (they pay, they get paid, or a guest they added does) first; everyone else's apart. */
export function partitionPayments(payments: readonly Payment[], viewerId: string, guests: readonly TripGuest[]): { mine: Payment[]; others: Payment[] } {
  const isMine = (p: Payment) =>
    p.from === viewerId || p.to === viewerId || looksAfter(p.from, viewerId, guests) || looksAfter(p.to, viewerId, guests);
  return { mine: payments.filter(isMine), others: payments.filter((p) => !isMine(p)) };
}

/** Only the person getting the money marks a payment as paid; for a guest, whoever added them. */
export function canMarkPaid(to: string, viewerId: string, guests: readonly TripGuest[]): boolean {
  return to === viewerId || looksAfter(to, viewerId, guests);
}

/** Only the person who added an expense (or a payment) can change or delete it. */
export function canEditExpense(expense: Pick<ExpenseRecord, "createdBy">, viewerId: string): boolean {
  return expense.createdBy === viewerId;
}

/** The trip's counting currency: the one it has, or for its first expense the person's own currency, else the bill's. */
export function chooseBaseCurrency(tripBase: string | null | undefined, home: string | null, billCurrency: string): string {
  return tripBase ?? home ?? billCurrency;
}

export type ExpenseField = "amount" | "title" | "paidBy" | "split" | "spentOn" | "category";

/** What an edit changed, for the expense's history. */
export function changedFields(before: ExpenseRecord, after: ExpenseRecord): ExpenseField[] {
  const changed: ExpenseField[] = [];
  if (before.amount !== after.amount || before.currency !== after.currency) changed.push("amount");
  if (before.title !== after.title) changed.push("title");
  if (before.paidBy !== after.paidBy) changed.push("paidBy");
  const split = (s: ExpenseShare[]) => JSON.stringify(s.map((x) => [x.who, x.share ?? null]));
  if (split(before.split) !== split(after.split)) changed.push("split");
  if (before.spentOn !== after.spentOn) changed.push("spentOn");
  if (before.category !== after.category) changed.push("category");
  return changed;
}

/** What the add-expense form holds, as typed. */
export interface ExpenseDraftValues {
  amountText: string;
  currency: string;
  title: string;
  mode: "equal" | "exact";
  /** Who shares it, in the order shown. */
  people: string[];
  /** Exact amounts as typed, by person (only used in `exact` mode). */
  exact: Record<string, string>;
}

export type SplitProblem = { code: "nobody" } | { code: "zero" } | { code: "short"; by: number } | { code: "over"; by: number };
export interface ExpenseDraftErrors {
  amount?: "missing" | "invalid";
  title?: "missing";
  split?: SplitProblem;
}

/** Checks the form and, when it is fine, gives the amount in minor units and the split to store. */
export function validateExpenseDraft(values: ExpenseDraftValues): { ok: true; amount: number; split: ExpenseShare[] } | { ok: false; errors: ExpenseDraftErrors } {
  const errors: ExpenseDraftErrors = {};
  const amount = parseMinor(values.amountText, values.currency);
  if (!values.amountText.trim()) errors.amount = "missing";
  else if (amount === null || amount <= 0) errors.amount = "invalid";
  if (!values.title.trim()) errors.title = "missing";

  let split: ExpenseShare[] = values.people.map((who) => ({ who }));
  if (values.people.length === 0) errors.split = { code: "nobody" };
  else if (values.mode === "exact" && amount !== null && amount > 0) {
    const parts = values.people.map((who) => parseMinor(values.exact[who] ?? "", values.currency) ?? 0);
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum < amount) errors.split = { code: "short", by: amount - sum };
    else if (sum > amount) errors.split = { code: "over", by: sum - amount };
    else if (parts.every((p) => p === 0)) errors.split = { code: "zero" };
    split = values.people.map((who, i) => ({ who, share: parts[i] as number }));
  }

  if (Object.keys(errors).length > 0 || amount === null) return { ok: false, errors };
  return { ok: true, amount, split };
}
