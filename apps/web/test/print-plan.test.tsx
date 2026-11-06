import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { fakeServices, item, renderApp, snapshot } from "./helpers";

const at = (hhmm: string, day: string) => new Date(`2026-12-${day}T${hhmm}:00+05:30`).toISOString();
const trip = snapshot({
  items: [
    item({ id: "hotel", kind: "stay", title: "Beach hotel", startsAt: at("14:00", "01"), endsAt: at("11:00", "04") }),
    item({ id: "tour", title: "Old town tour", startsAt: at("10:00", "02"), endsAt: at("12:00", "02"), locationUrl: "https://maps.example/tour", details: { notes: "Ref ZX9" } }),
    item({ id: "museum", title: "Museum", startsAt: at("09:00", "02"), groupItem: false, ownerId: "riya" }),
    item({ id: "mine", title: "Visit ABC place", startsAt: at("15:00", "02"), visibility: "private" }),
    item({ id: "theirs", title: "Riya's surprise", startsAt: at("16:00", "02"), visibility: "private", ownerId: "riya" }),
  ],
  rsvps: [{ itemId: "museum", userId: "me" }],
});
const open = async (query = "") => {
  const { services } = fakeServices({ snapshot: trip });
  const utils = renderApp(`/trips/t1/print${query}`, services);
  await screen.findByRole("heading", { level: 1, name: "Goa" });
  return utils;
};
const day = (name: RegExp) => screen.getByRole("region", { name });
const picker = () => screen.getByRole("button", { name: /^Show times in/ });

describe("printable plan", () => {
  it("has no app navigation, only Back and Print", async () => {
    await open();
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/trips/t1/export");
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await userEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledOnce();
  });

  it("lists each day in order with the stay pinned first and plans in time order", async () => {
    await open();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Day 1 · Tue 1 Dec 2026",
      "Day 2 · Wed 2 Dec 2026",
      "Day 3 · Thu 3 Dec 2026",
      "Day 4 · Fri 4 Dec 2026",
      "Day 5 · Sat 5 Dec 2026",
    ]);
    const second = day(/Day 2/);
    expect(within(second).getByText("Staying: Beach hotel, night 2 of 3")).toBeInTheDocument();
    const titles = within(second).getAllByRole("listitem").map((li) => li.textContent);
    expect(titles[0]).toMatch(/^09:00Museum/);
    expect(titles[1]).toMatch(/^10:00 – 12:00Old town tour/);
    expect(titles[2]).toMatch(/Visit ABC place/);
  });

  it("prints map links as plain text and never shows other people's private plans", async () => {
    await open();
    expect(screen.getByText("https://maps.example/tour").tagName).toBe("SPAN");
    expect(screen.queryByText("Riya's surprise")).toBeNull();
  });

  it("shows notes only when asked", async () => {
    await open("?notes=0&optional=1");
    expect(screen.queryByText("Ref ZX9")).toBeNull();
  });

  it("shows notes when asked, and leaves optional plans out when asked", async () => {
    await open("?notes=1&optional=0");
    expect(screen.getByText("Ref ZX9")).toBeInTheDocument();
    expect(screen.queryByText("Museum")).toBeNull();
  });

  it("has the header with travellers' first names", async () => {
    await open();
    expect(screen.getByText("Travellers: Neha, Aman, Riya")).toBeInTheDocument();
    expect(screen.getByText(/^Printed /)).toBeInTheDocument();
  });

  it("says which time zone the times are in, the trip's own by default", async () => {
    await open();
    expect(screen.getByText(/^Times are in the trip's time zone, Kolkata · GMT\+5:30\./)).toBeInTheDocument();
    expect(picker()).toHaveAccessibleName("Show times in Trip time · Kolkata · GMT+5:30");
    expect(picker()).toHaveAttribute("aria-expanded", "false");
  });

  it("can show every time in another zone, picked from a searchable list, kept in the address", async () => {
    const { router } = await open("?notes=1&optional=1");
    await userEvent.click(picker());
    const list = screen.getByRole("listbox", { name: "Time zones" });
    expect(within(list).getByRole("option", { name: "Trip time · Kolkata · GMT+5:30" })).toHaveAttribute("aria-selected", "true");
    await userEvent.type(screen.getByRole("combobox", { name: "Search time zones" }), "tokyo");
    await userEvent.click(within(list).getByRole("option", { name: "Tokyo · GMT+9" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(router.state.location.search).toBe("?notes=1&optional=1&tz=Asia%2FTokyo");
    expect(await screen.findByText("All times are in Tokyo · GMT+9.")).toBeInTheDocument();
    expect(within(day(/Day 2/)).getAllByRole("listitem")[1]!.textContent).toMatch(/^13:30 – 15:30Old town tour/);

    await userEvent.click(picker());
    await userEvent.click(screen.getByRole("option", { name: "Trip time · Kolkata · GMT+5:30" }));
    expect(router.state.location.search).toBe("?notes=1&optional=1");
  });

  it("works from the keyboard, and Escape closes it without changing anything", async () => {
    const { router } = await open();
    picker().focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard("gmt+9");
    await userEvent.keyboard("{ArrowDown}{ArrowUp}{Enter}");
    expect(router.state.location.search).toMatch(/tz=Asia%2F/);
    expect(picker()).toHaveFocus();

    const before = router.state.location.search;
    await userEvent.click(picker());
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(router.state.location.search).toBe(before);
  });

  it("says when no zone matches the search", async () => {
    await open();
    await userEvent.click(picker());
    await userEvent.type(screen.getByRole("combobox", { name: "Search time zones" }), "atlantis");
    expect(screen.getByText('No time zone matches "atlantis". Try a city, like Tokyo.')).toBeInTheDocument();
  });

  it("has no accessibility problems", async () => {
    const { container } = await open();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
    await userEvent.click(picker());
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
