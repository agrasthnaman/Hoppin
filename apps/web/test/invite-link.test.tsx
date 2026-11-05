import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fakeServices, renderApp } from "./helpers";

describe("the invite link (sent from the sign-up queue)", () => {
  it("signs the person in and takes them to create their first password", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=invite", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/reset-password"));
    expect(router.state.location.search).toBe("?welcome=1");
    expect(services.auth.verifyEmailLink).toHaveBeenCalledWith({ tokenHash: "abc", type: "invite" });
  });

  it("a reset link still goes to the plain choose-a-new-password page", async () => {
    const { services } = fakeServices();
    const { router } = renderApp("/auth/confirm?token_hash=abc&type=recovery", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/reset-password"));
    expect(router.state.location.search).toBe("");
  });

  it("welcomes them and asks them to create a password, then lets them carry on", async () => {
    const { services } = fakeServices();
    renderApp("/reset-password?welcome=1", services);
    expect(await screen.findByRole("heading", { name: "Create your password" })).toBeInTheDocument();
    expect(screen.getByText("Welcome to Hoppin. One password, and you're in.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("Your password"), "brand new password");
    await userEvent.click(screen.getByRole("button", { name: "Create password" }));
    expect(services.auth.updatePassword).toHaveBeenCalledWith("brand new password");
    expect(await screen.findByText("You're all set")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue" })).toBeInTheDocument();
  });

  it("the ordinary reset page keeps its own wording", async () => {
    const { services } = fakeServices();
    renderApp("/reset-password", services);
    expect(await screen.findByRole("heading", { name: "Choose a new password" })).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save password" })).toBeInTheDocument();
  });

  it("an invite opened a second time, signed out, says what to do in plain words", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/reset-password?welcome=1", services);
    expect(await screen.findByText(/This invite has already been used/)).toBeInTheDocument();
    expect(screen.getByText(/If you already created your password, just sign in/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/sign-in");
  });
});
