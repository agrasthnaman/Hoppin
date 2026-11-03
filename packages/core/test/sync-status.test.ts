import { describe, expect, it } from "vitest";
import { formatSyncedAgo, STALE_AFTER_MS, staleness, syncBanners } from "../src/sync-status";

const NOW = Date.UTC(2026, 11, 1, 12, 0, 0);
const ago = (ms: number) => NOW - ms;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatSyncedAgo", () => {
  it("says when the trip was last synced in plain words", () => {
    expect(formatSyncedAgo(null, NOW)).toBe("Not synced yet");
    expect(formatSyncedAgo(ago(20_000), NOW)).toBe("Synced just now");
    expect(formatSyncedAgo(ago(5 * MIN), NOW)).toBe("Synced 5 min ago");
    expect(formatSyncedAgo(ago(3 * HOUR), NOW)).toBe("Synced 3 h ago");
    expect(formatSyncedAgo(ago(1 * DAY + HOUR), NOW)).toBe("Synced 1 day ago");
    expect(formatSyncedAgo(ago(4 * DAY), NOW)).toBe("Synced 4 days ago");
  });

  it("treats a time in the future (clock difference) as just now", () => {
    expect(formatSyncedAgo(NOW + 5 * MIN, NOW)).toBe("Synced just now");
  });
});

describe("syncBanners", () => {
  it("is 24 hours before data counts as stale", () => {
    expect(STALE_AFTER_MS).toBe(DAY);
  });

  it("shows nothing when online and fresh", () => {
    expect(syncBanners({ online: true, lastSyncedAt: ago(5 * MIN), now: NOW })).toEqual([]);
  });

  it("shows an offline banner when offline", () => {
    expect(syncBanners({ online: false, lastSyncedAt: ago(5 * MIN), now: NOW }).map((b) => b.kind)).toEqual(["offline"]);
  });

  it("warns when the data is more than 24 hours old, even if online", () => {
    const banners = syncBanners({ online: true, lastSyncedAt: ago(DAY + MIN), now: NOW });
    expect(banners.map((b) => b.kind)).toEqual(["stale"]);
    expect(banners[0]?.text).toContain("1 day ago");
  });

  it("shows both when offline and stale", () => {
    expect(syncBanners({ online: false, lastSyncedAt: ago(3 * DAY), now: NOW }).map((b) => b.kind)).toEqual(["offline", "stale"]);
  });

  it("does not call a trip stale before it has ever synced", () => {
    expect(syncBanners({ online: true, lastSyncedAt: null, now: NOW })).toEqual([]);
    expect(syncBanners({ online: false, lastSyncedAt: null, now: NOW }).map((b) => b.kind)).toEqual(["offline"]);
  });
});

describe("staleness", () => {
  it("is fresh up to 24 hours and stale after, and stale when never synced", () => {
    expect(staleness(ago(DAY), NOW)).toBe("fresh");
    expect(staleness(ago(DAY + 1), NOW)).toBe("stale");
    expect(staleness(null, NOW)).toBe("stale");
  });
});
