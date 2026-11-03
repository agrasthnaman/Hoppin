import { useId, useState, type FormEvent } from "react";
import { Button } from "./ui/Button";

export interface NewTrip {
  name: string;
  startDate: string | null;
  endDate: string | null;
}

export interface CreateTripFormProps {
  onSubmit: (trip: NewTrip) => Promise<void>;
  onCancel: () => void;
}

const inputClass = "min-h-11 w-full rounded-card border border-line bg-surface px-3 text-base text-fg focus-visible:outline-2 focus-visible:outline-accent";

function Field({ label, error, children }: { label: string; error?: string; children: (id: string, describedBy?: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
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

/** Name and optional dates for a new trip. The person creating it becomes its organizer. */
export function CreateTripForm({ onSubmit, onCancel }: CreateTripFormProps) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [errors, setErrors] = useState<{ name?: string; end?: string }>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

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
      await onSubmit({ name: name.trim(), startDate: start || null, endDate: end || null });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Trip name" error={errors.name}>
        {(id, d) => <input id={id} aria-describedby={d} aria-invalid={errors.name ? true : undefined} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Starts">
        {(id) => <input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Ends" error={errors.end}>
        {(id, d) => <input id={id} type="date" aria-describedby={d} aria-invalid={errors.end ? true : undefined} value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />}
      </Field>
      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          Couldn't create the trip. Check your connection and try again.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          Create trip
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
