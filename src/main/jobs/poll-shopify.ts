// Background poller for Shopify orders via the Admin API.
// Direct Shopify is the source of truth for Shopify-channel orders — the
// ShipStation poller skips channel="shopify" orders when this is enabled.

import {
  recordSyncFinish,
  recordSyncStart,
  upsertOrder,
} from "../lib/db";
import {
  fetchShopifyOrdersSince,
  mapShopifyOrderToDashLab,
} from "../lib/shopify-api";
import { loadSettings } from "../lib/settings";

const SERVICE = "shopify";

declare global {
  // eslint-disable-next-line no-var
  var __dashlabShopifyPoller:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        inFlight: boolean;
        backfilled: boolean;
      }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabShopifyPoller) {
    globalThis.__dashlabShopifyPoller = {
      timer: null,
      running: false,
      inFlight: false,
      backfilled: false,
    };
  }
  return globalThis.__dashlabShopifyPoller;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function runOnce(): Promise<{ synced: number } | { skipped: string }> {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.shopify.enabled) return { skipped: "disabled" };
  if (!settings.shopify.storeDomain || !settings.shopify.adminAccessToken) {
    return { skipped: "missing credentials" };
  }

  const s = state();
  if (s.inFlight) return { skipped: "already running" };
  s.inFlight = true;

  const logId = recordSyncStart(SERVICE);
  try {
    // First run: pull a year + buffer for YoY comparisons. After that, just
    // catch anything updated in the last 7 days (catches late status changes
    // like fulfillment + cancellations).
    const isoStart = s.backfilled ? daysAgo(7) : daysAgo(400);

    const raws = await fetchShopifyOrdersSince(isoStart);
    for (const raw of raws) {
      const order = mapShopifyOrderToDashLab(raw);
      upsertOrder(order, raw);
    }
    s.backfilled = true;
    recordSyncFinish(logId, { status: "ok", recordsSynced: raws.length });
    return { synced: raws.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    console.error("[shopify-poller] sync failed:", msg);
    throw err;
  } finally {
    s.inFlight = false;
  }
}

export async function pollShopifyNow(): Promise<
  { synced: number } | { skipped: string }
> {
  return runOnce();
}

export function startShopifyPoller(): void {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) {
    console.log("[shopify-poller] skipped — useMockData is on");
    return;
  }
  if (!settings.shopify.enabled) {
    console.log("[shopify-poller] skipped — shopify.enabled is false");
    return;
  }
  if (!settings.shopify.storeDomain || !settings.shopify.adminAccessToken) {
    console.log("[shopify-poller] skipped — missing credentials");
    return;
  }

  const intervalMs =
    Math.max(30, settings.shopify.pollIntervalSeconds || 60) * 1000;

  s.running = true;

  runOnce().catch((err) => {
    console.error("[shopify-poller] initial poll failed:", err);
  });

  s.timer = setInterval(() => {
    runOnce().catch((err) => {
      console.error("[shopify-poller] tick failed:", err);
    });
  }, intervalMs);

  console.log(`[shopify-poller] started — every ${intervalMs / 1000}s`);
}

export function stopShopifyPoller(): void {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
