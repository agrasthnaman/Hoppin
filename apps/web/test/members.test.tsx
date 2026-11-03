import type { MemberInfo } from "@hoppin/core";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServices, renderApp, snapshot } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
beforeEach(() => setOnline(true));
afterEach(() => vi.restoreAllMocks());

const m = (userId: string, displayName: string, over: Partial<MemberInfo> = {}): MemberInfo => ({
  userId, displayName, role: "member", status: "approved", canEditAll: false, ...over,
});
const asOrganizer = () =>
  snapshot({ members: [m("me", "Aman", { role: "organizer" }), m("riya", "Riya"), m("kabir", "Kabir", { status: "pending" }), m("old", "Old Friend", { status: "removed" })] });
const asMember = () => snapshot({ members: [m("org", "Neha", { role: "organizer" }), m("me", "Aman"), m("riya", "Riya"), m("kabir", "Kabir", { status: "pending" })] });

const open = async (snap = asOrganizer(), opts: Parameters<typeof fakeServices>[0] = {}) => {
  const fake = fakeServices({ snapshot: snap, ...opts });
  const utils = renderApp("/trips/t1/members", fake.services);
  await screen.findByRole("heading", { name: "Members" });
  return { ...fake, ...utils };
};

describe("members screen: the organizer", () => {
  it("lists people waiting for approval, who can be approved or declined", async () => {
    const { services } = await open();
    const waiting = await screen.findByRole("region", { name: "Waiting for approval" });
    expect(within(waiting).getByText("Kabir")).toBeInTheDocument();
    await userEvent.click(within(waiting).getByRole("button", { name: "Approve Kabir" }));
    await waitFor(() => expect(services.invites.approveMember).toHaveBeenCalledWith("t1", "kabir"));
    await userEvent.click(within(waiting).getByRole("button", { name: "Decline Kabir" }));
    await waitFor(() => expect(services.invites.removeMember).toHaveBeenCalledWith("t1", "kabir"));
  });

  it("asks before removing someone, and explains what it does", async () => {
    const { services } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Remove Riya" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove Riya?" });
    expect(within(dialog).getByText(/lose access.*wiped from their phone/i)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(services.invites.removeMember).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Remove Riya" }));
    await userEvent.click(within(await screen.findByRole("dialog", { name: "Remove Riya?" })).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(services.invites.removeMember).toHaveBeenCalledWith("t1", "riya"));
  });

  it("can let a member edit other people's plans, and take it back", async () => {
    const { services } = await open();
    const toggle = await screen.findByRole("checkbox", { name: "Let Riya edit others' plans" });
    expect(toggle).not.toBeChecked();
    await userEvent.click(toggle);
    await waitFor(() => expect(services.actions.setEditRights).toHaveBeenCalledWith("t1", "riya", true));
  });

  it("shows the organizer themselves without controls", async () => {
    await open();
    expect(await screen.findByText("Aman")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove Aman" })).toBeNull();
    expect(screen.getByText("You · Organizer")).toBeInTheDocument();
  });

  it("lets someone who was removed back in", async () => {
    const { services } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Let Old Friend back in" }));
    await waitFor(() => expect(services.invites.approveMember).toHaveBeenCalledWith("t1", "old"));
  });

  it("tells the organizer when something did not work", async () => {
    const { services } = await open();
    services.invites.approveMember.mockRejectedValueOnce(new Error("down"));
    await userEvent.click(await screen.findByRole("button", { name: "Approve Kabir" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't do that");
  });
});

describe("members screen: invite links", () => {
  const invite = { id: "inv1", token: "a1".repeat(32), createdAt: "2026-12-01T00:00:00Z", expiresAt: "2026-12-15T00:00:00Z" };

  it("shows each active link, copies it, and can stop it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { services } = await open(asOrganizer(), { invites: [invite] });
    const link = `${window.location.origin}/join/${invite.token}`;
    expect(await screen.findByDisplayValue(link)).toBeInTheDocument();
    expect(screen.getByText("Expires 15 Dec")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(link);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Stop this link" }));
    await waitFor(() => expect(services.invites.revokeInvite).toHaveBeenCalledWith("inv1"));
    await waitFor(() => expect(screen.queryByDisplayValue(link)).toBeNull());
  });

  it("creates a new link", async () => {
    const { services } = await open();
    await userEvent.click(await screen.findByRole("button", { name: "Create invite link" }));
    await waitFor(() => expect(services.invites.createInvite).toHaveBeenCalledWith("t1"));
    expect(await screen.findByDisplayValue(`${window.location.origin}/join/${"b2".repeat(32)}`)).toBeInTheDocument();
  });

  it("explains that anyone with a link can ask to join, and that the organizer approves", async () => {
    await open();
    expect(await screen.findByText(/Anyone with the link can ask to join. You approve each person/)).toBeInTheDocument();
  });
});

describe("members screen: everyone else", () => {
  it("shows who is in the trip, with no controls, no waiting list and no invite links", async () => {
    await open(asMember());
    expect(await screen.findByText("Neha")).toBeInTheDocument();
    expect(screen.getByText("Riya")).toBeInTheDocument();
    expect(screen.getByText("Organizer")).toBeInTheDocument();
    expect(screen.queryByText("Kabir")).toBeNull();
    expect(screen.queryByRole("button", { name: /Remove|Approve|Create invite link/ })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("members screen: offline and access", () => {
  it("disables changes with no connection and says why", async () => {
    await open();
    await screen.findByRole("button", { name: "Approve Kabir" });
    act(() => {
      setOnline(false);
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText("Connect to the internet to change members or invite links.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve Kabir" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove Riya" })).toBeDisabled();
  });

  it("has no accessibility violations", async () => {
    const { container } = await open();
    await screen.findByRole("button", { name: "Remove Riya" });
    await act(async () => {});
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });

  it("is reachable from the More screen", async () => {
    const fake = fakeServices({ snapshot: asOrganizer() });
    renderApp("/trips/t1/more", fake.services);
    expect(await screen.findByRole("link", { name: "Members" })).toHaveAttribute("href", "/trips/t1/members");
  });
});
