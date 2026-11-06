import { canEdit, formatTimeRange, itemPlace, type DocumentScope, type Item, type MemberRef, type TripDocument } from "@hoppin/core";
import { MapPin } from "lucide-react";
import { useState, type ChangeEvent } from "react";
import type { Person } from "./DayView";
import { firstFileProblem, uploadEach, uploadFailure } from "../lib/upload-many";
import { BinButton, ConfirmDelete } from "./ConfirmDelete";
import { DocumentList } from "./DocumentList";
import { ItemForm, type ItemFormValues } from "./ItemForm";
import { Button } from "./ui/Button";
import { Spinner } from "./ui/Spinner";
import { Card } from "./ui/Card";

export interface BookingDetailProps {
  item: Item;
  member: MemberRef;
  /** All documents the app has loaded for the trip; only the ones attached to this item are shown. */
  documents: TripDocument[];
  people: Record<string, Person>;
  onSave: (values: ItemFormValues) => Promise<void>;
  /** Removes this plan. Shown beside Edit for people who may change it. */
  onRemove?: () => void | Promise<void>;
  onUpload: (file: File, scope: DocumentScope) => Promise<void>;
  onOpenDocument: (doc: TripDocument) => void | Promise<void>;
  /** Bias place search toward the trip destination. */
  near?: { lat: number; lon: number } | null;
}

const KIND_LABEL: Record<Item["kind"], string> = { flight: "Flight", stay: "Stay", activity: "Activity", transport: "Transport", plan: "Plan" };

function audienceLabel(item: Item): string {
  return item.visibility === "private" ? "Only you" : item.groupItem ? "Whole group" : "Optional";
}

/** One booking or plan: its details, its documents, and (only for people who may) edit and attach controls. */
export function BookingDetail({ item, member, documents, people, onSave, onUpload, onOpenDocument, onRemove, near }: BookingDetailProps) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scope, setScope] = useState<DocumentScope>("shared");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const mayEdit = canEdit(item, member);
  const notes = typeof item.details.notes === "string" ? item.details.notes : "";
  const place = itemPlace(item);
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: item.tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(item.startsAt));
  const time = formatTimeRange(item.startsAt, item.endsAt, item.tz, item.endTz);

  async function pick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length === 0) return;
    setUploadError(null);
    const problem = firstFileProblem(files);
    if (problem) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    const failed = await uploadEach(files, (file) => onUpload(file, scope));
    if (failed.length > 0) setUploadError(uploadFailure(failed));
    setUploading(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-soft-fg">
              {KIND_LABEL[item.kind]} · {audienceLabel(item)}
            </p>
            <h2 className="mt-2 font-display text-2xl font-extrabold">{item.title}</h2>
            {place?.label && <p className="text-sm text-muted">{place.label}</p>}
          </div>
          {mayEdit && !editing && (
            <div className="flex shrink-0 gap-1">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
              {onRemove && <BinButton label={`Delete ${item.title}`} onClick={() => setConfirming(true)} />}
            </div>
          )}
        </div>
        <p className="text-sm text-muted">{date}</p>
        <p>{time}</p>
        {item.endTz && item.endTz !== item.tz && <p className="text-xs text-muted">Starts in {item.tz} time, ends in {item.endTz} time.</p>}
        {item.ownerId !== member.userId && <p className="text-sm text-muted">Added by {people[item.ownerId]?.name ?? "someone"}</p>}
        {item.locationUrl && (
          <a href={item.locationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-link underline">
            <MapPin aria-hidden="true" className="size-4" />
            Open location
          </a>
        )}
        {notes && <p className="whitespace-pre-wrap">{notes}</p>}
      </Card>

      {editing && (
        <Card>
          <ItemForm
            initial={item}
            tz={item.tz}
            near={near}
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              await onSave(values);
              setEditing(false);
            }}
          />
        </Card>
      )}

      <section aria-labelledby="docs-heading" className="flex flex-col gap-3">
        <h3 id="docs-heading" className="font-display text-xl font-bold">
          Documents
        </h3>
        <DocumentList documents={documents.filter((d) => d.itemId === item.id)} member={member} people={people} onOpen={onOpenDocument} />

        {mayEdit && (
          <div className="flex flex-col gap-3">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Who can open it?</legend>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" className="accent-accent" name="doc-scope" checked={scope === "shared"} onChange={() => setScope("shared")} />
                Everyone in the trip
              </label>
              <label className="flex min-h-11 items-center gap-3">
                <input type="radio" className="accent-accent" name="doc-scope" checked={scope === "personal"} onChange={() => setScope("personal")} />
                Only me and the organizer
              </label>
            </fieldset>
            <div className="flex flex-col gap-1">
              <label htmlFor="doc-file" className="text-sm font-medium">
                Add documents
              </label>
              <input
                id="doc-file"
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
                disabled={uploading}
                onChange={(e) => void pick(e)}
                className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fg"
              />
              <span className="text-xs text-muted">PDF or image, up to 25 MB each. You can choose several at once.</span>
            </div>
            {uploading && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted">
                <Spinner className="text-accent" />
                Uploading
              </p>
            )}
            {uploadError && (
              <p role="alert" className="text-sm text-danger-fg">
                {uploadError}
              </p>
            )}
          </div>
        )}
      </section>
      {onRemove && (
        <ConfirmDelete
          name={item.title}
          open={confirming}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void onRemove();
          }}
        />
      )}
    </div>
  );
}
