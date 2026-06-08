
import { useState } from "react";
import { useRefresh } from "../RefreshContext";

export function RefreshButton() {
  const triggerRefresh = useRefresh();
  const [loading, setLoading] = useState(false);

  async function handleRefresh() {
    setLoading(true);
    try {
      await fetch("/api/sync/now", { method: "POST" });
    } catch {
      // swallow — we'll still refresh to show whatever state we have
    }
    // Soft refresh — re-fetch page data without unmounting the UI (no flash).
    triggerRefresh();
    setLoading(false);
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="dl-refresh-btn"
      aria-label="Refresh data"
      title="Sync ShipStation + Amazon now"
    >
      <span className={loading ? "dl-spin" : ""} aria-hidden>
        ↻
      </span>
      {loading ? "Syncing…" : "Refresh"}
      <style>{`
        .dl-refresh-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: var(--dl-primary);
          color: #fff;
          border: none;
          padding: 7px 14px;
          border-radius: 4px;
          font-family: inherit;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.12s;
        }
        .dl-refresh-btn:hover:not(:disabled) {
          background: var(--dl-primary-hover);
        }
        .dl-refresh-btn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .dl-spin {
          display: inline-block;
          animation: dl-spin-rotate 0.9s linear infinite;
        }
        @keyframes dl-spin-rotate {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
