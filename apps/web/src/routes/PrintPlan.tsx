import { buildPrintPlan } from "@hoppin/core";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { tripGate } from "../app/trip-data";
import { useTripRoute } from "../app/useTripRoute";
import { Button } from "../components/ui/Button";
import { formatDateRange } from "../lib/dates";
import "./print.css";

/** A clean copy of the plan for printing or "Save as PDF". Outside the app shell, rendered from the saved trip, so it works offline. */
export default function PrintPlan() {
  const trip = useTripRoute();
  const { clock } = useServices();
  const [params] = useSearchParams();
  const includeNotes = params.get("notes") === "1";
  const includeOptional = params.get("optional") !== "0";
  const back = `/trips/${trip.tripId}/export`;

  const gate = tripGate(trip);
  const plan =
    !gate && trip.snapshot
      ? buildPrintPlan(trip.snapshot, { viewerId: trip.viewerId, includeNotes, includeOptional, printedAt: clock.now(), deviceTz: clock.timeZone })
      : null;

  return (
    <div className="print-page min-h-dvh bg-raised px-3 py-4 sm:py-8">
      <div className="print-toolbar mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2">
        <Link
          to={back}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back
        </Link>
        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-muted sm:block">Choose Print, then Save as PDF to keep a copy.</p>
          <Button disabled={!plan} onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" />
            Print
          </Button>
        </div>
      </div>

      <main className="print-sheet mx-auto flex max-w-[210mm] flex-col gap-5 rounded-card bg-surface p-6 text-fg shadow-card sm:p-10">
        {gate ?? (plan && (
          <>
            <header className="flex flex-col gap-1 border-b border-line pb-4">
              <h1 className="font-display text-3xl font-bold">{plan.header.name}</h1>
              <p className="font-semibold">
                {formatDateRange(plan.header.startDate, plan.header.endDate)}
                {plan.header.destination && ` · ${plan.header.destination}`}
              </p>
              {plan.header.travellers.length > 0 && <p className="text-sm">Travellers: {plan.header.travellers.join(", ")}</p>}
              <p className="text-xs text-muted">{plan.header.printed}</p>
            </header>

            {plan.days.length === 0 && <p>There are no plans in this trip yet.</p>}
            {plan.days.map((day) => (
              <section key={day.date} aria-labelledby={`day-${day.date}`} className="flex flex-col gap-2">
                <h2 id={`day-${day.date}`} className="print-day-heading border-b border-line pb-1 text-lg font-bold">
                  {day.heading}
                </h2>
                {day.stays.map((line) => (
                  <p key={line} className="print-plan text-sm font-semibold">
                    {line}
                  </p>
                ))}
                {day.plans.length === 0 && day.stays.length === 0 && <p className="text-sm text-muted">Nothing planned.</p>}
                <ul className="flex flex-col gap-2">
                  {day.plans.map((p) => (
                    <li key={p.id} className="print-plan grid grid-cols-[7.5rem_1fr] gap-x-3 text-sm">
                      <span className="font-semibold tabular-nums">{p.time}</span>
                      <span className="flex min-w-0 flex-col">
                        <span>
                          <span className="font-semibold">{p.title}</span>
                          <span className="text-muted"> · {p.kind}</span>
                        </span>
                        {p.place && <span>{p.place}</span>}
                        {p.link && <span className="break-all text-xs text-muted">{p.link}</span>}
                        {p.notes && <span className="whitespace-pre-line text-xs">{p.notes}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ))}
      </main>
    </div>
  );
}
