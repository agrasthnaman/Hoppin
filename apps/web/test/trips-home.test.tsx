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
    renderApp("/", services);
    expect(await screen.findByRole("link", { name: /Goa/ })).toHaveAttribute("href", "/trips/t1");
    expect(screen.getByText("1–5 Dec 2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Manali/ })).toBeInTheDocument();
    expect(screen.getByText("Dates not set")).toBeInTheDocument();
  });
});

describe("creating a trip", () => {
  async function openForm() {
    const fake = fakeServices();
    const utils = renderApp("/", fake.services);
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
    renderApp("/", services);
    expect(await screen.findByRole("button", { name: "New trip" })).toBeDisabled();
    expect(screen.getByText("Connect to the internet to create a trip.")).toBeInTheDocument();
  });
});

describe("creating an account", () => {
  it("lets a new organizer sign up with a name and email", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in", services);
    await userEvent.click(await screen.findByRole("button", { name: "New here? Create an account" }));
    await userEvent.type(screen.getByLabelText("Your name"), "Neha");
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Create account and email me a link" }));
    expect(services.auth.sendMagicLink).toHaveBeenCalledWith({ email: "neha@example.com", name: "Neha", redirectTo: `${window.location.origin}/` });
    expect(await screen.findByText(/Check your email/)).toBeInTheDocument();
  });

  it("needs a name, and can go back to signing in", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/sign-in", services);
    await userEvent.click(await screen.findByRole("button", { name: "New here? Create an account" }));
    await userEvent.type(screen.getByLabelText("Email"), "neha@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Create account and email me a link" }));
    expect(screen.getByText("Enter your name")).toBeInTheDocument();
    expect(services.auth.sendMagicLink).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "I already have an account" }));
    expect(screen.getByRole("button", { name: "Email me a sign-in link" })).toBeInTheDocument();
  });
});
