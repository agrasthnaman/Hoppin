import type { Place } from "@hoppin/core";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlacePicker } from "../src/components/PlacePicker";
import type { PlaceHit, PlaceSearch, PlacesApi } from "../src/providers/places";

const uluwatu: PlaceHit = { place: { lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" }, detail: "Bali, Indonesia" };
const ubud: PlaceHit = { place: { lat: -8.5069, lon: 115.2625, label: "Ubud" }, detail: "Bali, Indonesia" };

function placesOf(search: (query: string) => Promise<PlaceSearch>): PlacesApi {
  return { searchPlaces: vi.fn(async (query) => search(query)), reversePlace: vi.fn(async () => null) };
}

function Harness({ places, initialUrl = "" }: { places: PlacesApi | null; initialUrl?: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [generated, setGenerated] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  return (
    <>
      <label>
        Location link
        <input value={url} onChange={(event) => { setUrl(event.target.value); setGenerated(false); }} />
      </label>
      <PlacePicker
        locationUrl={url}
        place={place}
        generated={generated}
        places={places}
        onPlace={setPlace}
        onLocationUrl={(next, made) => { setUrl(next); setGenerated(made); }}
      />
    </>
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe("PlacePicker", () => {
  it("fills the place from a pasted map link without searching", async () => {
    const places = placesOf(async () => ({ status: "ok", results: [] }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness places={places} />);
    await user.type(screen.getByLabelText("Location link"), "https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z");
    expect(screen.getByText("Uluwatu Temple")).toBeInTheDocument();
    expect(screen.getByText(/From your map link/)).toHaveTextContent("-8.8291, 115.0849");
    expect(places.searchPlaces).not.toHaveBeenCalled();
  });

  it("searches after a pause and chooses with the keyboard", async () => {
    const places = placesOf(async () => ({ status: "ok", results: [uluwatu, ubud] }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness places={places} />);
    await user.type(screen.getByLabelText("Find a place"), "Ulu");
    expect(places.searchPlaces).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(places.searchPlaces).toHaveBeenCalledWith("Ulu", expect.anything());
    expect(screen.getByRole("option", { name: /Uluwatu Temple/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Search by Photon · © OpenStreetMap contributors")).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByLabelText("Location link")).toHaveValue("https://www.google.com/maps/search/?api=1&query=-8.5069,115.2625");
    expect(screen.getByText("Ubud")).toBeInTheDocument();
  });

  it("does not replace a map link the person typed", async () => {
    const places = placesOf(async () => ({ status: "ok", results: [uluwatu] }));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness places={places} initialUrl="https://maps.example/museum" />);
    await user.type(screen.getByLabelText("Find a place"), "Ulu");
    await act(() => vi.advanceTimersByTimeAsync(500));
    await user.click(screen.getByRole("option", { name: /Uluwatu Temple/ }));
    expect(screen.getByLabelText("Location link")).toHaveValue("https://maps.example/museum");
  });

  it("removes the place and leaves the map link", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Harness places={null} initialUrl="https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z" />);
    expect(await screen.findByText("Uluwatu Temple")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Location link")).toHaveValue("https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z");
  });

  it("explains when search cannot run", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const offline = placesOf(async () => ({ status: "offline" }));
    const { unmount } = render(<Harness places={offline} />);
    await user.type(screen.getByLabelText("Find a place"), "Ubud");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByText("Search needs a connection. You can paste a map link instead.")).toBeInTheDocument();
    unmount();

    const failed = placesOf(async () => ({ status: "failed" }));
    const second = render(<Harness places={failed} />);
    await user.type(screen.getByLabelText("Find a place"), "Ubud");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByText("Couldn't search just now. You can paste a map link instead.")).toBeInTheDocument();
    second.unmount();

    const empty = placesOf(async () => ({ status: "ok", results: [] }));
    render(<Harness places={empty} />);
    await user.type(screen.getByLabelText("Find a place"), "Zzz");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(screen.getByText("Nothing found. Try a nearby town or paste a map link.")).toBeInTheDocument();
  });

  it("opens a short map link and fills the place", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const full = "https://www.google.com/maps/place/Calangute+Beach/@15.5439,73.7553,17z";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ url: full }) })));
    render(<Harness places={null} />);
    await user.type(screen.getByLabelText("Location link"), "https://maps.app.goo.gl/6mNLXEN6ewQYKyRe8");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(await screen.findByText("Calangute Beach")).toBeInTheDocument();
    expect(screen.getByLabelText("Location link")).toHaveValue(full);
    vi.unstubAllGlobals();
  });

  it("has no axe violations", async () => {
    const places = placesOf(async () => ({ status: "ok", results: [uluwatu] }));
    const { container } = render(<Harness places={places} initialUrl="https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z" />);
    expect(await axe(container, { rules: { "color-contrast": { enabled: false } } })).toHaveNoViolations();
  });
});
