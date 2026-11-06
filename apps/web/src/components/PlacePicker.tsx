import { placeFromUrl, type Place } from "@hoppin/core";
import { expandMapLink, isShortMapLink } from "../lib/expand-map-link";
import { MapPin } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { PlaceHit, PlacesApi } from "../providers/places";
import { Banner } from "./ui/Banner";

const MAPS = "https://www.google.com/maps/search/?api=1&query=";

export interface PlacePickerProps {
  locationUrl: string;
  place: Place | null;
  /** The map link was filled by choosing a search result, so another choice may replace it. */
  generated: boolean;
  places: PlacesApi | null;
  near?: { lat: number; lon: number } | null;
  onPlace: (place: Place | null) => void;
  onLocationUrl: (url: string, generated: boolean) => void;
}

function mapsLink(place: Place): string {
  return `${MAPS}${place.lat},${place.lon}`;
}

/** A place on a plan: filled from a map link, or found by search. */
export function PlacePicker({ locationUrl, place, generated, places, near, onPlace, onLocationUrl }: PlacePickerProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [openingLink, setOpeningLink] = useState(false);
  const fromLink = !generated && placeFromUrl(locationUrl);
  const shortLink = isShortMapLink(locationUrl);
  const filledFrom = useRef<string | null>(null);
  const opened = useRef(new Set<string>());
  const setUrl = useRef(onLocationUrl);
  setUrl.current = onLocationUrl;

  useEffect(() => {
    const found = placeFromUrl(locationUrl);
    if (!found) {
      filledFrom.current = null;
      return;
    }
    // Removing the place keeps the link. The same link does not put the place back.
    if (filledFrom.current === locationUrl) return;
    filledFrom.current = locationUrl;
    if (place && place.lat === found.lat && place.lon === found.lon) return;
    onPlace(found);
  }, [locationUrl, onPlace, place]);

  useEffect(() => {
    const url = locationUrl.trim();
    if (!isShortMapLink(url) || opened.current.has(url)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setOpeningLink(true);
      expandMapLink(url).then((long) => {
        if (cancelled) return;
        opened.current.add(url);
        setOpeningLink(false);
        const found = long ? placeFromUrl(long) : null;
        if (long && found) setUrl.current(long, false);
      });
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locationUrl]);

  useEffect(() => {
    const text = query.trim();
    if (!places || text.length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      places.searchPlaces(text, { ...(near ? { near } : {}), signal: controller.signal }).then(
        (result) => {
          if (controller.signal.aborted) return;
          if (result.status === "offline") {
            setNotice("Search needs a connection. You can paste a map link instead.");
            setResults([]);
            setOpen(false);
            return;
          }
          if (result.status === "failed") {
            setNotice("Couldn't search just now. You can paste a map link instead.");
            setResults([]);
            setOpen(false);
            return;
          }
          setNotice(result.results.length === 0 ? "Nothing found. Try a nearby town or paste a map link." : null);
          setResults(result.results);
          setOpen(result.results.length > 0);
          setActive(0);
        },
        (error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          if (!controller.signal.aborted) setNotice("Couldn't search just now. You can paste a map link instead.");
        },
      );
    }, 500);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [near, places, query]);

  function choose(hit: PlaceHit) {
    onPlace(hit.place);
    if (!locationUrl.trim() || generated) onLocationUrl(mapsLink(hit.place), true);
    setQuery("");
    setOpen(false);
    setNotice(null);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(results.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = results[active];
      if (hit) choose(hit);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {place && (
        <div className="flex items-center justify-between gap-2 rounded-2xl bg-raised px-3 py-2">
          <span className="min-w-0">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <MapPin aria-hidden="true" className="size-4 shrink-0 text-accent" />
              {place.label ?? "Place"}
            </span>
            {fromLink && <span className="mt-0.5 block text-xs text-muted">From your map link · {place.lat}, {place.lon}</span>}
          </span>
          <button
            type="button"
            onClick={() => onPlace(null)}
            className="min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold text-link hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            Remove
          </button>
        </div>
      )}
      <label className="flex flex-col gap-1 text-sm font-semibold">
        Find a place
        <input
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          placeholder="Uluwatu, Ubud…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setNotice(null);
          }}
          onKeyDown={onKeyDown}
          className="min-h-12 w-full rounded-2xl border border-line bg-raised px-4 text-base font-normal text-fg placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
      </label>
      {open && (
        <>
          <ul id={listId} role="listbox" aria-label="Places" className="flex flex-col overflow-hidden rounded-2xl border border-line">
            {results.map((hit, index) => (
              <li key={`${hit.place.lat},${hit.place.lon},${hit.place.label ?? index}`}>
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${index}`}
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(hit)}
                  className="flex w-full flex-col px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-accent aria-selected:bg-raised"
                >
                  <span className="text-sm font-semibold">{hit.place.label}</span>
                  {hit.detail && <span className="text-xs text-muted">{hit.detail}</span>}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">Search by Photon · © OpenStreetMap contributors</p>
        </>
      )}
      {shortLink && !place && (
        <Banner
          kind="info"
          text={!opened.current.has(locationUrl.trim()) || openingLink ? "Opening that map link…" : "Couldn't open that short link. Paste the full address, or search for the place."}
        />
      )}
      {notice && <Banner kind="info" text={notice} />}
    </div>
  );
}
