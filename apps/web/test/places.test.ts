import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoPlaces, createPhotonPlaces } from "../src/providers/places";

const photon = {
  features: [
    {
      geometry: { coordinates: [115.0849, -8.8291] },
      properties: { name: "Uluwatu Temple", city: "Pecatu", state: "Bali", country: "Indonesia" },
    },
    { geometry: { coordinates: [null, null] }, properties: { name: "Broken" } },
  ],
};

function json(body: unknown): Response {
  return { ok: true, json: async () => body } as Response;
}

afterEach(() => vi.restoreAllMocks());

describe("createPhotonPlaces", () => {
  it("builds the search URL, with a bias when a nearby point is given", async () => {
    const fetch = vi.fn(async (_url: string) => json(photon));
    const places = createPhotonPlaces({ fetch, online: () => true });
    const plain = await places.searchPlaces("Ulu");
    expect(plain).toEqual({
      status: "ok",
      results: [{ place: { lat: -8.8291, lon: 115.0849, label: "Uluwatu Temple" }, detail: "Pecatu, Bali, Indonesia" }],
    });
    expect(String(fetch.mock.calls[0]?.[0])).toBe("https://photon.komoot.io/api/?q=Ulu&limit=6&lang=en");
    await places.searchPlaces("Ubud temple", { near: { lat: -8.5, lon: 115.2 } });
    expect(String(fetch.mock.calls[1]?.[0])).toContain("lat=-8.5");
    expect(String(fetch.mock.calls[1]?.[0])).toContain("lon=115.2");
  });

  it("does not call the network for a short query, when offline, or twice for the same query", async () => {
    const fetch = vi.fn(async (_url: string) => json(photon));
    const places = createPhotonPlaces({ fetch, online: () => true });
    expect(await places.searchPlaces("Ul")).toEqual({ status: "ok", results: [] });
    expect(fetch).not.toHaveBeenCalled();
    const offline = createPhotonPlaces({ fetch, online: () => false });
    expect(await offline.searchPlaces("Uluwatu")).toEqual({ status: "offline" });
    expect(fetch).not.toHaveBeenCalled();
    const again = createPhotonPlaces({ fetch, online: () => true });
    await again.searchPlaces("Ulu");
    await again.searchPlaces(" ulu ");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a failed request, and lets an abort through", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("down");
    });
    const places = createPhotonPlaces({ fetch, online: () => true });
    expect(await places.searchPlaces("Uluwatu")).toEqual({ status: "failed" });

    const aborting = vi.fn((_url: string, init?: RequestInit) => {
      init?.signal?.addEventListener("abort", () => {});
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      });
    });
    const live = createPhotonPlaces({ fetch: aborting, online: () => true, timeoutMs: 60_000 });
    const controller = new AbortController();
    const pending = live.searchPlaces("Uluwatu", { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("createDemoPlaces", () => {
  it("uses a live result, and the sample list when the live search is empty or offline", async () => {
    const panaji = { place: { lat: 15.49, lon: 73.83, label: "Panaji" }, detail: "Goa, India" };
    const live = {
      searchPlaces: vi.fn()
        .mockResolvedValueOnce({ status: "ok", results: [panaji] })
        .mockResolvedValueOnce({ status: "offline" }),
      reversePlace: vi.fn(async () => null),
    };
    const places = createDemoPlaces(live);
    expect(await places.searchPlaces("Panaji")).toEqual({ status: "ok", results: [panaji] });
    const fallback = await places.searchPlaces("Uluwatu Temple");
    expect(fallback).toMatchObject({ status: "ok", results: [expect.objectContaining({ place: expect.objectContaining({ label: "Uluwatu" }) })] });
  });
});
