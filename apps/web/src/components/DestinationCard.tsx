import type { TripDestination } from "@hoppin/core";
import { useState, type FormEvent } from "react";
import { inputClass } from "../lib/forms";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";

export interface DestinationCardProps {
  current: TripDestination | null | undefined;
  online: boolean;
  lookup: (query: string) => Promise<TripDestination | null>;
  /** Saves the destination (null clears it). Rejects when it could not be saved. */
  onSave: (destination: TripDestination | null) => Promise<void>;
}

/** Organizer only: where the trip goes. The weather on each day follows it. */
export function DestinationCard({ current, online, lookup, onSave }: DestinationCardProps) {
  const [text, setText] = useState(current?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const query = text.trim();
    setBusy(true);
    try {
      if (!query) {
        await onSave(null);
        setMessage({ kind: "ok", text: "Destination removed. Days show no weather." });
        return;
      }
      let found: TripDestination | null;
      try {
        found = await lookup(query);
      } catch {
        setMessage({ kind: "error", text: "Couldn't check that place. Check your connection and try again." });
        return;
      }
      if (!found) {
        setMessage({ kind: "error", text: "Couldn't find that place. Try the city and country, like Goa, India." });
        return;
      }
      await onSave(found);
      setText(found.name);
      setMessage({ kind: "ok", text: `Weather will follow ${found.name}.` });
    } catch {
      setMessage({ kind: "error", text: "Couldn't save the destination. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={save} noValidate className="flex flex-col gap-3">
        <h3 className="font-semibold">Destination</h3>
        <div className="flex flex-col gap-1">
          <label htmlFor="trip-destination" className="text-sm font-medium">
            Where is the trip?
          </label>
          <input
            id="trip-destination"
            autoComplete="off"
            placeholder="Goa, India"
            value={text}
            disabled={!online || busy}
            onChange={(e) => setText(e.target.value)}
            className={inputClass}
          />
          <span className="text-xs text-muted">Each day shows this place's weather forecast. Only the place is sent to look up its weather.</span>
        </div>
        {!online && <p className="text-sm text-muted">Connect to the internet to change the destination.</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" disabled={!online || busy}>
            Save destination
          </Button>
        </div>
        {message && (
          <p role={message.kind === "error" ? "alert" : "status"} className={message.kind === "error" ? "text-sm text-danger-fg" : "text-sm text-muted"}>
            {message.text}
          </p>
        )}
      </form>
    </Card>
  );
}
