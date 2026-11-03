import type { TripSnapshot } from "@hoppin/core";
import { personColor } from "../lib/colors";
import type { Person } from "../components/DayView";

/** Name and colour for each member. Colours follow a stable order (by user id) so a person keeps theirs. */
export function peopleFrom(members: TripSnapshot["members"]): Record<string, Person> {
  const byId = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
  return Object.fromEntries(byId.map((m, i) => [m.userId, { name: m.displayName, color: personColor(i) }]));
}

export function goingFrom(rsvps: TripSnapshot["rsvps"]): Record<string, string[]> {
  const going: Record<string, string[]> = {};
  for (const r of rsvps) (going[r.itemId] ??= []).push(r.userId);
  return going;
}
