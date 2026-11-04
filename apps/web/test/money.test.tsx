import type { ExpenseRecord, TripSnapshot } from "@hoppin/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { listMoney } from "../src/offline/money-outbox";
import { fakeServices, renderApp, snapshot } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("hoppin.homeCurrency", "INR");
  setOnline(true);
});
afterEach(() => vi.restoreAllMocks());

const expense = (over: Partial<ExpenseRecord> & Pick<ExpenseRecord, "id" | "title" | "paidBy" | "amount" | "split" | "createdBy">): ExpenseRecord => ({
  tripId: "t1",
  kind: "expense",
  category: "food",
  currency: "INR",
  rate: 1,
  rateDate: "2026-12-01",
  baseCurrency: "INR",
  spentOn: "2026-12-01",
  version: 1,
  ...over,
});

/**
 * Goa, counted in rupees. Aman ("me") paid ₹900 for dinner for three; Riya paid $30 (stored rate ₹84) for a boat ride
 * shared with Aman and her guest Mia. Aman owes Riya ₹240; Mia owes Riya ₹840; Neha owes Riya ₹300.
 */
function moneySnapshot(over: Partial<TripSnapshot> = {}): TripSnapshot {
  const dinner = expense({ id: "e1", title: "Dinner", paidBy: "me", amount: 90000, createdBy: "me", split: [{ who: "me" }, { who: "org" }, { who: "riya" }] });
  const boat = expense({ id: "e2", title: "Boat ride", category: "activity", paidBy: "riya", amount: 3000, currency: "USD", rate: 84, createdBy: "riya", split: [{ who: "me" }, { who: "riya" }, { who: "mia" }] });
  return snapshot({
    trip: { id: "t1", name: "Goa", startDate: "2026-12-01", endDate: "2026-12-05", baseCurrency: "INR" },
    guests: [{ id: "mia", tripId: "t1", name: "Mia", addedBy: "riya" }],
    expenses: [dinner, boat],
    expenseHistory: [
      { expenseId: "e2", actorId: "riya", op: "insert", at: "2026-12-01T10:00:00.000Z", before: null, after: { ...boat, amount: 2500 } },
      { expenseId: "e2", actorId: "riya", op: "update", at: "2026-12-01T11:00:00.000Z", before: { ...boat, amount: 2500 }, after: boat },
    ],
    ...over,
  });
}

const as = (userId: string, snap = moneySnapshot()) => fakeServices({ session: { user: { id: userId } }, snapshot: snap });

describe("the Money screen", () => {
  it("shows what you owe in your currency, your own payments first, and everyone else's folded away", async () => {
    renderApp("/trips/t1/money", as("me").services);
    const hero = await screen.findByRole("region", { name: "Your balance" });
    expect(within(hero).getByText("You owe")).toBeInTheDocument();
    expect(within(hero).getByText("₹240")).toBeInTheDocument();

    const settle = screen.getByRole("region", { name: "Settle up" });
    expect(within(settle).getAllByRole("listitem")[0]).toHaveTextContent("You pay Riya₹240");
    const fold = within(settle).getByRole("button", { name: /Everyone else \(2\)/ });
    expect(fold).toHaveAttribute("aria-expanded", "false");
    expect(within(settle).queryByText(/Mia/)).toBeNull();
    await userEvent.click(fold);
    expect(within(settle).getByText("Mia").closest("li")).toHaveTextContent("Mia pays Riya₹840");
    expect(within(settle).getByText("Mia is Riya's guest.")).toBeInTheDocument();
  });

  it("Mark as paid shows only to the person getting the money, and records the payment", async () => {
    const first = renderApp("/trips/t1/money", as("me").services);
    await screen.findByRole("region", { name: "Settle up" });
    expect(screen.queryByRole("button", { name: "Mark as paid" })).toBeNull();
    first.unmount();

    const riya = as("riya");
    renderApp("/trips/t1/money", riya.services);
    const settle = await screen.findByRole("region", { name: "Settle up" });
    const buttons = within(settle).getAllByRole("button", { name: "Mark as paid" });
    expect(buttons).toHaveLength(3); // Mia, Neha and Aman all pay Riya
    await userEvent.click(within(within(settle).getByText("Aman").closest("li")!).getByRole("button", { name: "Mark as paid" }));
    const dialog = await screen.findByRole("dialog", { name: "Mark as paid" });
    expect(within(dialog).getByText("₹240")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Yes, mark as paid" }));

    await waitFor(() => expect(riya.services.actions.saveExpense).toHaveBeenCalled());
    const [sent] = vi.mocked(riya.services.actions.saveExpense).mock.calls[0]!;
    expect(sent).toMatchObject({ kind: "payment", paidBy: "me", amount: 24000, currency: "INR", rate: 1, split: [{ who: "riya" }], createdBy: "riya" });
    expect(await screen.findByText(/Marked as paid: Aman → you/)).toBeInTheDocument();
  });

  it("only the person who added a bill can edit it; others are told who can", async () => {
    renderApp("/trips/t1/money", as("me").services);
    await screen.findByRole("region", { name: "Expenses" });
    expect(screen.getByRole("button", { name: "Edit Dinner" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Boat ride" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "How Boat ride was worked out" }));
    const info = await screen.findByRole("dialog", { name: "Boat ride" });
    expect(within(info).getByText("1 USD = ₹84")).toBeInTheDocument();
    expect(within(info).getByText(/Only/)).toHaveTextContent("Only Riya can change this bill.");
    expect(within(info).getByText("Changed the amount: $25 → $30")).toBeInTheDocument();
    expect(within(info).queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("tapping a bill flips it to what was actually paid, and one switch flips them all", async () => {
    localStorage.setItem("hoppin.homeCurrency", "INR");
    renderApp("/trips/t1/money", as("me").services);
    const list = await screen.findByRole("region", { name: "Expenses" });
    const boat = within(list).getByText("Boat ride").closest("li")!;
    expect(boat).toHaveTextContent("₹2,520");
    expect(boat).toHaveTextContent("Paid in USD");
    await userEvent.click(within(boat).getByRole("button", { pressed: false }));
    expect(within(list).getByText("Boat ride").closest("li")).toHaveTextContent("$30");

    await userEvent.click(within(list).getByRole("switch", { name: "Show original amounts" }));
    expect(within(list).getByRole("switch", { name: "Show original amounts" })).toHaveAttribute("aria-checked", "true");
    expect(within(list).getByText("Boat ride").closest("li")).toHaveTextContent("$30");
    expect(within(list).getByText("Boat ride").closest("li")).toHaveTextContent("Your share $10");
  });

  it("the stored rate does not change when the display currency changes", async () => {
    const { services } = as("me");
    renderApp("/trips/t1/money", services);
    const hero = await screen.findByRole("region", { name: "Your balance" });
    await waitFor(async () => expect((await services.db.trips.get("t1"))?.snapshot.expenses?.[1]?.rate).toBe(84));

    await userEvent.click(within(hero).getByRole("button", { name: "Amounts shown in Indian Rupee. Change" }));
    const picker = await screen.findByRole("dialog", { name: "Show amounts in" });
    await userEvent.click(within(picker).getByRole("button", { name: /US Dollar/ }));

    // The fake rate service says 1 INR = 2 USD, so ₹240 shows as ≈ $480. Display only.
    expect(await within(hero).findByText("≈ $480")).toBeInTheDocument();
    const stored = (await services.db.trips.get("t1"))?.snapshot.expenses ?? [];
    expect(stored.map((e) => [e.id, e.rate, e.amount, e.currency])).toEqual([
      ["e1", 1, 90000, "INR"],
      ["e2", 84, 3000, "USD"],
    ]);
    expect(services.actions.saveExpense).not.toHaveBeenCalled();
    expect(await listMoney(services.db, "t1")).toEqual([]);
  });
});

describe("adding an expense", () => {
  it("in another currency, split with some people: the rate is captured and it is sent", async () => {
    const { services } = as("me");
    renderApp("/trips/t1/money", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });

    await userEvent.click(within(dialog).getByRole("button", { name: "Currency: Indian Rupee. Change" }));
    const picker = await screen.findByRole("dialog", { name: "Currency on the bill" });
    await userEvent.type(within(picker).getByRole("searchbox"), "rupiah");
    await userEvent.click(within(picker).getByRole("button", { name: /Indonesian Rupiah/ }));

    await userEvent.type(within(dialog).getByLabelText("How much?"), "300000");
    // The fake rate service says 1 IDR = 2 INR.
    expect(await within(dialog).findByText(/≈ ₹6(,00,000|00,000)/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("What for?"), "Coconut coffee");
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Neha" }));
    expect(within(dialog).getByText(/each · 2 people/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(services.actions.saveExpense).toHaveBeenCalled());
    const [sent, guestIds] = vi.mocked(services.actions.saveExpense).mock.calls[0]!;
    expect(sent).toMatchObject({
      kind: "expense",
      title: "Coconut coffee",
      category: "food",
      paidBy: "me",
      amount: 30000000,
      currency: "IDR",
      rate: 2,
      baseCurrency: "INR",
      split: [{ who: "me" }, { who: "riya" }],
      createdBy: "me",
    });
    expect([...guestIds]).toEqual(["mia"]);
    expect(await screen.findByText(/Added "Coconut coffee"/)).toBeInTheDocument();
  });

  it("exact amounts start from the equal split and must add up before saving", async () => {
    const { services } = as("me");
    renderApp("/trips/t1/money", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    await userEvent.type(within(dialog).getByLabelText("How much?"), "900");
    await userEvent.type(within(dialog).getByLabelText("What for?"), "Taxi");
    await userEvent.click(within(dialog).getByRole("radio", { name: "Exact amounts" }));

    const mine = within(dialog).getByRole("textbox", { name: "You's part in INR" });
    expect(mine).toHaveValue("300");
    await userEvent.clear(mine);
    await userEvent.type(mine, "100");
    expect(within(dialog).getByText("₹200 left to share out")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
    expect(within(dialog).getByText("Share out ₹200 more so it adds up.")).toBeInTheDocument();
    expect(services.actions.saveExpense).not.toHaveBeenCalled();
  });

  it("says plainly what is missing", async () => {
    renderApp("/trips/t1/money", as("me").services);
    await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));
    expect(within(dialog).getByText("Type how much it cost.")).toBeInTheDocument();
    expect(within(dialog).getByText("What was it for? A word or two is enough.")).toBeInTheDocument();
  });

  it("a guest can be added on the spot and shares the bill", async () => {
    const snap = moneySnapshot();
    const { services } = as("me", snap);
    vi.mocked(services.actions.addGuest).mockImplementation(async (guest) => void snap.guests?.push(guest)); // the fake server keeps it
    renderApp("/trips/t1/money", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Add guest" }));
    await userEvent.type(within(dialog).getByLabelText("Guest's name"), "Kadek{Enter}");
    expect(await within(dialog).findByRole("checkbox", { name: /Kadek/ })).toBeChecked();
    await userEvent.type(within(dialog).getByLabelText("How much?"), "400");
    await userEvent.type(within(dialog).getByLabelText("What for?"), "Surf lesson");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));

    await waitFor(() => expect(services.actions.saveExpense).toHaveBeenCalled());
    expect(services.actions.addGuest).toHaveBeenCalledWith(expect.objectContaining({ name: "Kadek", addedBy: "me", tripId: "t1" }));
    const [sent, guestIds] = vi.mocked(services.actions.saveExpense).mock.calls[0]!;
    const kadek = vi.mocked(services.actions.addGuest).mock.calls[0]![0].id;
    expect(sent.split.map((s) => s.who)).toEqual(["org", "me", "riya", kadek]);
    expect(guestIds.has(kadek)).toBe(true);
  });

  it("works with no signal: it shows at once as waiting, and is sent when the connection returns", async () => {
    const { services } = as("me");
    const first = renderApp("/trips/t1/money", services);
    await screen.findByRole("region", { name: "Expenses" });
    await waitFor(async () => expect(await services.db.trips.get("t1")).toBeDefined());
    first.unmount();

    setOnline(false);
    renderApp("/trips/t1/money", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add expense" }));
    const dialog = await screen.findByRole("dialog", { name: "Add expense" });
    expect(within(dialog).getByText(/You're offline/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("How much?"), "600");
    await userEvent.type(within(dialog).getByLabelText("What for?"), "Snacks");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add expense" }));

    const row = (await screen.findByText("Snacks")).closest("li")!;
    expect(row).toHaveTextContent("Waiting to send");
    expect(services.actions.saveExpense).not.toHaveBeenCalled();

    setOnline(true);
    act(() => window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(services.actions.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ title: "Snacks", amount: 60000 }), expect.any(Set)));
    await waitFor(async () => expect(await listMoney(services.db, "t1")).toEqual([]));
  });
});

describe("editing and deleting", () => {
  it("the person who added a bill can change it, and can delete it with an undo", async () => {
    const { services } = as("me");
    renderApp("/trips/t1/money", services);
    await userEvent.click(await screen.findByRole("button", { name: "Edit Dinner" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit expense" });
    const amount = within(dialog).getByLabelText("How much?");
    expect(amount).toHaveValue("900");
    await userEvent.clear(amount);
    await userEvent.type(amount, "1200");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(services.actions.saveExpense).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", amount: 120000, rate: 1, version: 1 }), expect.any(Set)));

    await userEvent.click(await screen.findByRole("button", { name: "Edit Dinner" }));
    const again = await screen.findByRole("dialog", { name: "Edit expense" });
    await userEvent.click(within(again).getByRole("button", { name: "Delete expense" }));
    await userEvent.click(within(again).getByRole("button", { name: "Delete it" }));
    await waitFor(() => expect(services.actions.deleteExpense).toHaveBeenCalledWith("e1"));
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
  });

  it("a change the server refuses is kept with the reason, to try again or discard", async () => {
    const { services } = as("me");
    vi.mocked(services.actions.saveExpense).mockRejectedValueOnce(new Error("only the person who added this can change it"));
    renderApp("/trips/t1/money", services);
    await userEvent.click(await screen.findByRole("button", { name: "Edit Dinner" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit expense" });
    await userEvent.clear(within(dialog).getByLabelText("What for?"));
    await userEvent.type(within(dialog).getByLabelText("What for?"), "Late dinner");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    const alert = await screen.findByText(/Couldn't save "Late dinner": only the person who added this can change it/);
    await userEvent.click(within(alert.closest("[role=alert]") as HTMLElement).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(screen.queryByText(/Couldn't save/)).toBeNull());
    expect(await listMoney(services.db, "t1")).toEqual([]);
  });
});

describe("accessibility", () => {
  it("the screen and the add-expense sheet have no detectable problems", async () => {
    const { container } = renderApp("/trips/t1/money", as("me").services);
    await screen.findByRole("region", { name: "Expenses" });
    const rules = { rules: { "color-contrast": { enabled: false } } };
    expect(await axe(container, rules)).toHaveNoViolations();
    await userEvent.click(screen.getByRole("button", { name: "Add expense" }));
    expect(await axe(await screen.findByRole("dialog", { name: "Add expense" }), rules)).toHaveNoViolations();
  });
});
