import { useCallback, useSyncExternalStore } from "react";
import { RATE_CURRENCIES } from "../providers/rates";

const KEY = "hoppin.homeCurrency";
const OFF = "off";
const SUPPORTED = new Set<string>(RATE_CURRENCIES);

// Regions whose own currency has published rates. The euro area shares one entry per country.
const REGION_CURRENCY: Record<string, string> = {
  AU: "AUD", BR: "BRL", CA: "CAD", CH: "CHF", LI: "CHF", CN: "CNY", CZ: "CZK", DK: "DKK", GB: "GBP", HK: "HKD",
  HU: "HUF", ID: "IDR", IL: "ILS", IN: "INR", IS: "ISK", JP: "JPY", KR: "KRW", MX: "MXN", MY: "MYR", NO: "NOK",
  NZ: "NZD", PH: "PHP", PL: "PLN", RO: "RON", SE: "SEK", SG: "SGD", TH: "THB", TR: "TRY", US: "USD", ZA: "ZAR",
  ...Object.fromEntries(
    ["AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK"].map((r) => [r, "EUR"]),
  ),
};

/** The currency of the first of the phone's languages whose region has published rates, such as INR for en-IN. */
export function guessHomeCurrency(locales: readonly string[]): string | null {
  for (const tag of locales) {
    try {
      const currency = REGION_CURRENCY[new Intl.Locale(tag).maximize().region ?? ""];
      if (currency) return currency;
    } catch {
      /* not a valid language tag: try the next */
    }
  }
  return null;
}

const listeners = new Set<() => void>();
let guessed: { from: string; currency: string | null } | null = null;
/** The choice made this visit when the browser refused to store it (private windows). */
let unsaved: string | undefined;

function phoneGuess(): string | null {
  const locales = typeof navigator === "undefined" ? [] : navigator.languages ?? [navigator.language];
  const from = locales.join(",");
  if (guessed?.from !== from) guessed = { from, currency: guessHomeCurrency(locales) };
  return guessed.currency;
}

function read(): string | null {
  let stored: string | null = unsaved ?? null;
  if (unsaved === undefined) {
    try {
      stored = localStorage.getItem(KEY);
    } catch {
      /* blocked storage: fall back to the guess */
    }
  }
  if (stored === OFF) return null;
  return stored && SUPPORTED.has(stored) ? stored : phoneGuess();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange(); // chosen in another tab
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * The currency this person wants amounts shown in (null: show amounts as entered). Remembered on this device; every
 * screen using it updates at once. Display only: stored amounts and rates never change.
 */
export function useHomeCurrency(): [string | null, (currency: string | null) => void] {
  const current = useSyncExternalStore(subscribe, read, () => null);
  const set = useCallback((currency: string | null) => {
    if (currency !== null && !SUPPORTED.has(currency)) return;
    try {
      localStorage.setItem(KEY, currency ?? OFF);
      unsaved = undefined;
    } catch {
      unsaved = currency ?? OFF; // not remembered, but applies for this visit
    }
    listeners.forEach((l) => l());
  }, []);
  return [current, set];
}
