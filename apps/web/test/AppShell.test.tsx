import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/AppShell";

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const status = (over: Partial<{ online: boolean; lastSyncedAt: number | null }> = {}) => ({
  online: true,
  lastSyncedAt: NOW - 5 * 60_000,
  now: NOW,
  ...over,
});

function setup(initial = "/trips/t1/today", s = status()) {
  const router = createMemoryRouter(
    [
      {
        path: "/trips/:tripId",
        element: <AppShell basePath="/trips/t1" tripName="Goa" status={s} />,
        children: [
          { path: "today", element: <h2>Today page</h2> },
          { path: "days", element: <h2>Days page</h2> },
          { path: "money", element: <h2>Money page</h2> },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  return render(<RouterProvider router={router} />);
}

describe("AppShell navigation", () => {
  it("shows Today, Days, Money, Docs and More, with the current page marked", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Today", "Days", "Money", "Docs", "More"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/trips/t1/today",
      "/trips/t1/days",
      "/trips/t1/money",
      "/trips/t1/docs",
      "/trips/t1/more",
    ]);
    expect(within(nav).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Today" })).toHaveClass("md:bg-nav-active");
    expect(within(nav).getByRole("link", { name: "Days" })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByText("Goa")).toBeInTheDocument();
  });

  it("is a floating bar on phones and becomes a sidebar on wide screens", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveClass("fixed", "bottom-3", "rounded-full"); // a floating pill on phones
    expect(nav).toHaveClass("md:relative", "md:z-30", "md:flex-col");
  });

  it("changes the page when a link is tapped", async () => {
    setup();
    expect(screen.getByRole("heading", { name: "Today page" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Money" }));
    expect(screen.getByRole("heading", { name: "Money page" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Money" })).toHaveAttribute("aria-current", "page");
  });

  it("has a skip link that points at the main content", () => {
    setup();
    expect(screen.getByRole("link", { name: "Skip to content" })).toHaveAttribute("href", "#content");
    expect(screen.getByRole("main")).toHaveAttribute("id", "content");
  });
});

describe("AppShell sync status", () => {
  it("always shows when the trip was last synced", () => {
    setup();
    expect(screen.getByText("Synced 5 min ago")).toBeInTheDocument();
    expect(screen.getAllByText("Goa")).toHaveLength(2);
  });

  it("shows no banner when online and fresh", () => {
    setup();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the offline banner, and keeps it when moving between pages", async () => {
    setup("/trips/t1/today", status({ online: false }));
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
    await userEvent.click(screen.getByRole("link", { name: "Days" }));
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
  });

  it("warns when the data is more than a day old", () => {
    setup("/trips/t1/today", status({ lastSyncedAt: NOW - 3 * 24 * 3_600_000 }));
    expect(screen.getByRole("status")).toHaveTextContent("3 days ago");
  });

  it("has no accessibility violations, even with banners", async () => {
    const { container } = setup("/trips/t1/today", status({ online: false, lastSyncedAt: NOW - 3 * 24 * 3_600_000 }));
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
