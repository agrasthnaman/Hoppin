import { currentTripId } from "@hoppin/core";

/** Where a signed-in person should land: Today for the trip underway, otherwise the trip list. */
export function homePath(
  trips: readonly { id: string; startDate?: string | null; endDate?: string | null }[],
  today: string,
): string {
  const id = currentTripId(trips, today);
  return id ? `/trips/${id}/today` : "/trips";
}
