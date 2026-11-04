import { describe, expect, it } from "vitest";
import {
  canEditExpense,
  canMarkPaid,
  changedFields,
  chooseBaseCurrency,
  netFor,
  partitionPayments,
  sharesOf,
  tripSettlement,
  validateExpenseDraft,
  type ExpenseDraftValues,
} from "../src/expenses";
import type { ExpenseRecord, TripGuest } from "../src/types";

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
  split: [{ who: "aman" }, { who: "riya" }, { who: "neha" }],
  createdBy: "aman",
  version: 1,
  ...over,
});
const mia: TripGuest = { id: "mia", tripId: "t1", name: "Mia", addedBy: "neha" };

describe("tripSettlement", () => {
  it("works out balances and payments in the counting currency, with each bill's stored rate", () => {
    const r = tripSettlement([expense(), expense({ id: "e2", paidBy: "riya", amount: 10000, currency: "USD", rate: 84, split: [{ who: "aman" }, { who: "riya" }] })], "INR");
    expect(r.balances).toEqual({ aman: 60000 - 420000, riya: -30000 + 420000, neha: -30000 });
    expect(r.waiting).toBe(0);
  });

  it("leaves out bills still waiting on this phone for a rate, and says how many", () => {
    const r = tripSettlement([expense(), expense({ id: "e2", currency: "THB", rate: null, rateDate: null })], "INR");
    expect(r.balances).toEqual({ aman: 60000, riya: -30000, neha: -30000 });
    expect(r.waiting).toBe(1);
  });

  it("has nothing to settle before the first expense", () => {
    expect(tripSettlement([], null)).toEqual({ balances: {}, payments: [], waiting: 0 });
  });

  it("editing an expense recalculates balances", () => {
    const before = tripSettlement([expense()], "INR");
    const after = tripSettlement([expense({ amount: 120000, split: [{ who: "aman" }, { who: "riya" }] })], "INR");
    expect(before.balances.riya).toBe(-30000);
    expect(after.balances).toEqual({ aman: 60000, riya: -60000 });
  });

  it("a payment settles what was owed", () => {
    const r = tripSettlement([expense(), expense({ id: "p1", kind: "payment", category: "payment", paidBy: "riya", amount: 30000, split: [{ who: "aman" }] })], "INR");
    expect(r.balances).toEqual({ aman: 30000, riya: 0, neha: -30000 });
    expect(r.payments).toEqual([{ from: "neha", to: "aman", amount: 30000 }]);
  });
});

describe("sharesOf and netFor", () => {
  it("splits a total the way the bill says, adding up exactly", () => {
    expect(sharesOf(expense({ amount: 100 }), 100)).toEqual({ aman: 34, riya: 33, neha: 33 });
    const exact = expense({ amount: 1000, split: [{ who: "aman", share: 700 }, { who: "riya", share: 300 }] });
    expect(sharesOf(exact, 1000)).toEqual({ aman: 700, riya: 300 });
    // the same exact split, scaled to the bill converted into another currency
    expect(sharesOf(exact, 50)).toEqual({ aman: 35, riya: 15 });
  });

  it("says what a bill means for one person: lent (+), owes (-), or nothing", () => {
    expect(netFor(expense(), "aman", 90000)).toBe(60000);
    expect(netFor(expense(), "riya", 90000)).toBe(-30000);
    expect(netFor(expense(), "kabir", 90000)).toBe(0);
  });
});

describe("partitionPayments", () => {
  const payments = [
    { from: "riya", to: "aman", amount: 1 },
    { from: "mia", to: "kabir", amount: 2 },
    { from: "neha", to: "kabir", amount: 3 },
    { from: "kabir", to: "riya", amount: 4 },
  ];

  it("puts the viewer's own payments first and folds away everyone else's", () => {
    const { mine, others } = partitionPayments(payments, "riya", [mia]);
    expect(mine.map((p) => p.amount)).toEqual([1, 4]);
    expect(others.map((p) => p.amount)).toEqual([2, 3]);
  });

  it("counts payments of guests the viewer added as their own", () => {
    const { mine } = partitionPayments(payments, "neha", [mia]);
    expect(mine.map((p) => p.amount)).toEqual([2, 3]);
  });
});

describe("who may do what", () => {
  it("only the person getting the money (or whoever added that guest) marks it paid", () => {
    expect(canMarkPaid("aman", "aman", [])).toBe(true);
    expect(canMarkPaid("aman", "riya", [])).toBe(false);
    expect(canMarkPaid("mia", "neha", [mia])).toBe(true);
    expect(canMarkPaid("mia", "aman", [mia])).toBe(false);
  });

  it("only the person who added an expense can change it", () => {
    expect(canEditExpense(expense({ createdBy: "aman" }), "aman")).toBe(true);
    expect(canEditExpense(expense({ createdBy: "aman" }), "riya")).toBe(false);
  });
});

describe("chooseBaseCurrency", () => {
  it("keeps the trip's counting currency once it has one", () => {
    expect(chooseBaseCurrency("INR", "USD", "IDR")).toBe("INR");
  });

  it("for the first expense uses the person's own currency, or else the bill's", () => {
    expect(chooseBaseCurrency(null, "USD", "IDR")).toBe("USD");
    expect(chooseBaseCurrency(null, null, "IDR")).toBe("IDR");
  });
});

describe("changedFields", () => {
  it("lists what an edit changed", () => {
    const before = expense();
    expect(changedFields(before, expense({ amount: 1, title: "Lunch" }))).toEqual(["amount", "title"]);
    expect(changedFields(before, expense({ split: [{ who: "aman" }] }))).toEqual(["split"]);
    expect(changedFields(before, expense({ paidBy: "riya", spentOn: "2026-12-02", category: "stay" }))).toEqual(["paidBy", "spentOn", "category"]);
    expect(changedFields(before, expense({ version: 9 }))).toEqual([]);
  });
});

describe("validateExpenseDraft", () => {
  const draft = (over: Partial<ExpenseDraftValues> = {}): ExpenseDraftValues => ({
    amountText: "900",
    currency: "INR",
    title: "Dinner",
    mode: "equal",
    people: ["aman", "riya", "neha"],
    exact: {},
    ...over,
  });

  it("turns a valid equal split into minor units and a split", () => {
    expect(validateExpenseDraft(draft())).toEqual({ ok: true, amount: 90000, split: [{ who: "aman" }, { who: "riya" }, { who: "neha" }] });
  });

  it("asks for an amount, a title and at least one person", () => {
    const r = validateExpenseDraft(draft({ amountText: "", title: "  ", people: [] }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual({ amount: "missing", title: "missing", split: { code: "nobody" } });
  });

  it("rejects amounts that are not money in that currency", () => {
    for (const amountText of ["abc", "0", "-5", "1.234"]) {
      const r = validateExpenseDraft(draft({ amountText }));
      expect(r.ok ? null : r.errors.amount, amountText).toBe("invalid");
    }
    const yen = validateExpenseDraft(draft({ currency: "JPY", amountText: "10.5" }));
    expect(yen.ok ? null : yen.errors.amount).toBe("invalid");
  });

  it("exact amounts must add up, and says by how much they are off", () => {
    const short = validateExpenseDraft(draft({ mode: "exact", people: ["aman", "riya"], exact: { aman: "500", riya: "300" } }));
    expect(short.ok ? null : short.errors.split).toEqual({ code: "short", by: 10000 });
    const over = validateExpenseDraft(draft({ mode: "exact", people: ["aman", "riya"], exact: { aman: "500", riya: "500" } }));
    expect(over.ok ? null : over.errors.split).toEqual({ code: "over", by: 10000 });
    const good = validateExpenseDraft(draft({ mode: "exact", people: ["aman", "riya"], exact: { aman: "600", riya: "300", neha: "5" } }));
    expect(good).toEqual({ ok: true, amount: 90000, split: [{ who: "aman", share: 60000 }, { who: "riya", share: 30000 }] });
  });
});
