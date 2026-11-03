/** Data older than this is called stale. */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function agoText(lastSyncedAt: number, now: number): string {
  const diff = Math.max(0, now - lastSyncedAt); // a clock slightly ahead counts as "just now"
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** "Synced 5 min ago", shown on every screen. */
export function formatSyncedAgo(lastSyncedAt: number | null, now: number): string {
  return lastSyncedAt === null ? "Not synced yet" : `Synced ${agoText(lastSyncedAt, now)}`;
}

export interface SyncState {
  online: boolean;
  /** When the trip was last refreshed from the server (ms since epoch), or null if never. */
  lastSyncedAt: number | null;
  now: number;
}

export interface SyncBanner {
  kind: "offline" | "stale";
  text: string;
}

/** Which trust banners to show: offline, and/or "may be out of date" when the last sync is over 24 hours old. */
export function syncBanners({ online, lastSyncedAt, now }: SyncState): SyncBanner[] {
  const banners: SyncBanner[] = [];
  if (!online) banners.push({ kind: "offline", text: "You're offline. Showing your saved trip." });
  if (lastSyncedAt !== null && now - lastSyncedAt > STALE_AFTER_MS) {
    banners.push({ kind: "stale", text: `Last synced ${agoText(lastSyncedAt, now)}. Some details may be out of date.` });
  }
  return banners;
}
