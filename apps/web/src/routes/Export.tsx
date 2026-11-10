import { buildIcs, exportableItems, zoneLabel } from "@hoppin/core";
import { Capacitor } from "@capacitor/core";
import { CalendarPlus, Printer } from "lucide-react";
import { useId, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { downloadText, safeFileName } from "../lib/download";
import { browserSharePorts, deliverIcs } from "../lib/share";

function Option({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-3 text-sm font-medium">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--color-accent)]" />
      {label}
    </label>
  );
}

const plansCount = (n: number) => (n === 1 ? "1 plan" : `${n} plans`);

/** Get the plan out of Hoppin: a calendar file, or a clean page to print or save as PDF. Both work offline. */
export default function Export() {
  const trip = useTripData();
  const { clock } = useServices();
  const navigate = useNavigate();
  const [calOptional, setCalOptional] = useState(true);
  const [calPrivate, setCalPrivate] = useState(true);
  const [printNotes, setPrintNotes] = useState(false);
  const [printOptional, setPrintOptional] = useState(true);
  const [saved, setSaved] = useState<string | null>(null);

  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;
  const joined = new Set(snapshot.rsvps.filter((r) => r.userId === trip.viewerId).map((r) => r.itemId));
  const calendarCount = exportableItems(snapshot.items, trip.viewerId, joined, { includePrivate: calPrivate, includeOptional: calOptional }).length;

  const native = Capacitor.isNativePlatform();

  async function downloadCalendar() {
    const ics = buildIcs(snapshot.items, {
      calendarName: snapshot.trip.name,
      now: new Date(clock.now()),
      includePrivate: calPrivate,
      includeOptional: calOptional,
      viewerId: trip.viewerId,
      joined,
    });
    const filename = `${safeFileName(snapshot.trip.name)}.ics`;
    const result = await deliverIcs(native, filename, ics, { download: downloadText, ports: browserSharePorts(native) });
    if (result === "cancelled") return;
    const verb = result === "shared" ? "Shared" : "Saved";
    setSaved(`${verb} ${filename} with ${plansCount(calendarCount)}. Open it to add them to your calendar.`);
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to={`/trips/${trip.tripId}/more`} className="w-fit text-sm font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent">
        Back to More
      </Link>
      <div className="flex flex-col gap-1">
        <h2 className="page-title text-5xl">Export</h2>
        <p className="text-sm text-muted">Only what you can see in the plan is exported. Other people's private plans never are. Works offline.</p>
      </div>

      <Card className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <CalendarPlus aria-hidden="true" className="size-5 text-muted" />
          Add to calendar
        </h3>
        <p className="text-sm text-muted">Download the plan as a calendar file. Open it to add every plan to Apple Calendar, Google Calendar or Outlook.</p>
        <p className="text-sm text-muted">Your calendar shows each plan at the right moment, in this device's time zone ({zoneLabel(clock.timeZone, clock.now())}).</p>
        <div className="flex flex-col">
          <Option label="Include optional plans I joined" checked={calOptional} onChange={setCalOptional} />
          <Option label="Include my private plans" checked={calPrivate} onChange={setCalPrivate} />
        </div>
        <p className="text-sm text-muted">
          {calendarCount === 0 ? "There are no plans to add yet." : `${plansCount(calendarCount)} will be added. Downloading it again later updates them instead of adding copies.`}
        </p>
        <Button className="w-fit" disabled={calendarCount === 0} onClick={() => void downloadCalendar()}>
          {native ? "Add to calendar" : "Download calendar file"}
        </Button>
        {saved && (
          <p role="status" className="text-sm">
            {saved}
          </p>
        )}
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="flex items-center gap-2 font-semibold">
          <Printer aria-hidden="true" className="size-5 text-muted" />
          Print or save as PDF
        </h3>
        <p className="text-sm text-muted">Opens a clean copy of the plan. Choose Print, then Save as PDF.</p>
        <p className="text-sm text-muted">Times are in the trip's time zone. You can pick another one on the next page.</p>
        <div className="flex flex-col">
          <Option label="Include notes" checked={printNotes} onChange={setPrintNotes} />
          {printNotes && <p className="-mt-1 mb-1 pl-8 text-xs text-muted">Notes can hold booking numbers. Only share the printout with people you trust.</p>}
          <Option label="Include optional plans I joined" checked={printOptional} onChange={setPrintOptional} />
        </div>
        <Button
          className="w-fit"
          variant="secondary"
          onClick={() => navigate(`/trips/${trip.tripId}/print?notes=${printNotes ? 1 : 0}&optional=${printOptional ? 1 : 0}`)}
        >
          Open printable plan
        </Button>
      </Card>
    </div>
  );
}
