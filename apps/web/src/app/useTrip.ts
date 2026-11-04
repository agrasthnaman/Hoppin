import {
  overlayMoney,
  overlaySnapshot,
  type ConflictNotice,
  type DocumentSource,
  type ExpenseRecord,
  type Item,
  type ItemValues,
  type MoneyRecord,
  type OutboxRecord,
  type TripGuest,
  type TripSnapshot,
  type TripSource,
} from "@hoppin/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OfflineDb } from "../offline/db";
import {
  applyDraft as putDraftBack,
  discardDraft as removeDraft,
  dismissNotice as removeNotice,
  flushOutbox,
  listDrafts,
  listNotices,
  listOutbox,
  queueCreate,
  queueItemEdit,
  queueRsvp,
  type Writer,
} from "../offline/outbox";
import { discardMoney as dropMoney, flushMoney, listMoney, queueMoney, retryMoney as resendMoney, type MoneyWriter } from "../offline/money-outbox";
import { cacheDocuments, getLocalTrip, syncTrip, type CacheResult } from "../offline/sync";
import type { RateService } from "../providers/rates";

export interface TripDeps {
  db: OfflineDb;
  tripSource: TripSource;
  documentSource: DocumentSource;
  /** Sends this person's changes to the server. */
  writer: Writer;
  /** Sends expenses, payments and guests. Without it (and `rates`), money changes stay on the device. */
  moneyWriter?: MoneyWriter;
  /** Prices expenses added offline before they are sent. */
  rates?: RateService;
}

export type TripPhase = "loading" | "ready" | "removed" | "unavailable";

export interface TripState {
  phase: TripPhase;
  /** The trip as the person should see it: the saved copy with their waiting changes on top. */
  snapshot: TripSnapshot | null;
  /** When this device last fetched the trip (ms), or null. */
  syncedAt: number | null;
  syncing: boolean;
  /** The last refresh failed (the copy on the device, if any, is still shown). */
  syncFailed: boolean;
  /** Changes made on this device that are waiting to be sent. */
  pendingCount: number;
  /** Things that happened to this person's changes that they should know about (conflicts, refusals). */
  notices: ConflictNotice[];
  /** Changes that could not be applied, kept so the person can apply or discard them. */
  drafts: OutboxRecord[];
  /** Send waiting changes, fetch the trip again and download its documents. */
  refresh: () => Promise<void>;
  /** Download every document this person may keep offline. */
  cacheAll: () => Promise<CacheResult>;
  /** Save changes to an item. Works offline: it is stored here and sent when there is a connection. */
  editItem: (item: Item, values: ItemValues) => Promise<void>;
  /** Add a plan. Works offline. Returns the plan's id. */
  addItem: (values: ItemValues) => Promise<string>;
  setGoing: (itemId: string, going: boolean) => Promise<void>;
  dismissNotice: (id: string) => Promise<void>;
  discardDraft: (id: string) => Promise<void>;
  /** Put a draft back in the queue as a newer change. `gone` means its item no longer exists. */
  applyDraft: (draft: OutboxRecord) => Promise<"queued" | "gone">;
  /** Money changes made on this device that are waiting to be sent, or that the server refused (`error`). */
  moneyChanges: MoneyRecord[];
  /** Add or change an expense or payment. Works offline. */
  saveExpense: (expense: ExpenseRecord) => Promise<void>;
  deleteExpense: (expense: ExpenseRecord) => Promise<void>;
  /** Add a named guest (someone without the app). Works offline. */
  addGuest: (name: string) => Promise<TripGuest>;
  retryMoney: (id: string) => Promise<void>;
  discardMoney: (id: string) => Promise<void>;
}

/** How often an open, visible trip looks for other people's changes. A hidden or backgrounded app does not run this. */
export const FRESH_EVERY_MS = 60_000;

function pageIsQuiet(): boolean {
  return document.hidden || !navigator.onLine || document.querySelector("[role='dialog']") !== null;
}

/**
 * One trip for one person. Always shows the copy on this device first (with their waiting changes on top); when
 * there is a connection it sends waiting changes, refreshes from the server (on open, when the connection returns,
 * when the page becomes visible, about once a minute while it stays visible, after each change, and on request)
 * and downloads documents.
 */
export function useTrip(deps: TripDeps, tripId: string, viewerId: string): TripState {
  const [local, setLocal] = useState<{ snapshot: TripSnapshot; syncedAt: number } | null | undefined>(undefined);
  const [outbox, setOutbox] = useState<OutboxRecord[]>([]);
  const [money, setMoney] = useState<MoneyRecord[]>([]);
  const [notices, setNotices] = useState<ConflictNotice[]>([]);
  const [drafts, setDrafts] = useState<OutboxRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [removed, setRemoved] = useState(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;
  const inflight = useRef<Promise<void> | null>(null);
  const again = useRef(false);

  const offline = useCallback(
    () => ({ db: depsRef.current.db, source: depsRef.current.tripSource, documents: depsRef.current.documentSource, viewerId }),
    [viewerId],
  );

  const round = useCallback(async () => {
    const d = depsRef.current;
    await flushOutbox({ db: d.db, source: d.tripSource, writer: d.writer, viewerId }, tripId);
    if (d.moneyWriter && d.rates) await flushMoney({ db: d.db, writer: d.moneyWriter, rates: d.rates }, tripId);
    const result = await syncTrip(offline(), tripId);
    if (result.status === "removed") setRemoved(true);
    else {
      setRemoved(false);
      await cacheDocuments(offline(), tripId);
    }
  }, [offline, tripId, viewerId]);

  const refresh = useCallback(() => {
    if (inflight.current) {
      again.current = true; // something changed while sending: go round once more when this finishes
      return inflight.current;
    }
    setSyncing(true);
    setSyncFailed(false);
    const run = (async () => {
      try {
        do {
          again.current = false;
          await round();
        } while (again.current);
      } catch {
        setSyncFailed(true);
      } finally {
        inflight.current = null;
        setSyncing(false);
      }
    })();
    inflight.current = run;
    return run;
  }, [round]);

  useEffect(() => {
    let alive = true;
    const read = async () => {
      const db = depsRef.current.db;
      let loaded;
      try {
        loaded = await Promise.all([getLocalTrip(db, tripId), listOutbox(db, tripId), listNotices(db, tripId), listDrafts(db, tripId), listMoney(db, tripId)]);
      } catch {
        return; // the device copy was just wiped (signing out); nothing left to show
      }
      const [trip, waiting, notes, kept, moneyWaiting] = loaded;
      if (!alive) return;
      setLocal(trip);
      setOutbox(waiting);
      setMoney(moneyWaiting);
      setNotices(notes);
      setDrafts(kept);
    };
    const onChanged = (e: Event) => (e as CustomEvent<{ tripId: string }>).detail?.tripId === tripId && void read();
    const onOnline = () => void refresh();
    void read();
    if (navigator.onLine) void refresh();
    window.addEventListener("hoppin:synced", onChanged);
    window.addEventListener("online", onOnline);
    return () => {
      alive = false;
      window.removeEventListener("hoppin:synced", onChanged);
      window.removeEventListener("online", onOnline);
    };
  }, [tripId, refresh]);

  useEffect(() => {
    let timer: number | undefined;
    const stop = () => {
      if (timer === undefined) return;
      window.clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      if (document.hidden || !navigator.onLine) return;
      timer = window.setInterval(() => {
        if (!pageIsQuiet()) void refresh();
      }, FRESH_EVERY_MS);
    };
    const onVisible = () => {
      if (document.hidden || !navigator.onLine) {
        stop();
        return;
      }
      if (!pageIsQuiet()) void refresh();
      start();
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const kick = () => {
    if (navigator.onLine) void refresh();
  };
  const queueDeps = () => ({ db: depsRef.current.db });

  const snapshot = useMemo(() => (local ? overlayMoney(overlaySnapshot(local.snapshot, outbox), money) : null), [local, outbox, money]);
  const onServer = (expenseId: string) => local?.snapshot.expenses?.some((e) => e.id === expenseId) ?? false;
  const phase: TripPhase = removed ? "removed" : local ? "ready" : local === undefined || syncing ? "loading" : "unavailable";

  return {
    phase,
    snapshot,
    syncedAt: local?.syncedAt ?? null,
    syncing,
    syncFailed,
    pendingCount: outbox.length + money.filter((r) => !r.error).length,
    notices,
    drafts,
    refresh,
    cacheAll: () => cacheDocuments(offline(), tripId),
    editItem: async (item, values) => {
      await queueItemEdit(queueDeps(), { tripId, item, values });
      kick();
    },
    addItem: async (values) => {
      const id = await queueCreate(queueDeps(), { tripId, ownerId: viewerId, values });
      kick();
      return id;
    },
    setGoing: async (itemId, going) => {
      await queueRsvp(queueDeps(), { tripId, itemId, userId: viewerId, going });
      kick();
    },
    dismissNotice: (id) => removeNotice(depsRef.current.db, id),
    discardDraft: (id) => removeDraft(depsRef.current.db, id),
    applyDraft: async (draft) => {
      const current = local?.snapshot.items.find((i) => i.id === draft.itemId); // the saved version, not the one with waiting edits
      const outcome = await putDraftBack(queueDeps(), draft, current);
      kick();
      return outcome;
    },
    moneyChanges: money,
    saveExpense: async (expense) => {
      await queueMoney(queueDeps(), { kind: "save", tripId, expense }, onServer(expense.id));
      kick();
    },
    deleteExpense: async (expense) => {
      await queueMoney(queueDeps(), { kind: "delete", tripId, expenseId: expense.id, title: expense.title }, onServer(expense.id));
      kick();
    },
    addGuest: async (name) => {
      const guest: TripGuest = { id: crypto.randomUUID(), tripId, name: name.trim(), addedBy: viewerId };
      await queueMoney(queueDeps(), { kind: "guest", tripId, guest });
      kick();
      return guest;
    },
    retryMoney: async (id) => {
      await resendMoney(depsRef.current.db, id);
      kick();
    },
    discardMoney: (id) => dropMoney(depsRef.current.db, id),
  };
}
