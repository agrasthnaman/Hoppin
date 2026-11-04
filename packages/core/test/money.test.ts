import { describe, expect, it } from "vitest";
import { convertMinor, isCurrencyCode, minorDigits } from "../src/money";

describe("minorDigits", () => {
  it("knows how many decimal places each currency has (ISO 4217)", () => {
    expect(minorDigits("INR")).toBe(2);
    expect(minorDigits("USD")).toBe(2);
    expect(minorDigits("JPY")).toBe(0);
    expect(minorDigits("KRW")).toBe(0);
    expect(minorDigits("ISK")).toBe(0);
    expect(minorDigits("KWD")).toBe(3);
    expect(minorDigits("BHD")).toBe(3);
  });

  it("assumes 2 for a currency that is not in the exceptions list", () => {
    expect(minorDigits("THB")).toBe(2);
  });
});

describe("isCurrencyCode", () => {
  it("accepts three capital letters only", () => {
    expect(isCurrencyCode("EUR")).toBe(true);
    expect(isCurrencyCode("eur")).toBe(false);
    expect(isCurrencyCode("EURO")).toBe(false);
    expect(isCurrencyCode("E1R")).toBe(false);
    expect(isCurrencyCode("")).toBe(false);
  });
});

describe("convertMinor", () => {
  it("leaves an amount alone when the currencies are the same", () => {
    expect(convertMinor(12345, 7, "INR", "INR")).toBe(12345);
  });

  it("converts minor units between two-decimal currencies", () => {
    // $100.00 at 94.75 = ₹9,475.00
    expect(convertMinor(10000, 94.75, "USD", "INR")).toBe(947500);
  });

  it("accounts for currencies with a different number of decimals", () => {
    // ¥1,000 at 0.60383 = ₹603.83
    expect(convertMinor(1000, 0.60383, "JPY", "INR")).toBe(60383);
    // ₹603.83 at 1.6561 = ¥1,000 (rounded to whole yen)
    expect(convertMinor(60383, 1.6561, "INR", "JPY")).toBe(1000);
    // 1.000 KWD at 3.25 = $3.25
    expect(convertMinor(1000, 3.25, "KWD", "USD")).toBe(325);
  });

  it("rounds half up without being thrown off by floating-point noise", () => {
    // 1.005 * 100 is 100.49999999999999 in floating point; a person expects 101 cents.
    expect(convertMinor(100, 1.005, "USD", "EUR")).toBe(101);
    expect(convertMinor(1, 0.5, "USD", "EUR")).toBe(1);
    expect(convertMinor(1, 0.49, "USD", "EUR")).toBe(0);
  });
});
