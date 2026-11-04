import type { Expense, RateProvider } from "@hoppin/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureRate,
  convert,
  createFrankfurterRates,
  createRateService,
  createRateStore,
  RatesUnavailableError,
  viewInHomeCurrency,
} from "../src/providers/rates";

const NOW = Date.UTC(2026, 10, 4, 12, 0, 0); // 4 Nov 2026, 12:00 UTC
const HOUR = 3_600_000;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
const frankfurter = (base: string, date: string, rates: Record<string, number>) => ok({ amount: 1, base, date, rates });
const answering = (respond: () => Response | Promise<Response>) => vi.fn(async (_url: string, _init?: RequestInit) => respond());

describe("Frankfurter adapter", () => {
  it("adapter returns the ECB rate for a date", async () => {
    const fetch = answering(() => frankfurter("USD", "2026-11-03", { INR: 94.75 }));
    const rates = createFrankfurterRates({ fetch, now: () => NOW });
    expect(await rates.getRate("USD", "INR", "2026-11-03")).toBe(94.75);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0]![0])).toBe("https://api.frankfurter.dev/v1/2026-11-03?base=USD&symbols=INR");
  });

  it("asks for the latest rate when the date is in the future (the ECB has none yet)", async () => {
    const fetch = answering(() => frankfurter("USD", "2026-11-04", { INR: 95 }));
    await createFrankfurterRates({ fetch, now: () => NOW }).getRate("USD", "INR", "2026-11-20");
    expect(String(fetch.mock.calls[0]![0])).toContain("/v1/latest?");
  });

  it("does not use the network for the same currency", async () => {
    const fetch = vi.fn();
    expect(await createFrankfurterRates({ fetch }).getRate("INR", "INR", "2026-11-03")).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("makes one request when the same rate is asked for twice at once", async () => {
    const fetch = answering(() => frankfurter("USD", "2026-11-03", { INR: 94.75 }));
    const rates = createFrankfurterRates({ fetch, now: () => NOW });
    await Promise.all([rates.getRate("USD", "INR", "2026-11-03"), rates.getRate("USD", "INR", "2026-11-03")]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses anything that is not a currency code or a date, before building a URL", async () => {
    const fetch = vi.fn();
    const rates = createFrankfurterRates({ fetch });
    await expect(rates.getRate("USD&x=1", "INR", "2026-11-03")).rejects.toThrow(RangeError);
    await expect(rates.getRate("USD", "INR", "../latest")).rejects.toThrow(RangeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports an unreachable service, an error answer, or a missing rate as RatesUnavailableError", async () => {
    const down = createFrankfurterRates({ fetch: answering(() => Promise.reject(new TypeError("Failed to fetch"))), now: () => NOW });
    await expect(down.getRate("USD", "INR", "2026-11-03")).rejects.toBeInstanceOf(RatesUnavailableError);
    const notFound = createFrankfurterRates({ fetch: answering(() => new Response("{}", { status: 404 })), now: () => NOW });
    await expect(notFound.getRate("USD", "INR", "2026-11-03")).rejects.toBeInstanceOf(RatesUnavailableError);
    const empty = createFrankfurterRates({ fetch: answering(() => frankfurter("USD", "2026-11-03", {})), now: () => NOW });
    await expect(empty.getRate("USD", "INR", "2026-11-03")).rejects.toBeInstanceOf(RatesUnavailableError);
  });

  it("gives up after a timeout instead of hanging on a bad connection", async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
      const pending = createFrankfurterRates({ fetch, timeoutMs: 5000, now: () => NOW }).getRate("USD", "INR", "2026-11-03");
      const check = expect(pending).rejects.toBeInstanceOf(RatesUnavailableError);
      await vi.advanceTimersByTimeAsync(5000);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("rate service (cache and fallback)", () => {
  let now = NOW;
  const provider = (impl: RateProvider["getRate"]) => ({ getRate: vi.fn(impl) });
  beforeEach(() => {
    now = NOW;
    localStorage.clear();
  });

  it("keeps a past day's rate and never asks again (the ECB does not change it)", async () => {
    const p = provider(async () => 94.75);
    const rates = createRateService({ provider: p, store: createRateStore(null), now: () => now });
    await rates.quote("USD", "INR", "2026-11-03");
    now += 30 * 24 * HOUR;
    const q = await rates.quote("USD", "INR", "2026-11-03");
    expect(p.getRate).toHaveBeenCalledTimes(1);
    expect(q).toMatchObject({ rate: 94.75, date: "2026-11-03", old: false });
  });

  it("refreshes today's rate after a few hours, because it can still change today", async () => {
    const p = provider(async () => 95);
    const rates = createRateService({ provider: p, store: createRateStore(null), now: () => now, refreshAfterMs: 6 * HOUR });
    await rates.quote("USD", "INR");
    now += 1 * HOUR;
    await rates.quote("USD", "INR");
    expect(p.getRate).toHaveBeenCalledTimes(1);
    now += 6 * HOUR;
    await rates.quote("USD", "INR");
    expect(p.getRate).toHaveBeenCalledTimes(2);
  });

  it("if rates are unreachable the last cached rate is used and flagged as old", async () => {
    let online = true;
    const p = provider(async () => {
      if (!online) throw new RatesUnavailableError("offline");
      return 94.75;
    });
    const rates = createRateService({ provider: p, store: createRateStore(null), now: () => now });
    await rates.quote("USD", "INR", "2026-11-03");
    online = false;
    now += 2 * 24 * HOUR;
    const q = await rates.quote("USD", "INR", "2026-11-06");
    expect(q).toMatchObject({ rate: 94.75, date: "2026-11-03", old: true });
  });

  it("can fall back to a saved rate for the opposite direction", async () => {
    let online = true;
    const p = provider(async () => {
      if (!online) throw new RatesUnavailableError("offline");
      return 0.0125;
    });
    const rates = createRateService({ provider: p, store: createRateStore(null), now: () => now });
    await rates.quote("INR", "EUR", "2026-11-03");
    online = false;
    const q = await rates.quote("EUR", "INR", "2026-11-04");
    expect(q.rate).toBeCloseTo(80, 10);
    expect(q.old).toBe(true);
  });

  it("says plainly when there is no rate at all", async () => {
    const rates = createRateService({ provider: provider(async () => Promise.reject(new RatesUnavailableError("offline"))), store: createRateStore(null), now: () => now });
    await expect(rates.quote("USD", "INR", "2026-11-03")).rejects.toBeInstanceOf(RatesUnavailableError);
  });

  it("remembers rates on the device across app restarts", async () => {
    const p = provider(async () => 94.75);
    await createRateService({ provider: p, store: createRateStore(localStorage), now: () => now }).quote("USD", "INR", "2026-11-03");
    const offline = provider(async () => Promise.reject(new RatesUnavailableError("offline")));
    const q = await createRateService({ provider: offline, store: createRateStore(localStorage), now: () => now }).quote("USD", "INR", "2026-11-05");
    expect(q).toMatchObject({ rate: 94.75, old: true });
  });

  it("ignores saved data it cannot trust and keeps the saved list small", async () => {
    localStorage.setItem("hoppin.rates", JSON.stringify({ "USD>INR@2026-11-03": { rate: "lots", fetchedAt: 1 } }));
    const store = createRateStore(localStorage, 3);
    expect(store.get("USD>INR@2026-11-03")).toBeUndefined();
    for (let d = 1; d <= 5; d += 1) store.set(`USD>INR@2026-11-0${d}`, { rate: d, fetchedAt: d });
    expect(Object.keys(JSON.parse(localStorage.getItem("hoppin.rates")!))).toEqual(["USD>INR@2026-11-03", "USD>INR@2026-11-04", "USD>INR@2026-11-05"]);
  });

  it("still works when the browser will not store anything", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      const rates = createRateService({ provider: provider(async () => 94.75), store: createRateStore(localStorage), now: () => now });
      expect((await rates.quote("USD", "INR", "2026-11-03")).rate).toBe(94.75);
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe("entering an expense", () => {
  it("entering an expense stores the rate on the expense", async () => {
    const rates = createRateService({ provider: { getRate: async () => 94.75 }, store: createRateStore(null), now: () => NOW });
    const { expense, quote } = await captureRate(
      { paidBy: "aman", amount: 10000, currency: "USD", date: "2026-11-03", split: [{ who: "aman" }, { who: "riya" }] },
      "INR",
      rates,
    );
    expect(expense).toEqual({ paidBy: "aman", amount: 10000, currency: "USD", rate: 94.75, split: [{ who: "aman" }, { who: "riya" }] });
    expect(quote.old).toBe(false);
  });

  it("stores a rate of 1 when the expense is in the trip's currency, without the network", async () => {
    const getRate = vi.fn();
    const rates = createRateService({ provider: { getRate }, store: createRateStore(null), now: () => NOW });
    const { expense } = await captureRate({ paidBy: "aman", amount: 500, currency: "INR", date: "2026-11-03", split: [{ who: "riya" }] }, "INR", rates);
    expect(expense.rate).toBe(1);
    expect(getRate).not.toHaveBeenCalled();
  });
});

describe("viewing in the home currency", () => {
  it("view-in-home-currency never changes stored amounts", async () => {
    const expenses: readonly Expense[] = Object.freeze([
      Object.freeze({ paidBy: "aman", amount: 10000, currency: "USD", rate: 94.75, split: Object.freeze([{ who: "riya" }]) }),
      Object.freeze({ paidBy: "riya", amount: 50000, currency: "INR", rate: 1, split: Object.freeze([{ who: "aman" }]) }),
    ]) as readonly Expense[];
    const before = JSON.stringify(expenses);
    const rates = createRateService({ provider: { getRate: async (from: string) => (from === "USD" ? 0.9 : 0.0095) }, store: createRateStore(null), now: () => NOW });

    const views = await viewInHomeCurrency(expenses, "EUR", rates);

    expect(JSON.stringify(expenses)).toBe(before);
    expect(views).toEqual([
      { amount: 9000, currency: "EUR", old: false },
      { amount: 475, currency: "EUR", old: false },
    ]);
  });

  it("asks for one rate per currency, not one per expense", async () => {
    const getRate = vi.fn(async () => 0.9);
    const rates = createRateService({ provider: { getRate }, store: createRateStore(null), now: () => NOW });
    const many = Array.from({ length: 20 }, () => ({ amount: 100, currency: "USD" }));
    await viewInHomeCurrency(many, "EUR", rates);
    expect(getRate).toHaveBeenCalledTimes(1);
  });

  it("shows nothing converted (rather than a wrong number) when no rate is available", async () => {
    const rates = createRateService({ provider: { getRate: async () => Promise.reject(new RatesUnavailableError("offline")) }, store: createRateStore(null), now: () => NOW });
    expect(await viewInHomeCurrency([{ amount: 100, currency: "USD" }, { amount: 100, currency: "EUR" }], "EUR", rates)).toEqual([
      null,
      { amount: 100, currency: "EUR", old: false },
    ]);
  });
});

describe("convert", () => {
  it("converts minor units at a rate, minding each currency's decimals", () => {
    expect(convert(10000, 94.75, "USD", "INR")).toBe(947500);
    expect(convert(1000, 0.60383, "JPY", "INR")).toBe(60383);
  });
});
