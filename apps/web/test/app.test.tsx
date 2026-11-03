import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalTrip } from "../src/offline/sync";
import { fakeServices, renderApp, snapshot } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
beforeEach(() => setOnline(true));
afterEach(() => vi.restoreAllMocks());

describe("sign in and gating", () => {
  it("sends signed-out visitors to sign in, remembering where they were going", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/trips/t1/days", services);
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(router.state.location.search).toContain("next=%2Ftrips%2Ft1%2Fdays");
  });

  it("emails a sign-in link that returns to where they were going", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in?next=%2Ftrips%2Ft1%2Fdays", services);
    await userEvent.type(await screen.findByLabelText("Email"), "aman@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(services.auth.signIn).toHaveBeenCalledWith({ email: "aman@example.com", redirectTo: `${window.location.origin}/trips/t1/days` });
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("ignores a 'next' address that points to another site", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in?next=%2F%2Fevil.example", services);
    await userEvent.type(await screen.findByLabelText("Email"), "a@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(services.auth.signIn).toHaveBeenCalledWith({ email: "a@b.co", redirectTo: `${window.location.origin}/` });
  });

  it("explains when the email has no account", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.signIn.mockRejectedValueOnce(new Error("Signups not allowed for otp"));
    renderApp("/sign-in", services);
    await userEvent.type(await screen.findByLabelText("Email"), "new@b.co");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ask the organizer for an invite link");
  });
});

describe("join route", () => {
  it("shows the join form to a signed-out person", async () => {
    const { services } = fakeServices({ session: null });
    renderApp(`/join/${"a1".repeat(32)}`, services);
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
  });

  it("joins once when signed in, and waits for approval", async () => {
    const { services } = fakeServices();
    renderApp(`/join/${"a1".repeat(32)}`, services);
    expect(await screen.findByText(/Waiting for the organizer to approve you/)).toBeInTheDocument();
    expect(services.invites.redeemInvite).toHaveBeenCalledTimes(1);
    expect(services.invites.redeemInvite).toHaveBeenCalledWith("a1".repeat(32));
  });
});

describe("trips home", () => {
  it("lists the person's trips as links", async () => {
    const { services } = fakeServices({ trips: [{ id: "t1", name: "Goa" }, { id: "t2", name: "Manali" }] });
    renderApp("/", services);
    expect(await screen.findByRole("link", { name: /Goa/ })).toHaveAttribute("href", "/trips/t1");
    expect(screen.getByRole("link", { name: /Manali/ })).toBeInTheDocument();
  });

  it("says what to do when there are no trips", async () => {
    const { services } = fakeServices({ trips: [] });
    renderApp("/", services);
    expect(await screen.findByText(/ask the organizer to send you an invite link/)).toBeInTheDocument();
  });
});

describe("trip gate", () => {
  it("loads the trip and shows the first day screen with the trip name", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1", services); // opens on days
    expect(await screen.findByText("Goa")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /December/ })).toBeInTheDocument();
  });

  it("tells a removed person they lost access and wipes the copy", async () => {
    const { services } = fakeServices({ snapshot: "no-access" });
    renderApp("/trips/t1/days", services);
    expect(await screen.findByText("You no longer have access to this trip.")).toBeInTheDocument();
    expect(await getLocalTrip(services.db, "t1")).toBeNull();
  });

  it("says the trip is not on this device when it cannot be loaded", async () => {
    const { services } = fakeServices({ snapshot: new Error("down") });
    renderApp("/trips/t1/days", services);
    expect(await screen.findByText(/isn't on this device yet/)).toBeInTheDocument();
  });

  it("opens from the device copy with no signal", async () => {
    const first = fakeServices();
    const { unmount } = renderApp("/trips/t1/days", first.services);
    await screen.findByText("Old town tour");
    unmount();
    setOnline(false);
    first.fetchSnapshot.mockClear();
    renderApp("/trips/t1/days", first.services);
    expect(await screen.findByText("Old town tour")).toBeInTheDocument();
    expect(await screen.findByText("You're offline. Showing your saved trip.")).toBeInTheDocument();
    expect(first.fetchSnapshot).not.toHaveBeenCalled();
  });
});

describe("days screen", () => {
  it("shows the day: group blocks, members' optional plans as chips, and the viewer's private plan", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/days?date=2026-12-02", services);
    const block = await screen.findByRole("region", { name: "Old town tour" });
    expect(within(block).getByRole("button", { name: "R: Museum" })).toBeInTheDocument();
    expect(screen.getByText("Visit ABC place")).toBeInTheDocument();
    expect(screen.queryByText("Lunch on day three")).toBeNull();
  });

  it("opens on today (in the device's time zone) when it is within the trip", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/days", services);
    expect(await screen.findByRole("heading", { name: /Wednesday 2 December/ })).toBeInTheDocument();
  });

  it("moves between days with the day strip", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("link", { name: "Thursday 3 December" }));
    expect(router.state.location.search).toBe("?date=2026-12-03");
    expect(await screen.findByText("Lunch on day three")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Thursday 3 December" })).toHaveAttribute("aria-current", "date");
    await userEvent.click(screen.getByRole("link", { name: "Wednesday 2 December" }));
    expect(router.state.location.search).toBe("?date=2026-12-02");
  });

  it("a trip without dates still has previous and next day arrows", async () => {
    const { services } = fakeServices({ snapshot: snapshot({ trip: { id: "t1", name: "Someday", startDate: null, endDate: null } }) });
    const { router } = renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("link", { name: "Next day" }));
    expect(router.state.location.search).toBe("?date=2026-12-03");
    await userEvent.click(screen.getByRole("link", { name: "Previous day" }));
    expect(router.state.location.search).toBe("?date=2026-12-02");
  });

  it("'I'm in' saves an RSVP and refreshes", async () => {
    const { services, fetchSnapshot } = fakeServices();
    renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("button", { name: "R: Museum" }));
    const calls = fetchSnapshot.mock.calls.length;
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Museum" })).getByRole("button", { name: "I'm in" }));
    // the change is saved on the device first and sent a moment later
    await waitFor(() => expect(services.actions.setRsvp).toHaveBeenCalledWith("i2", "me", true));
    await waitFor(() => expect(fetchSnapshot.mock.calls.length).toBeGreaterThan(calls));
  });

  it("adds a plan in the device's time zone and refreshes", async () => {
    const { services, fetchSnapshot } = fakeServices();
    renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a plan" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "Beach dinner");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2026-12-02T19:30");
    const calls = fetchSnapshot.mock.calls.length;
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(services.actions.createItem).toHaveBeenCalledWith(
        "t1",
        "me",
        expect.objectContaining({ title: "Beach dinner", startsAt: "2026-12-02T14:00:00.000Z", tz: "Asia/Kolkata" }),
        expect.any(String),
      ),
    );
    await waitFor(() => expect(fetchSnapshot.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("item screen", () => {
  it("shows a booking with its documents and lets the owner edit it", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/items/i1", services);
    expect(await screen.findByRole("heading", { name: "Old town tour" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open d1-ticket.pdf" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    await userEvent.clear(screen.getByLabelText("Title"));
    await userEvent.type(screen.getByLabelText("Title"), "Old town tour (moved)");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(services.actions.updateItem).toHaveBeenCalledWith(expect.objectContaining({ id: "i1", version: 1 }), expect.objectContaining({ title: "Old town tour (moved)" })),
    );
  });

  it("hides edit controls for someone else's item", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/items/i2", services);
    expect(await screen.findByRole("heading", { name: "Museum" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("uploads a document against the item", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/items/i1", services);
    await userEvent.upload(await screen.findByLabelText("Add a document"), new File(["x"], "pass.pdf", { type: "application/pdf" }));
    await waitFor(() =>
      expect(services.actions.uploadDocument).toHaveBeenCalledWith(expect.any(File), { tripId: "t1", ownerId: "me", itemId: "i1", scope: "shared", kind: "document" }),
    );
  });

  it("opens a document from the device when it is stored there, otherwise through a signed link", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    URL.createObjectURL = vi.fn(() => "blob:local");
    const { services } = fakeServices();
    renderApp("/trips/t1/items/i1", services);
    await userEvent.click(await screen.findByRole("button", { name: "Open d1-ticket.pdf" }));
    await waitFor(() => expect(open).toHaveBeenCalledWith("blob:local", "_blank", "noopener"));
    expect(services.actions.documentUrl).not.toHaveBeenCalled();
  });

  it("says when the item is not there any more", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/items/gone", services);
    expect(await screen.findByText(/isn't available/)).toBeInTheDocument();
  });
});

describe("more screen", () => {
  it("shows when the trip last synced and refreshes on request", async () => {
    const { services, fetchSnapshot } = fakeServices();
    renderApp("/trips/t1/more", services);
    await screen.findByRole("button", { name: "Refresh now" });
    await waitFor(() => expect(screen.getAllByText(/^Synced/).length).toBeGreaterThan(0));
    const calls = fetchSnapshot.mock.calls.length;
    await userEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    await waitFor(() => expect(fetchSnapshot.mock.calls.length).toBeGreaterThan(calls));
  });

  it("downloads everything for offline use and says what happened", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/more", services);
    await userEvent.click(await screen.findByRole("button", { name: "Download everything for offline use" }));
    expect(await screen.findByText(/already on this device|Saved \d+ document/)).toBeInTheDocument();
  });

  it("signing out removes the trip from this device and returns to sign in", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/more", services);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(services.auth.signOut).toHaveBeenCalled();
    expect(await getLocalTrip(services.db, "t1")).toBeNull();
  });
});
