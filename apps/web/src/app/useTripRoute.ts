import { useParams } from "react-router";
import { useServices } from "./services";
import type { TripData } from "./trip-data";
import { useTrip } from "./useTrip";
import { useUser } from "./user";

/** Loads and syncs the trip named in the URL, for a screen that provides it to the screens below. */
export function useTripRoute(): TripData {
  const { tripId = "" } = useParams();
  const { userId } = useUser();
  const services = useServices();
  const trip = useTrip(
    {
      db: services.db,
      tripSource: services.tripSource,
      documentSource: services.documentSource,
      writer: services.actions,
      moneyWriter: services.actions,
      rates: services.rates,
    },
    tripId,
    userId,
  );
  return { ...trip, tripId, viewerId: userId };
}
