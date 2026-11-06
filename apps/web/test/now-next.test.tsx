import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { axe } from "vitest-axe";
import { describe, expect, it } from "vitest";
import { NowNext } from "../src/components/NowNext";
import { item } from "./helpers";

const at = (hhmm: string) => `2026-12-02T${hhmm}:00Z`;
const NOW = Date.parse(at("11:00"));

function show(items: ReturnType<typeof item>[], now = NOW) {
  return render(
    <MemoryRouter>
      <NowNext items={items} viewerId="me" now={now} tripId="t1" />
    </MemoryRouter>,
  );
}

describe("now and next on the day plan", () => {
  const tour = item({ id: "a", title: "Old town tour", startsAt: at("10:00"), endsAt: at("12:00"), locationUrl: "https://maps.example/tour" });
  const lunch = item({ id: "b", title: "Lunch", startsAt: at("13:30"), endsAt: at("14:30") });
  const hotel = item({ id: "s", title: "Beach Hotel", kind: "stay", startsAt: at("08:00"), endsAt: "2026-12-05T08:00:00Z" });

  it("shows what is on now with its progress, what comes next and where the group sleeps", () => {
    show([tour, lunch, hotel]);
    const region = screen.getByRole("region", { name: "Right now" });
    expect(region).toHaveTextContent("Happening now");
    expect(within(region).getByRole("link", { name: "Old town tour" })).toHaveAttribute("href", "/trips/t1/items/a");
    expect(within(region).getByRole("link", { name: "Get directions" })).toHaveAttribute("href", "https://maps.example/tour");
    expect(region).toHaveTextContent("Then in 2 h 30 min");
    expect(region).toHaveTextContent("Lunch");
    expect(region).toHaveTextContent("Tonight you're at");
    expect(region).toHaveTextContent("Beach Hotel");
  });

  it("leads with what is up next, and how soon, when nothing is on", () => {
    show([lunch], Date.parse(at("13:00")));
    const region = screen.getByRole("region", { name: "Right now" });
    expect(region).toHaveTextContent("Up next · in 30 min");
    expect(region).not.toHaveTextContent("Happening now");
  });

  it("shows nothing for a trip with no plans, and never someone else's private plan", () => {
    const { container } = show([]);
    expect(container).toBeEmptyDOMElement();
    const secret = item({ id: "p", title: "Surprise", startsAt: at("10:00"), endsAt: at("12:00"), visibility: "private", ownerId: "riya", groupItem: false });
    show([secret]);
    expect(screen.queryByText("Surprise")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = show([tour, lunch, hotel]);
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
