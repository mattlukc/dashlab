
import { useEffect, useState } from "react";

interface SyncLog {
  service: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  records_synced: number;
  error_message: string | null;
}

interface Resp {
  shipstation: SyncLog | null;
  amazon: SyncLog | null;
  amazon_fbm: SyncLog | null;
  shopify: SyncLog | null;
  etsy: SyncLog | null;
  youtube: SyncLog | null;
  meta: SyncLog | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

/** Like relativeTime, but rounded to whole minutes — used for the headline so it doesn't tick every second. */
function relativeTimeCoarse(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.round(hr / 24);
  return `${days}d ago`;
}

function timeOnly(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function SyncStatus() {
  const [data, setData] = useState<Resp | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const res = await fetch("/api/sync/status", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as Resp;
        if (!cancelled) setData(json);
      } catch {
        // swallow
      }
    }
    refresh();
    const t = setInterval(refresh, 10_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const ss = data?.shipstation;
  const az = data?.amazon;
  const af = data?.amazon_fbm;
  const sh = data?.shopify;
  const et = data?.etsy;
  const yt = data?.youtube;
  const mt = data?.meta;

  // Most-recent timestamp across all services = the "last updated" value
  const ssTime = ss?.finished_at ? new Date(ss.finished_at).getTime() : 0;
  const azTime = az?.finished_at ? new Date(az.finished_at).getTime() : 0;
  const afTime = af?.finished_at ? new Date(af.finished_at).getTime() : 0;
  const shTime = sh?.finished_at ? new Date(sh.finished_at).getTime() : 0;
  const etTime = et?.finished_at ? new Date(et.finished_at).getTime() : 0;
  const ytTime = yt?.finished_at ? new Date(yt.finished_at).getTime() : 0;
  const mtTime = mt?.finished_at ? new Date(mt.finished_at).getTime() : 0;
  const mostRecent = Math.max(
    ssTime,
    azTime,
    afTime,
    shTime,
    etTime,
    ytTime,
    mtTime
  );
  const headline = mostRecent
    ? relativeTimeCoarse(new Date(mostRecent).toISOString())
    : "…";

  const allOk =
    (!ss || ss.status === "ok" || ss.status === "running") &&
    (!az || az.status === "ok" || az.status === "running") &&
    (!af || af.status === "ok" || af.status === "running") &&
    (!sh || sh.status === "ok" || sh.status === "running") &&
    (!et || et.status === "ok" || et.status === "running") &&
    (!yt || yt.status === "ok" || yt.status === "running") &&
    (!mt || mt.status === "ok" || mt.status === "running");

  return (
    <div className="dl-sync-status">
      <span className={`dl-sync-dot ${allOk ? "ok" : "bad"}`} />
      <span className="dl-sync-text">
        Last updated {headline}
      </span>
      <span className="dl-sync-arrow">▾</span>

      <div className="dl-sync-popover" role="tooltip">
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${ss?.status === "error" ? "bad" : "ok"}`}>
            ShipStation
          </span>
          <span className="dl-sync-row-time">
            {ss?.finished_at ? (
              <>
                {timeOnly(ss.finished_at)} <span className="dl-sync-rel">({relativeTime(ss.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {ss?.status === "error" && (
          <div className="dl-sync-error">{ss.error_message ?? "Unknown error"}</div>
        )}
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${az?.status === "error" ? "bad" : "ok"}`}>
            Amazon FBA
          </span>
          <span className="dl-sync-row-time">
            {az?.finished_at ? (
              <>
                {timeOnly(az.finished_at)} <span className="dl-sync-rel">({relativeTime(az.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {az?.status === "error" && (
          <div className="dl-sync-error">{az.error_message ?? "Unknown error"}</div>
        )}
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${af?.status === "error" ? "bad" : "ok"}`}>
            Amazon FBM
          </span>
          <span className="dl-sync-row-time">
            {af?.finished_at ? (
              <>
                {timeOnly(af.finished_at)} <span className="dl-sync-rel">({relativeTime(af.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {af?.status === "error" && (
          <div className="dl-sync-error">{af.error_message ?? "Unknown error"}</div>
        )}
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${sh?.status === "error" ? "bad" : "ok"}`}>
            Shopify
          </span>
          <span className="dl-sync-row-time">
            {sh?.finished_at ? (
              <>
                {timeOnly(sh.finished_at)} <span className="dl-sync-rel">({relativeTime(sh.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {sh?.status === "error" && (
          <div className="dl-sync-error">{sh.error_message ?? "Unknown error"}</div>
        )}
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${et?.status === "error" ? "bad" : "ok"}`}>
            Etsy
          </span>
          <span className="dl-sync-row-time">
            {et?.finished_at ? (
              <>
                {timeOnly(et.finished_at)} <span className="dl-sync-rel">({relativeTime(et.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {et?.status === "error" && (
          <div className="dl-sync-error">{et.error_message ?? "Unknown error"}</div>
        )}
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${yt?.status === "error" ? "bad" : "ok"}`}>
            YouTube
          </span>
          <span className="dl-sync-row-time">
            {yt?.finished_at ? (
              <>
                {timeOnly(yt.finished_at)} <span className="dl-sync-rel">({relativeTime(yt.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {yt?.status === "error" && (
          <div className="dl-sync-error">{yt.error_message ?? "Unknown error"}</div>
        )}
        <div className="dl-sync-row">
          <span className={`dl-sync-pill ${mt?.status === "error" ? "bad" : "ok"}`}>
            Facebook + Instagram
          </span>
          <span className="dl-sync-row-time">
            {mt?.finished_at ? (
              <>
                {timeOnly(mt.finished_at)} <span className="dl-sync-rel">({relativeTime(mt.finished_at)})</span>
              </>
            ) : (
              "no data yet"
            )}
          </span>
        </div>
        {mt?.status === "error" && (
          <div className="dl-sync-error">{mt.error_message ?? "Unknown error"}</div>
        )}
      </div>

      <style>{`
        .dl-sync-status {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 10px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 4px;
          color: rgba(255, 255, 255, 0.85);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          white-space: nowrap;
          cursor: default;
        }
        .dl-sync-dot {
          display: inline-block;
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .dl-sync-dot.ok  { background: #4ade80; box-shadow: 0 0 6px #4ade80; }
        .dl-sync-dot.bad { background: #ef4444; box-shadow: 0 0 6px #ef4444; }
        .dl-sync-text { font-variant-numeric: tabular-nums; }
        .dl-sync-arrow {
          color: rgba(255, 255, 255, 0.5);
          font-size: 10px;
          margin-left: 2px;
        }

        .dl-sync-popover {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          background: #fff;
          color: var(--dl-dark);
          border: 1px solid var(--dl-light);
          border-radius: 6px;
          padding: 12px 14px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.15);
          min-width: 280px;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.15s, visibility 0.15s;
          z-index: 9999;
          text-transform: none;
          letter-spacing: 0;
        }
        .dl-sync-status:hover .dl-sync-popover {
          opacity: 1;
          visibility: visible;
        }
        .dl-sync-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          padding: 5px 0;
        }
        .dl-sync-row + .dl-sync-row { border-top: 1px solid #eef0f2; }
        .dl-sync-pill {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 3px 8px;
          border-radius: 3px;
        }
        .dl-sync-pill.ok  { background: #e3f1df; color: #2f7a3a; }
        .dl-sync-pill.bad { background: #fdebee; color: #c4314b; }
        .dl-sync-row-time {
          font-size: 12px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          color: var(--dl-dark);
        }
        .dl-sync-rel {
          font-weight: 500;
          color: var(--dl-slate-mid);
        }
        .dl-sync-error {
          margin-top: 4px;
          font-size: 11px;
          color: var(--dl-danger);
          font-style: italic;
        }
      `}</style>
    </div>
  );
}
