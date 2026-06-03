// Background poller for YouTube channel stats. Runs every 15 minutes.

import { getYouTubeChannelStats } from "../lib/youtube-api";
import {
  recordSyncStart,
  recordSyncFinish,
  upsertSocialStat,
} from "../lib/db";
import { loadSettings } from "../lib/settings";

const SERVICE = "youtube";

declare global {
  // eslint-disable-next-line no-var
  var __dashlabYouTubePoller:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        inFlight: boolean;
      }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabYouTubePoller) {
    globalThis.__dashlabYouTubePoller = {
      timer: null,
      running: false,
      inFlight: false,
    };
  }
  return globalThis.__dashlabYouTubePoller;
}

async function runOnce(): Promise<
  { ok: true; subscribers: number } | { skipped: string }
> {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.social.youtube.enabled) return { skipped: "disabled" };
  if (
    !settings.social.youtube.apiKey ||
    !settings.social.youtube.channelId
  ) {
    return { skipped: "missing credentials" };
  }

  const s = state();
  if (s.inFlight) return { skipped: "already running" };
  s.inFlight = true;

  const logId = recordSyncStart(SERVICE);
  try {
    const stats = await getYouTubeChannelStats();
    upsertSocialStat({
      platform: "youtube",
      followers: stats.subscriberCount,
      contentCount: stats.videoCount,
      totalViews: stats.viewCount,
    });
    recordSyncFinish(logId, { status: "ok", recordsSynced: 1 });
    return { ok: true, subscribers: stats.subscriberCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    console.error("[youtube-poller] sync failed:", msg);
    throw err;
  } finally {
    s.inFlight = false;
  }
}

export async function pollYouTubeNow() {
  return runOnce();
}

export function startYouTubePoller(): void {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) return;
  if (!settings.social.youtube.enabled) {
    console.log("[youtube-poller] skipped — youtube.enabled is false");
    return;
  }

  const intervalMs =
    Math.max(2, settings.social.youtube.pollIntervalMinutes || 15) * 60 * 1000;
  s.running = true;

  runOnce().catch((err) => {
    console.error("[youtube-poller] initial poll failed:", err);
  });

  s.timer = setInterval(() => {
    runOnce().catch((err) => {
      console.error("[youtube-poller] tick failed:", err);
    });
  }, intervalMs);

  console.log("[youtube-poller] started — every 15 min");
}

export function stopYouTubePoller(): void {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
