import { tripStops } from "@hoppin/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MapFrame } from "../src/components/map/MapView";
import { TripMap } from "../src/components/map/TripMap";
import { fakeServices, item, renderApp, snapshot } from "./helpers";

vi.mock("maplibre-gl", () => {
  class LngLatBounds {
    extend() {
      return this;
    }
  }
  class Map {
    pins: HTMLElement[] = [];
    on(event: string, cb: () => void) {
      if (event === "load") queueMicrotask(cb);
      return this;
    }
    addSource() {}
    addLayer() {}
    jumpTo() {}
    easeTo() {}
    fitBounds() {}
    dragRotate = { disable() {} };
    touchZoomRotate = { disableRotation() {} };
    keyboard = { disableRotation() {} };
    remove() {
      for (const pin of this.pins) pin.remove();
    }
  }
  class Marker {
    constructor(private opts: { element: HTMLElement }) {}
    setLngLat() {
      return this;
    }
    addTo(map: Map) {
      map.pins.push(this.opts.element);
      document.body.append(this.opts.element);
      return this;
    }
  }
  return { Map, Marker, LngLatBounds, setWorkerUrl: () => {} };
});

vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("maplibre-gl/dist/maplibre-gl-worker.mjs?url", () => ({ default: "/maplibre-gl-worker.mjs" }));

const TZ = "Asia/Kolkata";
const ulu = { lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" };
const lunch = { lat: -8.5, lon: 115.2, label: "Warung" };

function plan(id: string, title: string, day: string, pin: { lat: number; lon: number; label: string } | null) {
  return item({
    id,
    title,
    startsAt: new Date(`${day}T17:00:00+05:30`).toISOString(),
    details: pin ? { place: pin } : {},
    locationUrl: pin ? "https://maps.example/stop" : null,
  });
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({}) as never);
});

afterEach(() => {
  document.querySelectorAll("[data-pin]").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("trip map", () => {
  const temple = plan("temple", "Uluwatu Temple", "2026-03-28", ulu);
  const warung = plan("lunch", "Lunch", "2026-03-29", lunch);
  const loose = plan("loose", "Somewhere", "2026-03-28", null);
  const items = [temple, warung, loose];
  const days = tripStops(items, "me", new Set(), "2026-03-28", "2026-03-29", TZ);

  function show() {
    return render(
      <MemoryRouter>
        <TripMap days={days} items={items} tripId="t1" online />
      </MemoryRouter>,
    );
  }

  it("filters pins by day and lists plans that have no place", async () => {
    const user = userEvent.setup();
    show();
    expect(await screen.findByRole("button", { name: "Start: Uluwatu Temple, 17:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day 1 · Sat 28 Mar" })).toBeInTheDocument();
    expect(screen.getByText("1 plan has no place yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Day 2 · Sun 29 Mar" }));
    expect(screen.queryByRole("button", { name: "Start: Uluwatu Temple, 17:00" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start: Lunch, 17:00" })).toBeInTheDocument();
    expect(screen.queryByText("Somewhere")).not.toBeInTheDocument();
  });

  it("links a plan with no place to the plan", async () => {
    const user = userEvent.setup();
    show();
    await user.click(screen.getByText("1 plan has no place yet"));
    expect(screen.getByRole("link", { name: "Somewhere" })).toHaveAttribute("href", "/trips/t1/items/loose");
  });

  it("invites the group to add places when nothing is placed", () => {
    const empty = tripStops([], "me", new Set(), "2026-03-28", "2026-03-29", TZ);
    render(
      <MemoryRouter>
        <TripMap days={empty} items={[]} tripId="t1" online />
      </MemoryRouter>,
    );
    expect(screen.getByText("Add places to your plans to see them here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Days" })).toHaveAttribute("href", "/trips/t1/days");
  });

  it("opens on today's stops while the trip is on, and names the next stop", async () => {
    const now = Date.parse("2026-03-28T16:00:00+05:30"); // an hour before the temple
    render(
      <MemoryRouter>
        <TripMap days={days} items={items} tripId="t1" online now={now} today="2026-03-28" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "All days" })).toHaveAttribute("aria-pressed", "false");
    const next = screen.getByRole("group", { name: "Next stop" });
    expect(next).toHaveTextContent("Next stop · in 1 h");
    expect(next).toHaveTextContent("Uluwatu Temple");
    await userEvent.click(within(next).getByRole("button", { name: "Show" }));
    expect(await screen.findByRole("dialog", { name: "Uluwatu Temple" })).toBeInTheDocument();
  });

  it("opens on every day before the trip starts, with no next-stop card once everything is over", () => {
    const after = Date.parse("2026-04-30T10:00:00+05:30");
    render(
      <MemoryRouter>
        <TripMap days={days} items={items} tripId="t1" online now={after} today="2026-04-30" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "All days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("group", { name: "Next stop" })).toBeNull();
  });

  it("opens on the day asked for, from the preview on the day plan", () => {
    render(
      <MemoryRouter>
        <TripMap days={days} items={items} tripId="t1" online initialDay="2026-03-29" now={Date.parse("2026-03-28T16:00:00+05:30")} today="2026-03-28" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("button", { name: "Day 2 · Sun 29 Mar" })).toHaveAttribute("aria-pressed", "true");
  });

  it("plays the trip from the start: every day, one after another", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <TripMap days={days} items={items} tripId="t1" online />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: "Day 2 · Sun 29 Mar" }));
    const play = screen.getByRole("button", { name: "Play the trip" });
    expect(play.parentElement?.className ?? "").not.toMatch(/overflow-hidden/);
    await user.click(play);
    expect(screen.getByRole("button", { name: "All days" })).toHaveAttribute("aria-pressed", "true");
    const pause = screen.getByRole("button", { name: "Pause" });
    expect(pause).toBeEnabled();
    await user.click(pause);
    const resume = screen.getByRole("button", { name: "Resume" });
    expect(resume).toBeEnabled();
    await user.click(resume);
    expect(screen.getByRole("button", { name: "Pause" })).toBeEnabled();
  });

  it("has nothing to play when the whole trip has a single stop", () => {
    const one = tripStops([temple], "me", new Set(), "2026-03-28", "2026-03-29", TZ);
    render(
      <MemoryRouter>
        <TripMap days={one} items={[temple]} tripId="t1" online />
      </MemoryRouter>,
    );
    expect(screen.queryByRole("button", { name: "Play the trip" })).toBeNull();
  });

  it("shows a photo in the pin when a place has one, and the plan's icon when it does not", async () => {
    render(
      <MapFrame
        online
        height={200}
        onSelect={() => {}}
        lines={[]}
        points={[
          { id: "a", lat: -8.8, lon: 115.1, title: "Uluwatu", kind: "moment", day: 0, color: "#0d22ee", photo: "https://photos.example/a-thumb.jpg" },
          { id: "b", lat: -8.7, lon: 115.2, title: "Lunch", kind: "stop", plan: "activity", order: 1, day: 0, color: "#0d22ee" },
        ]}
      />,
    );
    const withPhoto = await screen.findByRole("button", { name: /Moment: Uluwatu/ });
    await vi.waitFor(() => expect(withPhoto.querySelector("img")).toHaveAttribute("src", "https://photos.example/a-thumb.jpg"));
    const without = screen.getByRole("button", { name: /Lunch/ });
    await vi.waitFor(() => expect(without.querySelector("svg")).not.toBeNull());
    expect(without.querySelector("img")).toBeNull();
  });

  it("is one of the main tabs, not tucked away in More", async () => {
    renderApp("/trips/t1/days", fakeServices({ snapshot: snapshot({ items, documents: [] }) }).services);
    const nav = await screen.findByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Map" })).toHaveAttribute("href", "/trips/t1/map");
    expect(within(nav).queryByRole("link", { name: "Today" })).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = show();
    await screen.findByRole("button", { name: "Start: Uluwatu Temple, 17:00" });
    expect(await axe(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).toHaveNoViolations();
  });
});
