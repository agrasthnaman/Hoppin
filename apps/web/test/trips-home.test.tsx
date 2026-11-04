import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeServices, renderApp } from "./helpers";

const setOnline = (v: boolean) => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(v);
beforeEach(() => setOnline(true));
afterEach(() => vi.restoreAllMocks());

describe("trips list", () => {
  it("shows each trip with its dates", async () => {
    const { services } = fakeServices({ trips: [{ id: "t1", name: "Goa", startDate: "2026-12-01", endDate: "2026-12-05" }, { id: "t2", name: "Manali" }] });
    renderApp("/trips", services);
    expect(await screen.findByRole("link", { name: /Goa/ })).toHaveAttribute("href", "/trips/t1");
    expect(screen.getByText("1–5 Dec 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manali/ })).toBeInTheDocument();
    expect(screen.getByText("Dates not set")).toBeInTheDocument();
    expect(document.querySelector("[data-silk-anchor]")).not.toBeNull();
    expect(document.querySelector("main")?.className).toContain("trips-stage");
  });
});

describe("a new person with no trip", () => {
  it("welcomes them on a first day, with a way to start or join", async () => {
    const fake = fakeServices({ trips: [] });
    const { router } = renderApp("/trips", fake.services);
    expect(await screen.findByRole("heading", { name: "Welcome to Hoppin" })).toBeInTheDocument();
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("Days")).toBeInTheDocument();
    expect(screen.getByText("Money")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(document.querySelector("[data-silk-anchor]")).not.toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Start a trip" }));
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    expect(fake.services.actions.listTrips).toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));

    const token = "ab".repeat(32);
    const invite = screen.getByLabelText("Invite link");
    expect(invite.closest(".on-cream")).not.toBeNull();
    await userEvent.type(invite, `https://hoppin.app/join/${token}`);
    await userEvent.click(screen.getByRole("button", { name: "Join the trip" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/join/${token}`));
  });

  it("rejects a paste that is not an invite link", async () => {
    renderApp("/trips", fakeServices({ trips: [] }).services);
    await userEvent.type(await screen.findByLabelText("Invite link"), "see you there");
    await userEvent.click(screen.getByRole("button", { name: "Join the trip" }));
    expect(screen.getByText(/doesn't look like an invite link/)).toBeInTheDocument();
  });
});

describe("joining from the trips list", () => {
  it("opens an invite pasted next to the trips you already have", async () => {
    const { router } = renderApp("/trips", fakeServices({ trips: [{ id: "t1", name: "Goa" }] }).services);
    const token = "ab".repeat(32);
    const invite = await screen.findByLabelText("Invite link");
    expect(invite.closest(".on-cream")).not.toBeNull();
    await userEvent.type(invite, `https://hoppin.app/join/${token}`);
    await userEvent.click(screen.getByRole("button", { name: "Join the trip" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/join/${token}`));
  });
});

describe("creating a trip", () => {
  async function openForm() {
    const fake = fakeServices();
    const utils = renderApp("/trips", fake.services);
    await userEvent.click(await screen.findByRole("button", { name: "New trip" }));
    return { ...fake, ...utils, dialog: await screen.findByRole("dialog", { name: "New trip" }) };
  }

  it("creates the trip and opens it", async () => {
    const { services, router, dialog } = await openForm();
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Hampi");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2027-01-10");
    await userEvent.type(within(dialog).getByLabelText("Ends"), "2027-01-14");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(services.actions.createTrip).toHaveBeenCalledWith({ name: "Hampi", startDate: "2027-01-10", endDate: "2027-01-14" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/trips/new-trip/days"));
  });

  it("dates are optional", async () => {
    const { services, dialog } = await openForm();
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Someday");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(services.actions.createTrip).toHaveBeenCalledWith({ name: "Someday", startDate: null, endDate: null }));
  });

  it("explains what is wrong and does not create", async () => {
    const { services, dialog } = await openForm();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    expect(within(dialog).getByText("Enter a trip name")).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Hampi");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2027-01-14");
    await userEvent.type(within(dialog).getByLabelText("Ends"), "2027-01-10");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    expect(within(dialog).getByText("The end date must be on or after the start date")).toBeInTheDocument();
    expect(services.actions.createTrip).not.toHaveBeenCalled();
  });

  it("says so when the trip cannot be created", async () => {
    const { services, dialog } = await openForm();
    services.actions.createTrip.mockRejectedValueOnce(new Error("down"));
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Hampi");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't create the trip");
  });

  it("needs a connection, and says so", async () => {
    setOnline(false);
    const { services } = fakeServices();
    renderApp("/trips", services);
    expect(await screen.findByRole("button", { name: "New trip" })).toBeDisabled();
    expect(screen.getByText("Connect to the internet to create a trip.")).toBeInTheDocument();
  });
});

describe("creating an account", () => {
  it("lets a new organizer sign up with a name and email", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in", services);
    await userEvent.click(await screen.findByRole("button", { name: "New here? Join the waitlist" }));
    expect(screen.getByRole("heading", { name: "Join the waitlist" })).toBeInTheDocument();
    expect(document.querySelector("[data-silk-anchor]")).not.toBeNull();
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(services.auth.signUp).toHaveBeenCalledWith({ email: "neha@example.com", name: "Neha", password: "a long enough password", redirectTo: `${window.location.origin}/` });
    expect(await screen.findByRole("heading", { name: "You're on the list" })).toBeInTheDocument();
    expect(screen.getByText(/Welcome to the waitlist/)).toBeInTheDocument();
    expect(screen.getByText(/neha@example.com/)).toBeInTheDocument();
  });

  it("needs a name, and can go back to signing in", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in", services);
    await userEvent.click(await screen.findByRole("button", { name: "New here? Join the waitlist" }));
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "a long enough password");
    await userEvent.click(screen.getByRole("button", { name: "Join the waitlist" }));
    expect(screen.getByText("Enter your name")).toBeInTheDocument();
    expect(services.auth.signUp).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "I already have an account" }));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});

describe("the new trip form", () => {
  it("asks 'where to?', and says dates are optional", async () => {
    const { services } = fakeServices();
    renderApp("/trips", services);
    await userEvent.click(await screen.findByRole("button", { name: "New trip" }));
    const dialog = await screen.findByRole("dialog", { name: "New trip" });
    expect(within(dialog).getByPlaceholderText("Where to?")).toBeInTheDocument();
    expect(within(dialog).getByText(/Dates are optional/)).toBeInTheDocument();
  });
});
