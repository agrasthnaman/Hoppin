// ISO 4217 currencies whose minor unit is not 2 decimal places. A fixed table, not `Intl`, because amounts are stored
// in minor units and every device (and the future native app) must agree on what "1234" means.
const MINOR_DIGITS: Record<string, number> = {
  BIF: 0, CLP: 0, DJF: 0, GNF: 0, ISK: 0, JPY: 0, KMF: 0, KRW: 0, PYG: 0, RWF: 0, UGX: 0, UYI: 0, VND: 0, VUV: 0,
  XAF: 0, XOF: 0, XPF: 0,
  BHD: 3, IQD: 3, JOD: 3, KWD: 3, LYD: 3, OMR: 3, TND: 3,
  CLF: 4, UYW: 4,
};

/** A three-letter ISO 4217 code in capitals, such as `INR`. */
export function isCurrencyCode(code: string): boolean {
  return /^[A-Z]{3}$/.test(code);
}

/** How many decimal places a currency's minor unit has: 2 for INR (paise), 0 for JPY, 3 for KWD (fils). */
export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency] ?? 2;
}

/** Rounds half away from zero, after removing floating-point noise (so 100.49999999999999 counts as 100.5). */
function roundMinor(value: number): number {
  const clean = Number(value.toPrecision(15));
  return Math.sign(clean) * Math.round(Math.abs(clean)) || 0;
}

/**
 * Converts an amount in minor units of `from` into minor units of `to`. `rate` is what one whole unit of `from` is
 * worth in `to` (how exchange rates are quoted: 1 USD = 94.75 INR).
 */
export function convertMinor(amount: number, rate: number, from: string, to: string): number {
  if (from === to) return amount;
  const shift = minorDigits(to) - minorDigits(from);
  const scaled = shift >= 0 ? amount * rate * 10 ** shift : (amount * rate) / 10 ** -shift;
  return roundMinor(scaled);
}
