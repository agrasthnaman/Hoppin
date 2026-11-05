import { act, render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { ServicesProvider, type Services } from "../src/app/services";
import { guessHomeCurrency, useHomeCurrency } from "../src/app/home-currency";
import { HomeCurrencyCard } from "../src/components/HomeCurrencyCard";
import { formatMoney } from "../src/lib/money";
import { RatesUnavailableError, type RateQuote } from "../src/providers/rates";
import { fakeServices } from "./helpers";

const languages = vi.spyOn(navigator, "languages", "get");
beforeEach(() => {
  localStorage.clear();
  languages.mockReturnValue(["en-IN", "en"]);
});
afterEach(() => languages.mockReset());

describe("guessHomeCurrency", () => {
  it("uses the region of the phone's language", () => {
    expect(guessHomeCurrency(["en-IN"])).toBe("INR");
    expect(guessHomeCurrency(["de-DE"])).toBe("EUR");
    expect(guessHomeCurrency(["ja"])).toBe("JPY");
  });

  it("skips regions whose currency has no published rates, and gives up politely", () => {
    expect(guessHomeCurrency(["ar-AE", "en-GB"])).toBe("GBP");
    expect(guessHomeCurrency(["ar-AE"])).toBeNull();
    expect(guessHomeCurrency(["not a locale!"])).toBeNull();
  });
});

describe("useHomeCurrency", () => {
  it("starts from the phone's region and remembers a choice on this device", () => {
    const { result } = renderHook(() => useHomeCurrency());
    expect(result.current[0]).toBe("INR");
    act(() => result.current[1]("EUR"));
    expect(result.current[0]).toBe("EUR");
    expect(localStorage.getItem("hoppin.homeCurrency")).toBe("EUR");
  });

  it("can be turned off, and stays off", () => {
    const { result } = renderHook(() => useHomeCurrency());
    act(() => result.current[1](null));
    expect(result.current[0]).toBeNull();
    expect(renderHook(() => useHomeCurrency()).result.current[0]).toBeNull();
  });

  it("updates every screen that shows it at once", () => {
    const a = renderHook(() => useHomeCurrency());
    const b = renderHook(() => useHomeCurrency());
    act(() => a.result.current[1]("USD"));
    expect(b.result.current[0]).toBe("USD");
  });

  it("ignores a stored value it does not know", () => {
    localStorage.setItem("hoppin.homeCurrency", "<script>");
    expect(renderHook(() => useHomeCurrency()).result.current[0]).toBe("INR");
  });
});

describe("formatMoney", () => {
  it("shows minor units as money with the right number of decimals", () => {
    expect(formatMoney(947500, "INR", "en-IN")).toBe("₹9,475.00");
    expect(formatMoney(1000, "JPY", "en-US")).toBe("¥1,000");
    expect(formatMoney(1234, "KWD", "en-US").replace(/\u00a0/g, " ")).toBe("KWD 1.234");
  });
});

describe("HomeCurrencyCard", () => {
  const quote = (over: Partial<RateQuote> = {}): RateQuote => ({ from: "USD", to: "INR", date: "2026-11-03", rate: 94.75, fetchedAt: 0, old: false, ...over });
  function setup(quoteImpl: Services["rates"]["quote"] = async () => quote()) {
    const { services } = fakeServices();
    const rates = { source: "European Central Bank", quote: vi.fn(quoteImpl) };
    const utils = render(
      <ServicesProvider services={{ ...services, rates }}>
        <HomeCurrencyCard />
      </ServicesProvider>,
    );
    return { rates, ...utils };
  }

  it("shows a loader until the rate arrives", async () => {
    setup(() => new Promise(() => {}));
    expect(await screen.findByRole("status", { name: "Checking the rate" })).toBeInTheDocument();
  });

  it("shows the current home currency and today's rate with its source", async () => {
    setup();
    expect(screen.getByRole("button", { name: /Home currency.*Indian Rupee/i })).toBeInTheDocument();
    expect(await screen.findByText(/1 US Dollar ≈ ₹94\.75/)).toBeInTheDocument();
    expect(screen.getByText(/European Central Bank/)).toBeInTheDocument();
  });

  it("picks a new currency in one tap from a searchable list", async () => {
    const { rates } = setup();
    await userEvent.click(screen.getByRole("button", { name: /Home currency/i }));
    const dialog = await screen.findByRole("dialog", { name: "Home currency" });
    await userEvent.type(within(dialog).getByRole("searchbox", { name: /Search/ }), "yen");
    const options = within(within(dialog).getByRole("group", { name: "Currencies" })).getAllByRole("button");
    expect(options.map((o) => o.textContent)).toEqual([expect.stringContaining("Japanese Yen")]);
    await userEvent.click(within(dialog).getByRole("button", { name: /Japanese Yen/ }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("hoppin.homeCurrency")).toBe("JPY");
    expect(screen.getByRole("button", { name: /Home currency.*Japanese Yen/i })).toBeInTheDocument();
    expect(rates.quote).toHaveBeenLastCalledWith("USD", "JPY");
  });

  it("tapping anywhere on a row picks it and closes the list", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Home currency/i }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByText("Euro"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("hoppin.homeCurrency")).toBe("EUR");
  });

  it("marks the current choice and lists it first", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Home currency/i }));
    const group = within(await screen.findByRole("group", { name: "Currencies" }));
    const [off, first] = group.getAllByRole("button");
    expect(off).toHaveAccessibleName(/Don't convert/);
    expect(first).toHaveAccessibleName(/Indian Rupee/);
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(group.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it("works from the keyboard: search, then Enter picks and closes", async () => {
    setup();
    screen.getByRole("button", { name: /Home currency/i }).focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.type(await screen.findByRole("searchbox", { name: /Search/ }), "sgd");
    await userEvent.tab();
    expect(screen.getByRole("button", { name: /Singapore Dollar/ })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(localStorage.getItem("hoppin.homeCurrency")).toBe("SGD");
  });

  it("finds a currency by its code too, and says when nothing matches", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Home currency/i }));
    const search = await screen.findByRole("searchbox", { name: /Search/ });
    await userEvent.type(search, "thb");
    expect(screen.getByRole("button", { name: /Thai Baht/ })).toBeInTheDocument();
    await userEvent.clear(search);
    await userEvent.type(search, "zzz");
    expect(screen.getByText(/No currency matches/)).toBeInTheDocument();
  });

  it("can switch conversion off", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: /Home currency/i }));
    await userEvent.click(await screen.findByRole("button", { name: /Don't convert/ }));
    expect(screen.getByRole("button", { name: /Home currency.*Off/i })).toBeInTheDocument();
    expect(localStorage.getItem("hoppin.homeCurrency")).toBe("off");
  });

  it("is honest when it shows a saved rate", async () => {
    setup(async () => quote({ old: true, date: "2026-11-01" }));
    expect(await screen.findByText(/Saved rate from 1 Nov/)).toBeInTheDocument();
  });

  it("says when there is no rate yet instead of showing a wrong one", async () => {
    setup(async () => Promise.reject(new RatesUnavailableError("offline")));
    expect(await screen.findByText(/Rates show up when you're online/)).toBeInTheDocument();
  });

  it("has no accessibility problems, open or closed", async () => {
    const { container } = setup();
    await screen.findByText(/1 US Dollar/);
    expect(await axe(container)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: /Home currency/i }));
    expect(await axe(await screen.findByRole("dialog"))).toHaveNoViolations();
  });
});
