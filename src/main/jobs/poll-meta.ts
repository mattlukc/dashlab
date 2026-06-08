// Background poller for Meta-graph follower counts (Facebook + Instagram).

import { getFacebookPageStats, getInstagramStats } from "../lib/meta-api";
import {
  recordSyncStart,
  recordSyncFinish,
  upsertSocialStat,
} from "../lib/db";
import { loadSettings } from "../lib/settings";

const SERVICE = "meta";

declare global {
  // eslint-disable-next-line no-var
  var __dashlabMetaPoller:
    | { timer: NodeJS.Timeout | null; running: boolean; inFlight: boolean }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabMetaPoller) {
    globalThis.__dashlabMetaPoller = {
      timer: null,
      running: false,
      inFlight: false,
    };
  }
  return globalThis.__dashlabMetaPoller;
}

async function runOnce() {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.social.facebook.enabled && !settings.social.instagram.enabled) {
    return { skipped: "no Meta platforms enabled" };
  }

  const s = state();
  if (s.inFlight) return { skipped: "already running" };
  s.inFlight = true;

  const logId = recordSyncStart(SERVICE);
  let total = 0;
  try {
    if (
      settings.social.facebook.enabled &&
      settings.social.facebook.pageId &&
      settings.social.facebook.pageAccessToken
    ) {
      try {
        const s2 = await getFacebookPageStats();
        upsertSocialStat({ platform: "facebook", followers: s2.followers });
        total++;
      } catch (err) {
        console.warn("[meta-poller] facebook failed:", (err as Error).message);
      }
    }
    if (
      settings.social.instagram.enabled &&
      settings.social.instagram.instagramBusinessAccountId &&
      settings.social.instagram.accessToken
    ) {
      try {
        const s2 = await getInstagramStats();
        upsertSocialStat({
          platform: "instagram",
          followers: s2.followers,
          contentCount: s2.mediaCount,
        });
        total++;
      } catch (err) {
        console.warn("[meta-poller] instagram failed:", (err as Error).message);
      }
    }
    recordSyncFinish(logId, { status: "ok", recordsSynced: total });
    return { ok: true, total };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    throw err;
  } finally {
    s.inFlight = false;
  }
}

export async function pollMetaNow() {
  return runOnce();
}

export function startMetaPoller() {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) return;
  if (!settings.social.facebook.enabled && !settings.social.instagram.enabled) {
    console.log("[meta-poller] skipped — no Meta platforms enabled");
    return;
  }
  s.running = true;
  runOnce().catch((err) =>
    console.error("[meta-poller] initial poll failed:", err)
  );
  // Use the smaller of FB / IG intervals (run as often as the most-eager one wants)
  const intervalMinutes = Math.max(
    2,
    Math.min(
      settings.social.facebook.enabled
        ? settings.social.facebook.pollIntervalMinutes || 15
        : 999,
      settings.social.instagram.enabled
        ? settings.social.instagram.pollIntervalMinutes || 15
        : 999
    )
  );
  const intervalMs = intervalMinutes * 60 * 1000;
  s.timer = setInterval(
    () =>
      runOnce().catch((err) =>
        console.error("[meta-poller] tick failed:", err)
      ),
    intervalMs
  );
  console.log(`[meta-poller] started — every ${intervalMinutes} min`);
}

export function stopMetaPoller() {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
