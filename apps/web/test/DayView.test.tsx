import { buildDay, type Item } from "@hoppin/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { describe, expect, it, vi } from "vitest";
import { DayView } from "../src/components/DayView";

const IST = "Asia/Kolkata";
const ME = "me";
const RIYA = "riya";
const people = {
  [ME]: { name: "Aman", color: "#1d4ed8" },
  [RIYA]: { name: "Riya", color: "#6d28d9" },
};
const at = (hhmm: string) => new Date(`2026-12-01T${hhmm}:00+05:30`).toISOString();

let n = 0;
function item(over: Partial<Item> & Pick<Item, "startsAt" | "title">): Item {
  n += 1;
  return {
    id: `i${n}`,
    tripId: "t1",
    ownerId: ME,
    kind: "activity",
    visibility: "shared",
    groupItem: true,
    endsAt: null,
    tz: IST,
    locationUrl: null,
    details: {},
    version: 1,
    ...over,
  };
}

const tour = item({ title: "Old town tour", startsAt: at("10:00"), endsAt: at("12:00"), locationUrl: "https://maps.example/old-town" });
const lunch = item({ title: "Lunch", startsAt: at("13:00"), endsAt: at("14:00") });
const museum = item({ title: "Museum", startsAt: at("10:30"), groupItem: false, ownerId: RIYA, locationUrl: "https://maps.example/museum" });
const mine = item({ title: "ABC place", startsAt: at("15:00"), groupItem: false, visibility: "private" });

function setup(props: Partial<React.ComponentProps<typeof DayView>> = {}) {
  const onJoin = vi.fn();
  const layout = buildDay([lunch, tour, museum, mine], ME, "2026-12-01", IST);
  const utils = render(
    <DayView date="2026-12-01" tz={IST} layout={layout} people={people} viewerId={ME} goingByItem={{}} onJoin={onJoin} {...props} />,
  );
  return { onJoin, ...utils };
}

describe("DayView", () => {
  it("shows group blocks in time order with their local times", () => {
    setup();
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Old town tour", "Lunch"]);
    expect(within(screen.getByRole("region", { name: "Old town tour" })).getByText("10:00 – 12:00")).toBeInTheDocument();
  });

  it("shows a member's optional plan as a chip inside the block it falls in", () => {
    setup();
    const block = screen.getByRole("region", { name: "Old town tour" });
    expect(within(block).getByRole("button", { name: "R: Museum" })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Lunch" })).queryByRole("button")).toBeNull();
  });

  it("shows the viewer's private items muted and marked 'Only you'", () => {
    setup();
    const line = screen.getByText("ABC place").closest("div");
    expect(line).toHaveTextContent("Only you");
  });

  it("tapping a chip opens its details and 'I'm in' adds an RSVP", async () => {
    const { onJoin } = setup();
    await userEvent.click(screen.getByRole("button", { name: "R: Museum" }));
    const dialog = screen.getByRole("dialog", { name: "Museum" });
    expect(within(dialog).getByText(/Riya/)).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Open location/ })).toHaveAttribute("href", "https://maps.example/museum");
    await userEvent.click(within(dialog).getByRole("button", { name: "I'm in" }));
    expect(onJoin).toHaveBeenCalledWith(museum.id);
  });

  it("shows who is already in, and disables the button for someone who has joined", async () => {
    setup({ goingByItem: { [museum.id]: [RIYA, ME] } });
    await userEvent.click(screen.getByRole("button", { name: "R: Museum" }));
    const dialog = screen.getByRole("dialog", { name: "Museum" });
    expect(within(dialog).getByRole("button", { name: "You're in" })).toBeDisabled();
    expect(within(dialog).getByText("2 going")).toBeInTheDocument();
  });

  it("tells the viewer when nothing is planned", () => {
    setup({ layout: { blocks: [], chips: {}, privateLines: [] } });
    expect(screen.getByText("Nothing planned for this day yet.")).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
