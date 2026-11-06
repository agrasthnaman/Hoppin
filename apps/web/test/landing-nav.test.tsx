import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MotionRoot } from "../src/lib/motion";
import Landing from "../src/routes/Landing";

function renderLanding() {
  return render(
    <MotionRoot>
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    </MotionRoot>,
  );
}

describe("landing navigation", () => {
  it("sends each option to that part's detail further down the page", () => {
    renderLanding();
    const nav = screen.getByRole("navigation");
    for (const name of ["days", "bookings", "money", "docs", "today"]) {
      const link = withinNav(nav, name);
      const id = link.getAttribute("href")?.slice(1);
      expect(id).toBe(name);
      expect(document.getElementById(name)).toBeTruthy();
    }
  });

  it("lets someone who is not signed in email support from the end of the page", () => {
    renderLanding();
    const link = screen.getByRole("link", { name: "Email support at support@hoppinclub.com" });
    expect(link.closest("footer")).not.toBeNull();
    expect(link.getAttribute("href")).toMatch(/^mailto:support@hoppinclub\.com\?/);
  });
});

describe("scroll motion on the home page", () => {
  it("brings each feature in on its own as you scroll", () => {
    renderLanding();
    const days = document.getElementById("days")?.closest("[data-reveal]");
    const bookings = document.getElementById("bookings")?.closest("[data-reveal]");
    expect(days).toBeTruthy();
    expect(bookings).toBeTruthy();
    expect(days).not.toBe(bookings);
  });

  it("shows a feature straight away when the phone asks for less motion", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    renderLanding();
    expect(document.getElementById("days")?.closest("[data-reveal]")?.getAttribute("data-motion")).toBe("off");
  });
});

describe("the trip player on the home page", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("holds the stop on screen long enough to read before the next one", () => {
    vi.useFakeTimers();
    renderLanding();
    act(() => {
      screen.getByRole("button", { name: "Play" }).click();
    });
    expect(screen.getByText(/sunset kayaking/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(6999);
    });
    expect(screen.getByText(/sunset kayaking/)).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText(/overnight bus/)).toBeTruthy();
  });
});

function withinNav(nav: HTMLElement, name: string) {
  const link = [...nav.querySelectorAll("a")].find((anchor) => anchor.textContent === name);
  if (!link) throw new Error(`missing nav link ${name}`);
  return link;
}
