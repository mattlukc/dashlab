// Background poller for Etsy receipts (orders).
// Pulls via the Etsy Open API v3, writes into the main `orders` table with
// id prefix "etsy-" and channel="etsy".

import { recordSyncFinish, recordSyncStart, upsertOrder } from "../lib/db";
import {
  fetchEtsyReceiptsSince,
  mapEtsyReceiptToDashLab,
} from "../lib/etsy-api";
import { loadSettings } from "../lib/settings";

const SERVICE = "etsy";

declare global {
  // eslint-disable-next-line no-var
  var __dashlabEtsyPoller:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        inFlight: boolean;
        backfilled: boolean;
      }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabEtsyPoller) {
    globalThis.__dashlabEtsyPoller = {
      timer: null,
      running: false,
      inFlight: false,
      backfilled: false,
    };
  }
  return globalThis.__dashlabEtsyPoller;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

async function runOnce(): Promise<{ synced: number } | { skipped: string }> {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.etsy.enabled) return { skipped: "disabled" };
  if (
    !settings.etsy.keystring ||
    !settings.etsy.refreshToken ||
    !settings.etsy.shopId
  ) {
    return { skipped: "missing credentials" };
  }

  const s = state();
  if (s.inFlight) return { skipped: "already running" };
  s.inFlight = true;

  const logId = recordSyncStart(SERVICE);
  try {
    // First run: pull a year + buffer for YoY comparisons. Then catch the
    // last 7 days for status changes / cancellations.
    const isoStart = s.backfilled ? daysAgo(7) : daysAgo(400);
    const raws = await fetchEtsyReceiptsSince(isoStart);
    for (const raw of raws) {
      const order = mapEtsyReceiptToDashLab(raw);
      upsertOrder(order, raw);
    }
    s.backfilled = true;
    recordSyncFinish(logId, { status: "ok", recordsSynced: raws.length });
    return { synced: raws.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    console.error("[etsy-poller] sync failed:", msg);
    throw err;
  } finally {
    s.inFlight = false;
  }
}

export async function pollEtsyNow() {
  return runOnce();
}

export function startEtsyPoller(): void {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) {
    console.log("[etsy-poller] skipped — useMockData on");
    return;
  }
  if (!settings.etsy.enabled) {
    console.log("[etsy-poller] skipped — etsy.enabled is false");
    return;
  }
  if (
    !settings.etsy.keystring ||
    !settings.etsy.refreshToken ||
    !settings.etsy.shopId
  ) {
    console.log("[etsy-poller] skipped — missing credentials");
    return;
  }

  const intervalMs =
    Math.max(30, settings.etsy.pollIntervalSeconds || 60) * 1000;

  s.running = true;
  runOnce().catch((err) => {
    console.error("[etsy-poller] initial poll failed:", err);
  });
  s.timer = setInterval(() => {
    runOnce().catch((err) => {
      console.error("[etsy-poller] tick failed:", err);
    });
  }, intervalMs);
  console.log(`[etsy-poller] started — every ${intervalMs / 1000}s`);
}

export function stopEtsyPoller(): void {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
