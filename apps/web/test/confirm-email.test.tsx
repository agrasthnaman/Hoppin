import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthError } from "../src/lib/auth-api";
import { fakeServices, renderApp } from "./helpers";

describe("/auth/confirm (the link in the emails, on our own domain)", () => {
  it("confirms a sign-up link and goes on to where the person was headed", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fhoppinclub.com%2Faccount", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/account"));
    expect(services.auth.verifyEmailLink).toHaveBeenCalledTimes(1);
    expect(services.auth.verifyEmailLink).toHaveBeenCalledWith({ tokenHash: "abc", type: "signup" });
  });

  it("sends a recovery link to the choose-a-password page", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=recovery&next=https%3A%2F%2Fhoppinclub.com%2F", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/reset-password"));
  });

  it("only ever stays on this site, whatever 'next' says", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=signup&next=https%3A%2F%2Fevil.example%2Fsteal", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/steal"));
    expect(window.location.hostname).not.toBe("evil.example");
  });

  it("explains a link that was already used or has expired", async () => {
    const { services } = fakeServices({ session: null });
    services.auth.verifyEmailLink.mockRejectedValueOnce(new AuthError("invalid-link", "expired"));
    renderApp("/auth/confirm?token_hash=abc&type=signup", services);
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("treats a link with no token as invalid without calling the server", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/auth/confirm?type=signup", services);
    expect(await screen.findByText(/expired or was already used/)).toBeInTheDocument();
    expect(services.auth.verifyEmailLink).not.toHaveBeenCalled();
  });
});
