import { describe, expect, it } from "vitest";
import { distanceKm, isValidPlace, itemPlace, placeFromUrl, roundPlace } from "../src/place";

const ulu = { lat: -8.8291, lon: 115.0849 };

describe("placeFromUrl", () => {
  it("reads a Google place link, including the name", () => {
    expect(placeFromUrl("https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z/data=...")).toEqual({
      ...ulu,
      label: "Uluwatu Temple",
    });
  });

  it("prefers the pin (!3d!4d) over the map centre (@)", () => {
    const url = "https://www.google.com/maps/place/X/@1.0000,2.0000,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d-8.8291!4d115.0849";
    expect(placeFromUrl(url)).toEqual({ ...ulu, label: "X" });
  });

  it("reads coordinate query parameters", () => {
    expect(placeFromUrl("https://www.google.com/maps?q=-8.8291,115.0849")).toEqual(ulu);
    expect(placeFromUrl("https://www.google.com/maps?ll=-8.8291,115.0849")).toEqual(ulu);
    expect(placeFromUrl("https://www.google.com/maps?query=-8.8291,115.0849")).toEqual(ulu);
    expect(placeFromUrl("https://www.google.com/maps?destination=-8.8291,115.0849")).toEqual(ulu);
    expect(placeFromUrl("https://www.google.com/maps?sll=-8.8291,115.0849")).toEqual(ulu);
  });

  it("reads an Apple maps link and keeps a name that is not coordinates", () => {
    expect(placeFromUrl("https://maps.apple.com/?ll=-8.8291,115.0849&q=Name")).toEqual({ ...ulu, label: "Name" });
    expect(placeFromUrl("https://maps.apple.com/?ll=-8.8291,115.0849&q=-8.8291,115.0849")).toEqual(ulu);
  });

  it("reads OpenStreetMap links", () => {
    expect(placeFromUrl("https://www.openstreetmap.org/?mlat=-8.8291&mlon=115.0849")).toEqual(ulu);
    expect(placeFromUrl("https://www.openstreetmap.org/#map=17/-8.8291/115.0849")).toEqual(ulu);
  });

  it("reads a geo link", () => {
    expect(placeFromUrl("geo:-8.8291,115.0849")).toEqual(ulu);
  });

  it("returns null for short links and junk, and never throws", () => {
    expect(placeFromUrl("https://maps.app.goo.gl/abc")).toBeNull();
    expect(placeFromUrl("https://goo.gl/maps/abc")).toBeNull();
    expect(placeFromUrl("not a url")).toBeNull();
    expect(placeFromUrl("")).toBeNull();
    expect(placeFromUrl("javascript:alert(1)")).toBeNull();
    expect(placeFromUrl("x".repeat(10_000))).toBeNull();
  });
});

describe("place validity", () => {
  it("rejects anything off the earth and the empty pin", () => {
    expect(isValidPlace({ lat: -8.8291, lon: 115.0849 })).toBe(true);
    expect(isValidPlace({ lat: 91, lon: 0 })).toBe(false);
    expect(isValidPlace({ lat: 0, lon: 181 })).toBe(false);
    expect(isValidPlace({ lat: 0, lon: 0 })).toBe(false);
    expect(isValidPlace({ lat: Number.NaN, lon: 1 })).toBe(false);
    expect(isValidPlace(null)).toBe(false);
  });

  it("rounds to 6 decimals when storing", () => {
    expect(roundPlace({ lat: -8.82910049, lon: 115.08490049, label: "  Uluwatu  " })).toEqual({
      lat: -8.8291,
      lon: 115.0849,
      label: "Uluwatu",
    });
  });
});

describe("itemPlace", () => {
  it("uses a saved place, and otherwise reads the map link", () => {
    expect(itemPlace({ details: { place: { lat: 1.5, lon: 2.5, label: "Saved" } }, locationUrl: "https://www.google.com/maps?q=9,9" })).toEqual({
      lat: 1.5,
      lon: 2.5,
      label: "Saved",
    });
    expect(itemPlace({ details: {}, locationUrl: "https://www.google.com/maps/place/Uluwatu+Temple/@-8.8291,115.0849,17z" })).toEqual({
      ...ulu,
      label: "Uluwatu Temple",
    });
    expect(itemPlace({ details: { place: { lat: 0, lon: 0 } }, locationUrl: null })).toBeNull();
  });
});

describe("distanceKm", () => {
  it("is zero at one place and about 111 km per degree of latitude", () => {
    expect(distanceKm(ulu, ulu)).toBe(0);
    expect(distanceKm({ lat: 0, lon: 10 }, { lat: 1, lon: 10 })).toBeGreaterThan(110);
    expect(distanceKm({ lat: 0, lon: 10 }, { lat: 1, lon: 10 })).toBeLessThan(112);
  });
});
