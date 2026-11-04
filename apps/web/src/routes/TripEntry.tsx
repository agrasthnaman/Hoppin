import { localDate } from "@hoppin/core";
import { Navigate } from "react-router";
import { useServices } from "../app/services";
import { tripGate, useTripData } from "../app/trip-data";

/** During the trip, the trip opens on Today. Outside those dates it opens on the day plan. */
export function TripEntry() {
  const trip = useTripData();
  const { clock } = useServices();
  const gate = tripGate(trip);
  if (gate || !trip.snapshot) return gate;

  const today = localDate(clock.now(), clock.timeZone);
  const { startDate, endDate } = trip.snapshot.trip;
  const during = Boolean(startDate && endDate && startDate <= today && today <= endDate);
  return <Navigate to={during ? "today" : "days"} replace />;
}
