import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { fakeServices, renderApp } from "./helpers";

// The landing page is a big file that is deliberately not stored for offline use. Simulate a phone that cannot fetch it.
vi.mock("../src/routes/Landing", () => {
  throw new Error("Failed to fetch dynamically imported module");
});

describe("the landing page when it cannot be loaded (offline)", () => {
  it("shows a small welcome with a way in, instead of a broken screen", async () => {
    const { services } = fakeServices({ session: null });
    renderApp("/", services);
    expect(await screen.findByRole("heading", { name: "hoppin" })).toBeInTheDocument();
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/sign-in");
  });
});
