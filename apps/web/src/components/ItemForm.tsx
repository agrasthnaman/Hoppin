import { instantToZonedInput, zonedTimeToInstant, type Item, type ItemKind, type ItemValues } from "@hoppin/core";
import { BedDouble, Bus, Lock, MapPin, PartyPopper, Plane, Sparkles, Users, type LucideIcon } from "lucide-react";
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { useOnline } from "../hooks/useOnline";
import { inputClass } from "../lib/forms";
import { firstFileProblem, mergeFiles } from "../lib/upload-many";
import { Button } from "./ui/Button";

export type ItemFormValues = ItemValues;

export interface ItemFormProps {
  /** An existing item when editing. */
  initial?: Item;
  /** Starting text for a new plan (for example the winner of a poll). Ignored when editing. */
  prefill?: { title?: string; kind?: ItemKind; notes?: string };
  /** Time zone the times are entered in (the trip's current location). Editing keeps the item's own zone. */
  tz: string;
  /** `documents` is set only when creating a booking and at least one file was chosen. */
  onSubmit: (values: ItemFormValues, documents?: File[]) => void | Promise<void>;
  onCancel: () => void;
}

function isZone(name: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: name });
    return name.trim() !== "";
  } catch {
    return false;
  }
}

function zoneNames(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
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
export function ItemForm({ initial, prefill, tz, onSubmit, onCancel }: ItemFormProps) {
  const zone = initial?.tz ?? tz;
  const [arrivalZone, setArrivalZone] = useState(initial?.endTz ?? zone);
  const [kind, setKind] = useState<ItemKind>(initial?.kind ?? prefill?.kind ?? "activity");
  const [title, setTitle] = useState(initial?.title ?? prefill?.title ?? "");
  const [starts, setStarts] = useState(initial ? instantToZonedInput(initial.startsAt, zone) : "");
  const [ends, setEnds] = useState(initial?.endsAt ? instantToZonedInput(initial.endsAt, initial.endTz ?? zone) : "");
  const [location, setLocation] = useState(initial?.locationUrl ?? "");
  const [notes, setNotes] = useState(typeof initial?.details.notes === "string" ? initial.details.notes : (prefill?.notes ?? ""));
  const [audience, setAudience] = useState<Audience>(
    initial ? (initial.visibility === "private" ? "private" : initial.groupItem ? "group" : "optional") : "group",
  );
  const [documents, setDocuments] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const online = useOnline();
  const documentId = useId();

  // Only a flight or other transport ends somewhere else. Anything else ends where it starts.
  const travels = kind === "flight" || kind === "transport";
  const endZone = travels && isZone(arrivalZone) ? arrivalZone : zone;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = "Enter a title";
    if (!starts) next.starts = "Choose when it starts";
    if (travels && !isZone(arrivalZone)) next.arrivalZone = "Enter a time zone like Europe/London";
    if (starts && ends && !next.arrivalZone && zonedTimeToInstant(ends, endZone) <= zonedTimeToInstant(starts, zone)) {
      next.ends = "The end must be after the start";
    }
    if (location.trim() && !/^https?:\/\/\S+$/i.test(location.trim())) {
      next.location = "Enter a link starting with http:// or https://";
    }
    const fileProblem = firstFileProblem(documents);
    if (fileProblem) next.document = fileProblem;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSaving(true);
    setFailed(null);
    const values = {
      kind,
      title: title.trim(),
      startsAt: zonedTimeToInstant(starts, zone),
      endsAt: ends ? zonedTimeToInstant(ends, endZone) : null,
      tz: zone,
      endTz: endZone === zone ? null : endZone,
      locationUrl: location.trim() || null,
      visibility: audience === "private" ? "private" : "shared",
      groupItem: audience === "group",
      notes: notes.trim(),
    } as const;
    try {
      if (documents.length > 0) await onSubmit(values, documents);
      else await onSubmit(values);
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
      <p className="-mt-3 text-xs text-muted">
        {travels && endZone !== zone ? `Starts in ${zone} time, ends in ${endZone} time.` : `Times are in ${zone}.`}
      </p>
      {travels && (
        <Field label="Arrival time zone" error={errors.arrivalZone}>
          {(p) => (
            <>
              <input
                id={p.id}
                list={`${p.id}-zones`}
                autoComplete="off"
                spellCheck={false}
                aria-invalid={p.invalid}
                aria-describedby={p.describedBy}
                value={arrivalZone}
                onChange={(e) => setArrivalZone(e.target.value)}
                className={inputClass}
              />
              <datalist id={`${p.id}-zones`}>
                {zoneNames().map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              <span className="text-xs text-muted">Where it lands, if that is in a different time zone. The end time above is in this zone.</span>
            </>
          )}
        </Field>
      )}

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
      {!initial && (
        <div className="flex flex-col gap-1">
          <label htmlFor={documentId} className="text-sm font-semibold">
            Booking documents
          </label>
          <input
            id={documentId}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
            multiple
            disabled={!online}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const chosen = Array.from(event.target.files ?? []);
              setDocuments((current) => mergeFiles(current, chosen));
              setErrors((current) => ({ ...current, document: "" }));
              event.target.value = ""; // so the same file can be picked again after removing it
            }}
            className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fg"
          />
          <span className="text-xs text-muted">
            {online ? "Optional. Add as many as you need (ticket, invoice, visa). Anyone in the group can open them from Docs." : "Connect to the internet to attach documents. You can still save the booking."}
          </span>
          {documents.length > 0 && (
            <ul aria-label="Chosen documents" className="mt-1 flex flex-col gap-1">
              {documents.map((file) => (
                <li key={`${file.name}-${file.size}-${file.lastModified}`} className="flex items-center gap-2 rounded-full bg-raised py-1 pl-4 pr-1 text-sm">
                  <span className="min-w-0 flex-1 truncate">{file.name}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => setDocuments((current) => current.filter((existing) => existing !== file))}
                    className="min-h-9 rounded-full px-3 text-xs font-semibold text-link hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          {errors.document && <span className="text-sm text-danger-fg">{errors.document}</span>}
        </div>
      )}

      <Field label="Notes">
        {(p) => <textarea id={p.id} rows={3} placeholder="Booking reference, what to bring…" value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputClass} py-3`} />}
      </Field>

      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          {failed}
        </p>
      )}
      <div className="sticky bottom-0 z-20 -mx-5 flex gap-2 bg-surface px-5 pb-1 pt-3">
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
