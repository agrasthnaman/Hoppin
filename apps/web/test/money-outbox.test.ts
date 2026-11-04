import type { ExpenseRecord, TripSnapshot } from "@hoppin/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openOfflineDb, type OfflineDb } from "../src/offline/db";
import { discardMoney, flushMoney, listMoney, queueMoney, retryMoney, type MoneyWriter } from "../src/offline/money-outbox";
import type { RateService } from "../src/providers/rates";

let db: OfflineDb;
let n = 0;
beforeEach(async () => {
  db = openOfflineDb(`money-outbox-${(n += 1)}`);
});

const expense = (over: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "e1",
  tripId: "t1",
  kind: "expense",
  title: "Dinner",
  category: "food",
  paidBy: "me",
  amount: 30000000,
  currency: "IDR",
  rate: null,
  rateDate: null,
  baseCurrency: "INR",
  spentOn: "2026-12-01",
  split: [{ who: "me" }, { who: "mia" }],
  createdBy: "me",
  version: 0,
  ...over,
});

async function storeTrip(over: Partial<TripSnapshot> = {}) {
  await db.trips.put({
    tripId: "t1",
    syncedAt: 1,
    snapshot: { trip: { id: "t1", name: "Bali", startDate: null, endDate: null, baseCurrency: "INR" }, members: [], items: [], rsvps: [], documents: [], guests: [], expenses: [], ...over },
  });
}

const writer = (): MoneyWriter & { [K in keyof MoneyWriter]: ReturnType<typeof vi.fn> } => ({
  saveExpense: vi.fn(async () => {}),
  deleteExpense: vi.fn(async () => {}),
  addGuest: vi.fn(async () => {}),
});
const rates = (rate = 0.0053): RateService => ({
  source: "European Central Bank",
  quote: vi.fn(async (from: string, to: string, date?: string) => ({ from, to, date: date ?? "2026-12-05", rate: from === to ? 1 : rate, fetchedAt: 1, old: false })),
});

describe("flushMoney", () => {
  it("prices an expense added offline at the rate of the day it was paid, then sends it", async () => {
    await storeTrip();
    await queueMoney({ db }, { kind: "save", tripId: "t1", expense: expense() }, false);
    const w = writer();
    const r = rates();
    expect(await flushMoney({ db, writer: w, rates: r }, "t1")).toEqual({ sent: 1, refused: 0, deferred: false });
    expect(r.quote).toHaveBeenCalledWith("IDR", "INR", "2026-12-01");
    expect(w.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", rate: 0.0053, rateDate: "2026-12-01", baseCurrency: "INR" }), expect.any(Set));
    expect(await listMoney(db, "t1")).toEqual([]);
    // shown in the device's copy at once, before the next refresh
    expect((await db.trips.get("t1"))?.snapshot.expenses?.map((e) => [e.id, e.rate])).toEqual([["e1", 0.0053]]);
  });

  it("replaces a rate the phone had saved while offline with a fresh one", async () => {
    await storeTrip();
    await queueMoney({ db }, { kind: "save", tripId: "t1", expense: expense({ rate: 0.005, rateDate: "2026-11-20", rateSaved: true }) }, false);
    const w = writer();
    await flushMoney({ db, writer: w, rates: rates(0.0054) }, "t1");
    const [sent] = w.saveExpense.mock.calls[0]!;
    expect(sent).toMatchObject({ rate: 0.0054, rateDate: "2026-12-01" });
    expect(sent).not.toHaveProperty("rateSaved");
  });

  it("keeps a rate that was captured online", async () => {
    await storeTrip();
    await queueMoney({ db }, { kind: "save", tripId: "t1", expense: expense({ rate: 0.0052, rateDate: "2026-12-01" }) }, false);
    const r = rates();
    await flushMoney({ db, writer: writer(), rates: r }, "t1");
    expect(r.quote).not.toHaveBeenCalled();
  });

  it("if someone else's first expense set another counting currency, prices it in that one", async () => {
    await storeTrip({ trip: { id: "t1", name: "Bali", startDate: null, endDate: null, baseCurrency: null } });
    await queueMoney({ db }, { kind: "save", tripId: "t1", expense: expense({ baseCurrency: "USD", rate: 0.000063, rateDate: "2026-12-01" }) }, false);
    const w = writer();
    w.saveExpense.mockRejectedValueOnce(new Error("base_currency:INR"));
    expect(await flushMoney({ db, writer: w, rates: rates() }, "t1")).toMatchObject({ sent: 1, refused: 0 });
    expect(w.saveExpense.mock.calls[1]![0]).toMatchObject({ baseCurrency: "INR", rate: 0.0053 });
  });

  it("waits when there is no connection or no exchange rate, keeping everything", async () => {
    await storeTrip();
    await queueMoney({ db }, { kind: "save", tripId: "t1", expense: expense() }, false);
    const offline = writer();
    offline.saveExpense.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await flushMoney({ db, writer: offline, rates: rates() }, "t1")).toMatchObject({ deferred: true, sent: 0 });

    const noRate: RateService = { source: "x", quote: vi.fn(async () => Promise.reject(new Error("no rate"))) };
    expect(await flushMoney({ db, writer: writer(), rates: noRate }, "t1")).toMatchObject({ deferred: true });
    expect(await listMoney(db, "t1")).toHaveLength(1);
  });

  it("keeps a refused change with the reason, until it is tried again or discarded", async () => {
    await storeTrip();
    await queueMoney({ db }, { kind: "delete", tripId: "t1", expenseId: "e9", title: "Taxi" }, true);
    const w = writer();
    w.deleteExpense.mockRejectedValueOnce(new Error("only the person who added this can delete it"));
    expect(await flushMoney({ db, writer: w, rates: rates() }, "t1")).toMatchObject({ refused: 1 });
    const [kept] = await listMoney(db, "t1");
    expect(kept?.error).toBe("only the person who added this can delete it");

    // a refused change is not retried on its own
    await flushMoney({ db, writer: w, rates: rates() }, "t1");
    expect(w.deleteExpense).toHaveBeenCalledTimes(1);

    await retryMoney(db, kept!.id);
    expect(await flushMoney({ db, writer: w, rates: rates() }, "t1")).toMatchObject({ sent: 1 });

    await queueMoney({ db }, { kind: "delete", tripId: "t1", expenseId: "e8", title: "Bus" }, true);
    const [other] = await listMoney(db, "t1");
    await discardMoney(db, other!.id);
    expect(await listMoney(db, "t1")).toEqual([]);
  });

  it("sends new guests before the expenses that use them, telling guests apart from members", async () => {
    await storeTrip();
    await queueMoney({ db }, { kind: "save", tripId: "t1", expense: expense({ rate: 0.0053, rateDate: "2026-12-01" }) }, false);
    await queueMoney({ db }, { kind: "guest", tripId: "t1", guest: { id: "mia", tripId: "t1", name: "Mia", addedBy: "me" } });
    const order: string[] = [];
    const w = writer();
    w.addGuest.mockImplementation(async () => void order.push("guest"));
    w.saveExpense.mockImplementation(async (_e: ExpenseRecord, guestIds: ReadonlySet<string>) => void order.push(`expense:${[...guestIds].join(",")}`));
    await flushMoney({ db, writer: w, rates: rates() }, "t1");
    expect(order).toEqual(["guest", "expense:mia"]);
    expect((await db.trips.get("t1"))?.snapshot.guests?.map((g) => g.name)).toEqual(["Mia"]);
  });
});
