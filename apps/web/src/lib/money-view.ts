import { convertMinor } from "@hoppin/core";
import { useEffect, useState } from "react";
import { useServices } from "../app/services";
import type { RateQuote } from "../providers/rates";
import { formatMoneyShort } from "./money";

/** Today's rate from one currency to another: the quote, null when none is available, undefined while it loads. */
export function useRate(from: string | null, to: string | null): RateQuote | null | undefined {
  const { rates } = useServices();
  const [result, setResult] = useState<{ key: string; quote: RateQuote | null } | null>(null);
  const key = from && to ? `${from}>${to}` : "";
  useEffect(() => {
    if (!from || !to) return;
    let live = true;
    rates.quote(from, to).then(
      (quote) => live && setResult({ key: `${from}>${to}`, quote }),
      () => live && setResult({ key: `${from}>${to}`, quote: null }),
    );
    return () => {
      live = false;
    };
  }, [rates, from, to]);
  if (!from || !to) return null;
  if (from === to) return { from, to, date: "", rate: 1, fetchedAt: 0, old: false };
  return result?.key === key ? result.quote : undefined;
}

export interface MoneyView {
  /** The currency amounts are shown in: the person's own, or the trip's while no rate is available. */
  currency: string;
  /** Amounts are converted at today's rate (shown with ≈). */
  approx: boolean;
  /** Today's rate from the counting currency, when converting. */
  quote: RateQuote | null;
  /** A counting-currency amount in the person's currency (minor units). */
  convert(baseMinor: number): number;
  /** The same, as text: "≈ $23.75" or "₹2,000". */
  show(baseMinor: number): string;
}

/**
 * How to show the trip's money to this person: in their home currency at today's rate (display only, stored amounts
 * never change), or in the trip's counting currency when they chose not to convert or no rate is available yet.
 */
export function useMoneyView(base: string | null, home: string | null): MoneyView {
  const target = home && base && home !== base ? home : null;
  const quote = useRate(base, target);
  const converting = !!(target && base && quote);
  const currency = converting ? (target as string) : (base ?? home ?? "INR");
  const convert = (minor: number) => (converting ? convertMinor(minor, (quote as RateQuote).rate, base as string, currency) : minor);
  return {
    currency,
    approx: converting,
    quote: converting ? (quote as RateQuote) : null,
    convert,
    show: (minor) => `${converting ? "≈ " : ""}${formatMoneyShort(convert(minor), currency)}`,
  };
}
