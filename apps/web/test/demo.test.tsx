import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createDemoServices } from "../src/demo/demo-services";
import { renderApp } from "./helpers";

const demo = () => createDemoServices({ today: "2026-12-01", timeZone: "Asia/Kolkata", dbName: `demo-${Math.random()}` });

describe("demo mode", () => {
  it("starts signed in with two sample trips", async () => {
    renderApp("/", demo());
    expect(await screen.findByRole("link", { name: /Goa/ })).toHaveAttribute("href", "/trips/demo-goa");
    expect(screen.getByRole("link", { name: /Manali weekend/ })).toBeInTheDocument();
  });

  it("opens on today, which is the busy day of the sample trip", async () => {
    renderApp("/trips/demo-goa/days", demo());
    expect(await screen.findByRole("region", { name: "Old town walking tour" })).toBeInTheDocument();
  });

  it("a multi-day stay says when it ends", async () => {
    renderApp("/trips/demo-goa/days?date=2026-12-01", demo());
    expect(await screen.findByText("14:00 – 4 Dec 11:00")).toBeInTheDocument();
  });

  it("shows a full sample day: group plans, friends' optional plans as chips, and the viewer's private plan", async () => {
    renderApp("/trips/demo-goa/days?date=2026-12-01", demo());
    const tour = await screen.findByRole("region", { name: "Old town walking tour" });
    expect(within(tour).getByRole("button", { name: /Museum/ })).toBeInTheDocument();
    expect(screen.getByText("Visit the ABC viewpoint")).toBeInTheDocument();
  });

  it("changes are kept in the demo: a new plan appears, and a friend's plan can be joined", async () => {
    renderApp("/trips/demo-goa/days?date=2026-12-01", demo());
    await userEvent.click(await screen.findByRole("button", { name: "Add plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a plan" });
    await userEvent.type(within(dialog).getByLabelText("Title"), "Beach dinner");
    await userEvent.type(within(dialog).getByLabelText("Starts"), "2026-12-01T19:30");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("region", { name: "Beach dinner" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/waiting to send/)).toBeNull());
  });

  it("the organizer can approve the person waiting to join", async () => {
    renderApp("/trips/demo-goa/members", demo());
    const waiting = await screen.findByRole("region", { name: "Waiting for approval" });
    await userEvent.click(within(waiting).getByRole("button", { name: "Approve Kabir" }));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Waiting for approval" })).toBeNull());
    expect(screen.getByText("Kabir")).toBeInTheDocument();
  });

  it("in the other trip the viewer is a plain member, with no organizer controls", async () => {
    renderApp("/trips/demo-manali/members", demo());
    expect(await screen.findByText("Neha")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create invite link" })).toBeNull();
  });

  it("creating a trip works and opens it", async () => {
    const { router } = renderApp("/", demo());
    await userEvent.click(await screen.findByRole("button", { name: "New trip" }));
    await userEvent.type(await screen.findByLabelText("Trip name"), "Hampi");
    await userEvent.click(screen.getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/trips\/demo-\d+\/days$/));
  });

  it("signing out and back in works without any email", async () => {
    const services = demo();
    renderApp("/trips/demo-goa/more", services);
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Email"), "aman@example.com");
    await userEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));
    await waitFor(() => expect(services.sessionClient).toBeDefined());
  });
});
