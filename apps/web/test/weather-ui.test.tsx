import type { TripDestination, TripSnapshot } from "@hoppin/core";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readPdfText } from "../src/lib/pdf-text";
import { destinationHint } from "../src/components/CreateTripForm";
import { fakeServices, renderApp, snapshot } from "./helpers";

vi.mock("../src/lib/pdf-text", () => ({ readPdfText: vi.fn(async () => "") }));

const GOA: TripDestination = { name: "Goa, India", lat: 15.49, lon: 73.83 };
const withDestination = (destination: TripDestination | null): TripSnapshot => {
  const base = snapshot();
  return { ...base, trip: { ...base.trip, destination } };
};

beforeEach(() => vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(true));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(readPdfText).mockClear();
});

describe("weather on a day", () => {
  it("shows highs and lows, the summary, the place and when it was fetched", async () => {
    const { services } = fakeServices({ snapshot: withDestination(GOA) });
    services.weather.forDay.mockResolvedValue({ status: "ok", forecast: { hi: 31, lo: 23, summary: "Partly cloudy" }, fetchedAt: Date.UTC(2026, 11, 2, 3, 35), old: false });
    renderApp("/trips/t1/days?date=2026-12-02", services);
    const weather = await screen.findByRole("region", { name: "Weather" });
    expect(weather).toHaveTextContent("31° / 23°");
    expect(weather).toHaveTextContent("Partly cloudy");
    expect(weather).toHaveTextContent("Goa, India");
    expect(weather).toHaveTextContent("Updated 09:05"); // 03:35 UTC in Kolkata
    expect(services.weather.forDay).toHaveBeenCalledWith({ lat: 15.49, lon: 73.83 }, "2026-12-02");
  });

  it("says a saved forecast is saved when it could not be refreshed", async () => {
    const { services } = fakeServices({ snapshot: withDestination(GOA) });
    services.weather.forDay.mockResolvedValue({ status: "ok", forecast: { hi: 30, lo: 22, summary: "Clear" }, fetchedAt: Date.UTC(2026, 11, 1, 3, 35), old: true });
    renderApp("/trips/t1/days?date=2026-12-02", services);
    expect(await screen.findByRole("region", { name: "Weather" })).toHaveTextContent("Saved forecast, updated 09:05");
  });

  it('days beyond the forecast say "not available yet"', async () => {
    const { services } = fakeServices({ snapshot: withDestination(GOA) });
    services.weather.forDay.mockResolvedValue({ status: "not-yet" });
    renderApp("/trips/t1/days?date=2026-12-04", services);
    expect(await screen.findByRole("region", { name: "Weather" })).toHaveTextContent("not available yet");
  });

  it("shows nothing when there is no forecast to show, and never breaks the day", async () => {
    const { services } = fakeServices({ snapshot: withDestination(GOA) });
    renderApp("/trips/t1/days?date=2026-12-02", services);
    expect(await screen.findByText("Old town tour")).toBeInTheDocument();
    await waitFor(() => expect(services.weather.forDay).toHaveBeenCalled());
    expect(screen.queryByRole("region", { name: "Weather" })).toBeNull();
  });

  it("a trip with no destination asks for no weather at all", async () => {
    const { services } = fakeServices({ snapshot: withDestination(null) });
    renderApp("/trips/t1/days?date=2026-12-02", services);
    expect(await screen.findByText("Old town tour")).toBeInTheDocument();
    expect(services.weather.forDay).not.toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: "Weather" })).toBeNull();
  });
});

describe("destination hints", () => {
  it("describes each state of the lookup", () => {
    expect(destinationHint("G", null)).toBeNull();
    expect(destinationHint("Goa", null)).toBe("Looking up…");
    expect(destinationHint("Goa", { query: "Go", result: GOA })).toBe("Looking up…");
    expect(destinationHint("Goa", { query: "Goa", result: GOA })).toBe("Weather will follow Goa, India.");
    expect(destinationHint("Goa", { query: "Goa", result: null })).toContain("Couldn't find that place");
    expect(destinationHint("Goa", { query: "Goa", result: "failed" })).toContain("Couldn't check that place");
  });
});

async function openNewTrip(services: ReturnType<typeof fakeServices>["services"]) {
  renderApp("/trips", services);
  await userEvent.click(await screen.findByRole("button", { name: "New trip" }));
  return screen.findByRole("dialog", { name: "New trip" });
}

describe("creating a trip with a destination", () => {
  it("looks the place up once typing stops and saves its coordinates with the trip", async () => {
    const { services } = fakeServices();
    services.geocoder.find.mockResolvedValue(GOA);
    const dialog = await openNewTrip(services);
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Goa 2026");
    await userEvent.type(within(dialog).getByLabelText("Destination (optional)"), "Goa");
    expect(await within(dialog).findByText("Weather will follow Goa, India.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(services.actions.createTrip).toHaveBeenCalledWith(expect.objectContaining({ name: "Goa 2026", destination: GOA })));
    expect(services.geocoder.find).toHaveBeenCalledTimes(1);
  });

  it("creates the trip without weather when the place can't be found", async () => {
    const { services } = fakeServices();
    const dialog = await openNewTrip(services);
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Somewhere");
    await userEvent.type(within(dialog).getByLabelText("Destination (optional)"), "Nowhereville");
    expect(await within(dialog).findByText(/Couldn't find that place/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(services.actions.createTrip).toHaveBeenCalledWith(expect.objectContaining({ name: "Somewhere", destination: null })));
  });

  it("creates the trip without weather when the lookup service can't be reached", async () => {
    const { services } = fakeServices();
    services.geocoder.find.mockRejectedValue(new Error("offline"));
    const dialog = await openNewTrip(services);
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Somewhere");
    await userEvent.type(within(dialog).getByLabelText("Destination (optional)"), "Goa");
    expect(await within(dialog).findByText(/Couldn't check that place/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(services.actions.createTrip).toHaveBeenCalledWith(expect.objectContaining({ destination: null })));
  });

  it("a trip with no destination typed makes no lookup", async () => {
    const { services } = fakeServices();
    const dialog = await openNewTrip(services);
    await userEvent.type(within(dialog).getByLabelText("Trip name"), "Plain");
    await userEvent.click(within(dialog).getByRole("button", { name: "Create trip" }));
    await waitFor(() => expect(services.actions.createTrip).toHaveBeenCalledWith(expect.objectContaining({ name: "Plain", destination: null })));
    expect(services.geocoder.find).not.toHaveBeenCalled();
  });
});

describe("changing the destination later", () => {
  const organizerSnapshot = () => {
    const base = withDestination(null);
    return { ...base, members: base.members.map((m) => (m.userId === "me" ? { ...m, role: "organizer" as const } : m)) };
  };

  it("an organizer can set it from More", async () => {
    const { services } = fakeServices({ snapshot: organizerSnapshot() });
    services.geocoder.find.mockResolvedValue(GOA);
    renderApp("/trips/t1/more", services);
    await userEvent.type(await screen.findByLabelText("Where is the trip?"), "Goa");
    await userEvent.click(screen.getByRole("button", { name: "Save destination" }));
    await waitFor(() => expect(services.actions.setTripDestination).toHaveBeenCalledWith("t1", GOA));
    expect(await screen.findByText("Weather will follow Goa, India.")).toBeInTheDocument();
  });

  it("explains when the place can't be found and saves nothing", async () => {
    const { services } = fakeServices({ snapshot: organizerSnapshot() });
    renderApp("/trips/t1/more", services);
    await userEvent.type(await screen.findByLabelText("Where is the trip?"), "Nowhereville");
    await userEvent.click(screen.getByRole("button", { name: "Save destination" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't find that place");
    expect(services.actions.setTripDestination).not.toHaveBeenCalled();
  });

  it("clearing it removes the weather", async () => {
    const base = organizerSnapshot();
    const { services } = fakeServices({ snapshot: { ...base, trip: { ...base.trip, destination: GOA } } });
    renderApp("/trips/t1/more", services);
    const field = await screen.findByLabelText("Where is the trip?");
    expect(field).toHaveValue("Goa, India");
    await userEvent.clear(field);
    await userEvent.click(screen.getByRole("button", { name: "Save destination" }));
    await waitFor(() => expect(services.actions.setTripDestination).toHaveBeenCalledWith("t1", null));
  });

  it("members who are not organizers do not see it", async () => {
    const { services } = fakeServices({ snapshot: withDestination(GOA) });
    renderApp("/trips/t1/more", services);
    expect(await screen.findByRole("heading", { name: "This trip" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Where is the trip?")).toBeNull();
  });
});
