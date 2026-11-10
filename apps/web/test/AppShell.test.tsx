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

function setup(initial = "/trips/t1/days", s = status(), memberWaiting = false) {
  const router = createMemoryRouter(
    [
      {
        path: "/trips/:tripId",
        element: <AppShell basePath="/trips/t1" tripName="Goa" status={s} memberWaiting={memberWaiting} />,
        children: [
          { path: "days", element: <h2>Days page</h2> },
          { path: "map", element: <h2>Map page</h2> },
          { path: "money", element: <h2>Money page</h2> },
        ],
      },
    ],
    { initialEntries: [initial] },
  );
  return render(<RouterProvider router={router} />);
}

describe("AppShell navigation", () => {
  it("shows Days, Map, Money, Docs and More, with the current page marked", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Main" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Days", "Map", "Money", "Docs", "More"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/trips/t1/days",
      "/trips/t1/map",
      "/trips/t1/money",
      "/trips/t1/docs",
      "/trips/t1/more",
    ]);
    expect(within(nav).getByRole("link", { name: "Days" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Days" })).toHaveClass("md:bg-nav-active");
    expect(within(nav).getByRole("link", { name: "Map" })).not.toHaveAttribute("aria-current");
    const mark = within(nav).getByText("hoppin");
    expect(mark).toHaveClass("hp-mark");
    expect(mark.querySelector("svg")).not.toBeNull(); // the same map pin as the landing page logo
    expect(within(nav).queryByText("Goa")).toBeNull();
    expect(screen.getByText("Goa")).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "More" })).toHaveClass("md:mt-auto");
  });

  it("is a floating bar on phones and becomes a sidebar on wide screens", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveClass("fixed", "bottom-3", "rounded-full"); // a floating pill on phones
    expect(nav).toHaveClass("md:sticky", "md:top-0", "md:h-dvh", "md:z-30", "md:flex-col");
  });

  it("puts a dot on More when someone is waiting for the organizer", () => {
    setup("/trips/t1/days", status(), true);
    const more = screen.getByRole("link", { name: "More" });
    expect(more).toHaveAccessibleDescription("Someone is waiting for approval");
    expect(more.querySelector("[data-waiting]")).not.toBeNull();
  });

  it("leaves More unmarked when nobody is waiting", () => {
    setup();
    expect(screen.getByRole("link", { name: "More" })).not.toHaveAccessibleDescription();
  });

  it("changes the page when a link is tapped", async () => {
    setup();
    expect(screen.getByRole("heading", { name: "Days page" })).toBeInTheDocument();
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
    const updates = screen.getByRole("button", { name: "Updates" });
    expect(updates.closest("header")).toBe(screen.getByText("Synced 5 min ago").closest("header"));
    expect(screen.getAllByText("Goa")).toHaveLength(1);
  });

  it("shows no banner when online and fresh", () => {
    setup();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the offline banner, and keeps it when moving between pages", async () => {
    setup("/trips/t1/days", status({ online: false }));
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
    await userEvent.click(screen.getByRole("link", { name: "Days" }));
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
  });

  it("warns when the data is more than a day old", () => {
    setup("/trips/t1/days", status({ lastSyncedAt: NOW - 3 * 24 * 3_600_000 }));
    expect(screen.getByRole("status")).toHaveTextContent("3 days ago");
  });

  it("has no accessibility violations, even with banners", async () => {
    const { container } = setup("/trips/t1/days", status({ online: false, lastSyncedAt: NOW - 3 * 24 * 3_600_000 }));
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
