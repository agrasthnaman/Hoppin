import { Navigate } from "react-router";

/** A trip always opens on Days, which opens on today's date during the trip and on the first day otherwise. */
export function TripEntry() {
  return <Navigate to="days" replace />;
}
