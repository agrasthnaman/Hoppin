import { ChevronRight } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { TripDestination } from "@hoppin/core";
import { draftBookingsFromText, tripSpan, type DraftBooking } from "../lib/booking-draft";
import { inputClass } from "../lib/forms";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";

export interface NewTrip {
  name: string;
  startDate: string | null;
  endDate: string | null;
  /** Where the trip goes, looked up once (for the weather). Null when none was given or it could not be found. */
  destination: TripDestination | null;
  bookings: EditableBooking[];
}

export type EditableBooking = DraftBooking & { file: File };

export interface CreateTripFormProps {
  onSubmit: (trip: NewTrip) => Promise<void>;
  onCancel: () => void;
  /** Turns the typed destination into coordinates. Without it the destination field is not shown. */
  lookup?: (query: string) => Promise<TripDestination | null>;
}

type Match = { query: string; result: TripDestination | null | "failed" };

/** What to tell the person about the destination they typed. */
export function destinationHint(query: string, match: Match | null): string | null {
  if (query.length < 2) return null;
  if (!match || match.query !== query) return "Looking up…";
  if (match.result === "failed") return "Couldn't check that place right now. The trip will be made without weather.";
  if (match.result === null) return "Couldn't find that place. The trip will be made without weather.";
  return `Weather will follow ${match.result.name}.`;
}

async function readBookings(files: File[]): Promise<EditableBooking[]> {
  const { readPdfText } = await import("../lib/pdf-text");
  const drafts: EditableBooking[] = [];
  for (const file of files) {
    let text = "";
    try {
      text = await readPdfText(await file.arrayBuffer());
    } catch {
      text = "";
    }
    for (const booking of draftBookingsFromText(file.name, text)) drafts.push({ ...booking, file });
  }
  return drafts;
}

function Field({ label, error, children }: { label: string; error?: string; children: (id: string, describedBy?: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      {children(id, error ? `${id}-error` : undefined)}
      {error && (
        <span id={`${id}-error`} className="text-sm text-danger-fg">
          {error}
        </span>
      )}
    </div>
  );
}

/** Opens on a name and dates. A highlighted tab below switches to drafting the trip from booking PDFs. The person creating it becomes its organizer. */
export function CreateTripForm({ onSubmit, onCancel, lookup }: CreateTripFormProps) {
  const filesId = useId();
  const [name, setName] = useState("");
  const [place, setPlace] = useState("");
  const [match, setMatch] = useState<Match | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [datesTouched, setDatesTouched] = useState(false);
  const [bookings, setBookings] = useState<EditableBooking[]>([]);
  const [reading, setReading] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; end?: string }>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [path, setPath] = useState<"manual" | "documents">("manual");

  // Look the place up a moment after typing stops, so the person sees what the weather will follow.
  useEffect(() => {
    const query = place.trim();
    if (!lookup || query.length < 2) return;
    const timer = setTimeout(() => {
      lookup(query).then(
        (result) => setMatch({ query, result }),
        () => setMatch({ query, result: "failed" }),
      );
    }, 600);
    return () => clearTimeout(timer);
  }, [place, lookup]);

  useEffect(() => {
    if (datesTouched || bookings.length === 0) return;
    const span = tripSpan(bookings);
    if (span.startDate) setStart(span.startDate);
    if (span.endDate) setEnd(span.endDate);
  }, [bookings, datesTouched]);

  function editBooking(index: number, patch: Partial<DraftBooking>) {
    setBookings((current) => current.map((booking, i) => (i === index ? { ...booking, ...patch } : booking)));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next = {
      name: name.trim() ? undefined : "Enter a trip name",
      end: start && end && end < start ? "The end date must be on or after the start date" : undefined,
    };
    setErrors(next);
    if (next.name || next.end) return;
    setSaving(true);
    setFailed(false);
    try {
      // A destination that can't be found never stops the trip from being made; it just has no weather.
      const query = place.trim();
      let destination: TripDestination | null = null;
      if (lookup && query) {
        if (match?.query === query) destination = match.result === "failed" ? null : match.result;
        else destination = await lookup(query).catch(() => null);
      }
      await onSubmit({ name: name.trim(), startDate: start || null, endDate: end || null, destination, bookings });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function backToNameAndDates() {
    setPath("manual");
    setBookings([]);
    if (!datesTouched) {
      setStart("");
      setEnd("");
    }
  }

  const placeHint = destinationHint(place.trim(), match);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {path === "documents" && (
        <p className="text-sm text-muted">
          Upload your ticket and hotel PDFs. Tickets set the dates. Hotel bookings add the stay and the place. Correct the draft before creating the trip.
        </p>
      )}
      <Field label="Trip name" error={errors.name}>
        {(id, d) => (
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={errors.name ? true : undefined}
            placeholder="Where to?"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${inputClass} font-display text-xl font-bold`}
          />
        )}
      </Field>
      {lookup && (
        <Field label="Destination (optional)">
          {(id) => (
            <>
              <input
                id={id}
                autoComplete="off"
                placeholder="Goa, India"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                className={inputClass}
              />
              <span role="status" className="flex items-center gap-2 text-xs text-muted">
                {placeHint === "Looking up…" && <Spinner className="text-accent" />}
                {placeHint ?? "Shows the weather forecast for each day."}
              </span>
            </>
          )}
        </Field>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Starts">
          {(id) => (
            <input
              id={id}
              type="date"
              value={start}
              onChange={(e) => {
                setDatesTouched(true);
                setStart(e.target.value);
              }}
              className={inputClass}
            />
          )}
        </Field>
        <Field label="Ends" error={errors.end}>
          {(id, d) => (
            <input
              id={id}
              type="date"
              aria-describedby={d}
              aria-invalid={errors.end ? true : undefined}
              value={end}
              onChange={(e) => {
                setDatesTouched(true);
                setEnd(e.target.value);
              }}
              className={inputClass}
            />
          )}
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted">
        {path === "documents" ? "Dates fill in from the tickets. Change anything that looks wrong." : "Dates are optional. You can start adding plans without them."}
      </p>
      {path === "documents" && (
      <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={filesId} className="text-sm font-semibold">
          Booking PDFs
        </label>
        <input
          id={filesId}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={reading || saving}
          onChange={(event) => {
            const picked = [...(event.target.files ?? [])];
            event.target.value = "";
            if (picked.length === 0) return;
            setReading(true);
            void readBookings(picked)
              .then((drafts) => setBookings((current) => [...current, ...drafts]))
              .finally(() => setReading(false));
          }}
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fg"
        />
        <span className="text-xs text-muted">Add each booking. Ones already here stay in the list. Tickets set the dates. A villa or hotel adds the stay and the place.</span>
      </div>
      {reading && (
        <p role="status" className="text-sm text-muted">
          Reading bookings…
        </p>
      )}
      {bookings.map((booking, index) => (
        <fieldset key={`${booking.fileName}-${index}`} className="flex flex-col gap-2 rounded-card border border-line p-3">
          <legend className="px-1 text-sm font-semibold">{booking.kind === "flight" ? "Flight" : booking.kind === "stay" ? "Stay" : "Booking"}</legend>
          {booking.unread && <p className="text-sm text-muted">Couldn't read {booking.fileName}. Fill in what you know.</p>}
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Title
            <input
              aria-label={`${booking.fileName} title`}
              value={booking.title}
              onChange={(event) => editBooking(index, { title: event.target.value })}
              className={inputClass}
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-semibold">
              Day
              <input
                type="date"
                aria-label={`${booking.fileName} day`}
                value={booking.startsOn ?? ""}
                onChange={(event) => editBooking(index, { startsOn: event.target.value || null })}
                className={inputClass}
              />
            </label>
            {booking.kind === "stay" && (
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Until
                <input
                  type="date"
                  aria-label={`${booking.fileName} until`}
                  value={booking.endsOn ?? ""}
                  onChange={(event) => editBooking(index, { endsOn: event.target.value || null })}
                  className={inputClass}
                />
              </label>
            )}
          </div>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            Place
            <input
              aria-label={`${booking.fileName} place`}
              value={booking.place ?? ""}
              onChange={(event) => editBooking(index, { place: event.target.value || null })}
              className={inputClass}
            />
          </label>
        </fieldset>
      ))}
      </>
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          Couldn't create the trip. Check your connection and try again.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" busy={reading || saving} className="flex-1">
          Create trip
        </Button>
        {path === "documents" ? (
          <Button type="button" variant="ghost" onClick={backToNameAndDates}>
            Back
          </Button>
        ) : (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
      {path === "manual" && (
        <button
          type="button"
          aria-label="From booking documents"
          onClick={() => setPath("documents")}
          className="flex w-full items-center gap-3 rounded-card bg-highlight px-4 py-3 text-left text-highlight-fg hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">From booking documents</span>
            <span className="mt-1 block text-sm">Upload tickets and hotel bookings, and Hoppin drafts the trip.</span>
          </span>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0" />
        </button>
      )}
    </form>
  );
}
