import type { ExpenseRecord, TripGuest, TripSnapshot } from "./types";

/**
 * Money changes made on this device that are waiting to be sent. `error` is set when the server refused one; it is
 * then kept (not retried, not shown in the totals) until the person tries again or discards it.
 */
export type MoneyRecord =
  | { kind: "guest"; id: string; tripId: string; guest: TripGuest; at: number; error?: string }
  | { kind: "save"; id: string; tripId: string; expense: ExpenseRecord; at: number; error?: string }
  | { kind: "delete"; id: string; tripId: string; expenseId: string; title: string; at: number; error?: string };

const expenseIdOf = (r: MoneyRecord): string | null => (r.kind === "save" ? r.expense.id : r.kind === "delete" ? r.expenseId : null);

/**
 * Adds a change to the waiting list. A newer save of an expense replaces the one waiting; deleting an expense that never
 * left this phone (`onServer` false) simply drops it, since there is nothing to delete on the server.
 */
export function queueMoneyChange(queue: readonly MoneyRecord[], change: MoneyRecord, onServer: boolean): MoneyRecord[] {
  const target = expenseIdOf(change);
  const rest = target === null ? [...queue] : queue.filter((r) => expenseIdOf(r) !== target);
  if (change.kind === "delete" && !onServer) return rest;
  return [...rest, change];
}

/** Ids of expenses with a change still waiting to be sent (not ones the server refused). */
export function pendingMoneyIds(queue: readonly MoneyRecord[]): Set<string> {
  return new Set(queue.filter((r) => !r.error).map(expenseIdOf).filter((id): id is string => id !== null));
}

/** What the person should see: saved guests and expenses with their waiting changes on top. The saved copy is not modified. */
export function overlayMoney(snapshot: TripSnapshot, queue: readonly MoneyRecord[]): TripSnapshot {
  const mine = queue.filter((r) => r.tripId === snapshot.trip.id && !r.error).sort((a, b) => a.at - b.at);
  const guests = [...(snapshot.guests ?? [])];
  let expenses = [...(snapshot.expenses ?? [])];
  for (const r of mine) {
    if (r.kind === "guest" && !guests.some((g) => g.id === r.guest.id)) guests.push(r.guest);
    if (r.kind === "save") {
      const at = expenses.findIndex((e) => e.id === r.expense.id);
      expenses = at >= 0 ? expenses.map((e, i) => (i === at ? r.expense : e)) : [...expenses, r.expense];
    }
    if (r.kind === "delete") expenses = expenses.filter((e) => e.id !== r.expenseId);
  }
  const firstBase = mine.find((r): r is Extract<MoneyRecord, { kind: "save" }> => r.kind === "save")?.expense.baseCurrency;
  const baseCurrency = snapshot.trip.baseCurrency ?? firstBase ?? null;
  return { ...snapshot, trip: { ...snapshot.trip, baseCurrency }, guests, expenses };
}
