import { describeChange, localDate, type ItemKind, type NotifiedChange, type TripNotification } from "@hoppin/core";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useServices } from "../app/services";
import { useTripData } from "../app/trip-data";
import { KIND_STYLE } from "../components/kind";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { Card } from "../components/ui/Card";
import { useOnline } from "../hooks/useOnline";

type Load = { status: "loading" } | { status: "failed" } | { status: "ready"; notifications: TripNotification[] };

/** "Just now", "12 min ago", "Today, 14:05" or "Tue 1 Dec, 14:05", in the device's time zone. */
function whenSent(iso: string, now: number, timeZone: string): string {
  const at = Date.parse(iso);
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  if (localDate(at, timeZone) === localDate(now, timeZone)) return `Today, ${time}`;
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short", day: "numeric", month: "short" }).format(at);
  return `${day}, ${time}`;
}

function ChangeRow({ change, tripId }: { change: NotifiedChange; tripId: string }) {
  const { headline, lines } = describeChange(change);
  const { icon: Icon, tag } = KIND_STYLE[change.kind as ItemKind] ?? KIND_STYLE.plan;
  const body = (
    <>
      <span aria-hidden="true" className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${tag}`}>
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`font-semibold ${change.op === "removed" ? "text-muted line-through" : ""}`}>{headline}</span>
        {lines.map((line) => (
          <span key={line} className="break-words text-sm text-muted">
            {line}
          </span>
        ))}
        {change.byNames.length > 0 && <span className="text-xs text-muted">by {change.byNames.join(", ")}</span>}
      </span>
    </>
  );
  if (change.op === "removed") return <li className="flex items-start gap-3 py-3">{body}</li>;
  return (
    <li>
      <Link
        to={`/trips/${tripId}/items/${change.itemId}`}
        aria-label={`Open ${change.title}`}
        className="-mx-2 flex items-start gap-3 rounded-card px-2 py-3 hover:bg-raised focus-visible:outline-2 focus-visible:outline-accent"
      >
        {body}
        <ChevronRight aria-hidden="true" className="mt-2 size-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}

/** What other people changed in the trip, grouped the way it was sent, and whether to also get it by email. */
export default function Updates() {
  const trip = useTripData();
  const { actions, clock } = useServices();
  const online = useOnline();
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [emailOn, setEmailOn] = useState(true);
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const tripId = trip.tripId;

  const fetchUpdates = useCallback(async (isCurrent: () => boolean) => {
    setLoad({ status: "loading" });
    try {
      const result = await actions.listUpdates(tripId);
      if (!isCurrent()) return;
      setLoad({ status: "ready", notifications: result.notifications });
      setEmailOn(result.emailOn);
      // "New" stays on screen for this visit; next time these show as read.
      if (result.notifications.some((n) => !n.readAt)) void actions.markUpdatesRead(tripId).catch(() => {});
    } catch {
      if (isCurrent()) setLoad({ status: "failed" });
    }
  }, [actions, tripId]);

  useEffect(() => {
    if (!online) return;
    let current = true;
    void fetchUpdates(() => current);
    return () => {
      current = false;
    };
  }, [fetchUpdates, online]);

  async function toggleEmail() {
    const next = !emailOn;
    setEmailOn(next);
    setEmailError(null);
    setSavingEmail(true);
    try {
      await actions.setEmailUpdates(tripId, next);
    } catch {
      setEmailOn(!next);
      setEmailError("Couldn't save. Check your connection and try again.");
    } finally {
      setSavingEmail(false);
    }
  }

  const now = clock.now();
  return (
    <div className="flex flex-col gap-4">
      <Dialog.Description className="text-sm text-muted">
        When someone adds, changes or removes a plan you can see, it shows up here. Changes made within a few minutes of each other arrive together.
      </Dialog.Description>

      <Card className="flex flex-col gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={emailOn}
          aria-describedby="email-updates-help"
          disabled={!online || savingEmail || load.status === "loading"}
          onClick={() => void toggleEmail()}
          className="group flex min-h-11 w-full items-center justify-between gap-3 text-left font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          Email me updates
          <span aria-hidden="true" className="relative h-6.5 w-11 shrink-0 rounded-full border border-line bg-raised transition-colors group-aria-checked:border-accent group-aria-checked:bg-accent">
            <span className="absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow-card transition-transform duration-300 group-aria-checked:translate-x-[18px]" />
          </span>
        </button>
        <p id="email-updates-help" className="text-sm text-muted">
          {emailOn ? "You get one email for each batch of changes in this trip, at most every 5 minutes." : "No emails for this trip. Updates still show here."}
        </p>
        {emailError && (
          <p role="alert" className="text-sm text-danger-fg">
            {emailError}
          </p>
        )}
      </Card>

      {!online ? (
        <p className="text-sm text-muted">Connect to the internet to see updates.</p>
      ) : load.status === "loading" ? (
        <p role="status" aria-label="Loading updates" className="flex items-center gap-3 text-sm text-muted">
          <Spinner className="text-accent" />
          Loading updates…
        </p>
      ) : load.status === "failed" ? (
        <Card className="flex flex-col items-start gap-3">
          <p role="alert" className="text-sm text-danger-fg">Couldn't load updates. Check your connection.</p>
          <Button variant="secondary" onClick={() => void fetchUpdates(() => true)}>
            Try again
          </Button>
        </Card>
      ) : load.notifications.length === 0 ? (
        <Card className="flex flex-col gap-1">
          <p className="font-semibold">No updates yet</p>
          <p className="text-sm text-muted">When someone else adds or changes a plan, you'll see what changed here, so nobody has to ask the organizer.</p>
        </Card>
      ) : (
        load.notifications.map((n) => {
          const label = whenSent(n.createdAt, now, clock.timeZone);
          return (
            <Card key={n.id} role="article" aria-label={`${label}${n.readAt ? "" : ", new"}`} className="flex flex-col py-2">
              <div className="flex items-center gap-2 pt-2">
                <h3 className="text-sm font-semibold text-muted">{label}</h3>
                {!n.readAt && <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-fg">New</span>}
              </div>
              <ul className="flex flex-col divide-y divide-line">
                {n.changes.map((c) => (
                  <ChangeRow key={`${c.itemId}-${c.at}`} change={c} tripId={tripId} />
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
}

/** Old links to the updates page open the panel over Days instead of leaving the trip. */
export function OpenUpdates() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("../days", { replace: true, state: { updates: true } });
  }, [navigate]);
  return null;
}
