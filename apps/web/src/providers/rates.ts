import { convertMinor, isCurrencyCode, type Expense, type RateProvider } from "@hoppin/core";

export { convertMinor as convert } from "@hoppin/core";

/** Currencies the European Central Bank publishes daily rates for (what Frankfurter serves). */
export const RATE_CURRENCIES = [
  "AUD", "BRL", "CAD", "CHF", "CNY", "CZK", "DKK", "EUR", "GBP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK",
  "JPY", "KRW", "MXN", "MYR", "NOK", "NZD", "PHP", "PLN", "RON", "SEK", "SGD", "THB", "TRY", "USD", "ZAR",
] as const;

/** No rate could be fetched (offline, timed out, or the service had none). */
export class RatesUnavailableError extends Error {
  override name = "RatesUnavailableError";
}

const HOUR = 3_600_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function checkArgs(from: string, to: string, date: string): void {
  if (!isCurrencyCode(from) || !isCurrencyCode(to)) throw new RangeError(`Not a currency pair: ${from} to ${to}`);
  if (!DATE.test(date)) throw new RangeError(`Not a date: ${date}`);
}

export interface FrankfurterOptions {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
  baseUrl?: string;
  timeoutMs?: number;
  now?: () => number;
}

/** ECB reference rates from Frankfurter (free, no key). Identical requests in flight share one network call. */
export function createFrankfurterRates({
  fetch = (url, init) => globalThis.fetch(url, init),
  baseUrl = "https://api.frankfurter.dev/v1",
  timeoutMs = 8000,
  now = Date.now,
}: FrankfurterOptions = {}): RateProvider {
  const inFlight = new Map<string, Promise<number>>();

  async function load(from: string, to: string, date: string): Promise<number> {
    const day = date > utcDate(now()) ? "latest" : date; // the ECB has no rates for future days
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${baseUrl}/${day}?base=${from}&symbols=${to}`, { signal: controller.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new RatesUnavailableError(`The rates service answered ${res.status}`);
      const rate = ((await res.json()) as { rates?: Record<string, unknown> }).rates?.[to];
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) throw new RatesUnavailableError(`No ${from} to ${to} rate for ${date}`);
      return rate;
    } catch (error) {
      if (error instanceof RatesUnavailableError) throw error;
      throw new RatesUnavailableError("Couldn't reach the rates service", { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getRate(from, to, date) {
      checkArgs(from, to, date);
      if (from === to) return 1;
      const key = `${from}>${to}@${date}`;
      let pending = inFlight.get(key);
      if (!pending) {
        pending = load(from, to, date).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      return pending;
    },
  };
}

export interface CachedRate {
  rate: number;
  fetchedAt: number;
}

/** Rates kept on the device, keyed `FROM>TO@YYYY-MM-DD`. */
export interface RateStore {
  get(key: string): CachedRate | undefined;
  set(key: string, value: CachedRate): void;
  entries(): IterableIterator<[string, CachedRate]>;
}

const STORE_KEY = "hoppin.rates";
const isCachedRate = (v: unknown): v is CachedRate =>
  typeof v === "object" && v !== null &&
  typeof (v as CachedRate).rate === "number" && Number.isFinite((v as CachedRate).rate) && (v as CachedRate).rate > 0 &&
  typeof (v as CachedRate).fetchedAt === "number";

/**
 * Saved rates in `storage` (localStorage by default; `null` keeps them in memory only). Read once, then served from
 * memory; only the most recently fetched `limit` rates are kept so storage stays tiny.
 */
export function createRateStore(storage: Storage | null = defaultStorage(), limit = 300): RateStore {
  let rates: Map<string, CachedRate> | null = null;
  const all = (): Map<string, CachedRate> => {
    if (rates) return rates;
    rates = new Map();
    try {
      const saved = JSON.parse(storage?.getItem(STORE_KEY) ?? "{}") as Record<string, unknown>;
      for (const [key, value] of Object.entries(saved)) if (isCachedRate(value)) rates.set(key, value);
    } catch {
      /* unreadable: start empty */
    }
    return rates;
  };

  return {
    get: (key) => all().get(key),
    entries: () => all().entries(),
    set(key, value) {
      const map = all();
      map.delete(key);
      map.set(key, value);
      if (map.size > limit) {
        const oldestFirst = [...map].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
        for (const [old] of oldestFirst.slice(0, map.size - limit)) map.delete(old);
      }
      try {
        storage?.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(map)));
      } catch {
        /* storage full or blocked: still cached for this visit */
      }
    },
  };
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export interface RateQuote {
  from: string;
  to: string;
  /** The day the rate is for. On a fallback this is the saved rate's day, not the day asked for. */
  date: string;
  rate: number;
  fetchedAt: number;
  /** A saved rate used because a fresh one couldn't be fetched. Say so on screen. */
  old: boolean;
}

export interface RateService {
  /** Where the rates come from, for the credit line ("European Central Bank"). */
  readonly source: string;
  /** The rate for a day (default: today). Falls back to the most recent saved rate when offline. */
  quote(from: string, to: string, date?: string): Promise<RateQuote>;
}

export interface RateServiceOptions {
  provider: RateProvider;
  store: RateStore;
  now?: () => number;
  /** How long today's rate is trusted before asking again (it can change until the ECB publishes). */
  refreshAfterMs?: number;
  source?: string;
}

/** Rates with a device cache: past days are fetched once ever, today's are refreshed, and offline uses what was saved. */
export function createRateService({
  provider,
  store,
  now = Date.now,
  refreshAfterMs = 6 * HOUR,
  source = "European Central Bank",
}: RateServiceOptions): RateService {
  /** The most recent saved rate for a pair, either direction. */
  function latestSaved(from: string, to: string): RateQuote | null {
    let best: RateQuote | null = null;
    for (const [key, saved] of store.entries()) {
      const [pair, date = ""] = key.split("@");
      const rate = pair === `${from}>${to}` ? saved.rate : pair === `${to}>${from}` ? 1 / saved.rate : null;
      if (rate === null) continue;
      if (!best || date > best.date || (date === best.date && saved.fetchedAt > best.fetchedAt)) {
        best = { from, to, date, rate, fetchedAt: saved.fetchedAt, old: true };
      }
    }
    return best;
  }

  return {
    source,
    async quote(from, to, date = utcDate(now())) {
      checkArgs(from, to, date);
      if (from === to) return { from, to, date, rate: 1, fetchedAt: now(), old: false };

      const key = `${from}>${to}@${date}`;
      const saved = store.get(key);
      // A day's rate is final once it was fetched on a later day; until then it can still be updated.
      if (saved && (utcDate(saved.fetchedAt) > date || now() - saved.fetchedAt < refreshAfterMs)) {
        return { from, to, date, ...saved, old: false };
      }
      try {
        const fresh = { rate: await provider.getRate(from, to, date), fetchedAt: now() };
        store.set(key, fresh);
        return { from, to, date, ...fresh, old: false };
      } catch (error) {
        const fallback = saved ? { from, to, date, ...saved, old: true } : latestSaved(from, to);
        if (fallback) return fallback;
        throw error instanceof RatesUnavailableError ? error : new RatesUnavailableError("No exchange rate available", { cause: error });
      }
    },
  };
}

/** An expense as typed in, before its rate is known. `date` is the day it was paid; that day's rate is captured. */
export type ExpenseDraft = Omit<Expense, "rate"> & { date: string };

/** Captures the rate into the expense when it is entered, so later rate changes never change what anyone owes. */
export async function captureRate(draft: ExpenseDraft, baseCurrency: string, rates: RateService): Promise<{ expense: Expense; quote: RateQuote }> {
  const { date, ...expense } = draft;
  const quote = await rates.quote(draft.currency, baseCurrency, date);
  return { expense: { ...expense, rate: quote.rate }, quote };
}

export interface HomeAmount {
  amount: number;
  currency: string;
  old: boolean;
}

/**
 * The same amounts shown in the person's home currency, for display only: the inputs are never modified. Uses today's
 * rate, one request per currency. `null` where no rate is available, so the screen shows the original instead.
 */
export async function viewInHomeCurrency(
  amounts: readonly { amount: number; currency: string }[],
  home: string,
  rates: RateService,
): Promise<(HomeAmount | null)[]> {
  const currencies = [...new Set(amounts.map((a) => a.currency))];
  const quotes = new Map(
    await Promise.all(currencies.map(async (c) => [c, await rates.quote(c, home).catch(() => null)] as const)),
  );
  return amounts.map(({ amount, currency }) => {
    const q = quotes.get(currency);
    return q ? { amount: convertMinor(amount, q.rate, currency, home), currency: home, old: q.old } : null;
  });
}
