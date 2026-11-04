import { describe, expect, it } from "vitest";
import { computeSettlement, InvalidExpenseError } from "../src/settlement";
import type { Expense } from "../src/types";

const inr = (over: Partial<Expense> & Pick<Expense, "paidBy" | "amount" | "split">): Expense => ({
  currency: "INR",
  rate: 1,
  ...over,
});
const everyone = (...who: string[]) => who.map((w) => ({ who: w }));
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Applies the suggested payments to the balances; a correct settlement leaves everyone at zero. */
function afterPaying(result: ReturnType<typeof computeSettlement>): Record<string, number> {
  const left = { ...result.balances };
  for (const p of result.payments) {
    left[p.from] = (left[p.from] ?? 0) + p.amount;
    left[p.to] = (left[p.to] ?? 0) - p.amount;
  }
  return left;
}

describe("computeSettlement", () => {
  it("equal split among all", () => {
    const r = computeSettlement([inr({ paidBy: "aman", amount: 90000, split: everyone("aman", "riya", "neha") })], "INR");
    expect(r.balances).toEqual({ aman: 60000, riya: -30000, neha: -30000 });
    expect(r.payments).toEqual([
      { from: "neha", to: "aman", amount: 30000 },
      { from: "riya", to: "aman", amount: 30000 },
    ]);
  });

  it("custom amounts", () => {
    const r = computeSettlement(
      [inr({ paidBy: "riya", amount: 100000, split: [{ who: "aman", share: 70000 }, { who: "riya", share: 30000 }] })],
      "INR",
    );
    expect(r.balances).toEqual({ riya: 70000, aman: -70000 });
    expect(r.payments).toEqual([{ from: "aman", to: "riya", amount: 70000 }]);
  });

  it("splits by share when the custom amounts do not add up to the total", () => {
    // 2 : 1 of ₹300 is ₹200 and ₹100.
    const r = computeSettlement([inr({ paidBy: "aman", amount: 30000, split: [{ who: "aman", share: 2 }, { who: "riya", share: 1 }] })], "INR");
    expect(r.balances).toEqual({ aman: 10000, riya: -10000 });
  });

  it("guest included in a split", () => {
    const r = computeSettlement([inr({ paidBy: "aman", amount: 30000, split: everyone("aman", "riya", "guest:kid") })], "INR");
    expect(r.balances).toEqual({ aman: 20000, riya: -10000, "guest:kid": -10000 });
    expect(r.payments).toContainEqual({ from: "guest:kid", to: "aman", amount: 10000 });
  });

  it("a guest with a zero share owes nothing", () => {
    const r = computeSettlement(
      [inr({ paidBy: "aman", amount: 1000, split: [{ who: "aman", share: 1 }, { who: "riya", share: 1 }, { who: "guest:kid", share: 0 }] })],
      "INR",
    );
    expect(r.balances["guest:kid"]).toBe(0);
    expect(r.balances).toEqual({ aman: 500, riya: -500, "guest:kid": 0 });
    expect(r.payments.some((p) => p.from === "guest:kid" || p.to === "guest:kid")).toBe(false);
  });

  it("three-way debts are reduced to the fewest payments", () => {
    // Aman owes Riya ₹100 and Riya owes Neha ₹100: one payment, Aman to Neha.
    const r = computeSettlement(
      [
        inr({ paidBy: "riya", amount: 10000, split: everyone("aman") }),
        inr({ paidBy: "neha", amount: 10000, split: everyone("riya") }),
      ],
      "INR",
    );
    expect(r.balances).toEqual({ riya: 0, aman: -10000, neha: 10000 });
    expect(r.payments).toEqual([{ from: "aman", to: "neha", amount: 10000 }]);
  });

  it("settles a busy trip in fewer payments than there are people", () => {
    const r = computeSettlement(
      [
        inr({ paidBy: "aman", amount: 120000, split: everyone("aman", "riya", "neha", "kabir") }),
        inr({ paidBy: "riya", amount: 40000, split: everyone("aman", "riya", "neha", "kabir") }),
        inr({ paidBy: "neha", amount: 20000, split: everyone("neha", "kabir") }),
      ],
      "INR",
    );
    expect(r.payments.length).toBeLessThan(4);
    expect(Object.values(afterPaying(r)).every((v) => v === 0)).toBe(true);
  });

  it("pairs people who owe and are owed the same amount directly", () => {
    // Largest-first on its own needs five payments here; pairing equal amounts first needs four.
    const r = computeSettlement(
      [
        inr({ paidBy: "a", amount: 500, split: everyone("x") }),
        inr({ paidBy: "b", amount: 300, split: everyone("y") }),
        inr({ paidBy: "b", amount: 200, split: everyone("z") }),
        inr({ paidBy: "c", amount: 400, split: everyone("w") }),
      ],
      "INR",
    );
    // Balances: a +500, b +500, c +400, x -500, y -300, z -200, w -400.
    expect(r.payments).toContainEqual({ from: "w", to: "c", amount: 400 });
    expect(r.payments.length).toBe(4);
    expect(Object.values(afterPaying(r)).every((v) => v === 0)).toBe(true);
  });

  it("balances sum to exactly zero when the amount does not divide evenly", () => {
    // ₹10.00 between three people: 334 + 333 + 333 paise.
    const r = computeSettlement([inr({ paidBy: "aman", amount: 1000, split: everyone("aman", "riya", "neha") })], "INR");
    expect(sum(Object.values(r.balances))).toBe(0);
    expect(r.balances).toEqual({ aman: 666, riya: -333, neha: -333 });
  });

  it("gives the leftover paise to the largest remainders, so custom shares round fairly", () => {
    // 100 paise split 1:1:1:3 → 16.67, 16.67, 16.67, 50 → 17, 17, 16, 50.
    const r = computeSettlement(
      [inr({ paidBy: "p", amount: 100, split: [{ who: "a", share: 1 }, { who: "b", share: 1 }, { who: "c", share: 1 }, { who: "d", share: 3 }] })],
      "INR",
    );
    expect(r.balances).toEqual({ p: 100, a: -17, b: -17, c: -16, d: -50 });
  });

  it("a foreign-currency expense uses its stored rate", () => {
    // $100.00 at the stored rate of 94.75 is ₹9,475.00, whatever today's rate is.
    const r = computeSettlement(
      [{ paidBy: "aman", amount: 10000, currency: "USD", rate: 94.75, split: everyone("aman", "riya") }],
      "INR",
    );
    expect(r.balances).toEqual({ aman: 473750, riya: -473750 });
  });

  it("converts currencies with a different number of decimals correctly", () => {
    // ¥1,000 at 0.60383 is ₹603.83.
    const r = computeSettlement([{ paidBy: "aman", amount: 1000, currency: "JPY", rate: 0.60383, split: everyone("riya") }], "INR");
    expect(r.balances).toEqual({ aman: 60383, riya: -60383 });
  });

  it("ignores the stored rate when the expense is already in the base currency", () => {
    const r = computeSettlement([inr({ paidBy: "aman", amount: 1000, rate: 3, split: everyone("riya") })], "INR");
    expect(r.balances).toEqual({ aman: 1000, riya: -1000 });
  });

  it("returns nothing to settle when there are no expenses", () => {
    expect(computeSettlement([], "INR")).toEqual({ balances: {}, payments: [] });
  });

  it("never reports negative zero", () => {
    const r = computeSettlement([inr({ paidBy: "aman", amount: 1000, split: everyone("aman") })], "INR");
    expect(Object.is(r.balances.aman, 0)).toBe(true);
    expect(r.payments).toEqual([]);
  });

  it("always sums to zero and settles completely, across many random trips", () => {
    let seed = 42;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const people = ["a", "b", "c", "d", "e", "f", "g", "guest:1"];
    const currencies: [string, number][] = [["INR", 1], ["USD", 94.75], ["JPY", 0.60383], ["KWD", 308.9]];
    for (let trip = 0; trip < 200; trip += 1) {
      const expenses: Expense[] = Array.from({ length: 1 + rand(12) }, () => {
        const [currency, rate] = currencies[rand(currencies.length)]!;
        const who = people.filter(() => rand(2) === 1);
        const split = (who.length ? who : ["a"]).map((w) => (rand(3) === 0 ? { who: w, share: rand(5) } : { who: w }));
        const custom = split.some((s) => s.share !== undefined);
        const shares = custom ? split.map((s) => ({ who: s.who, share: s.share ?? 1 })) : split;
        if (custom && shares.every((s) => s.share === 0)) shares[0]!.share = 1;
        return { paidBy: people[rand(people.length)]!, amount: 1 + rand(5_000_000), currency, rate, split: shares };
      });
      const r = computeSettlement(expenses, "INR");
      expect(sum(Object.values(r.balances))).toBe(0);
      expect(Object.values(afterPaying(r)).every((v) => v === 0)).toBe(true);
      expect(r.payments.every((p) => Number.isInteger(p.amount) && p.amount > 0)).toBe(true);
      expect(r.payments.length).toBeLessThan(Math.max(1, Object.keys(r.balances).length));
    }
  });
});

describe("computeSettlement refuses expenses that would give wrong money", () => {
  const bad = (over: Partial<Expense>) => () =>
    computeSettlement([inr({ paidBy: "aman", amount: 1000, split: everyone("aman", "riya"), ...over })], "INR");

  it("rejects amounts that are not whole minor units", () => {
    expect(bad({ amount: 10.5 })).toThrow(InvalidExpenseError);
    expect(bad({ amount: -100 })).toThrow(/amount/);
  });

  it("rejects a missing or broken rate on a foreign-currency expense", () => {
    expect(bad({ currency: "USD", rate: 0 })).toThrow(/rate/);
    expect(bad({ currency: "USD", rate: Number.NaN })).toThrow(/rate/);
  });

  it("rejects an unknown currency code", () => {
    expect(bad({ currency: "usd" })).toThrow(/currency/);
    expect(() => computeSettlement([], "rupees")).toThrow(/currency/);
  });

  it("rejects an empty split, someone listed twice, or shares on only some people", () => {
    expect(bad({ split: [] })).toThrow(/split/);
    expect(bad({ split: everyone("riya", "riya") })).toThrow(/twice/);
    expect(bad({ split: [{ who: "aman", share: 1 }, { who: "riya" }] })).toThrow(/share/);
  });

  it("rejects shares that are negative, fractional, or all zero", () => {
    expect(bad({ split: [{ who: "aman", share: -1 }, { who: "riya", share: 2 }] })).toThrow(/share/);
    expect(bad({ split: [{ who: "aman", share: 0.5 }, { who: "riya", share: 1 }] })).toThrow(/share/);
    expect(bad({ split: [{ who: "aman", share: 0 }, { who: "riya", share: 0 }] })).toThrow(/share/);
  });

  it("says which expense is wrong", () => {
    try {
      computeSettlement([inr({ paidBy: "a", amount: 1, split: everyone("a") }), inr({ paidBy: "a", amount: 1.5, split: everyone("a") })], "INR");
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidExpenseError);
      expect((e as InvalidExpenseError).index).toBe(1);
    }
  });
});
