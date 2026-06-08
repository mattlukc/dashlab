// Background poller that keeps the local SQLite cache fresh with
// `awaiting_shipment` orders from ShipStation. Runs as a singleton inside
// the Node process — only one timer ever exists, even across HMR reloads.

import {
  recordSyncFinish,
  recordSyncStart,
  upsertOrder,
} from "../lib/db";
import {
  listRecentOrders,
  mapShipstationOrderToDashLab,
  refreshAllShipstationStores,
  refreshStoreMap,
} from "../lib/shipstation";
import { loadSettings } from "../lib/settings";

const SERVICE = "shipstation";

function daysSinceJan1(): number {
  const now = new Date();
  const jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil((now.getTime() - jan1.getTime()) / (1000 * 60 * 60 * 24));
}

// Module-level singleton state. In Next.js dev mode the file can be re-evaluated
// on HMR; we additionally stash a flag on globalThis so we don't double-schedule.
declare global {
  // eslint-disable-next-line no-var
  var __dashlabShipStationPoller:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        inFlight: boolean;
        backfilled: boolean;
        /** Unix ms — last time we fired refreshAllShipstationStores. */
        lastStoreRefreshAt?: number;
      }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabShipStationPoller) {
    globalThis.__dashlabShipStationPoller = {
      timer: null,
      running: false,
      inFlight: false,
      backfilled: false,
    };
  }
  return globalThis.__dashlabShipStationPoller;
}

async function runOnce(): Promise<{ synced: number } | { skipped: string }> {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.shipstation.enabled) return { skipped: "disabled" };
  if (!settings.shipstation.apiKey || !settings.shipstation.apiSecret) {
    return { skipped: "missing credentials" };
  }

  const s = state();
  if (s.inFlight) return { skipped: "already running" };
  s.inFlight = true;

  const logId = recordSyncStart(SERVICE);
  try {
    // Auto-refresh ShipStation stores from their source channels on a cadence.
    // ShipStation's own channel-polling can lag 30+ min so this nudges it.
    const refreshMins = settings.shipstation.forceRefreshIntervalMinutes;
    if (refreshMins > 0) {
      const s3 = state();
      const lastFired = s3.lastStoreRefreshAt ?? 0;
      const dueAt = lastFired + refreshMins * 60 * 1000;
      if (Date.now() >= dueAt) {
        s3.lastStoreRefreshAt = Date.now();
        // Fire and forget — refresh takes 10-60s on ShipStation's side, we
        // just want to kick it off so the NEXT poll catches the new orders.
        refreshAllShipstationStores()
          .then((r) => {
            console.log(
              `[shipstation-poller] auto-refresh fired — triggered=${r.triggered} rateLimited=${r.rateLimited} failed=${r.failed}`
            );
          })
          .catch((err) => {
            console.warn(
              "[shipstation-poller] auto-refresh failed:",
              (err as Error).message
            );
          });
      }
    }

    // Refresh storeId → channel map first so order channel attribution is correct.
    // Don't fail the whole sync if this step errors — fall back to "other" channels.
    try {
      await refreshStoreMap();
    } catch (err) {
      console.warn(
        "[shipstation-poller] refreshStoreMap failed, channels may default to 'other':",
        (err as Error).message
      );
    }

    // First-run backfill: fetch from Jan 1 of last year (covers full prior-year
    // YTD/QTD comparisons). After that, regular polls only fetch last 30 days.
    const s2 = state();
    const daysBack = s2.backfilled
      ? 30
      : daysSinceJan1() + 365 + 30; // safety buffer

    const raws = await listRecentOrders({ daysBack });

    // ShipStation is the FULFILLMENT source — it pulls every channel so we
    // have complete shipping/printing data. The ANALYTICS layer is responsible
    // for skipping ShipStation rows whose channel has a direct integration
    // (see directChannelExclusionSql in db.ts).
    for (const raw of raws) {
      const order = mapShipstationOrderToDashLab(raw);
      upsertOrder(order, raw);
    }

    s2.backfilled = true;
    recordSyncFinish(logId, {
      status: "ok",
      recordsSynced: raws.length,
    });
    return { synced: raws.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    console.error("[shipstation-poller] sync failed:", msg);
    throw err;
  } finally {
    s.inFlight = false;
  }
}

/** Force an immediate poll. Resolves when the sync completes. */
export async function pollShipStationNow(): Promise<
  { synced: number } | { skipped: string }
> {
  return runOnce();
}

export function startShipStationPoller(): void {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) {
    console.log("[shipstation-poller] skipped — useMockData is on");
    return;
  }
  if (!settings.shipstation.enabled) {
    console.log("[shipstation-poller] skipped — shipstation.enabled is false");
    return;
  }

  const intervalMs = Math.max(
    5,
    settings.shipstation.pollIntervalSeconds || 30
  ) * 1000;

  s.running = true;

  // Fire once immediately, then on interval.
  runOnce().catch((err) => {
    console.error("[shipstation-poller] initial poll failed:", err);
  });

  s.timer = setInterval(() => {
    runOnce().catch((err) => {
      console.error("[shipstation-poller] tick failed:", err);
    });
  }, intervalMs);

  console.log(
    `[shipstation-poller] started — every ${intervalMs / 1000}s`
  );
}

export function stopShipStationPoller(): void {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
