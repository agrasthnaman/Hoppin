/** How far a time zone is ahead of UTC at an instant, in milliseconds (handles daylight saving). */
function offsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(instant / 1000) * 1000;
}

function startOfDay(date: string, tz: string): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const first = guess - offsetMs(guess, tz);
  return guess - offsetMs(first, tz); // second pass settles days where the offset changes
}

/** Adds (or subtracts) calendar days to a `YYYY-MM-DD` date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The instants (ms since epoch) where a calendar day starts and where the next one starts, in a time zone. */
export function dayRange(date: string, tz: string): { start: number; end: number } {
  return { start: startOfDay(date, tz), end: startOfDay(addDays(date, 1), tz) };
}

/** 24-hour `HH:mm` clock time of an instant in a time zone. */
export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(
    new Date(iso),
  );
}

/**
 * Turns a wall-clock time in a zone (`YYYY-MM-DDTHH:mm`, as a datetime-local field gives) into an ISO instant.
 * A time that does not exist (skipped by a clock change) resolves to the moment just after the change.
 */
export function zonedTimeToInstant(local: string, tz: string): string {
  const [date = "", time = "00:00"] = local.split("T");
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [hh, mm] = time.split(":").map(Number) as [number, number];
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetMs(guess, tz);
  return new Date(guess - offsetMs(first, tz)).toISOString();
}

/** The reverse: an instant as `YYYY-MM-DDTHH:mm` wall-clock time in a zone, for a datetime-local field. */
export function instantToZonedInput(iso: string, tz: string): string {
  const t = new Date(iso).getTime();
  return new Date(t + offsetMs(t, tz)).toISOString().slice(0, 16);
}

/** The calendar date (`YYYY-MM-DD`) of an instant in a time zone. */
export function localDate(instant: number, tz: string): string {
  return instantToZonedInput(new Date(instant).toISOString(), tz).slice(0, 10);
}

/** Which day a trip screen opens on: today if it is within the trip, otherwise the first day. */
export function defaultDay(trip: { startDate: string | null; endDate: string | null }, now: number, tz: string): string {
  const today = localDate(now, tz);
  if (trip.startDate && today < trip.startDate) return trip.startDate;
  if (trip.startDate && trip.endDate && today > trip.endDate) return trip.startDate;
  return today;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "10:00 – 12:30" for something within one day, "14:00 – 5 Dec 11:00" when it ends on a later day (a stay),
 * or just "10:00" with no end. The start is shown in `tz` and the end in `endTz` (the same zone unless the item ends
 * somewhere else, like a flight). A later day is the end's own calendar day compared with the start's.
 */
export function formatTimeRange(startIso: string, endIso: string | null, tz: string, endTz?: string | null): string {
  const endZone = endTz ?? tz;
  const start = formatTime(startIso, tz);
  if (!endIso) return start;
  const startDay = instantToZonedInput(startIso, tz).slice(0, 10);
  const endLocal = instantToZonedInput(endIso, endZone);
  if (endLocal.slice(0, 10) === startDay) return `${start} – ${formatTime(endIso, endZone)}`;
  return `${start} – ${Number(endLocal.slice(8, 10))} ${MONTHS[Number(endLocal.slice(5, 7)) - 1]} ${formatTime(endIso, endZone)}`;
}

/**
 * The time zone a new plan on `date` should be entered in: where the group is on that day, not where the person
 * typing it happens to be. It is the most common zone of the other plans on that day, then of the whole trip, and
 * only then the phone's own zone. Flights are left out because they start in one place and end in another.
 */
export function planZone(items: { kind: string; startsAt: string; tz: string }[], date: string, deviceTz: string): string {
  const common = (list: { tz: string }[]): string | null => {
    const counts = new Map<string, number>();
    for (const { tz } of list) counts.set(tz, (counts.get(tz) ?? 0) + 1);
    let best: string | null = null;
    for (const [tz, n] of counts) if (best === null || n > counts.get(best)!) best = tz;
    return best;
  };
  const ground = items.filter((item) => item.kind !== "flight");
  const sameDay = ground.filter((item) => localDate(Date.parse(item.startsAt), item.tz) === date);
  return common(sameDay) ?? common(ground) ?? deviceTz;
}
