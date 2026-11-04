import { visibleDocuments, type TripDocument } from "@hoppin/core";
import { FileText } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { getDeviceKey } from "../offline/crypto";
import { getLocalDocument } from "../offline/sync";

/** Every file saved with this trip. Opens the copy on the phone when there is one. */
export default function Docs() {
  const trip = useTripData();
  const { actions, db } = useServices();
  const [failed, setFailed] = useState<string | null>(null);
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;
  const member = snapshot.members.find((person) => person.userId === trip.viewerId);
  if (!member) return <p>This trip isn't available.</p>;

  const docs = visibleDocuments(snapshot.documents, member);

  async function open(doc: TripDocument) {
    setFailed(null);
    try {
      const stored = await getLocalDocument(db, doc, await getDeviceKey(db));
      if (stored) {
        window.open(URL.createObjectURL(stored), "_blank", "noopener");
        return;
      }
      if (!navigator.onLine) throw new Error("offline");
      window.open(await actions.documentUrl(doc), "_blank", "noopener");
    } catch {
      setFailed(doc.fileName);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-4xl font-extrabold">Docs</h1>
        <p className="mt-1 text-sm text-muted">Tickets and files kept with this trip. Ones saved on this phone open with no signal.</p>
      </div>
      {docs.length === 0 ? (
        <p>No documents yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((doc) => {
            const plan = doc.itemId ? snapshot.items.find((item) => item.id === doc.itemId) : undefined;
            const kind = doc.scope === "personal" ? "Personal" : doc.kind.charAt(0).toUpperCase() + doc.kind.slice(1);
            return (
              <li key={doc.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
                <FileText aria-hidden="true" className="size-5 shrink-0 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{doc.fileName}</p>
                  <p className="truncate text-xs text-muted">
                    {plan ? (
                      <Link to={`/trips/${trip.tripId}/items/${plan.id}`} className="font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
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
                  onClick={() => void open(doc)}
                  className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold text-link hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
                >
                  Open
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {failed && (
        <p role="alert" className="text-sm text-danger-fg">
          Couldn't open {failed}. Check your connection and try again.
        </p>
      )}
    </div>
  );
}
