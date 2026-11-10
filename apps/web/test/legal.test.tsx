import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { fakeServices, renderApp } from "./helpers";

describe("privacy and terms", () => {
  it("shows the privacy page to someone who is not signed in", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/privacy", services);
    expect(await screen.findByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hop back in" })).toBeNull();
    expect(router.state.location.pathname).toBe("/privacy");
    expect(screen.getAllByText(/support@hoppinclub\.com/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Delete my account/)).toBeInTheDocument();
    expect(screen.getByText(/Signing out of this phone removes that token/)).toBeInTheDocument();
    expect(screen.queryByText(/do not store a push notification token/i)).toBeNull();
  });

  it("shows the terms page to someone who is not signed in", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/terms", services);
    expect(await screen.findByRole("heading", { name: "Terms" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Hop back in" })).toBeNull();
    expect(router.state.location.pathname).toBe("/terms");
    expect(screen.getByText(/support@hoppinclub\.com/)).toBeInTheDocument();
  });

  it("links to privacy and terms from sign-in, account, and the site footer", async () => {
    const signedOut = fakeServices({ session: null });
    const signIn = renderApp("/sign-in", signedOut.services);
    expect(await screen.findByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    signIn.unmount();

    const home = renderApp("/", fakeServices({ session: null }).services);
    const support = await screen.findByRole("link", { name: "Email support at support@hoppinclub.com" });
    const footer = support.closest("footer");
    expect(footer).not.toBeNull();
    expect(footer?.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(footer?.querySelector('a[href="/terms"]')).not.toBeNull();
    home.unmount();

    renderApp("/account", fakeServices().services);
    await screen.findByRole("heading", { name: "Account" });
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
  });
});
