import { localDate, tripStops } from "@hoppin/core";
import { useSearchParams } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";
import { goingFrom } from "../app/people";
import { TripMap as TripMapView } from "../components/map/TripMap";
import { PageHeading } from "../components/PageHeading";
import { useOnline } from "../hooks/useOnline";

/** Every placed plan on the trip, coloured by day. Opens on today's stops while the trip is on. */
export default function TripMap() {
  const trip = useTripData();
  const { clock } = useServices();
  const online = useOnline();
  const requested = useSearchParams()[0].get("day");
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;
  const { snapshot } = trip;
  const going = goingFrom(snapshot.rsvps);
  const joined = new Set(Object.entries(going).filter(([, ids]) => ids.includes(trip.viewerId)).map(([id]) => id));
  const days = tripStops(snapshot.items, trip.viewerId, joined, snapshot.trip.startDate, snapshot.trip.endDate, clock.timeZone);
  const places = days.reduce((total, day) => total + day.stops.length, 0);
  const lede =
    places === 0
      ? "Where you're going, on one map."
      : `${places} ${places === 1 ? "place" : "places"} over ${days.length} ${days.length === 1 ? "day" : "days"}. Tap a pin to see what's there.`;
  return (
    <div className="flex flex-col gap-4 pb-24">
      <PageHeading title="Map" lede={lede} />
      <TripMapView
        days={days}
        items={snapshot.items}
        tripId={trip.tripId}
        online={online}
        now={clock.now()}
        today={localDate(clock.now(), clock.timeZone)}
        {...(requested ? { initialDay: requested } : {})}
      />
    </div>
  );
}
