import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { DayStrip } from "../src/components/DayStrip";

const setup = (props: Partial<React.ComponentProps<typeof DayStrip>> = {}) =>
  render(
    <MemoryRouter>
      <DayStrip start="2026-12-01" end="2026-12-05" selected="2026-12-03" {...props} />
    </MemoryRouter>,
  );

describe("DayStrip", () => {
  it("shows a pill for every day of the trip, with the weekday and date", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Days of the trip" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Tue1", "Wed2", "Thu3", "Fri4", "Sat5"]);
    expect(links[0]).toHaveAccessibleName("Tuesday 1 December");
    expect(links[2]).toHaveAttribute("href", "/?date=2026-12-03");
  });

  it("marks the selected day for screen readers and styles it with the pop colour", () => {
    setup();
    const selected = screen.getByRole("link", { name: "Thursday 3 December" });
    expect(selected).toHaveAttribute("aria-current", "date");
    expect(selected).toHaveClass("bg-accent");
    expect(screen.getByRole("link", { name: "Friday 4 December" })).not.toHaveAttribute("aria-current");
  });

  it("caps very long trips instead of drawing hundreds of pills", () => {
    setup({ start: "2026-01-01", end: "2026-12-31", selected: "2026-01-02" });
    expect(screen.getAllByRole("link").length).toBeLessThanOrEqual(31);
  });

  it("shows nothing for a trip without dates", () => {
    const { container } = setup({ start: null, end: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("includes the selected day even if it falls outside the trip's dates", () => {
    setup({ selected: "2026-12-09" });
    expect(screen.getByRole("link", { name: "Wednesday 9 December" })).toHaveAttribute("aria-current", "date");
  });
});
