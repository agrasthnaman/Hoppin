import { Capacitor } from "@capacitor/core";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeServices, renderApp } from "./helpers";

afterEach(() => vi.restoreAllMocks());

describe("signed-out home", () => {
  it("goes straight to sign-in in the installed app", async () => {
    vi.spyOn(Capacitor, "isNativePlatform").mockReturnValue(true);
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/sign-in"));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("still shows the welcome page on the website", async () => {
    const { services } = fakeServices({ session: null });
    const { router } = renderApp("/", services);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
