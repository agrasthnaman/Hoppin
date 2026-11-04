import { convertMinor, isCurrencyCode } from "./money";
import type { Expense, ExpenseShare } from "./types";

export interface Payment {
  from: string;
  to: string;
  /** In minor units of the base currency. */
  amount: number;
}

export interface Settlement {
  /** What each person is owed (positive) or owes (negative), in minor units of the base currency. Always sums to exactly zero. */
  balances: Record<string, number>;
  /** Who pays whom to settle up. */
  payments: Payment[];
}

/** An expense that cannot be settled without giving wrong money. `index` is its position in the list. */
export class InvalidExpenseError extends Error {
  constructor(
    readonly index: number,
    reason: string,
  ) {
    super(`Expense ${index + 1}: ${reason}`);
    this.name = "InvalidExpenseError";
  }
}

/** Checks one expense and returns each person's weight in the split (1 each for an equal split). */
function splitWeights(expense: Expense, index: number, baseCurrency: string): { who: string; weight: number }[] {
  const fail = (reason: string): never => {
    throw new InvalidExpenseError(index, reason);
  };
  if (typeof expense.paidBy !== "string" || expense.paidBy === "") fail("who paid is missing");
  if (!isCurrencyCode(expense.currency)) fail(`"${expense.currency}" is not a currency code`);
  if (!Number.isSafeInteger(expense.amount) || expense.amount < 0) fail("the amount must be a whole number of minor units (paise, cents), zero or more");
  if (expense.currency !== baseCurrency && !(Number.isFinite(expense.rate) && expense.rate > 0)) fail("the exchange rate must be a positive number");
  if (!Array.isArray(expense.split) || expense.split.length === 0) fail("the split has nobody in it");

  const seen = new Set<string>();
  for (const { who } of expense.split) {
    if (typeof who !== "string" || who === "") fail("someone in the split has no id");
    if (seen.has(who)) fail(`${who} is in the split twice`);
    seen.add(who);
  }

  const custom = expense.split.filter((s) => s.share !== undefined).length;
  if (custom === 0) return expense.split.map(({ who }) => ({ who, weight: 1 }));
  if (custom !== expense.split.length) fail("give a share for everyone in the split, or for nobody (equal split)");
  if (expense.split.some((s) => !Number.isSafeInteger(s.share) || (s.share as number) < 0)) fail("each share must be a whole number, zero or more");
  if (expense.split.every((s) => s.share === 0)) fail("at least one share must be more than zero");
  return expense.split.map(({ who, share }) => ({ who, weight: share as number }));
}

/**
 * Splits `total` in proportion to `weights` so the parts add up to exactly `total`: everyone gets the whole-unit part
 * of their exact share, and the leftover units go to the largest fractions (earlier people first on a tie).
 */
function largestRemainder(total: number, weights: number[]): number[] {
  // BigInt keeps total × weight exact; both can be large enough to lose precision as floating-point numbers.
  const t = BigInt(total);
  const sum = weights.reduce((acc, w) => acc + BigInt(w), 0n);
  const parts = weights.map((w, i) => ({ i, floor: (t * BigInt(w)) / sum, rem: (t * BigInt(w)) % sum }));
  let left = t - parts.reduce((acc, p) => acc + p.floor, 0n);
  const byRemainder = [...parts].sort((a, b) => (a.rem === b.rem ? a.i - b.i : a.rem > b.rem ? -1 : 1));
  for (const p of byRemainder) {
    if (left === 0n) break;
    p.floor += 1n;
    left -= 1n;
  }
  return parts.map((p) => Number(p.floor));
}

interface Open {
  who: string;
  left: number;
}
const largestFirst = (a: Open, b: Open) => b.left - a.left || (a.who < b.who ? -1 : a.who > b.who ? 1 : 0);

/**
 * Settles the balances in few payments: pair anyone who owes exactly what someone else is owed (one payment clears
 * two people), otherwise the largest debtor pays the largest creditor. Needs at most one payment fewer than people.
 */
function settle(balances: Map<string, number>): Payment[] {
  const creditors: Open[] = [];
  const debtors: Open[] = [];
  for (const [who, balance] of balances) {
    if (balance > 0) creditors.push({ who, left: balance });
    else if (balance < 0) debtors.push({ who, left: -balance });
  }

  const payments: Payment[] = [];
  const pay = (debtor: Open, creditor: Open, amount: number) => {
    payments.push({ from: debtor.who, to: creditor.who, amount });
    debtor.left -= amount;
    creditor.left -= amount;
  };

  for (;;) {
    const owed = creditors.filter((c) => c.left > 0).sort(largestFirst);
    const owing = debtors.filter((d) => d.left > 0).sort(largestFirst);
    if (owed.length === 0 || owing.length === 0) return payments;

    const byAmount = new Map<number, Open>();
    for (const c of owed) if (!byAmount.has(c.left)) byAmount.set(c.left, c);
    const exact = owing.find((d) => byAmount.has(d.left));
    if (exact) pay(exact, byAmount.get(exact.left) as Open, exact.left);
    else pay(owing[0] as Open, owed[0] as Open, Math.min((owing[0] as Open).left, (owed[0] as Open).left));
  }
}

/**
 * Who owes whom across a trip's expenses, in the trip's base currency. Each expense is converted with the rate stored
 * on it (never today's rate), then split; guests are people like any other.
 */
export function computeSettlement(expenses: Expense[], baseCurrency: string): Settlement {
  if (!isCurrencyCode(baseCurrency)) throw new RangeError(`"${baseCurrency}" is not a currency code`);

  const balances = new Map<string, number>();
  const add = (who: string, amount: number) => balances.set(who, (balances.get(who) ?? 0) + amount);

  expenses.forEach((expense, index) => {
    const weights = splitWeights(expense, index, baseCurrency);
    const total = convertMinor(expense.amount, expense.rate, expense.currency, baseCurrency);
    add(expense.paidBy, total);
    largestRemainder(total, weights.map((w) => w.weight)).forEach((owes, i) => add((weights[i] as { who: string }).who, -owes));
  });

  for (const [who, balance] of balances) if (Object.is(balance, -0)) balances.set(who, 0);
  return { balances: Object.fromEntries(balances), payments: settle(balances) };
}

/** Splits `total` among the people in `split` the way the bill says (equal, or in proportion to exact amounts), adding up exactly. */
export function splitAmount(total: number, split: ExpenseShare[]): Record<string, number> {
  const custom = split.some((s) => s.share !== undefined);
  const weights = split.map((s) => (custom ? (s.share ?? 0) : 1));
  if (weights.every((w) => w === 0)) return Object.fromEntries(split.map((s) => [s.who, 0]));
  const parts = largestRemainder(total, weights);
  return Object.fromEntries(split.map((s, i) => [s.who, parts[i] as number]));
}
