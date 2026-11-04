import { describe, expect, it } from "vitest";
import { overlayMoney, pendingMoneyIds, queueMoneyChange, type MoneyRecord } from "../src/money-outbox";
import type { ExpenseRecord, TripSnapshot } from "../src/types";

const expense = (over: Partial<ExpenseRecord> = {}): ExpenseRecord => ({
  id: "e1",
  tripId: "t1",
  kind: "expense",
  title: "Dinner",
  category: "food",
  paidBy: "aman",
  amount: 90000,
  currency: "INR",
  rate: 1,
  rateDate: "2026-12-01",
  baseCurrency: "INR",
  spentOn: "2026-12-01",
  split: [{ who: "aman" }, { who: "riya" }],
  createdBy: "aman",
  version: 1,
  ...over,
});
const save = (e: ExpenseRecord, at = 1): MoneyRecord => ({ kind: "save", id: `s-${e.id}-${at}`, tripId: "t1", expense: e, at });
const del = (expenseId: string, at = 1): MoneyRecord => ({ kind: "delete", id: `d-${expenseId}-${at}`, tripId: "t1", expenseId, title: "Dinner", at });

const snap = (over: Partial<TripSnapshot> = {}): TripSnapshot => ({
  trip: { id: "t1", name: "Goa", startDate: null, endDate: null, baseCurrency: "INR" },
  members: [],
  items: [],
  rsvps: [],
  documents: [],
  guests: [],
  expenses: [expense()],
  ...over,
});

describe("queueMoneyChange", () => {
  it("keeps only the latest waiting save of an expense", () => {
    const q = queueMoneyChange([save(expense({ amount: 1 }), 1)], save(expense({ amount: 2 }), 2), true);
    expect(q).toHaveLength(1);
    expect(q[0]?.kind === "save" && q[0].expense.amount).toBe(2);
  });

  it("deleting an expense that never left the phone just drops it", () => {
    const q = queueMoneyChange([save(expense({ id: "new", version: 0 }))], del("new", 2), false);
    expect(q).toEqual([]);
  });

  it("deleting a saved expense replaces its waiting edits with the delete", () => {
    const q = queueMoneyChange([save(expense({ amount: 5 }))], del("e1", 2), true);
    expect(q.map((r) => r.kind)).toEqual(["delete"]);
  });

  it("a fresh change clears an earlier refusal of the same expense", () => {
    const refused: MoneyRecord = { ...save(expense()), error: "nope" };
    const q = queueMoneyChange([refused], save(expense({ amount: 7 }), 2), true);
    expect(q).toHaveLength(1);
    expect(q[0]?.error).toBeUndefined();
  });
});

describe("overlayMoney", () => {
  it("shows waiting saves, deletes and guests on top of the saved trip, without changing it", () => {
    const saved = snap();
    const queue: MoneyRecord[] = [
      save(expense({ amount: 100 })),
      save(expense({ id: "e2", version: 0 })),
      { kind: "guest", id: "g", tripId: "t1", guest: { id: "mia", tripId: "t1", name: "Mia", addedBy: "aman" }, at: 1 },
    ];
    const shown = overlayMoney(saved, queue);
    expect(shown.expenses?.map((e) => [e.id, e.amount])).toEqual([["e1", 100], ["e2", 90000]]);
    expect(shown.guests?.map((g) => g.name)).toEqual(["Mia"]);
    expect(saved.expenses?.[0]?.amount).toBe(90000);
    expect(overlayMoney(saved, [del("e1")]).expenses).toEqual([]);
  });

  it("leaves out changes the server refused (they are shown separately)", () => {
    expect(overlayMoney(snap(), [{ ...del("e1"), error: "no" }]).expenses).toHaveLength(1);
  });

  it("a trip's first expense, still on this phone, sets the counting currency shown", () => {
    const shown = overlayMoney(snap({ trip: { id: "t1", name: "Goa", startDate: null, endDate: null }, expenses: [] }), [save(expense({ baseCurrency: "USD" }))]);
    expect(shown.trip.baseCurrency).toBe("USD");
  });

  it("works on a trip saved before expenses existed", () => {
    const old = snap();
    delete old.expenses;
    delete old.guests;
    expect(overlayMoney(old, []).expenses).toEqual([]);
  });

  it("knows which expenses are still waiting to be sent", () => {
    expect([...pendingMoneyIds([save(expense()), del("e9"), { ...save(expense({ id: "x" })), error: "no" }])]).toEqual(["e1", "e9"]);
  });
});
