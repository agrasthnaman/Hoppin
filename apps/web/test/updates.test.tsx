import type { NotifiedChange, TripNotification } from "@hoppin/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fakeServices, NOW, renderApp } from "./helpers";

const change = (over: Partial<NotifiedChange> = {}): NotifiedChange => ({
  itemId: "i1",
  op: "changed",
  title: "Sea view hotel",
  kind: "stay",
  tz: "Asia/Kolkata",
  startsAt: "2026-12-01T09:30:00.000Z",
  fields: [{ field: "title", before: "Beach hotel", after: "Sea view hotel" }],
  by: ["org"],
  at: new Date(NOW - 12 * 60_000).toISOString(),
  byNames: ["Aman"],
  ...over,
});
const digest = (over: Partial<TripNotification> = {}): TripNotification => ({
  id: "n1",
  createdAt: new Date(NOW - 10 * 60_000).toISOString(),
  readAt: null,
  changes: [change(), change({ itemId: "i2", op: "removed", title: "Kayak", kind: "activity", fields: [] })],
  ...over,
});

describe("updates", () => {
  it("sits opposite the trip name, above when it was synced, and says when there is something new", async () => {
    const { services } = fakeServices({ updates: [digest()] });
    renderApp("/trips/t1/days", services);
    const button = await screen.findByRole("button", { name: "Updates" });
    const header = button.closest("header");
    expect(header).not.toBeNull();
    expect(await within(header as HTMLElement).findByText("Goa")).toBeInTheDocument();
    expect(within(header as HTMLElement).getByText(/Synced/)).toBeInTheDocument();
    await waitFor(() => expect(button).toHaveAccessibleDescription("You have new updates"));
  });

  it("opens a panel from the left over the current page, and closing it returns there", async () => {
    const { services } = fakeServices({ updates: [digest()] });
    const { router } = renderApp("/trips/t1/days", services);
    expect(await screen.findByRole("link", { name: "Days" })).toHaveAttribute("aria-current", "page");
    await userEvent.click(screen.getByRole("button", { name: "Updates" }));
    const panel = await screen.findByRole("dialog", { name: "Updates" });
    expect(panel).toHaveAttribute("data-side", "left");
    expect(screen.queryByRole("link", { name: "Back to More" })).toBeNull();
    expect(router.state.location.pathname).toBe("/trips/t1/days");
    expect(screen.getByRole("link", { name: "Days", hidden: true })).toHaveAttribute("aria-current", "page");
    expect(await within(panel).findByText("Sea view hotel was changed")).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Updates" })).toBeNull());
    expect(router.state.location.pathname).toBe("/trips/t1/days");
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("aria-current", "page");
  });

  it("closes when a plan in the panel is opened", async () => {
    const { services } = fakeServices({ updates: [digest()] });
    const { router } = renderApp("/trips/t1/days", services);
    await userEvent.click(await screen.findByRole("button", { name: "Updates" }));
    const panel = await screen.findByRole("dialog", { name: "Updates" });
    await userEvent.click(await within(panel).findByRole("link", { name: "Open Sea view hotel" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Updates" })).toBeNull());
    expect(router.state.location.pathname).toBe("/trips/t1/items/i1");
  });

  it("is not listed inside More", async () => {
    const { services } = fakeServices({ updates: [digest()] });
    renderApp("/trips/t1/more", services);
    expect(await screen.findByRole("heading", { name: "More" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).queryByRole("link", { name: "Updates" })).toBeNull();
  });

  it("explains an empty list", async () => {
    const { services } = fakeServices({ updates: [] });
    renderApp("/trips/t1/updates", services);
    expect(await screen.findByText("No updates yet")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to More" })).toBeNull();
    expect(screen.getByRole("link", { name: "Days", hidden: true })).toHaveAttribute("aria-current", "page");
    expect(services.actions.markUpdatesRead).not.toHaveBeenCalled();
  });

  it("shows what changed, who changed it and when, then marks it as read", async () => {
    const { services } = fakeServices({ updates: [digest()] });
    renderApp("/trips/t1/updates", services);
    const group = await screen.findByRole("article", { name: /10 min ago/ });
    expect(within(group).getByText("New")).toBeInTheDocument();
    expect(within(group).getByText("Sea view hotel was changed")).toBeInTheDocument();
    expect(within(group).getByText("Name: Beach hotel → Sea view hotel")).toBeInTheDocument();
    expect(within(group).getAllByText("by Aman")).toHaveLength(2);
    expect(within(group).getByRole("link", { name: "Open Sea view hotel" })).toHaveAttribute("href", "/trips/t1/items/i1");
    expect(within(group).queryByRole("link", { name: /Kayak/ })).toBeNull(); // removed: nothing to open
    await waitFor(() => expect(services.actions.markUpdatesRead).toHaveBeenCalledWith("t1"));
  });

  it("read digests are not marked again", async () => {
    const { services } = fakeServices({ updates: [digest({ readAt: new Date(NOW).toISOString() })] });
    renderApp("/trips/t1/updates", services);
    const group = await screen.findByRole("article", { name: /10 min ago/ });
    expect(within(group).queryByText("New")).toBeNull();
    expect(services.actions.markUpdatesRead).not.toHaveBeenCalled();
  });

  it("the email switch saves the choice, and puts it back if saving fails", async () => {
    const { services } = fakeServices({ updates: [] });
    renderApp("/trips/t1/updates", services);
    const email = await screen.findByRole("switch", { name: "Email me updates" });
    expect(email).toBeChecked();
    await userEvent.click(email);
    expect(services.actions.setEmailUpdates).toHaveBeenCalledWith("t1", false);
    await waitFor(() => expect(email).not.toBeChecked());

    services.actions.setEmailUpdates.mockRejectedValueOnce(new Error("offline"));
    await userEvent.click(email);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save. Check your connection and try again.");
    expect(email).not.toBeChecked();
  });

  it("says so when the list cannot be loaded, and can try again", async () => {
    const { services } = fakeServices({ updates: [digest()] });
    services.actions.listUpdates.mockRejectedValueOnce(new Error("down"));
    renderApp("/trips/t1/updates", services);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load updates.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Sea view hotel was changed")).toBeInTheDocument();
  });
});
