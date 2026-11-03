import { instantToZonedInput, zonedTimeToInstant, type Item, type ItemKind, type Visibility } from "@hoppin/core";
import { useId, useState, type FormEvent } from "react";
import { Button } from "./ui/Button";

export interface ItemFormValues {
  kind: ItemKind;
  title: string;
  startsAt: string;
  endsAt: string | null;
  tz: string;
  locationUrl: string | null;
  visibility: Visibility;
  groupItem: boolean;
  notes: string;
}

export interface ItemFormProps {
  /** An existing item when editing. */
  initial?: Item;
  /** Time zone the times are entered in (the trip's current location). Editing keeps the item's own zone. */
  tz: string;
  onSubmit: (values: ItemFormValues) => void | Promise<void>;
  onCancel: () => void;
}

type Audience = "group" | "optional" | "private";

const KINDS: { value: ItemKind; label: string }[] = [
  { value: "flight", label: "Flight" },
  { value: "stay", label: "Stay" },
  { value: "activity", label: "Activity" },
  { value: "transport", label: "Transport" },
  { value: "plan", label: "Plan" },
];

const AUDIENCES: { value: Audience; label: string; hint: string }[] = [
  { value: "group", label: "Whole group", hint: "A fixed plan for everyone" },
  { value: "optional", label: "Optional, anyone can join", hint: "Shows as a small chip people can tap" },
  { value: "private", label: "Just me", hint: "Only you can see it" },
];

const inputClass =
  "min-h-11 w-full rounded-card border border-line bg-surface px-3 text-base text-fg focus-visible:outline-2 focus-visible:outline-accent";

function Field({ label, error, children }: { label: string; error?: string; children: (props: { id: string; describedBy?: string; invalid?: boolean }) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({ id, describedBy: error ? `${id}-error` : undefined, invalid: error ? true : undefined })}
      {error && (
        <span id={`${id}-error`} className="text-sm text-danger-fg">
          {error}
        </span>
      )}
    </div>
  );
}

/** Add or edit a trip item: a booking (flight, stay, transport), a group activity, an optional plan, or a private plan. */
export function ItemForm({ initial, tz, onSubmit, onCancel }: ItemFormProps) {
  const zone = initial?.tz ?? tz;
  const [kind, setKind] = useState<ItemKind>(initial?.kind ?? "activity");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [starts, setStarts] = useState(initial ? instantToZonedInput(initial.startsAt, zone) : "");
  const [ends, setEnds] = useState(initial?.endsAt ? instantToZonedInput(initial.endsAt, zone) : "");
  const [location, setLocation] = useState(initial?.locationUrl ?? "");
  const [notes, setNotes] = useState(typeof initial?.details.notes === "string" ? initial.details.notes : "");
  const [audience, setAudience] = useState<Audience>(
    initial ? (initial.visibility === "private" ? "private" : initial.groupItem ? "group" : "optional") : "group",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Enter a title";
    if (!starts) next.starts = "Choose when it starts";
    if (starts && ends && zonedTimeToInstant(ends, zone) <= zonedTimeToInstant(starts, zone)) {
      next.ends = "The end must be after the start";
    }
    if (location.trim() && !/^https?:\/\/\S+$/i.test(location.trim())) {
      next.location = "Enter a link starting with http:// or https://";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setFailed(false);
    try {
      await onSubmit({
        kind,
        title: title.trim(),
        startsAt: zonedTimeToInstant(starts, zone),
        endsAt: ends ? zonedTimeToInstant(ends, zone) : null,
        tz: zone,
        locationUrl: location.trim() || null,
        visibility: audience === "private" ? "private" : "shared",
        groupItem: audience === "group",
        notes: notes.trim(),
      });
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label="Title" error={errors.title}>
        {(p) => <input id={p.id} aria-invalid={p.invalid} aria-describedby={p.describedBy} value={title} onChange={(e) => setTitle(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Type">
        {(p) => (
          <select id={p.id} value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} className={inputClass}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        )}
      </Field>
      <p className="text-xs text-muted">Times are in {zone}.</p>
      <Field label="Starts" error={errors.starts}>
        {(p) => <input id={p.id} type="datetime-local" aria-invalid={p.invalid} aria-describedby={p.describedBy} value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Ends" error={errors.ends}>
        {(p) => <input id={p.id} type="datetime-local" aria-invalid={p.invalid} aria-describedby={p.describedBy} value={ends} onChange={(e) => setEnds(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Location link" error={errors.location}>
        {(p) => <input id={p.id} type="url" inputMode="url" aria-invalid={p.invalid} aria-describedby={p.describedBy} value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Notes">
        {(p) => <textarea id={p.id} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} py-2`} />}
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Who is it for?</legend>
        {AUDIENCES.map((a) => (
          <label key={a.value} className="flex min-h-11 items-start gap-3 rounded-card border border-line bg-surface p-3">
            <input type="radio" name="audience" value={a.value} checked={audience === a.value} onChange={() => setAudience(a.value)} className="mt-1 accent-accent" />
            <span>
              <span className="block font-medium">{a.label}</span>
              <span className="block text-sm text-muted">{a.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          Couldn't save. Please try again.
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
