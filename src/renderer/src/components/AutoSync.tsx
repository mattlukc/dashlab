
// Silent background auto-sync. On load it checks when each enabled service last
// synced successfully; if any is missing or stale, it fires a sync in the
// background and soft-refreshes the page a few seconds later so the freshly
// pulled data shows up. No spinner, no banner — renders nothing.

import { useEffect, useRef } from "react";
import { useRefresh } from "../RefreshContext";

const STALE_MS = 30 * 60 * 1000; // 30 minutes
const REFRESH_DELAY_MS = 8000; // give /api/sync/now ~8s to write before refreshing

interface SyncStatusResp {
  lastSuccessful?: Record<string, string | null>;
  enabled?: Record<string, boolean>;
}

export function AutoSync() {
  const triggerRefresh = useRefresh();
  // Guard so it fires at most once per mount (also covers React StrictMode's
  // double-invoke in dev — the same instance's ref survives the remount).
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        const res = await fetch("/api/sync/status", { cache: "no-store" });
        if (!res.ok) return;
        const { lastSuccessful = {}, enabled = {} } =
          (await res.json()) as SyncStatusResp;

        const now = Date.now();
        const needsSync = Object.entries(enabled).some(([service, isOn]) => {
          if (!isOn) return false; // ignore disabled services
          const last = lastSuccessful[service];
          if (!last) return true; // enabled but never synced successfully
          const ts = Date.parse(last);
          if (Number.isNaN(ts)) return true; // unparseable → treat as stale
          return now - ts > STALE_MS; // synced too long ago
        });

        if (!needsSync) return;

        // Fire and forget — don't await, don't block the UI.
        fetch("/api/sync/now", { method: "POST" }).catch(() => {});

        // Then soft-refresh page data so the new data renders (no reload/flash).
        refreshTimer = setTimeout(() => {
          triggerRefresh();
        }, REFRESH_DELAY_MS);
      } catch {
        // Swallow — auto-sync is best-effort and must never surface an error.
      }
    })();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
