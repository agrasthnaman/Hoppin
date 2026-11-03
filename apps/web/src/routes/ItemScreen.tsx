import type { TripDocument } from "@hoppin/core";
import { ChevronLeft } from "lucide-react";
import { Link, useParams } from "react-router";
import { peopleFrom } from "../app/people";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { BookingDetail } from "../components/BookingDetail";
import { getDeviceKey } from "../offline/crypto";
import { getLocalDocument } from "../offline/sync";

/** One item with its documents. Documents open from this device when stored there, otherwise online. */
export function ItemScreen() {
  const { itemId } = useParams();
  const trip = useTripData();
  const { actions, db } = useServices();

  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;

  const back = (
    <Link to={`/trips/${trip.tripId}/days`} className="mb-3 inline-flex items-center gap-1 text-accent focus-visible:outline-2 focus-visible:outline-accent">
      <ChevronLeft aria-hidden="true" className="size-4" />
      Back to days
    </Link>
  );
  const item = snapshot.items.find((i) => i.id === itemId);
  const member = snapshot.members.find((m) => m.userId === trip.viewerId);
  if (!item || !member) {
    return (
      <div>
        {back}
        <p>This item isn't available. It may have been deleted.</p>
      </div>
    );
  }

  async function openDocument(doc: TripDocument) {
    const stored = await getLocalDocument(db, doc, await getDeviceKey(db));
    if (stored) {
      window.open(URL.createObjectURL(stored), "_blank", "noopener");
      return;
    }
    if (!navigator.onLine) throw new Error("This document isn't on this device and you're offline.");
    window.open(await actions.documentUrl(doc), "_blank", "noopener");
  }

  return (
    <div>
      {back}
      <BookingDetail
        item={item}
        member={member}
        documents={snapshot.documents}
        people={peopleFrom(snapshot.members)}
        onSave={async (values) => {
          await trip.editItem(item, values); // saved on this device first; sent as soon as there is a connection
        }}
        onUpload={async (file, scope) => {
          await actions.uploadDocument(file, { tripId: trip.tripId, ownerId: trip.viewerId, itemId: item.id, scope, kind: "document" });
          await trip.refresh();
        }}
        onOpenDocument={openDocument}
      />
    </div>
  );
}
