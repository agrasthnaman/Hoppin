import { zonedTimeToInstant, type ItemValues } from "@hoppin/core";

/** One booking read from a confirmation, still waiting for the organizer to correct it. */
export type DraftBooking = {
  kind: "flight" | "stay" | "plan";
  title: string;
  startsOn: string | null;
  endsOn: string | null;
  startsAtTime: string;
  endsAtTime: string | null;
  place: string | null;
  unread: boolean;
  fileName: string;
};

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2000 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function dateIn(source: string): string | null {
  const typed = source.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (typed) return iso(Number(typed[1]), Number(typed[2]), Number(typed[3]));
  const dayFirst = source.match(/\b(\d{1,2})[\s-]+([A-Za-z]+)[\s-]+(\d{4})\b/);
  const dayMonth = dayFirst?.[2]?.toLowerCase();
  if (dayFirst && dayMonth && MONTHS[dayMonth]) return iso(Number(dayFirst[3]), MONTHS[dayMonth], Number(dayFirst[1]));
  const monthFirst = source.match(/\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/);
  const monthName = monthFirst?.[1]?.toLowerCase();
  if (monthFirst && monthName && MONTHS[monthName]) return iso(Number(monthFirst[3]), MONTHS[monthName], Number(monthFirst[2]));
  return datesIn(source)[0] ?? null;
}

const WEEKDAYS = new Set(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

function datesIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\b(\d{1,2})[\s-]+([A-Za-z]{3,9})\.?\s+['"]?(\d{4}|\d{2})\b/g)) {
    const month = MONTHS[match[2]?.toLowerCase() ?? ""];
    const yearRaw = Number(match[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const day = month ? iso(year, month, Number(match[1])) : null;
    if (day && !found.includes(day)) found.push(day);
  }
  return found;
}

const NOT_AIRPORT = new Set(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"]);

function clock(value: string): string | null {
  return timeIn(value);
}

function airport(code: string): string | null {
  const upper = code.toUpperCase();
  if (NOT_AIRPORT.has(upper) || !/^[A-Z]{3}$/.test(upper)) return null;
  return upper;
}

type Leg = { from: string; depart: string; to: string; arrive: string };

function legOn(line: string): Leg | null {
  const stacked = line.match(/\b([A-Za-z]{3})\s+(\d{1,2}:\d{2})\s+(\d{1,2}:\d{2})\s+([A-Za-z]{3})\b/);
  if (stacked) {
    const from = airport(stacked[1] ?? "");
    const to = airport(stacked[4] ?? "");
    const depart = clock(stacked[2] ?? "");
    const arrive = clock(stacked[3] ?? "");
    if (from && to && from !== to && depart && arrive) return { from, depart, to, arrive };
  }
  const side = line.match(/\b([A-Za-z]{3})\s+(\d{1,2}:\d{2})\b[\s\S]*?\b([A-Za-z]{3})\s+(\d{1,2}:\d{2})\b/);
  if (!side) return null;
  const from = airport(side[1] ?? "");
  const to = airport(side[3] ?? "");
  const depart = clock(side[2] ?? "");
  const arrive = clock(side[4] ?? "");
  if (!from || !to || from === to || !depart || !arrive) return null;
  return { from, depart, to, arrive };
}

function flightNoIn(source: string): string | null {
  const match = source.replace(/\$([A-Za-z])/g, "S$1").match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s*-\s*(\d{2,4})\b/i);
  if (!match?.[1] || !match[2]) return null;
  return `${match[1].toUpperCase()}-${match[2]}`;
}

function cityRoute(line: string | undefined): string | null {
  if (!line || /\b[A-Za-z]{3}\s+\d{1,2}:\d{2}/.test(line)) return null;
  const match = line.match(/^(.+?)\s+to\s+(.+?)(?=\s+(?:mon|tue|wed|thu|fri|sat|sun)\b|$)/i);
  const from = match?.[1]?.trim();
  const to = match?.[2]?.trim().replace(/[.,]$/, "");
  if (!from || !to || WEEKDAYS.has(from.toLowerCase())) return null;
  return `${from} to ${to}`;
}

function itineraryFlights(fileName: string, text: string): DraftBooking[] {
  const lines = linesOf(text);
  const flights: DraftBooking[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const leg = legOn(lines[index] ?? "");
    if (!leg) continue;
    const window = lines.slice(index, index + 4).join("\n");
    const number = flightNoIn(window);
    const route = cityRoute(lines[index - 1]);
    const title = [number, route ?? `${leg.from} to ${leg.to}`].filter(Boolean).join(" ");
    flights.push({
      kind: "flight",
      title,
      startsOn: datesIn(window)[0] ?? null,
      endsOn: null,
      startsAtTime: leg.depart,
      endsAtTime: null,
      place: null,
      unread: !datesIn(window)[0],
      fileName,
    });
  }
  return flights;
}

/** One file can hold several flights. A labelled ticket or a hotel stays a single booking. */
export function draftBookingsFromText(fileName: string, text: string): DraftBooking[] {
  const flights = itineraryFlights(fileName, text);
  if (flights.length > 0) return flights;
  return [draftBookingFromText(fileName, text)];
}

const WEEKDAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function anchorYears(text: string): number[] {
  const years = [...text.matchAll(/\b(20\d{2})\b/g)].map((match) => Number(match[1]));
  return years.length > 0 ? [...new Set(years)] : [new Date().getUTCFullYear()];
}

function yearFor(weekday: string, day: number, month: number, anchors: readonly number[]): number | null {
  const want = WEEKDAY_INDEX[weekday];
  if (want === undefined) return null;
  const pool = new Set<number>();
  for (const year of anchors) {
    pool.add(year - 1);
    pool.add(year);
    pool.add(year + 1);
    pool.add(year + 2);
  }
  const matches = [...pool]
    .filter((year) => iso(year, month, day) !== null && new Date(Date.UTC(year, month - 1, day)).getUTCDay() === want)
    .sort((a, b) => a - b);
  const anchor = Math.max(...anchors);
  return matches.find((year) => year >= anchor) ?? matches.at(-1) ?? null;
}

function bareDates(line: string): { weekday: string; day: number; month: number }[] {
  const found: { weekday: string; day: number; month: number }[] = [];
  for (const match of line.matchAll(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s+(\d{1,2})\s+([a-z]{3,9})\b(?!\s*['"]?\d)/gi)) {
    const weekday = match[1]?.toLowerCase().slice(0, 3);
    const month = MONTHS[match[3]?.toLowerCase() ?? ""];
    if (!weekday || !month) continue;
    found.push({ weekday, day: Number(match[2]), month });
  }
  return found;
}

/** Check-in and check-out printed side by side, the way Airbnb does, often without a year. */
function pairedStay(lines: readonly string[], anchors: readonly number[]): { startsOn: string; endsOn: string; startsAtTime: string | null; endsAtTime: string | null } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (!/check-?in/i.test(line) || !/check-?out/i.test(line)) continue;
    const dates = bareDates(lines[index + 1] ?? "");
    const arrival = dates[0];
    const departure = dates[1];
    if (!arrival || !departure) continue;
    const startYear = yearFor(arrival.weekday, arrival.day, arrival.month, anchors);
    const endYear = yearFor(departure.weekday, departure.day, departure.month, anchors);
    if (!startYear || !endYear) continue;
    const startsOn = iso(startYear, arrival.month, arrival.day);
    const endsOn = iso(endYear, departure.month, departure.day);
    if (!startsOn || !endsOn) continue;
    const times = timesIn(lines[index + 2] ?? "");
    return { startsOn, endsOn: endsOn < startsOn ? startsOn : endsOn, startsAtTime: times[0] ?? null, endsAtTime: times[1] ?? null };
  }
  return null;
}

function timeIn(source: string): string | null {
  const match = source.match(/\b(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function timesIn(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi)) {
    const clock = timeIn(match[0]);
    if (clock) found.push(clock);
  }
  return found;
}

function linesOf(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

function labeled(lines: string[], labels: readonly string[]): string | null {
  for (const line of lines) {
    for (const label of labels) {
      const match = line.match(new RegExp(`^${label}\\s*[:\\-]\\s*(.+)$`, "i"));
      const value = match?.[1]?.trim();
      if (value) return value;
    }
  }
  return null;
}

function blank(fileName: string): DraftBooking {
  return {
    kind: "plan",
    title: fileName,
    startsOn: null,
    endsOn: null,
    startsAtTime: "12:00",
    endsAtTime: null,
    place: null,
    unread: true,
    fileName,
  };
}

/** Reads one confirmation. A file with nothing useful comes back unread, for the organizer to fill in. */
export function draftBookingFromText(fileName: string, text: string): DraftBooking {
  const body = text.trim();
  if (!body) return blank(fileName);
  const lower = body.toLowerCase();
  const stay = /check-?in|hotel\s*:|property\s*:/.test(lower);
  const flight = /flight|e-ticket|eticket|boarding/.test(lower);
  const lines = linesOf(body);

  if (stay && (!flight || /check-?in/.test(lower))) {
    const name = labeled(lines, ["property name", "hotel", "property"]) ?? fileName.replace(/\.pdf$/i, "");
    const checkIn = labeled(lines, ["check-in", "check in", "arrival"]);
    const checkOut = labeled(lines, ["check-out", "check out", "departure"]);
    const paired = pairedStay(lines, anchorYears(body));
    const startsOn = (checkIn && dateIn(checkIn)) || paired?.startsOn || null;
    const endsOn = (checkOut && dateIn(checkOut)) || paired?.endsOn || null;
    if (!startsOn && !name) return blank(fileName);
    return {
      kind: "stay",
      title: name,
      startsOn,
      endsOn,
      startsAtTime: (checkIn && timeIn(checkIn)) || paired?.startsAtTime || "15:00",
      endsAtTime: endsOn ? (checkOut && timeIn(checkOut)) || paired?.endsAtTime || "11:00" : null,
      place: labeled(lines, ["address", "location"]),
      unread: !startsOn,
      fileName,
    };
  }

  if (flight) {
    const from = labeled(lines, ["from"]);
    const to = labeled(lines, ["to"]);
    const departure = labeled(lines, ["departure", "depart", "date"]);
    const startsOn = (departure && dateIn(departure)) || dateIn(body);
    return {
      kind: "flight",
      title: from && to ? `${from} to ${to}` : fileName.replace(/\.pdf$/i, ""),
      startsOn,
      endsOn: null,
      startsAtTime: (departure && timeIn(departure)) || "12:00",
      endsAtTime: null,
      place: null,
      unread: !startsOn,
      fileName,
    };
  }

  return blank(fileName);
}

/** The earliest and latest day across the bookings that had a date. */
export function tripSpan(bookings: readonly DraftBooking[]): { startDate: string | null; endDate: string | null } {
  const days = bookings.flatMap((booking) => [booking.startsOn, booking.endsOn].filter((day): day is string => day !== null)).sort();
  const startDate = days[0];
  const endDate = days[days.length - 1];
  if (!startDate || !endDate) return { startDate: null, endDate: null };
  return { startDate, endDate };
}

/** The plan to save for one drafted booking. Null when it has no day to land on. */
export function bookingItemValues(booking: DraftBooking, fallbackDay: string | null, tz: string): ItemValues | null {
  const day = booking.startsOn ?? fallbackDay;
  if (!day) return null;
  // The review step already says which files could not be read, and the file itself is attached to the plan.
  // Nothing about the drafting is saved into the plan's notes, so they hold only what is useful later.
  const notes = booking.place ?? "";
  return {
    kind: booking.kind,
    title: booking.title.trim() || booking.fileName,
    startsAt: zonedTimeToInstant(`${day}T${booking.startsAtTime}`, tz),
    endsAt: booking.endsOn ? zonedTimeToInstant(`${booking.endsOn}T${booking.endsAtTime ?? "11:00"}`, tz) : null,
    tz,
    locationUrl: null,
    visibility: "shared",
    groupItem: true,
    notes,
  };
}
