import { dayStops, type Item } from "@hoppin/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayGlance } from "../src/components/map/DayGlance";
import { DayMap } from "../src/components/map/DayMap";
import { fitPadding, MAP_NOTICE } from "../src/components/map/MapView";
import { fakeServices, item, renderApp, snapshot } from "./helpers";

const mapMock = vi.hoisted(() => ({
  maps: 0,
  fitBounds: vi.fn(),
  jumpTo: vi.fn(),
  options: {} as { center?: [number, number]; zoom?: number },
  emitError: false,
}));

vi.mock("maplibre-gl", () => {
  class LngLatBounds {
    extend() {
      return this;
    }
  }
  class Map {
    pins: HTMLElement[] = [];
    constructor(options: { center?: [number, number]; zoom?: number }) {
      mapMock.maps += 1;
      mapMock.options = options;
    }
    on(event: string, cb: (event?: { error?: Error }) => void) {
      if (event === "load" && !mapMock.emitError) queueMicrotask(cb);
      if (event === "error" && mapMock.emitError) cb({ error: new Error("Worker failed to load. Check that the worker URL is correct.") });
      return this;
    }
    addSource() {}
    addLayer() {}
    easeTo() {}
    jumpTo(camera: unknown) {
      mapMock.jumpTo(camera);
    }
    fitBounds(...args: unknown[]) {
      mapMock.fitBounds(...args);
    }
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

const place = { lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" };
const at = "2026-12-02T11:30:00.000Z";

function placed(over: Partial<Item> = {}): Item {
  return item({ id: "temple", title: "Uluwatu Temple", startsAt: at, details: { place }, locationUrl: "https://maps.example/uluwatu", ...over });
}

function renderDay(items: Item[], online = true) {
  const day = dayStops(items, "me", new Set(), "2026-12-02", "Asia/Kolkata");
  return render(
    <MemoryRouter>
      <DayMap day={day} dayIndex={1} tripId="t1" online={online} items={items} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mapMock.maps = 0;
  mapMock.emitError = false;
  mapMock.fitBounds.mockClear();
  mapMock.jumpTo.mockClear();
  localStorage.clear();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => ({}) as never);
});

afterEach(() => {
  document.querySelectorAll("[data-pin]").forEach((node) => node.remove());
  vi.restoreAllMocks();
});

describe("a day on the map", () => {
  it("names each pin and opens the plan from it", async () => {
    const user = userEvent.setup();
    const second = item({
      id: "lunch",
      title: "Lunch",
      startsAt: "2026-12-02T07:30:00.000Z",
      details: { place: { lat: -8.5, lon: 115.2, label: "Warung" } },
      locationUrl: "https://maps.example/lunch",
    });
    renderDay([second, placed()]);
    const pin = await screen.findByRole("button", { name: "Stop 2: Uluwatu Temple, 17:00" });
    expect(screen.getByRole("button", { name: "Start: Lunch, 13:00" })).toBeInTheDocument();
    expect(mapMock.fitBounds).toHaveBeenCalledWith(expect.anything(), { padding: { top: 112, right: 48, bottom: 48, left: 48 }, maxZoom: 15, duration: 0 });
    await user.hover(pin);
    await user.click(pin);
    expect(mapMock.maps).toBe(1);
    const card = pin.closest(".map-marker");
    expect(card).toHaveAttribute("data-open", "true");
    expect(card).toHaveTextContent("Stop 2");
    expect(card).toHaveTextContent("Activity");
    expect(card).toHaveTextContent("Uluwatu Temple");
    expect(card).toHaveTextContent("17:00");
    expect(within(card as HTMLElement).getByRole("link", { name: "Get directions" })).toHaveAttribute("href", "https://maps.example/uluwatu");
    expect(within(card as HTMLElement).getByRole("link", { name: "Open plan" })).toHaveAttribute("href", "/trips/t1/items/temple");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("drops a pin with that plan's icon on each place", async () => {
    renderDay([placed({ kind: "flight" })]);
    const pin = await screen.findByRole("button", { name: "Start: Uluwatu Temple, 17:00" });
    expect(pin).toHaveAttribute("data-pin-icon", "flight");
    expect(pin.querySelector(".map-pin-shape")).not.toBeNull();
  });

  it("zooms a single pin in close", async () => {
    renderDay([placed()]);
    await screen.findByRole("button", { name: "Start: Uluwatu Temple, 17:00" });
    expect(mapMock.options).toMatchObject({ center: [115.0849, -8.8291], zoom: 14 });
    expect(mapMock.jumpTo).toHaveBeenCalledWith({ center: [115.0849, -8.8291], zoom: 14 });
  });

  it("explains when the map cannot be drawn and still lists the stop", async () => {
    renderDay([placed()], false);
    expect(await screen.findByText(MAP_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Uluwatu Temple/ })).toBeInTheDocument();
    expect(mapMock.maps).toBe(0);
  });

  it("shows the same note when the tiles fail", async () => {
    mapMock.emitError = true;
    renderDay([placed()]);
    expect(await screen.findByText(MAP_NOTICE)).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderDay([placed()]);
    await screen.findByRole("button", { name: "Start: Uluwatu Temple, 17:00" });
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});

describe("the list and map switch", () => {
  it("is hidden when the day has no places", async () => {
    renderApp("/trips/t1/days?date=2026-12-02", fakeServices().services);
    expect(await screen.findByRole("button", { name: "Add plan" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Map" })).not.toBeInTheDocument();
  });

  it("remembers the choice on this device", async () => {
    const user = userEvent.setup();
    const services = fakeServices({ snapshot: snapshot({ items: [placed()], documents: [] }) }).services;
    renderApp("/trips/t1/days?date=2026-12-02", services);
    const map = await screen.findByRole("button", { name: "Map" });
    expect(map).toHaveAttribute("aria-pressed", "false");
    await user.click(map);
    expect(map).toHaveAttribute("aria-pressed", "true");
    expect(localStorage.getItem("hoppin.plan-view")).toBe("map");
  });
});

describe("the map glance on the day plan", () => {
  it("shows a small look at the route that opens the Map tab on this day", async () => {
    const services = fakeServices({ snapshot: snapshot({ items: [placed()], documents: [] }) }).services;
    renderApp("/trips/t1/days?date=2026-12-02", services);
    const glance = await screen.findByRole("link", { name: "Open the map for this day. 1 stop" });
    expect(glance).toHaveAttribute("href", "/trips/t1/map?day=2026-12-02");
    expect(glance).toHaveTextContent("Open map");
    // It only looks: the pins in it cannot be tapped or tabbed to.
    expect(within(glance).queryByRole("button")).toBeNull();
  });

  it("is not there on a day with no places", async () => {
    renderApp("/trips/t1/days?date=2026-12-02", fakeServices().services);
    await screen.findByRole("button", { name: "Add plan" });
    expect(screen.queryByRole("link", { name: /Open the map for this day/ })).toBeNull();
  });

  it("shows the stops as a ribbon when there is no connection", () => {
    const second = placed({ id: "lunch", title: "Lunch", startsAt: "2026-12-02T07:30:00.000Z" });
    const day = dayStops([second, placed()], "me", new Set(), "2026-12-02", "Asia/Kolkata");
    render(
      <MemoryRouter>
        <DayGlance day={day} dayIndex={1} tripId="t1" online={false} />
      </MemoryRouter>,
    );
    const glance = screen.getByRole("link", { name: "Open the map for this day. 2 stops" });
    expect(glance).toHaveTextContent("Lunch → Uluwatu Temple");
    expect(mapMock.maps).toBe(0);
  });
});

describe("fitting a small map to its pins", () => {
  it("leaves little room round the pins in a short preview, so it does not zoom out to the whole world", () => {
    expect(fitPadding(false, 176)).toEqual({ top: 24, right: 24, bottom: 24, left: 24 });
  });

  it("keeps room for a pin's note on a full map, but never more than half of a short one", () => {
    expect(fitPadding(true, null)).toEqual({ top: 112, right: 48, bottom: 48, left: 48 });
    expect(fitPadding(true, 320)).toEqual({ top: 112, right: 48, bottom: 48, left: 48 });
    const short = fitPadding(true, 200);
    expect(short.top + short.bottom).toBeLessThanOrEqual(100);
  });

  it("the day preview fits its two far-apart stops with the small padding", async () => {
    const first = placed({ id: "flight", title: "SQ-511 BLR to SIN", kind: "flight", startsAt: "2026-12-02T01:00:00.000Z", details: { place: { lat: 12.95, lon: 77.67, label: "Bengaluru" } } });
    const day = dayStops([first, placed()], "me", new Set(), "2026-12-02", "Asia/Kolkata");
    mapMock.fitBounds.mockClear();
    render(
      <MemoryRouter>
        <DayGlance day={day} dayIndex={0} tripId="t1" online />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: /Open the map for this day/ });
    await vi.waitFor(() => expect(mapMock.fitBounds).toHaveBeenCalled());
    expect(mapMock.fitBounds).toHaveBeenCalledWith(expect.anything(), { padding: { top: 24, right: 24, bottom: 24, left: 24 }, maxZoom: 15, duration: 0 });
  });
});
