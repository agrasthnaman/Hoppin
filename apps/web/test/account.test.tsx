import type { MemberInfo } from "@hoppin/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServices, renderApp, snapshot } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
beforeEach(() => setOnline(true));
afterEach(() => vi.restoreAllMocks());

const m = (userId: string, displayName: string, over: Partial<MemberInfo> = {}): MemberInfo => ({
  userId, displayName, role: "member", status: "approved", canEditAll: false, ...over,
});
const asMember = () => snapshot({ members: [m("org", "Neha", { role: "organizer" }), m("me", "Aman")] });
const asSoleOrganizer = () => snapshot({ members: [m("me", "Aman", { role: "organizer" }), m("riya", "Riya")] });
const asCoOrganizer = () => snapshot({ members: [m("me", "Aman", { role: "organizer" }), m("riya", "Riya", { role: "organizer" }), m("neha", "Neha")] });

describe("account screen", () => {
  async function open() {
    const fake = fakeServices();
    const utils = renderApp("/account", fake.services);
    await screen.findByRole("heading", { name: "Account" });
    return { ...fake, ...utils };
  }

  it("links back to the day plan while a trip is happening", async () => {
    await open();
    expect(await screen.findByRole("link", { name: "Back to your trips" })).toHaveAttribute("href", "/trips/t1/days");
  });

  it("shows a loader until the name arrives", async () => {
    const { services } = fakeServices();
    services.actions.getProfile.mockReturnValue(new Promise(() => {}));
    renderApp("/account", services);
    expect(await screen.findByRole("status", { name: "Loading your name" })).toBeInTheDocument();
  });

  it("shows the person's name and email, and saves a new name", async () => {
    const { services } = await open();
    const name = await screen.findByLabelText("Your name");
    await waitFor(() => expect(name).toHaveValue("Aman"));
    expect(screen.getByText("aman@example.com")).toBeInTheDocument();
    await userEvent.clear(name);
    await userEvent.type(name, "Amanpreet");
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(services.actions.updateDisplayName).toHaveBeenCalledWith("Amanpreet"));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });

  it("needs a name", async () => {
    const { services } = await open();
    const name = await screen.findByLabelText("Your name");
    await waitFor(() => expect(name).toHaveValue("Aman"));
    await userEvent.clear(name);
    await userEvent.click(screen.getByRole("button", { name: "Save name" }));
    expect(screen.getByText("Enter your name")).toBeInTheDocument();
    expect(services.actions.updateDisplayName).not.toHaveBeenCalled();
  });

  it("with no connection, says so and does not let anything change", async () => {
    await open();
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText("Connect to the internet to change your details.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save name" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled();
  });

  it("deleting the account asks first, explains what happens, and needs the word 'delete'", async () => {
    const { services } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete your account?" });
    expect(within(dialog).getByText(/private plans and personal documents/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/group plans and bookings you added stay/i)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete my account" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Type delete to confirm/), "delete");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(services.actions.deleteAccount).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Hop back in" })).toBeInTheDocument();
    expect(await services.db.trips.count()).toBe(0);
  });

  it("cancelling changes nothing", async () => {
    const { services } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(services.actions.deleteAccount).not.toHaveBeenCalled();
  });

  it("shows the reason when the account cannot be deleted yet", async () => {
    const { services } = await open();
    services.actions.deleteAccount.mockRejectedValueOnce(new Error('You are the only organizer of "Goa". Make someone else an organizer or delete the trip first.'));
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete your account?" });
    await userEvent.type(within(dialog).getByLabelText(/Type delete to confirm/), "delete");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete my account" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent('You are the only organizer of "Goa"');
    expect(screen.queryByRole("heading", { name: "Hop back in" })).toBeNull();
  });

  it("signs out from here too", async () => {
    const { services } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Hop back in" })).toBeInTheDocument();
    expect(services.auth.signOut).toHaveBeenCalled();
  });

  it("is reachable from the trips list and the More screen", async () => {
    const a = fakeServices();
    const { unmount } = renderApp("/trips", a.services);
    expect(await screen.findByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
    unmount();
    const b = fakeServices();
    renderApp("/trips/t1/more", b.services);
    expect(await screen.findByRole("link", { name: "Account" })).toHaveAttribute("href", "/account");
  });
});

describe("joining from account and more", () => {
  it("opens an invite pasted on the account page", async () => {
    const { router } = renderApp("/account", fakeServices().services);
    const token = "cd".repeat(32);
    await userEvent.type(await screen.findByLabelText("Invite link"), token);
    await userEvent.click(screen.getByRole("button", { name: "Join the trip" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/join/${token}`));
  });

  it("opens an invite pasted on the More screen of a trip", async () => {
    const { router } = renderApp("/trips/t1/more", fakeServices().services);
    const token = "ef".repeat(32);
    await userEvent.type(await screen.findByLabelText("Invite link"), token);
    await userEvent.click(screen.getByRole("button", { name: "Join the trip" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/join/${token}`));
  });
});

describe("leaving and deleting a trip (More screen)", () => {
  const open = async (snap = asMember()) => {
    const fake = fakeServices({ snapshot: snap });
    const utils = renderApp("/trips/t1/more", fake.services);
    await screen.findByRole("heading", { name: "More" });
    return { ...fake, ...utils };
  };

  it("a member can leave after confirming, which removes the trip from this phone", async () => {
    const { services, router } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Leave this trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Leave this trip?" });
    expect(within(dialog).getByText(/private plans and personal documents in this trip are deleted/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Leave trip" }));
    await waitFor(() => expect(services.actions.leaveTrip).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips"));
    expect(await services.db.trips.get("t1")).toBeUndefined();
  });

  it("the only organizer cannot leave, and is told what to do", async () => {
    await open(asSoleOrganizer());
    expect(await screen.findByRole("button", { name: "Leave this trip" })).toBeDisabled();
    expect(screen.getByText("You're the only organizer. Make someone else an organizer or delete the trip first.")).toBeInTheDocument();
  });

  it("an organizer can leave once there is another organizer", async () => {
    await open(asCoOrganizer());
    expect(await screen.findByRole("button", { name: "Leave this trip" })).toBeEnabled();
  });

  it("only an organizer can delete the trip, and has to type its name", async () => {
    const { services, router } = await open(asSoleOrganizer());
    await userEvent.click(await screen.findByRole("button", { name: "Delete this trip" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete Goa for everyone?" });
    expect(within(dialog).getByText(/every plan, booking and document/i)).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Delete trip" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText(/Type the trip name to confirm/), "Goa");
    await userEvent.click(confirm);
    await waitFor(() => expect(services.actions.deleteTrip).toHaveBeenCalledWith("t1"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips"));
  });

  it("members do not see the delete option", async () => {
    await open();
    await screen.findByRole("button", { name: "Leave this trip" });
    expect(screen.queryByRole("button", { name: "Delete this trip" })).toBeNull();
  });

  it("shows a message if leaving did not work", async () => {
    const { services } = await open();
    services.actions.leaveTrip.mockRejectedValueOnce(new Error("down"));
    await userEvent.click(await screen.findByRole("button", { name: "Leave this trip" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Leave trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't leave the trip");
  });

  it("needs a connection", async () => {
    await open(asSoleOrganizer());
    await screen.findByRole("button", { name: "Delete this trip" });
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Delete this trip" })).toBeDisabled());
    expect(screen.getByText("Connect to the internet to leave or delete a trip.")).toBeInTheDocument();
  });
});

describe("co-organizers (Members screen)", () => {
  it("an organizer can make someone an organizer, and make another organizer a member again", async () => {
    const fake = fakeServices({ snapshot: asCoOrganizer() });
    renderApp("/trips/t1/members", fake.services);
    await userEvent.click(await screen.findByRole("button", { name: "Make Neha an organizer" }));
    await waitFor(() => expect(fake.services.actions.setMemberRole).toHaveBeenCalledWith("t1", "neha", "organizer"));
    await userEvent.click(await screen.findByRole("button", { name: "Make Riya a member again" }));
    await waitFor(() => expect(fake.services.actions.setMemberRole).toHaveBeenCalledWith("t1", "riya", "member"));
  });

  it("there is no such button for yourself", async () => {
    const fake = fakeServices({ snapshot: asCoOrganizer() });
    renderApp("/trips/t1/members", fake.services);
    await screen.findByRole("button", { name: "Make Neha an organizer" });
    expect(screen.queryByRole("button", { name: /Make Aman/ })).toBeNull();
  });
});
