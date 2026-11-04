import { minorDigits } from "@hoppin/core";

// Building an Intl formatter is slow compared with using one, and money lists format many amounts.
const formatters = new Map<string, Intl.NumberFormat>();
const symbols = new Map<string, string>();
const names = new Map<string, Intl.DisplayNames>();

function formatter(currency: string, locale: string | undefined, display: "symbol" | "narrowSymbol" = "symbol"): Intl.NumberFormat {
  const key = `${locale ?? ""}|${currency}|${display}`;
  let f = formatters.get(key);
  if (!f) {
    const digits = minorDigits(currency);
    f = new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: display, minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(key, f);
  }
  return f;
}

/** An amount in minor units as money: `formatMoney(947500, "INR")` is "₹9,475.00". */
export function formatMoney(amount: number, currency: string, locale?: string): string {
  return formatter(currency, locale).format(amount / 10 ** minorDigits(currency));
}

/** The short sign for a currency, such as ₹ or $ (the code itself when there is none). */
export function currencySymbol(currency: string, locale?: string): string {
  const key = `${locale ?? ""}|${currency}`;
  let s = symbols.get(key);
  if (s === undefined) {
    s = formatter(currency, locale, "narrowSymbol").formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;
    symbols.set(key, s);
  }
  return s;
}

/** The currency's name in the person's language, such as "Indian Rupee". */
export function currencyName(currency: string, locale?: string): string {
  const key = locale ?? "";
  let n = names.get(key);
  if (!n) {
    n = new Intl.DisplayNames(locale ? [locale] : undefined, { type: "currency" });
    names.set(key, n);
  }
  return n.of(currency) ?? currency;
}
