import { instantToZonedInput, zonedTimeToInstant, type Item, type ItemKind, type ItemValues } from "@hoppin/core";
import { BedDouble, Bus, Lock, MapPin, PartyPopper, Plane, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { inputClass } from "../lib/forms";
import { Button } from "./ui/Button";

export type ItemFormValues = ItemValues;

export interface ItemFormProps {
  /** An existing item when editing. */
  initial?: Item;
  /** Time zone the times are entered in (the trip's current location). Editing keeps the item's own zone. */
  tz: string;
  onSubmit: (values: ItemFormValues) => void | Promise<void>;
  onCancel: () => void;
}

type Audience = "group" | "optional" | "private";

const KINDS: { value: ItemKind; label: string; icon: LucideIcon }[] = [
  { value: "flight", label: "Flight", icon: Plane },
  { value: "stay", label: "Stay", icon: BedDouble },
  { value: "activity", label: "Activity", icon: Sparkles },
  { value: "transport", label: "Transport", icon: Bus },
  { value: "plan", label: "Plan", icon: MapPin },
];

const AUDIENCES: { value: Audience; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "group", label: "Whole group", hint: "A fixed plan for everyone", icon: Users },
  { value: "optional", label: "Optional, anyone can join", hint: "Shows as a small chip people can tap", icon: PartyPopper },
  { value: "private", label: "Just me", hint: "Only you can see it", icon: Lock },
];

function Field({ label, error, children }: { label: string; error?: string; children: (props: { id: string; describedBy?: string; invalid?: boolean }) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
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
  const [failed, setFailed] = useState<string | null>(null);

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
    setFailed(null);
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
    } catch (error) {
      // A clash with someone else's edit has its own explanation; anything else is a generic retry.
      setFailed(error instanceof Error && error.name === "ConflictError" ? error.message : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Title" error={errors.title}>
        {(p) => (
          <input
            id={p.id}
            aria-invalid={p.invalid}
            aria-describedby={p.describedBy}
            placeholder="What's the plan?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={`${inputClass} font-display text-lg font-bold`}
          />
        )}
      </Field>

      <div className="flex flex-col gap-1.5">
        <p id="kind-label" className="text-sm font-semibold">
          Type
        </p>
        <div role="radiogroup" aria-label="Type" className="flex flex-wrap gap-2">
          {KINDS.map(({ value, label, icon: Icon }) => (
            <label
              key={value}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-raised px-4 text-sm font-semibold transition-colors has-[:checked]:bg-accent has-[:checked]:text-accent-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
            >
              <input type="radio" name="kind" className="sr-only" checked={kind === value} onChange={() => setKind(value)} />
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Starts" error={errors.starts}>
          {(p) => <input id={p.id} type="datetime-local" aria-invalid={p.invalid} aria-describedby={p.describedBy} value={starts} onChange={(e) => setStarts(e.target.value)} className={inputClass} />}
        </Field>
        <Field label="Ends" error={errors.ends}>
          {(p) => <input id={p.id} type="datetime-local" aria-invalid={p.invalid} aria-describedby={p.describedBy} value={ends} onChange={(e) => setEnds(e.target.value)} className={inputClass} />}
        </Field>
      </div>
      <p className="-mt-3 text-xs text-muted">Times are in {zone}.</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-semibold">Who is it for?</legend>
        {AUDIENCES.map(({ value, label, hint, icon: Icon }) => (
          <label
            key={value}
            className="flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl bg-raised p-3 transition-colors has-[:checked]:bg-accent-soft has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
          >
            <input type="radio" name="audience" value={value} checked={audience === value} onChange={() => setAudience(value)} className="sr-only" />
            <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface">
              <Icon className="size-4" />
            </span>
            <span>
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-muted">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field label="Location link" error={errors.location}>
        {(p) => <input id={p.id} type="url" inputMode="url" placeholder="Paste a Maps link" aria-invalid={p.invalid} aria-describedby={p.describedBy} value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} />}
      </Field>
      <Field label="Notes">
        {(p) => <textarea id={p.id} rows={3} placeholder="Booking reference, what to bring…" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} py-3`} />}
      </Field>

      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          {failed}
        </p>
      )}
      <div className="sticky bottom-0 -mx-5 flex gap-2 bg-surface px-5 pb-1 pt-3">
        <Button type="submit" disabled={saving} className="flex-1">
          Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
