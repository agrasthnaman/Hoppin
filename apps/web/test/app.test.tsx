import { AuthError } from "../src/lib/auth-api";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocalTrip } from "../src/offline/sync";
import { fakeServices, item, renderApp, snapshot } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
beforeEach(() => setOnline(true));
afterEach(() => vi.restoreAllMocks());

describe("sign in and gating", () => {
  it("shows the Hoppin landing when nobody is signed in", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/", services);
    expect(await screen.findByRole("heading", { name: "hoppin" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Hoppin" })).toHaveAttribute("href", "/sign-in");
  });

  it("sends signed-out visitors to sign in, remembering where they were going", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/trips/t1/days", services);
    expect(await screen.findByRole("heading", { name: "Hop back in" })).toBeInTheDocument();
    expect(router.state.location.search).toContain("next=%2Ftrips%2Ft1%2Fdays");
  });

  it("signs in with email and password", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in?next=%2Ftrips%2Ft1%2Fdays", services);
    await userEvent.type(await screen.findByLabelText("Email"), "aman@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(services.auth.signIn).toHaveBeenCalledWith({ email: "aman@example.com", password: "a long enough password" });
  });

  it("sends someone who is already signed in on to today", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/sign-in", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips/t1/today"));
    expect(screen.queryByRole("heading", { name: "Hop back in" })).toBeNull();
  });

  it("sends an already signed-in person to the page they were trying to open", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/sign-in?next=%2Faccount", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
  });

  it("ignores a 'next' address that points to another site when creating an account", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in?next=%2F%2Fevil.example", services);
    await userEvent.click(await screen.findByRole("button", { name: "New here? Join the waitlist" }));
    await userEvent.type(screen.getByLabelText("Your name"), "A");
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(services.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ redirectTo: `${window.location.origin}/` }));
  });

  it("says so when the email or password is wrong, without saying which", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.signIn.mockRejectedValueOnce(new AuthError("invalid-credentials", "Invalid login credentials"));
    renderApp("/sign-in", services);
    await userEvent.type(await screen.findByLabelText("Email"), "new@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "whatever password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Wrong email or password");
  });

  it("asks someone with an unconfirmed email to confirm it, and can send a new link", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.signIn.mockRejectedValueOnce(new AuthError("email-not-confirmed", "Email not confirmed"));
    renderApp("/sign-in", services);
    await userEvent.type(await screen.findByLabelText("Email"), "new@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "whatever password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("heading", { name: "You're on the list" })).toBeInTheDocument();
    expect(screen.getByText(/Welcome to the waitlist/)).toBeInTheDocument();
    expect(screen.getByText(/invite is on its way to new@b.co/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Send another invite" }));
    expect(services.auth.resendConfirmation).toHaveBeenCalledWith({ email: "new@b.co", redirectTo: `${window.location.origin}/` });
    expect(await screen.findByText(/old one no longer works/)).toBeInTheDocument();
  });

  it("sends a password reset link that comes back to the reset page", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in", services);
    await userEvent.click(await screen.findByRole("button", { name: "Forgot password?" }));
    await userEvent.type(screen.getByLabelText("Email"), "aman@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));
    expect(services.auth.requestPasswordReset).toHaveBeenCalledWith({ email: "aman@example.com", redirectTo: `${window.location.origin}/reset-password` });
    expect(await screen.findByText(/If aman@example.com has an account/)).toBeInTheDocument();
  });

  it("keeps the email field and the waitlist links on the cream card", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in", services);
    const email = await screen.findByLabelText("Email");
    const forgot = screen.getByRole("button", { name: "Forgot password?" });
    const waitlist = screen.getByRole("button", { name: "New here? Join the waitlist" });
    expect(email.closest(".on-cream")).not.toBeNull();
    expect(forgot.closest(".on-cream")).toBe(email.closest(".on-cream"));
    expect(waitlist.closest(".on-cream")).toBe(email.closest(".on-cream"));
  });
});

describe("join route", () => {
  it("shows the join form to a signed-out person", async () => {
    const { services } = fakeServices({ session: null });
    renderApp(`/join/${"a1".repeat(32)}`, services);
    expect(await screen.findByLabelText("Your name")).toBeInTheDocument();
  });

  it("opens today once the organizer has approved the join", async () => {
    const { services } = fakeServices();
    services.invites.redeemInvite.mockResolvedValue({ tripId: "t1", status: "approved" });
    const { router } = renderApp(`/join/${"ab".repeat(32)}`, services);
    await userEvent.click(await screen.findByRole("button", { name: "Open trip" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips/t1/today"));
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
    expect(await screen.findByRole("heading", { name: "Welcome to Hoppin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a trip" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Join the trip" })).toBeInTheDocument();
  });
});

describe("trip gate", () => {
  it("welcomes a brand new trip on its days page", async () => {
    renderApp("/trips/t1/days", fakeServices({ snapshot: snapshot({ items: [], documents: [] }) }).services);
    expect(await screen.findByRole("heading", { name: "This day is waiting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add plan" })).toBeInTheDocument();
    expect(document.querySelector("[data-silk-anchor]")).not.toBeNull();
  });

  it("loads the trip and opens today while the trip is happening", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1", services);
    expect(await screen.findAllByText("Goa")).toHaveLength(2);
    const today = await screen.findByRole("heading", { name: "Today" });
    expect(today).toHaveClass("page-title");
    expect(today.parentElement?.querySelector(".editorial")).not.toBeNull();
    expect(screen.getByRole("region", { name: "Next" })).toHaveTextContent("Old town tour");
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
    const day = await screen.findByRole("heading", { name: /Wednesday 2 December/ });
    expect(day.querySelector(".editorial")).toHaveTextContent("2 December");
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
    expect(services.actions.uploadDocument).not.toHaveBeenCalled();
  });

  it("can attach a document when a plan is added from the day", async () => {
    const { services } = fakeServices();
    renderApp("/trips/t1/days?date=2026-12-02", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a plan" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "Beach dinner");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2026-12-02T19:30");
    await userEvent.upload(within(dialog).getByLabelText("Booking document"), new File(["x"], "dinner.pdf", { type: "application/pdf" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(services.actions.createItem).toHaveBeenCalled());
    const itemId = (services.actions.createItem.mock.calls as unknown[][])[0]?.[3] as string;
    await waitFor(() =>
      expect(services.actions.uploadDocument).toHaveBeenCalledWith(expect.any(File), { tripId: "t1", ownerId: "me", itemId, scope: "shared", kind: "document" }),
    );
  });
});

describe("docs and money", () => {
  it("opens a booking's document from the docs tab, on the same plan as that day", async () => {
    renderApp("/trips/t1/docs", fakeServices().services);
    const bookings = await screen.findByRole("region", { name: "Bookings" });
    const row = within(bookings).getByRole("link", { name: "Old town tour" }).closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByRole("link", { name: "Old town tour" })).toHaveAttribute("href", "/trips/t1/items/i1");
    expect(within(row as HTMLElement).getByRole("link", { name: "Wednesday 2 December" })).toHaveAttribute("href", "/trips/t1/days?date=2026-12-02");
    expect(within(row as HTMLElement).getByText("10:00 – 12:00")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("button", { name: "Open d1-ticket.pdf" })).toBeInTheDocument();
  });

  it("says when a trip has no personal files", async () => {
    renderApp("/trips/t1/docs", fakeServices({ snapshot: snapshot({ documents: [] }) }).services);
    expect(await screen.findByText("Nothing personal saved yet.")).toBeInTheDocument();
    const bookings = screen.getByRole("region", { name: "Bookings" });
    expect(within(bookings).queryByRole("button", { name: /^Open / })).toBeNull();
    expect(within(bookings).getAllByText("No confirmation saved").length).toBeGreaterThan(0);
  });

  it("shows that nothing is owed yet, and where amounts are converted", async () => {
    renderApp("/trips/t1/money", fakeServices().services);
    expect(await screen.findByRole("heading", { name: "Money" })).toBeInTheDocument();
    expect(screen.getByText("Nothing to settle yet.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Home currency" })).toBeInTheDocument();
  });
});

describe("bookings and my documents", () => {
  const at = (hhmm: string) => new Date(`2026-12-02T${hhmm}:00+05:30`).toISOString();
  const doc = (over: Partial<ReturnType<typeof snapshot>["documents"][number]> & Pick<ReturnType<typeof snapshot>["documents"][number], "id" | "fileName" | "ownerId" | "scope">) => ({
    tripId: "t1",
    itemId: null,
    storagePath: `t1/${over.ownerId}/${over.fileName}`,
    kind: "document",
    ...over,
  });

  function bookingsSnapshot() {
    return snapshot({
      items: [
        item({ id: "f2", title: "Night flight", kind: "flight", startsAt: at("21:00") }),
        item({ id: "f1", title: "Goa flight", kind: "flight", startsAt: at("08:00") }),
        item({ id: "s1", title: "Beach house", kind: "stay", ownerId: "riya", startsAt: at("15:00") }),
        item({ id: "secret", title: "Riya's note", kind: "plan", visibility: "private", ownerId: "riya", startsAt: at("18:00") }),
        item({ id: "mine", title: "Call the hotel", kind: "plan", visibility: "private", ownerId: "me", startsAt: at("19:00") }),
      ],
      documents: [
        doc({ id: "p1", fileName: "passport.pdf", ownerId: "me", scope: "personal", kind: "passport" }),
        doc({ id: "p2", fileName: "riya-visa.pdf", ownerId: "riya", scope: "personal" }),
        doc({ id: "d1", fileName: "d1-ticket.pdf", ownerId: "me", scope: "shared", itemId: "f1", kind: "ticket" }),
      ],
    });
  }

  it("groups bookings by kind, and leaves out other people's private plans", async () => {
    renderApp("/trips/t1/docs", fakeServices({ snapshot: bookingsSnapshot() }).services);
    const bookings = await screen.findByRole("region", { name: "Bookings" });
    expect(within(bookings).getByRole("heading", { name: "Flights" })).toBeInTheDocument();
    expect(within(bookings).getByRole("heading", { name: "Stays" })).toBeInTheDocument();
    expect(within(bookings).getByRole("heading", { name: "Plans" })).toBeInTheDocument();
    expect(within(bookings).getByRole("link", { name: "Goa flight" })).toHaveAttribute("href", "/trips/t1/items/f1");
    const flightLinks = within(bookings).getAllByRole("link", { name: /flight/i });
    expect(flightLinks.map((link) => link.textContent)).toEqual(["Goa flight", "Night flight"]);
    expect(within(bookings).getByText("08:00")).toBeInTheDocument();
    expect(within(bookings).getByRole("link", { name: "Beach house" })).toBeInTheDocument();
    expect(within(bookings).getByRole("link", { name: "Call the hotel" })).toBeInTheDocument();
    expect(within(bookings).queryByText("Riya's note")).toBeNull();
  });

  it("filters bookings by who booked them and by title", async () => {
    renderApp("/trips/t1/docs", fakeServices({ snapshot: bookingsSnapshot() }).services);
    const bookings = await screen.findByRole("region", { name: "Bookings" });
    await userEvent.selectOptions(within(bookings).getByLabelText("Who booked it"), "riya");
    expect(within(bookings).getByRole("link", { name: "Beach house" })).toBeInTheDocument();
    expect(within(bookings).queryByRole("link", { name: "Goa flight" })).toBeNull();
    expect(within(bookings).queryByRole("link", { name: "Call the hotel" })).toBeNull();
    await userEvent.selectOptions(within(bookings).getByLabelText("Who booked it"), "all");
    await userEvent.type(within(bookings).getByLabelText("Search bookings"), "hotel");
    expect(within(bookings).getByRole("link", { name: "Call the hotel" })).toBeInTheDocument();
    expect(within(bookings).queryByRole("link", { name: "Beach house" })).toBeNull();
  });

  it("adds a booking from the docs tab", async () => {
    const { services } = fakeServices({ snapshot: bookingsSnapshot() });
    renderApp("/trips/t1/docs", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add booking" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a booking" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "Airport cab");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2026-12-02T07:00");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(services.actions.createItem).toHaveBeenCalledWith("t1", "me", expect.objectContaining({ title: "Airport cab" }), expect.any(String)));
    expect(services.actions.uploadDocument).not.toHaveBeenCalled();
  });

  it("can attach a confirmation when the booking is added, for anyone in the group to open", async () => {
    const { services } = fakeServices({ snapshot: bookingsSnapshot() });
    renderApp("/trips/t1/docs", services);
    await userEvent.click(await screen.findByRole("button", { name: "Add booking" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a booking" });
    await userEvent.click(within(dialog).getByRole("radio", { name: "Stay" }));
    await userEvent.type(within(dialog).getByLabelText("Title"), "Beach house");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2026-12-02T15:00");
    await userEvent.upload(within(dialog).getByLabelText("Booking document"), new File(["x"], "stay.pdf", { type: "application/pdf" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(services.actions.createItem).toHaveBeenCalled());
    const itemId = (services.actions.createItem.mock.calls as unknown[][])[0]?.[3] as string;
    await waitFor(() =>
      expect(services.actions.uploadDocument).toHaveBeenCalledWith(expect.any(File), { tripId: "t1", ownerId: "me", itemId, scope: "shared", kind: "document" }),
    );
  });

  it("shows only the viewer's own files under My documents, and can add one", async () => {
    const snap = bookingsSnapshot();
    snap.members = snap.members.map((member) => (member.userId === "me" ? { ...member, role: "organizer" } : member));
    const { services } = fakeServices({ snapshot: snap });
    renderApp("/trips/t1/docs", services);
    const mine = await screen.findByRole("region", { name: "My documents" });
    expect(within(mine).getByText("passport.pdf")).toBeInTheDocument();
    expect(within(mine).queryByText("riya-visa.pdf")).toBeNull();
    const bookings = screen.getByRole("region", { name: "Bookings" });
    expect(within(bookings).getByRole("button", { name: "Open d1-ticket.pdf" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Other files" })).getByText("riya-visa.pdf")).toBeInTheDocument();
    await userEvent.upload(within(mine).getByLabelText("Add a document"), new File(["x"], "visa.pdf", { type: "application/pdf" }));
    await waitFor(() =>
      expect(services.actions.uploadDocument).toHaveBeenCalledWith(expect.any(File), { tripId: "t1", ownerId: "me", itemId: null, scope: "personal", kind: "document" }),
    );
  });

  it("says when there are no bookings and no files", async () => {
    renderApp("/trips/t1/docs", fakeServices({ snapshot: snapshot({ items: [], documents: [] }) }).services);
    expect(await screen.findByText("No bookings yet.")).toBeInTheDocument();
    expect(screen.getByText("Nothing personal saved yet.")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderApp("/trips/t1/docs", fakeServices().services);
    await screen.findByRole("heading", { name: "Docs" });
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
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
    expect(await screen.findByRole("heading", { name: "Hop back in" })).toBeInTheDocument();
    expect(services.auth.signOut).toHaveBeenCalled();
    expect(await getLocalTrip(services.db, "t1")).toBeNull();
  });
});
