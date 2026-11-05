import type { TripSnapshot } from "@hoppin/core";
import { personColor } from "../lib/colors";
import type { Person } from "../components/DayView";

/** Name and colour for each member. Colours follow a stable order (by user id) so a person keeps theirs. */
export function peopleFrom(members: TripSnapshot["members"]): Record<string, Person> {
  const byId = [...members].sort((a, b) => a.userId.localeCompare(b.userId));
  return Object.fromEntries(byId.map((m, i) => [m.userId, { name: m.displayName, color: personColor(i) }]));
}

/** True when this viewer organizes the trip and someone is still waiting to be approved. */
export function waitingForOrganizer(members: TripSnapshot["members"], viewerId: string): boolean {
  const me = members.find((member) => member.userId === viewerId);
  return me?.role === "organizer" && members.some((member) => member.status === "pending");
}

export function goingFrom(rsvps: TripSnapshot["rsvps"]): Record<string, string[]> {
  const going: Record<string, string[]> = {};
  for (const r of rsvps) (going[r.itemId] ??= []).push(r.userId);
  return going;
}

/** Someone who can pay for or share an expense: a member (in any status, or one who left) or a guest. */
export interface MoneyPerson extends Person {
  id: string;
  guest: boolean;
  /** For a guest: the member who added them. */
  addedBy?: string;
  /** Can be picked for new expenses (approved members and guests). */
  active: boolean;
}

/** Everyone who appears in the trip's money, by id. Guests' colours follow the members'. */
export function moneyPeople(snapshot: TripSnapshot): Map<string, MoneyPerson> {
  const members = peopleFrom(snapshot.members);
  const people = new Map<string, MoneyPerson>();
  for (const m of snapshot.members) {
    const p = members[m.userId] as Person;
    people.set(m.userId, { ...p, id: m.userId, guest: false, active: m.status === "approved" });
  }
  const guests = [...(snapshot.guests ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  guests.forEach((g, i) => people.set(g.id, { id: g.id, name: g.name, color: personColor(snapshot.members.length + i), guest: true, addedBy: g.addedBy, active: true }));
  return people;
}

/** A person's name as the viewer reads it: "You", their name, or "Someone who left". */
export function moneyName(people: Map<string, MoneyPerson>, id: string, viewerId: string, you = "You"): string {
  if (id === viewerId) return you;
  return people.get(id)?.name ?? "Someone who left";
}
