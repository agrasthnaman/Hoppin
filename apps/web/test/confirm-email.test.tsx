import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AuthError } from "../src/lib/auth-api";
import { fakeServices, renderApp } from "./helpers";

describe("/auth/confirm (the link in the emails, on our own domain)", () => {
  it("confirms a sign-up link and goes on to where the person was headed", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fhoppinclub.com%2Faccount", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
    expect(services.auth.verifyEmailLink).toHaveBeenCalledTimes(1);
    expect(services.auth.verifyEmailLink).toHaveBeenCalledWith({ tokenHash: "abc", type: "signup" });
  });

  it("sends a recovery link to the choose-a-password page", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=recovery&next=https%3A%2F%2Fhoppinclub.com%2F", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/reset-password"));
  });

  it("only ever stays on this site, whatever 'next' says", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fevil.example%2Fsteal", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/steal"));
    expect(window.location.hostname).not.toBe("evil.example");
  });

  it("shows a loader while the link is being confirmed", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.verifyEmailLink.mockReturnValue(new Promise(() => {}));
    renderApp("/auth/confirm?token_hash=abc&type=signup&next=/account", services);
    const status = await screen.findByRole("status", { name: "One moment while we confirm your link." });
    expect(status.querySelector(".hp-hop")).not.toBeNull();
  });

  it("explains a link that was already used or has expired", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.verifyEmailLink.mockRejectedValueOnce(new AuthError("invalid-link", "expired"));
    renderApp("/auth/confirm?token_hash=abc&type=signup", services);
    expect(await screen.findByText(/already been used, or it is more than 24 hours old/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("treats a link with no token as invalid without calling the server", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/auth/confirm?type=signup", services);
    expect(await screen.findByText(/already been used, or it is more than 24 hours old/)).toBeInTheDocument();
    expect(services.auth.verifyEmailLink).not.toHaveBeenCalled();
  });

  it("a link opened a second time, by someone already signed in, just carries on instead of showing a problem", async () => {
    const { services } = fakeServices();
    services.auth.verifyEmailLink.mockRejectedValueOnce(new AuthError("invalid-link", "already used"));
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fhoppinclub.com%2Faccount", services);
    await userEvent.click(await screen.findByRole("button", { name: "Continue with this link" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
    expect(screen.queryByText(/already been used/)).toBeNull();
  });

  it("someone already signed in is asked before a link can switch them to another account", async () => {
    const { services } = fakeServices();
    renderApp("/auth/confirm?token_hash=abc&type=recovery", services);
    expect(await screen.findByText(/You're signed in as aman@example.com/)).toBeInTheDocument();
    expect(services.auth.verifyEmailLink).not.toHaveBeenCalled();
  });

  it("staying signed in leaves the session alone and uses nothing from the link", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=recovery", services);
    await userEvent.click(await screen.findByRole("link", { name: "Stay signed in" }));
    await waitFor(() => expect(router.state.location.pathname).not.toBe("/auth/confirm"));
    expect(services.auth.verifyEmailLink).not.toHaveBeenCalled();
  });

  it("continuing confirms the link once and goes where it leads", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=recovery", services);
    await userEvent.click(await screen.findByRole("button", { name: "Continue with this link" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/reset-password"));
    expect(services.auth.verifyEmailLink).toHaveBeenCalledTimes(1);
  });

  it("tells a signed-out person what to do next in plain words, with no error wording", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.verifyEmailLink.mockRejectedValueOnce(new AuthError("invalid-link", "expired"));
    renderApp("/auth/confirm?token_hash=abc&type=signup", services);
    expect(await screen.findByText(/just sign in with your password/)).toBeInTheDocument();
    expect(screen.queryByText(/problem|error|failed|invalid/i)).toBeNull();
  });
});
