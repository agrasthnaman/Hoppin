import { buildDay, type Item, type Poll, type Vote } from "@hoppin/core";
import { render, screen, waitFor, within } from "@testing-library/react";
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
const museum = item({
  title: "Museum",
  startsAt: at("10:30"),
  groupItem: false,
  ownerId: RIYA,
  locationUrl: "https://maps.example/museum",
  details: { notes: "Meet at the gate" },
});
const mine = item({ title: "ABC place", startsAt: at("15:00"), groupItem: false, visibility: "private" });

function setup(props: Partial<React.ComponentProps<typeof DayView>> = {}) {
  const onJoin = vi.fn();
  const onLeave = vi.fn();
  const layout = buildDay([lunch, tour, museum, mine], ME, "2026-12-01", IST);
  const utils = render(
    <DayView date="2026-12-01" tz={IST} layout={layout} people={people} viewerId={ME} goingByItem={{}} onJoin={onJoin} onLeave={onLeave} {...props} />,
  );
  return { onJoin, onLeave, ...utils };
}

describe("DayView", () => {
  it("shows group blocks in time order with their local times", () => {
    setup();
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Old town tour", "Museum", "Lunch"]);
    expect(within(screen.getByRole("region", { name: "Old town tour" })).getByText("10:00 – 12:00")).toBeInTheDocument();
  });

  it("shows an optional plan as its own card, with a way to join", () => {
    setup();
    const tourBlock = screen.getByRole("region", { name: "Old town tour" });
    expect(within(tourBlock).queryByText("Museum")).toBeNull();
    const card = screen.getByRole("region", { name: "Museum" });
    expect(within(card).getByRole("button", { name: "Join Museum" })).toBeEnabled();
  });

  it("shows a loader from the click until the trip shows you as in", async () => {
    let resolveJoin: () => void = () => {};
    const onJoin = vi.fn(() => new Promise<void>((done) => { resolveJoin = done; }));
    const view = (going: Record<string, string[]> = {}) => (
      <DayView date="2026-12-01" tz={IST} layout={buildDay([lunch, tour, museum, mine], ME, "2026-12-01", IST)} people={people} viewerId={ME} goingByItem={going} onJoin={onJoin} onLeave={vi.fn()} />
    );
    const { rerender } = render(view());
    await userEvent.click(screen.getByRole("button", { name: "Join Museum" }));
    const joining = screen.getByRole("button", { name: "Joining Museum" });
    expect(joining).toHaveAttribute("aria-busy", "true");
    expect(joining).toBeDisabled();
    resolveJoin();
    await waitFor(() => expect(onJoin).toHaveBeenCalledWith(museum.id));
    expect(screen.getByRole("button", { name: "Joining Museum" })).toBeDisabled();
    rerender(view({ [museum.id]: [ME] }));
    expect(screen.getByRole("button", { name: "Opt out of Museum" })).toBeEnabled();
  });

  it("joining from the card saves an RSVP without opening the plan", async () => {
    const { onJoin } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Join Museum" }));
    expect(onJoin).toHaveBeenCalledWith(museum.id);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the viewer's private items muted and marked 'Only you'", () => {
    setup();
    const line = screen.getByText("ABC place").closest("div");
    expect(line).toHaveTextContent("Only you");
  });

  it("opening an optional card shows the notes, the map, and who joined", async () => {
    const { onJoin, onLeave } = setup({ goingByItem: { [museum.id]: [RIYA, ME] } });
    const card = screen.getByRole("region", { name: "Museum" });
    expect(within(card).getByText("You're in")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Museum" }));
    const dialog = screen.getByRole("dialog", { name: "Museum" });
    expect(within(dialog).getByText("Meet at the gate")).toBeInTheDocument();
    expect(within(dialog).getByText(/Added by Riya/)).toBeInTheDocument();
    const joined = within(dialog).getByRole("list", { name: "Who joined" });
    expect(within(joined).getByText("Riya")).toBeInTheDocument();
    expect(within(joined).getByText("Aman")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: /Get directions/ })).toHaveAttribute("href", "https://maps.example/museum");
    await userEvent.click(within(dialog).getByRole("button", { name: "Opt out" }));
    expect(onLeave).toHaveBeenCalledWith(museum.id);
    expect(within(dialog).getByRole("button", { name: "Leaving Museum" })).toHaveAttribute("aria-busy", "true");
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("stacks who joined on the card, and counts the faces that do not fit", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `p${i}`);
    const crowd = Object.fromEntries(ids.map((id, i) => [id, { name: `Person ${i + 1}`, color: "#334155" }]));
    setup({ people: { ...people, ...crowd }, goingByItem: { [museum.id]: ids } });
    const card = screen.getByRole("region", { name: "Museum" });
    const pile = within(card).getByRole("group", { name: "10 going" });
    expect(within(pile).getAllByRole("img")).toHaveLength(4);
    expect(within(pile).getByText("+6")).toBeInTheDocument();
    expect(within(pile).queryByRole("img", { name: "Person 5" })).toBeNull();
  });

  it("shows every face on the card when only a few people joined", () => {
    setup({ goingByItem: { [museum.id]: [RIYA, ME] } });
    const pile = within(screen.getByRole("region", { name: "Museum" })).getByRole("group", { name: "2 going" });
    expect(within(pile).getByRole("img", { name: "Riya" })).toBeInTheDocument();
    expect(within(pile).getByRole("img", { name: "Aman" })).toBeInTheDocument();
    expect(within(pile).queryByText(/^\+/)).toBeNull();
  });

  it("keeps delete beside edit in the plan sheet", async () => {
    setup({ onEdit: vi.fn(), onRemove: vi.fn(), canEditItem: () => true });
    await userEvent.click(screen.getByRole("button", { name: "Open Museum" }));
    const dialog = screen.getByRole("dialog", { name: "Museum" });
    const edit = within(dialog).getByRole("button", { name: "Edit plan" });
    const bin = within(dialog).getByRole("button", { name: "Delete Museum" });
    const row = edit.parentElement;
    expect(row).toBe(bin.parentElement);
    expect(row?.children).toHaveLength(2);
    expect(within(dialog).getByRole("button", { name: "I'm in" }).parentElement).not.toBe(row);
  });

  it("opening a card nobody has joined yet says so, and I'm in joins from there", async () => {
    const { onJoin } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Open Museum" }));
    const dialog = screen.getByRole("dialog", { name: "Museum" });
    expect(within(dialog).getByText("No one yet")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "I'm in" }));
    expect(onJoin).toHaveBeenCalledWith(museum.id);
  });

  it("tells the viewer when nothing is planned", () => {
    setup({ layout: { blocks: [], chips: {}, privateLines: [] } });
    expect(screen.getByText("Nothing planned for this day yet.")).toBeInTheDocument();
  });

  it("spotlights one plan with the big colour block, and the rest stay plain", () => {
    setup({ highlightId: tour.id });
    expect(screen.getByRole("region", { name: "Old town tour" }).firstElementChild).toHaveClass("bg-hero");
    expect(screen.getByRole("region", { name: "Lunch" }).firstElementChild).not.toHaveClass("bg-hero");
  });

  it("has no accessibility violations", async () => {
    const { container } = setup();
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});

describe("DayView cards", () => {
  const stay = item({
    title: "Alaya Resort Ubud",
    kind: "stay",
    startsAt: at("12:30"),
    endsAt: new Date("2026-12-04T11:00:00+05:30").toISOString(),
    locationUrl: "https://maps.example/alaya",
  });
  const show = (date: string, items: Item[]) => {
    const layout = buildDay(items, ME, date, IST);
    return render(<DayView date={date} tz={IST} layout={layout} people={people} viewerId={ME} goingByItem={{}} onJoin={vi.fn()} onLeave={vi.fn()} />);
  };

  it("pins the stay at the top of the day in its own colour, ahead of the plans", () => {
    show("2026-12-01", [lunch, tour, stay]);
    const regions = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regions).toEqual(["Alaya Resort Ubud", "Old town tour", "Lunch"]);
    expect(screen.getByRole("region", { name: "Alaya Resort Ubud" }).firstElementChild).toHaveClass("bg-info-bg");
    expect(within(screen.getByRole("region", { name: "Alaya Resort Ubud" })).getByText("Where you're staying")).toBeInTheDocument();
  });

  it("the stay says check-in on the first day, which night it is in between, and check-out on the last", () => {
    const { unmount } = show("2026-12-01", [stay]);
    expect(screen.getByText("Check-in 12:30")).toBeInTheDocument();
    unmount();
    const second = show("2026-12-02", [stay]);
    expect(screen.getByText("Night 2 of 3")).toBeInTheDocument();
    second.unmount();
    show("2026-12-04", [stay]);
    expect(screen.getByText("Check-out 11:00")).toBeInTheDocument();
  });

  it("a card with a map link has Get directions on it, without opening the plan", () => {
    show("2026-12-01", [lunch, tour, stay]);
    expect(within(screen.getByRole("region", { name: "Old town tour" })).getByRole("link", { name: "Get directions to Old town tour" })).toHaveAttribute("href", "https://maps.example/old-town");
    expect(within(screen.getByRole("region", { name: "Alaya Resort Ubud" })).getByRole("link", { name: "Get directions to Alaya Resort Ubud" })).toHaveAttribute("href", "https://maps.example/alaya");
    expect(within(screen.getByRole("region", { name: "Lunch" })).queryByRole("link", { name: /Get directions/ })).toBeNull();
  });

  it("a plan that came from a poll shows each option's votes", () => {
    const beach: Poll = {
      id: "p1",
      tripId: "t1",
      createdBy: ME,
      question: "Which beach?",
      multiple: false,
      closed: false,
      createdAt: "2026-12-01T00:00:00.000Z",
      options: [
        { id: "a", label: "Baga" },
        { id: "b", label: "Palolem" },
      ],
    };
    const votes: Vote[] = [
      { pollId: "p1", optionId: "b", userId: ME },
      { pollId: "p1", optionId: "b", userId: RIYA },
      { pollId: "p1", optionId: "a", userId: "org" },
    ];
    const plan = item({ title: "Palolem", startsAt: at("16:00"), details: { notes: "Which beach?", pollId: "p1" } });
    const layout = buildDay([plan], ME, "2026-12-01", IST);
    render(<DayView date="2026-12-01" tz={IST} layout={layout} people={people} viewerId={ME} goingByItem={{}} onJoin={vi.fn()} onLeave={vi.fn()} polls={[beach]} votes={votes} />);
    const card = screen.getByRole("region", { name: "Palolem" });
    expect(within(card).getByText("Poll")).toBeInTheDocument();
    expect(within(card).getByText("Which beach?")).toBeInTheDocument();
    expect(within(card).getAllByText("Palolem").length).toBeGreaterThan(0);
    expect(within(card).getByText("2 votes")).toBeInTheDocument();
    expect(within(card).getByText("Baga")).toBeInTheDocument();
    expect(within(card).getByText("1 vote")).toBeInTheDocument();
    expect(within(card).queryByText("Activity")).toBeNull();
  });

  it("every card names its kind with an icon tag", () => {
    const flight = item({ title: "DPS to SIN", kind: "flight", startsAt: at("18:00") });
    const ferry = item({ title: "Fast boat", kind: "transport", startsAt: at("09:00") });
    show("2026-12-01", [flight, ferry, tour]);
    expect(within(screen.getByRole("region", { name: "DPS to SIN" })).getByText("Flight")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Fast boat" })).getByText("Transport")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Old town tour" })).getByText("Activity")).toBeInTheDocument();
  });

  it("has no accessibility violations with a stay, flight and directions on the page", async () => {
    const { container } = show("2026-12-02", [stay, tour, item({ title: "DPS to SIN", kind: "flight", startsAt: at("18:00") })]);
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
