import type { ConflictNotice, OutboxRecord } from "@hoppin/core";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NoticeList } from "../src/components/NoticeList";
import { listOutbox } from "../src/offline/outbox";
import { fakeServices, renderApp } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
const goOnline = () => {
  setOnline(true);
  act(() => window.dispatchEvent(new Event("online")));
};
beforeEach(() => setOnline(true));
afterEach(() => vi.restoreAllMocks());

const notice = (over: Partial<ConflictNotice> = {}): ConflictNotice => ({
  id: "n1", tripId: "t1", itemId: "i1", itemTitle: "Old town tour", field: "title", kind: "lost", mine: "Mine", theirs: "Theirs", at: 1, ...over,
});

describe("NoticeList", () => {
  it("shows each notice in plain words with a way to dismiss it", async () => {
    const onDismiss = vi.fn();
    render(<NoticeList notices={[notice(), notice({ id: "n2", kind: "deleted", itemTitle: "Lunch" })]} onDismiss={onDismiss} />);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByText(/Someone else changed the title of "Old town tour" after you/)).toBeInTheDocument();
    expect(screen.getByText(/"Lunch" was deleted while you were offline/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole("button", { name: "Dismiss" })[1]!);
    expect(onDismiss).toHaveBeenCalledWith("n2");
  });

  it("shows nothing when there are no notices", () => {
    const { container } = render(<NoticeList notices={[]} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

/** Loads the trip online once so it is stored on the device, then closes the app. */
async function loadOnce(path = "/trips/t1/days?date=2026-12-02") {
  const fake = fakeServices();
  const first = renderApp(path, fake.services);
  await screen.findByRole("region", { name: "Old town tour" });
  await waitFor(() => expect(fake.services.documentSource.download).toHaveBeenCalled());
  first.unmount();
  return fake;
}

describe("working with no signal", () => {
  it("a plan added offline appears at once, is shown as waiting, and is sent when the connection returns", async () => {
    const { services } = await loadOnce();
    setOnline(false);
    renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a plan" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "Beach dinner");
    await userEvent.clear(within(dialog).getByLabelText("Starts"));
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2026-12-02T19:30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("region", { name: "Beach dinner" })).toBeInTheDocument();
    expect(await screen.findByText("1 change waiting to send.")).toBeInTheDocument();
    expect(services.actions.createItem).not.toHaveBeenCalled();

    goOnline();
    await waitFor(() => expect(services.actions.createItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText("1 change waiting to send.")).toBeNull());
    expect(await listOutbox(services.db, "t1")).toEqual([]);
  });

  it("an edit made offline shows at once on the item and is sent later", async () => {
    const { services } = await loadOnce();
    setOnline(false);
    renderApp("/trips/t1/items/i1", services);
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "Old town tour (moved)");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("heading", { name: "Old town tour (moved)" })).toBeInTheDocument();
    expect(await screen.findByText("1 change waiting to send.")).toBeInTheDocument();
    expect(services.actions.updateItem).not.toHaveBeenCalled();

    goOnline();
    await waitFor(() => expect(services.actions.updateItem).toHaveBeenCalledTimes(1));
    expect((services.actions.updateItem.mock.calls[0] as unknown[])[1]).toMatchObject({ title: "Old town tour (moved)" });
  });

  it("'I'm in' offline is remembered and sent later", async () => {
    const { services } = await loadOnce();
    setOnline(false);
    renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("button", { name: "Open Museum" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Museum" })).getByRole("button", { name: "I'm in" }));
    expect(await screen.findByText("1 change waiting to send.")).toBeInTheDocument();
    goOnline();
    await waitFor(() => expect(services.actions.setRsvp).toHaveBeenCalledWith("i2", "me", true));
  });
});

describe("conflict notices and drafts", () => {
  const draft: OutboxRecord = { kind: "update", id: "d1", tripId: "t1", itemId: "i1", itemTitle: "Old town tour", field: "title", value: "My title", baseValue: "Old town tour", baseVersion: 1, at: 5 };

  it("shows notices on every screen until dismissed", async () => {
    const { services } = await loadOnce();
    await services.db.notices.put(notice());
    renderApp("/trips/t1/days?date=2026-12-02", services);
    expect(await screen.findByText(/Someone else changed the title of "Old town tour" after you/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByText(/Someone else changed the title/)).toBeNull());
    expect(await services.db.notices.count()).toBe(0);
  });

  it("lists unsent changes on the More screen, where they can be applied or discarded", async () => {
    const { services } = await loadOnce();
    await services.db.drafts.put(draft);
    setOnline(false);
    renderApp("/trips/t1/more", services);
    expect(await screen.findByText(/title of "Old town tour"/)).toBeInTheDocument();
    expect(screen.getByText(/My title/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Apply my version" }));
    await waitFor(async () => expect(await services.db.drafts.count()).toBe(0));
    expect(await listOutbox(services.db, "t1")).toHaveLength(1);
  });

  it("discarding an unsent change removes it", async () => {
    const { services } = await loadOnce();
    await services.db.drafts.put(draft);
    renderApp("/trips/t1/more", services);
    await userEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(async () => expect(await services.db.drafts.count()).toBe(0));
    expect(await screen.findByText("No unsent changes.")).toBeInTheDocument();
  });
});
