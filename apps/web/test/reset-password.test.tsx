import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fakeServices, renderApp } from "./helpers";

describe("reset password page", () => {
  it("lets a signed-in person (who just opened the reset link) choose a new password", async () => {
    const { services } = fakeServices();
    renderApp("/reset-password", services);
    await userEvent.type(await screen.findByLabelText("New password"), "brand new password");
    await userEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(services.auth.updatePassword).toHaveBeenCalledWith("brand new password");
    expect(await screen.findByText("Password updated")).toBeInTheDocument();
  });

  it("rejects a short password without asking the server", async () => {
    const { services } = fakeServices();
    renderApp("/reset-password", services);
    await userEvent.type(await screen.findByLabelText("New password"), "short");
    await userEvent.click(screen.getByRole("button", { name: "Save password" }));
    expect(screen.getByText("Use at least 10 characters")).toBeInTheDocument();
    expect(services.auth.updatePassword).not.toHaveBeenCalled();
  });

  it("explains an expired or already-used link when nobody is signed in", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/reset-password", services);
    expect(await screen.findByText(/already been used, or it is more than 24 hours old/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to sign in" })).toHaveAttribute("href", "/sign-in");
  });

  it("is reachable from the account screen", async () => {
    const { services } = fakeServices();
    renderApp("/account", services);
    expect(await screen.findByRole("link", { name: "Change password" })).toHaveAttribute("href", "/reset-password");
  });
});
