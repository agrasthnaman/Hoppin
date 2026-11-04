import { canEdit, formatTimeRange, localDate, validateDocumentFile, visibleDocuments, type Item, type ItemKind, type TripDocument } from "@hoppin/core";
import { ChevronDown, FileText, Plus } from "lucide-react";
import { openFile } from "../lib/open-file";
import { firstFileProblem, uploadEach, uploadFailure } from "../lib/upload-many";
import { useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { peopleFrom } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { ItemForm } from "../components/ItemForm";
import { PageHeading } from "../components/PageHeading";
import { Button } from "../components/ui/Button";
import { Sheet } from "../components/ui/Sheet";
import { useOnline } from "../hooks/useOnline";
import { inputClass, selectClass } from "../lib/forms";
import { getDeviceKey } from "../offline/crypto";
import { getLocalDocument } from "../offline/sync";

const KIND_ORDER: ItemKind[] = ["flight", "stay", "transport", "activity", "plan"];
const KIND_HEADING: Record<ItemKind, string> = {
  flight: "Flights",
  stay: "Stays",
  transport: "Transport",
  activity: "Activities",
  plan: "Plans",
};

/** Shared plans, plus the viewer's own private ones. Other people's private plans stay hidden. */
function visibleBookings(items: Item[], viewerId: string): Item[] {
  return items.filter((item) => item.visibility === "shared" || item.ownerId === viewerId);
}

/** The trip's bookings, each with the file you show at reception, plus the viewer's own scans. */
function dayOf(item: Item): { date: string; label: string } {
  const date = localDate(Date.parse(item.startsAt), item.tz);
  const label = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${date}T12:00:00Z`));
  return { date, label };
}

export default function Docs() {
  const trip = useTripData();
  const { actions, db, clock } = useServices();
  const online = useOnline();
  const [failed, setFailed] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState("all");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [folded, setFolded] = useState<Set<ItemKind>>(new Set());
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;
  const member = snapshot.members.find((entry) => entry.userId === trip.viewerId);
  if (!member) return <p>This trip isn't available.</p>;

  const people = peopleFrom(snapshot.members);
  const bookings = visibleBookings(snapshot.items, trip.viewerId);
  const needle = query.trim().toLowerCase();
  const shown = bookings.filter((item) => (person === "all" || item.ownerId === person) && item.title.toLowerCase().includes(needle));
  const bookers = [...new Set(bookings.map((item) => item.ownerId))]
    .map((id) => ({ id, name: people[id]?.name ?? "Someone" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const visible = visibleDocuments(snapshot.documents, member);
  const bookingIds = new Set(bookings.map((item) => item.id));
  const mine = visible.filter((doc) => doc.scope === "personal" && doc.ownerId === member.userId && !doc.itemId);
  const other = visible.filter((doc) => !bookingIds.has(doc.itemId ?? "") && !mine.includes(doc));

  async function open(doc: TripDocument) {
    setFailed(null);
    try {
      await openFile(async () => {
        const stored = await getLocalDocument(db, doc, await getDeviceKey(db));
        if (stored) return URL.createObjectURL(stored);
        if (!navigator.onLine) throw new Error("offline");
        return actions.documentUrl(doc);
      });
    } catch {
      setFailed(doc.fileName);
    }
  }

  async function addToBooking(item: Item, event: ChangeEvent<HTMLInputElement>) {
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
    const failed = await uploadEach(files, (file) =>
      actions.uploadDocument(file, { tripId: trip.tripId, ownerId: trip.viewerId, itemId: item.id, scope: "shared", kind: "document" }),
    );
    await trip.refresh().catch(() => {});
    if (failed.length > 0) setUploadError(uploadFailure(failed));
    setUploading(false);
  }

  async function addPersonal(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setUploadError(null);
    const problem = validateDocumentFile(file);
    if (problem) {
      setUploadError(problem);
      input.value = "";
      return;
    }
    setUploading(true);
    try {
      await actions.uploadDocument(file, { tripId: trip.tripId, ownerId: trip.viewerId, itemId: null, scope: "personal", kind: "document" });
      await trip.refresh();
    } catch {
      setUploadError(`Couldn't upload ${file.name}. Please try again.`);
    } finally {
      setUploading(false);
      input.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeading title="Docs" lede="The same plans as the days. Open a confirmation here when you need to show it." />

      <section aria-labelledby="bookings-heading" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="bookings-heading" className="font-display text-2xl font-bold">
            Bookings
          </h2>
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-4" />
            Add booking
          </Button>
        </div>
        {bookings.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
              Search bookings
              <input className={inputClass} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium sm:w-44">
              Who booked it
              <span className="relative block">
              <select className={selectClass} value={person} onChange={(event) => setPerson(event.target.value)}>
                <option value="all">Everyone</option>
                {bookers.map((booker) => (
                  <option key={booker.id} value={booker.id}>
                    {booker.name}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" strokeWidth={2.5} data-testid="select-arrow" className="pointer-events-none absolute right-4 top-1/2 size-5 -translate-y-1/2 text-fg" />
              </span>
            </label>
          </div>
        )}
        {bookings.length === 0 ? (
          <p>No bookings yet.</p>
        ) : shown.length === 0 ? (
          <p>No bookings match.</p>
        ) : (
          KIND_ORDER.map((kind) => {
            const group = shown.filter((item) => item.kind === kind).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
            if (group.length === 0) return null;
            return (
              <div key={kind} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted">
                  <button
                    type="button"
                    aria-expanded={!folded.has(kind)}
                    aria-controls={`group-${kind}`}
                    onClick={() =>
                      setFolded((current) => {
                        const next = new Set(current);
                        if (!next.delete(kind)) next.add(kind);
                        return next;
                      })
                    }
                    className="flex min-h-11 w-full items-center gap-2 rounded-card px-1 text-left hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                  >
                    <ChevronDown aria-hidden="true" className={`size-4 shrink-0 transition-transform ${folded.has(kind) ? "-rotate-90" : ""}`} />
                    {KIND_HEADING[kind]}
                    <span aria-hidden="true" className="rounded-full bg-raised px-2 py-0.5 text-xs font-medium">
                      {group.length}
                    </span>
                  </button>
                </h3>
                <ul id={`group-${kind}`} hidden={folded.has(kind)} className="grid items-start gap-2 sm:grid-cols-2">
                  {group.map((item) => {
                    const day = dayOf(item);
                    const attached = visible.filter((doc) => doc.itemId === item.id);
                    return (
                      <li key={item.id} className="flex min-w-0 flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3">
                        <div className="min-w-0">
                          <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/trips/${trip.tripId}/items/${item.id}`}
                            title={item.title}
                            className="min-w-0 flex-1 truncate font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            {item.title}
                          </Link>
                          {canEdit(item, member) && (
                            <button
                              type="button"
                              aria-label={`Edit ${item.title}`}
                              onClick={() => setEditing(item)}
                              className="-mt-1 min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-link hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              Edit
                            </button>
                          )}
                          </div>
                          <p className="truncate text-sm font-semibold">{formatTimeRange(item.startsAt, item.endsAt, item.tz, item.endTz)}</p>
                          <p className="truncate text-xs text-muted">
                            <Link
                              to={`/trips/${trip.tripId}/days?date=${day.date}`}
                              className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              {day.label}
                            </Link>
                            {" · "}
                            {people[item.ownerId]?.name ?? "Someone"}
                          </p>
                        </div>
                        {attached.length === 0 && <p className="text-sm text-muted">No confirmation saved</p>}
                        {attached.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-3">
                            <FileText aria-hidden="true" className="size-5 shrink-0 text-muted" />
                            <p className="min-w-0 flex-1 truncate text-sm" title={doc.fileName}>{doc.fileName}</p>
                            <button
                              type="button"
                              aria-label={`Open ${doc.fileName}`}
                              onClick={() => void open(doc)}
                              className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-link hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                            >
                              Open
                            </button>
                          </div>
                        ))}
                        <label
                          className={`inline-flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-full px-3 text-sm font-semibold text-link focus-within:outline-2 focus-within:outline-accent hover:bg-raised ${
                            online && !uploading ? "" : "pointer-events-none opacity-50"
                          }`}
                        >
                          <Plus aria-hidden="true" className="size-4" />
                          {attached.length === 0 ? "Add files" : "Add more files"}
                          <input
                            type="file"
                            multiple
                            aria-label={`Add files to ${item.title}`}
                            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
                            disabled={!online || uploading}
                            onChange={(event) => void addToBooking(item, event)}
                            className="sr-only"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {other.length > 0 && (
        <section aria-labelledby="other-heading" className="flex flex-col gap-3">
          <h2 id="other-heading" className="font-display text-2xl font-bold">
            Other files
          </h2>
          <FileList docs={other} items={snapshot.items} tripId={trip.tripId} onOpen={open} />
        </section>
      )}

      <section aria-labelledby="mine-heading" className="flex flex-col gap-3">
        <h2 id="mine-heading" className="font-display text-2xl font-bold">
          My documents
        </h2>
        <p className="text-sm text-muted">Passport and visa scans. Only you and the organizer can open them.</p>
        {mine.length === 0 ? <p>Nothing personal saved yet.</p> : <FileList docs={mine} items={snapshot.items} tripId={trip.tripId} onOpen={open} />}
        <div className="flex flex-col gap-1">
          <label htmlFor="personal-doc" className="text-sm font-medium">
            Add a document
          </label>
          <input
            id="personal-doc"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,application/pdf,image/*"
            disabled={!online || uploading}
            onChange={(event) => void addPersonal(event)}
            className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:font-semibold file:text-fg"
          />
          <span className="text-xs text-muted">{online ? "PDF or image, up to 25 MB." : "Connect to the internet to add a document."}</span>
        </div>
        {uploading && (
          <p role="status" className="text-sm text-muted">
            Uploading…
          </p>
        )}
        {uploadError && (
          <p role="alert" className="text-sm text-danger-fg">
            {uploadError}
          </p>
        )}
      </section>

      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          Couldn't open {failed}. Check your connection and try again.
        </p>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => !open && setEditing(null)} title="Edit booking">
        {editing && (
          <ItemForm
            initial={editing}
            tz={editing.tz}
            onCancel={() => setEditing(null)}
            onSubmit={async (values) => {
              await trip.editItem(editing, values);
              setEditing(null);
            }}
          />
        )}
      </Sheet>

      <Sheet open={adding} onOpenChange={setAdding} title="Add a booking">
        <ItemForm
          tz={clock.timeZone}
          onCancel={() => setAdding(false)}
          onSubmit={async (values, files) => {
            const id = await trip.addItem(values);
            setAdding(false);
            if (!files?.length) return;
            const failed = await uploadEach(files, (file) => actions.uploadDocument(file, { tripId: trip.tripId, ownerId: trip.viewerId, itemId: id, scope: "shared", kind: "document" }));
            await trip.refresh();
            if (failed.length > 0) setUploadError(`The booking is saved. Couldn't upload ${failed.join(", ")}. Open the booking and try again.`);
          }}
        />
      </Sheet>
    </div>
  );
}

function FileList({ docs, items, tripId, onOpen }: { docs: TripDocument[]; items: Item[]; tripId: string; onOpen: (doc: TripDocument) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {docs.map((doc) => {
        const plan = doc.itemId ? items.find((item) => item.id === doc.itemId) : undefined;
        const kind = doc.scope === "personal" ? "Personal" : doc.kind.charAt(0).toUpperCase() + doc.kind.slice(1);
        return (
          <li key={doc.id} className="flex min-w-0 items-center gap-3 rounded-card border border-line bg-surface p-3">
            <FileText aria-hidden="true" className="size-5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium" title={doc.fileName}>{doc.fileName}</p>
              <p className="truncate text-xs text-muted">
                {plan ? (
                  <Link to={`/trips/${tripId}/items/${plan.id}`} className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
                    {plan.title}
                  </Link>
                ) : (
                  "Not on a plan"
                )}
                {" · "}
                {kind}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Open ${doc.fileName}`}
              onClick={() => void onOpen(doc)}
              className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-link hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
            >
              Open
            </button>
          </li>
        );
      })}
    </ul>
  );
}
