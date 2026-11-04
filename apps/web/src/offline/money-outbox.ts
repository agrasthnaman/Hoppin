import { queueMoneyChange, type ExpenseRecord, type MoneyRecord, type TripGuest, type TripSnapshot } from "@hoppin/core";
import type { RateService } from "../providers/rates";
import type { OfflineDb } from "./db";
import { announceChange } from "./events";
import { isRetryLater } from "./outbox";
import { getLocalTrip } from "./sync";

/** What sending money changes needs from the server side. */
export interface MoneyWriter {
  saveExpense(expense: ExpenseRecord, guestIds: ReadonlySet<string>): Promise<void>;
  deleteExpense(expenseId: string): Promise<void>;
  addGuest(guest: TripGuest): Promise<void>;
}

type Change = MoneyRecord extends infer R ? (R extends MoneyRecord ? Omit<R, "id" | "at" | "error"> : never) : never;

export const listMoney = (db: OfflineDb, tripId: string) => db.moneyOutbox.where("tripId").equals(tripId).toArray();

/** Keeps a money change on this device until it can be sent. `onServer`: the expense exists on the server already. */
export async function queueMoney(deps: { db: OfflineDb; now?: () => number; newId?: () => string }, change: Change, onServer = true): Promise<void> {
  const { db } = deps;
  const record = { ...change, id: (deps.newId ?? (() => crypto.randomUUID()))(), at: (deps.now ?? Date.now)() } as MoneyRecord;
  await db.transaction("rw", db.moneyOutbox, async () => {
    const current = await listMoney(db, change.tripId);
    const next = queueMoneyChange(current, record, onServer);
    await db.moneyOutbox.bulkDelete(current.map((r) => r.id));
    await db.moneyOutbox.bulkPut(next);
  });
  announceChange(change.tripId);
}

/** Tries a refused change again (for example after the person fixed what was wrong elsewhere). */
export async function retryMoney(db: OfflineDb, id: string): Promise<void> {
  const record = await db.moneyOutbox.get(id);
  if (!record) return;
  const { error: _error, ...rest } = record;
  await db.moneyOutbox.put({ ...rest, at: Date.now() } as MoneyRecord);
  announceChange(record.tripId);
}

export async function discardMoney(db: OfflineDb, id: string): Promise<void> {
  const record = await db.moneyOutbox.get(id);
  await db.moneyOutbox.delete(id);
  if (record) announceChange(record.tripId);
}

export interface MoneyFlushDeps {
  db: OfflineDb;
  writer: MoneyWriter;
  rates: RateService;
}

export interface MoneyFlushResult {
  sent: number;
  refused: number;
  /** No connection (or no exchange rate yet): what is left is tried again next time. */
  deferred: boolean;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Sends waiting money changes in the order that keeps them valid: new guests, then expenses, then deletions. An
 * expense added offline gets a fresh exchange rate for the day it was paid just before it is sent. Nothing is dropped:
 * a change the server refuses is kept, marked with the reason, for the person to retry or discard.
 */
export async function flushMoney(deps: MoneyFlushDeps, tripId: string): Promise<MoneyFlushResult> {
  const { db, writer, rates } = deps;
  const result: MoneyFlushResult = { sent: 0, refused: 0, deferred: false };
  const waiting = (await listMoney(db, tripId)).filter((r) => !r.error).sort((a, b) => a.at - b.at);
  if (waiting.length === 0) return result;

  const local = await getLocalTrip(db, tripId);
  let base = local?.snapshot.trip.baseCurrency ?? null;
  const guestIds = new Set([
    ...(local?.snapshot.guests ?? []).map((g) => g.id),
    ...waiting.flatMap((r) => (r.kind === "guest" ? [r.guest.id] : [])),
  ]);

  /** The server took it: show it in the device's copy right away (the next refresh replaces it with the server's). */
  const done = async (r: MoneyRecord, sent?: ExpenseRecord) => {
    await db.transaction("rw", db.moneyOutbox, db.trips, async () => {
      await db.moneyOutbox.delete(r.id);
      const stored = await db.trips.get(tripId);
      if (stored) await db.trips.put({ ...stored, snapshot: applySent(stored.snapshot, r, sent) });
    });
    result.sent += 1;
  };
  const refuse = async (r: MoneyRecord, e: unknown) => {
    await db.moneyOutbox.put({ ...r, error: message(e) });
    result.refused += 1;
  };
  /** The expense with a rate to `to`: kept if it already has a fresh one, fetched for the day it was paid otherwise. */
  const priced = async (e: ExpenseRecord, to: string): Promise<ExpenseRecord> => {
    if (e.baseCurrency === to && e.rate !== null && !e.rateSaved) return e;
    const quote = await rates.quote(e.currency, to, e.spentOn);
    const { rateSaved: _saved, ...rest } = e;
    return { ...rest, baseCurrency: to, rate: quote.rate, rateDate: quote.date };
  };

  try {
    for (const r of waiting.filter((x) => x.kind === "guest")) {
      try {
        await writer.addGuest(r.guest);
        await done(r);
      } catch (e) {
        if (isRetryLater(e)) return { ...result, deferred: true };
        await refuse(r, e);
      }
    }

    for (const r of waiting.filter((x) => x.kind === "save")) {
      let expense: ExpenseRecord;
      try {
        expense = await priced(r.expense, base ?? r.expense.baseCurrency);
      } catch {
        return { ...result, deferred: true }; // no rate reachable yet
      }
      try {
        await writer.saveExpense(expense, guestIds);
        base ??= expense.baseCurrency;
        await done(r, expense);
      } catch (e) {
        // Someone else's first expense set a different counting currency in the meantime: price it in that one.
        const tripBase = /base_currency:([A-Z]{3})/.exec(message(e))?.[1];
        if (tripBase && tripBase !== expense.baseCurrency) {
          base = tripBase;
          try {
            const repriced = await priced(expense, tripBase);
            await writer.saveExpense(repriced, guestIds);
            await done(r, repriced);
            continue;
          } catch (again) {
            if (isRetryLater(again)) return { ...result, deferred: true };
            await refuse(r, again);
            continue;
          }
        }
        if (isRetryLater(e)) return { ...result, deferred: true };
        await refuse(r, e);
      }
    }

    for (const r of waiting.filter((x) => x.kind === "delete")) {
      try {
        await writer.deleteExpense(r.expenseId);
        await done(r);
      } catch (e) {
        if (isRetryLater(e)) return { ...result, deferred: true };
        await refuse(r, e);
      }
    }
    return result;
  } finally {
    if (result.sent + result.refused > 0) announceChange(tripId);
  }
}

function applySent(snapshot: TripSnapshot, r: MoneyRecord, sent: ExpenseRecord | undefined): TripSnapshot {
  if (r.kind === "guest") {
    const guests = snapshot.guests ?? [];
    return guests.some((g) => g.id === r.guest.id) ? snapshot : { ...snapshot, guests: [...guests, r.guest] };
  }
  const expenses = (snapshot.expenses ?? []).filter((e) => e.id !== (r.kind === "save" ? r.expense.id : r.expenseId));
  if (r.kind === "delete" || !sent) return { ...snapshot, expenses };
  const saved = { ...sent, version: Math.max(sent.version, 0) + 1 };
  return { ...snapshot, trip: { ...snapshot.trip, baseCurrency: snapshot.trip.baseCurrency ?? saved.baseCurrency }, expenses: [saved, ...expenses] };
}
