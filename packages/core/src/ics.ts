import { itemPlace } from "./place";
import { addDays, localDate } from "./time";
import type { Item } from "./types";

export interface IcsOptions {
  calendarName: string;
  /** Written as DTSTAMP on every event. */
  now: Date;
  includePrivate: boolean;
  includeOptional: boolean;
  viewerId: string;
  /** Optional plans the viewer said they are going to. */
  joined: ReadonlySet<string>;
}

const HOUR = 3_600_000;
const encoder = new TextEncoder();

/** The plans a person may export: group plans, their own private plans, and optional plans they joined or suggested. */
export function exportableItems(
  items: readonly Item[],
  viewerId: string,
  joined: ReadonlySet<string>,
  opts: { includePrivate: boolean; includeOptional: boolean },
): Item[] {
  return items.filter((item) => {
    if (item.visibility === "private") return opts.includePrivate && item.ownerId === viewerId;
    if (item.groupItem) return true;
    return opts.includeOptional && (joined.has(item.id) || item.ownerId === viewerId);
  });
}

/** TEXT value escaping (RFC 5545 3.3.11). Any line break becomes `\n`. */
function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r\n|\r|\n/g, "\\n");
}

/** Splits a content line into lines of at most 75 octets; continuation lines start with a space. Never splits a character. */
function fold(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = out.length === 0 ? 75 : 74; // the leading space of a continuation counts
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

/** `20260328T041500Z` */
function utc(instant: number): string {
  return new Date(instant).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const dateValue = (date: string) => date.replace(/-/g, "");

function eventLines(item: Item, dtstamp: string): string[] {
  const out = [`UID:${item.id}@hoppinclub.com`, `DTSTAMP:${dtstamp}`, `SEQUENCE:${item.version}`];
  const start = Date.parse(item.startsAt);
  if (item.kind === "stay") {
    const checkIn = localDate(start, item.tz);
    const checkOut = item.endsAt ? localDate(Date.parse(item.endsAt), item.endTz ?? item.tz) : checkIn;
    out.push(`DTSTART;VALUE=DATE:${dateValue(checkIn)}`, `DTEND;VALUE=DATE:${dateValue(checkOut > checkIn ? checkOut : addDays(checkIn, 1))}`);
  } else {
    out.push(`DTSTART:${utc(start)}`, `DTEND:${utc(item.endsAt ? Date.parse(item.endsAt) : start + HOUR)}`);
  }
  out.push(`SUMMARY:${escapeText(item.kind === "flight" ? `Flight: ${item.title}` : item.title)}`);

  const notes = typeof item.details.notes === "string" ? item.details.notes.trim() : "";
  const link = item.locationUrl;
  const description = [notes, link].filter(Boolean).join("\n");
  if (description) out.push(`DESCRIPTION:${escapeText(description)}`);
  const location = itemPlace(item)?.label ?? link;
  if (location) out.push(`LOCATION:${escapeText(location)}`);
  if (link) out.push(`URL:${link.replace(/[\r\n]/g, "")}`);
  return out;
}

/** A calendar file (RFC 5545) with one event per plan the viewer may see. Times are UTC, so no time zone blocks are needed. */
export function buildIcs(items: readonly Item[], opts: IcsOptions): string {
  const chosen = exportableItems(items, opts.viewerId, opts.joined, opts).sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const dtstamp = utc(opts.now.getTime());
  const content = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hoppin//Trip planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(opts.calendarName)}`,
    ...chosen.flatMap((item) => ["BEGIN:VEVENT", ...eventLines(item, dtstamp), "END:VEVENT"]),
    "END:VCALENDAR",
  ];
  return content.map(fold).join("\r\n") + "\r\n";
}
