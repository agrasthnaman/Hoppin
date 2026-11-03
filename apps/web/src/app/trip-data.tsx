import { createContext, useContext, type ReactNode } from "react";
import { Button } from "../components/ui/Button";
import type { TripState } from "./useTrip";

export interface TripData extends TripState {
  tripId: string;
  viewerId: string;
}

const TripDataContext = createContext<TripData | null>(null);
export const TripDataProvider = TripDataContext.Provider;

/** The trip the current screens belong to, kept in sync by the trip shell. */
export function useTripData(): TripData {
  const data = useContext(TripDataContext);
  if (!data) throw new Error("useTripData must be used inside a trip");
  return data;
}

/** A message to show instead of the screen while the trip is not ready, or null when it is. */
export function tripGate(trip: TripData): ReactNode | null {
  switch (trip.phase) {
    case "ready":
      return null;
    case "loading":
      return <p role="status">Loading your trip…</p>;
    case "removed":
      return <p>You no longer have access to this trip.</p>;
    case "unavailable":
      return (
        <div className="flex flex-col items-start gap-3">
          <p>This trip isn't on this device yet. Connect to the internet and try again.</p>
          <Button onClick={() => void trip.refresh()}>Try again</Button>
        </div>
      );
  }
}
