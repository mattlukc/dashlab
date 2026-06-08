// Static / "TV" mode dashboard — minimal one-screen view designed for a
// wall display. Auto-refreshes every 30s. Big, glanceable numbers only.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { TvAutoRefresh } from "./TvAutoRefresh";
import { SocialFollowersStrip } from "../components/SocialFollowersStrip";
import { SyncStatus } from "../components/SyncStatus";
import { RefreshButton } from "../components/RefreshButton";

// Wall-display view. Fetches the aggregated TV payload (api:tv:get, computed in
// src/main/dashboard.ts) on mount and re-fetches every 30s for liveness.

const REFRESH_SECONDS = 30;

type ItemRow = {
  sku: string;
  name: string;
  isCustom: boolean;
  total: number;
  perChannel: Record<string, number>;
};
type Pill = {
  platform: "youtube" | "facebook" | "instagram" | "tiktok";
  handle: string;
  followers: number;
  contentCount?: number;
};
interface TvData {
  displayMode: "gross" | "net";
  totalGross: number;
  totalNet: number;
  totalOrders: number;
  totalItems: number;
  aov: number;
  mtdTotal: number;
  mtdDeltaPct: number;
  oldest: { ageHours: number; orderNumber: string } | null;
  queueCount: number;
  topSku: { name: string } | null;
  todayItems: ItemRow[];
  todayChannels: string[];
  todayUnits: number;
  fbaEnabled: boolean;
  fbaItems: number;
  socialPills: Pill[];
  goal: number;
}

export default function TVPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const now = new Date();
  const [data, setData] = useState<TvData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/tv", { cache: "no-store" });
        const json = (await res.json()) as TvData;
        if (!cancelled) setData(json);
      } catch {
        // keep the previous frame on a transient failure
      }
    }
    load();
    const ti = setInterval(load, REFRESH_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearInterval(ti);
    };
  }, [refreshKey]);

  const totalGross = data?.totalGross ?? 0;
  const totalNet = data?.totalNet ?? 0;
  const net = data?.displayMode === "net";
  const heroValue = net ? totalNet : totalGross;
  const totalOrders = data?.totalOrders ?? 0;
  const totalItems = data?.totalItems ?? 0;
  const aov = data?.aov ?? 0;
  const mtdTotal = data?.mtdTotal ?? 0;
  const mtdDeltaPct = data?.mtdDeltaPct ?? 0;

  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysLeftInMonth = endOfMonth.getDate() - now.getDate();

  const oldest = data?.oldest ?? null;
  const queueCount = data?.queueCount ?? 0;

  const topSku = data?.topSku ?? null;
  const todayItems: ItemRow[] = data?.todayItems ?? [];
  const todayChannels: string[] = data?.todayChannels ?? [];
  const todayUnits = data?.todayUnits ?? 0;
  const fbaEnabled = data?.fbaEnabled ?? false;
  const fbaItems = data?.fbaItems ?? 0;

  const channelLabel = (c: string): string => {
    switch (c) {
      case "shopify":
        return "Shopify";
      case "amazon_fbm":
        return "Amazon FBM";
      case "amazon_fba":
        return "Amazon FBA";
      case "etsy":
        return "Etsy";
      case "ebay":
        return "eBay";
      case "manual":
        return "Manual";
      case "other":
        return "Other";
      default:
        return c;
    }
  };

  const socialPills: Pill[] = data?.socialPills ?? [];

  const todayLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const goal = data?.goal ?? 0;
  const goalPct = goal > 0 ? Math.min(100, (heroValue / goal) * 100) : 0;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const monthlyGoal = goal * daysInMonth;
  const monthlyGoalPct =
    monthlyGoal > 0 ? Math.min(100, (mtdTotal / monthlyGoal) * 100) : 0;
  const totalItemsLabel = totalItems;

  return (
    <div className="tv-shell">
      <div className="tv-head">
        <div className="tv-head-left">
          <Link to="/" className="tv-exit">
            ← Full dashboard
          </Link>
          <div className="tv-brand">● DashLab</div>
        </div>
        <div className="tv-head-right">
          <div className="tv-sync-wrap">
            <SyncStatus />
          </div>
          <RefreshButton />
          <div className="tv-date">{todayLabel}</div>
          <TvAutoRefresh />
        </div>
      </div>

      <div className="tv-hero-band">
        <div className="tv-hero-tag">{net ? "Net Sales Today" : "Sales Today"}</div>
        <div className="tv-hero-value dl-private">
          ${Math.round(heroValue).toLocaleString()}
        </div>
        {net && (
          <div
            className="tv-hero-sub"
            style={{ fontSize: "0.75rem", color: "#aaa", marginTop: "0.25rem" }}
          >
            est. after channel fees
          </div>
        )}
        <div className="tv-hero-sub">
          <strong>{totalOrders}</strong> orders ·{" "}
          <strong>{totalItemsLabel}</strong> items today
        </div>
      </div>

      {goal > 0 && (
        <div className="tv-goal-wrap">
          <div className="tv-goal-line">
            <span>Daily Goal</span>
            <span className="dl-private">
              <span className="tv-goal-current">
                ${Math.round(heroValue).toLocaleString()}
              </span>{" "}
              / ${Math.round(goal).toLocaleString()} ({Math.round(goalPct)}%)
            </span>
          </div>
          <div className="tv-goal-track">
            <div className="tv-goal-fill" style={{ width: `${goalPct}%` }} />
          </div>
        </div>
      )}

      {monthlyGoal > 0 && (
        <div className="tv-goal-wrap">
          <div className="tv-goal-line">
            <span>
              Monthly Goal
              <span className="tv-goal-days">
                · {daysLeftInMonth} {daysLeftInMonth === 1 ? "day" : "days"} left
              </span>
            </span>
            <span className="dl-private">
              <span className="tv-goal-current">
                ${Math.round(mtdTotal).toLocaleString()}
              </span>{" "}
              / ${Math.round(monthlyGoal).toLocaleString()} (
              {Math.round(monthlyGoalPct)}%)
            </span>
          </div>
          <div className="tv-goal-track">
            <div
              className="tv-goal-fill"
              style={{ width: `${monthlyGoalPct}%` }}
            />
          </div>
        </div>
      )}

      <div className="tv-stats">
        <div className="tv-stat accent">
          <div className="tv-stat-label">AOV</div>
          <div className="tv-stat-value dl-private">
            ${Math.round(aov).toLocaleString()}
          </div>
          <div className="tv-stat-sub">avg per order</div>
        </div>
        <div
          className={`tv-stat ${queueCount > 30 ? "alert" : ""}`}
        >
          <div className="tv-stat-label">Ship Queue</div>
          <div className="tv-stat-value">{queueCount}</div>
          <div className="tv-stat-sub">orders waiting</div>
        </div>
        <div
          className={`tv-stat ${oldest && oldest.ageHours > 72 ? "alert" : oldest && oldest.ageHours > 48 ? "accent" : ""}`}
        >
          <div className="tv-stat-label">Oldest Unshipped</div>
          <div className="tv-stat-value">
            {oldest
              ? oldest.ageHours < 1
                ? "<1 hr"
                : oldest.ageHours < 24
                  ? `${Math.round(oldest.ageHours)} ${Math.round(oldest.ageHours) === 1 ? "hr" : "hrs"}`
                  : (() => {
                      const d = Math.round(oldest.ageHours / 24);
                      return `${d} ${d === 1 ? "day" : "days"}`;
                    })()
              : "—"}
          </div>
          <div className="tv-stat-sub">
            {oldest ? `#${oldest.orderNumber}` : "queue is clear"}
          </div>
        </div>
        <div className="tv-stat">
          <div className="tv-stat-label">Monthly Sales</div>
          <div className="tv-stat-value dl-private">
            ${Math.round(mtdTotal).toLocaleString()}
          </div>
          <div className="tv-stat-sub">
            month to date
            {mtdDeltaPct !== 0 && (
              <>
                {" · "}
                <span
                  style={{
                    color: mtdDeltaPct > 0 ? "#2F7A3A" : "#C4314B",
                    fontWeight: 800,
                  }}
                >
                  {mtdDeltaPct > 0 ? "▲" : "▼"}{" "}
                  {Math.abs(Math.round(mtdDeltaPct))}% vs LY
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <SocialFollowersStrip pills={socialPills} size="tv" />

      {/* Items Sold Today — fills the remaining vertical space at the bottom */}
      <div className="tv-items-section">
        <div className="tv-items-header">
          <span className="tv-items-title">Items Sold Today</span>
          {todayItems.length > 0 ? (
            <span className="tv-items-meta">
              {todayItems.length}{" "}
              {todayItems.length === 1 ? "product" : "products"} ·{" "}
              <strong>{todayUnits}</strong> units
              {fbaEnabled && fbaItems > todayUnits && (
                <>
                  {" · "}
                  <em style={{ fontStyle: "normal", opacity: 0.7 }}>
                    + {fbaItems - todayUnits} FBA units pending itemization
                  </em>
                </>
              )}
            </span>
          ) : topSku ? (
            <span className="tv-items-meta">
              Top: <strong>{topSku.name}</strong>
            </span>
          ) : null}
        </div>
        {todayItems.length === 0 ? (
          <div className="tv-items-empty">No products sold yet today</div>
        ) : (
          <div className="tv-items-table-wrap">
            <table className="tv-items-table">
              <thead>
                <tr>
                  <th className="tv-items-col-product">Product</th>
                  {todayChannels.map((c) => (
                    <th key={c} className="tv-items-col-num">
                      {channelLabel(c)}
                    </th>
                  ))}
                  <th className="tv-items-col-total">Total</th>
                </tr>
              </thead>
              <tbody>
                {todayItems.map((row) => (
                  <tr key={row.sku + row.name}>
                    <td className="tv-items-col-product">
                      {row.isCustom && (
                        <span className="tv-items-tag">Custom</span>
                      )}
                      <span className="tv-items-name">{row.name}</span>
                    </td>
                    {todayChannels.map((c) => (
                      <td key={c} className="tv-items-col-num">
                        {row.perChannel[c] || ""}
                      </td>
                    ))}
                    <td className="tv-items-col-total">{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        /* TV page: light, on-brand, no scrolling */
        html, body { background: #FAFAF8 !important; color: #2F2F2F; }
        body { overflow: hidden !important; }
        .dl-main { padding: 0 !important; max-width: none !important; }

        .tv-shell {
          display: flex;
          flex-direction: column;
          height: 100vh;
          padding: 32px 48px;
          box-sizing: border-box;
          position: relative;
          background: #FAFAF8;
        }

        /* Top branded strip */
        .tv-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 18px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #2F2F2F;
          margin-bottom: 10px;
        }
        .tv-brand {
          color: #EC6B23;
          font-weight: 900;
          letter-spacing: 0.18em;
        }

        /* Hero section - Neat Orange band like the main dashboard Today band */
        .tv-hero-band {
          background: #FCE5D3;
          border: 2px solid #EC6B23;
          border-radius: 14px;
          padding: 30px 40px;
          text-align: center;
          margin-bottom: 18px;
        }
        .tv-hero-tag {
          display: inline-block;
          background: #EC6B23;
          color: #fff;
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          padding: 8px 20px;
          border-radius: 4px;
          margin-bottom: 14px;
        }
        .tv-hero-value {
          font-size: 200px;
          font-weight: 900;
          line-height: 0.95;
          font-variant-numeric: tabular-nums;
          color: #2F2F2F;
          margin: 4px 0 10px;
        }
        .tv-hero-sub {
          font-size: 22px;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #4a4a4a;
          text-transform: uppercase;
        }
        .tv-hero-sub strong { color: #EC6B23; font-weight: 900; }

        /* Goal bar — matches DailyGoalBar styling */
        .tv-goal-wrap { margin-bottom: 18px; }
        .tv-goal-line {
          display: flex;
          justify-content: space-between;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #2F2F2F;
          margin-bottom: 8px;
        }
        .tv-goal-current { color: #EC6B23; }
        .tv-goal-days {
          color: #6d7175;
          font-weight: 600;
          letter-spacing: 0.04em;
          margin-left: 6px;
        }
        .tv-goal-track {
          height: 22px;
          background: #fff;
          border: 2px solid #EC6B23;
          border-radius: 999px;
          overflow: hidden;
        }
        .tv-goal-fill {
          height: 100%;
          background: #EC6B23;
          border-radius: 999px;
          transition: width 0.5s;
        }

        /* Stat cards — white with subtle border, like BigKPICard */
        .tv-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-bottom: 18px;
        }
        .tv-stat {
          background: #fff;
          border: 1px solid #E6E3E0;
          border-radius: 10px;
          padding: 18px 22px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .tv-stat-label {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #6d7175;
          margin-bottom: 8px;
        }
        .tv-stat-value {
          font-size: 46px;
          font-weight: 900;
          line-height: 1;
          color: #2F2F2F;
          font-variant-numeric: tabular-nums;
        }
        .tv-stat-sub {
          font-size: 13px;
          font-weight: 600;
          color: #6d7175;
          margin-top: 6px;
          letter-spacing: 0.02em;
        }
        .tv-stat.accent .tv-stat-value { color: #EC6B23; }
        .tv-stat.alert .tv-stat-value { color: #C4314B; }
        .tv-stat.good .tv-stat-value { color: #2F7A3A; }

        /* Social media follower strip */
        .tv-social {
          display: flex;
          gap: 12px;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .tv-social-pill {
          flex: 1;
          min-width: 200px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          border: 1px solid #E6E3E0;
          border-radius: 10px;
          padding: 12px 18px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .tv-social-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .tv-social-platform {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6d7175;
        }
        .tv-social-handle {
          font-size: 13px;
          font-weight: 700;
          color: #2F2F2F;
        }
        .tv-social-count {
          margin-left: auto;
          font-size: 26px;
          font-weight: 900;
          color: #2F2F2F;
          font-variant-numeric: tabular-nums;
        }

        /* Social media follower strip */
        .tv-social {
          display: flex;
          gap: 12px;
          margin-top: 18px;
          flex-wrap: wrap;
        }
        .tv-social-pill {
          flex: 1;
          min-width: 200px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: #fff;
          border: 1px solid #E6E3E0;
          border-radius: 10px;
          padding: 12px 18px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }

        /* Bottom strip */
        .tv-bottom {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 12px;
          padding-top: 12px;
          font-size: 14px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #6d7175;
        }
        .tv-bottom strong { color: #EC6B23; font-weight: 800; letter-spacing: 0.04em; }

        /* SyncStatus override for the light TV header */
        .tv-sync-wrap .dl-sync-status {
          background: #fff;
          border-color: #E6E3E0;
          color: #2F2F2F;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .tv-sync-wrap .dl-sync-arrow { color: #6d7175; }

        /* Items Sold Today — fills remaining vertical space at the bottom */
        .tv-items-section {
          flex: 1 1 0;
          min-height: 0;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          margin-top: 12px;
        }
        .tv-items-header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 2px solid #EC6B23;
          flex-shrink: 0;
        }
        .tv-items-title {
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #2F2F2F;
        }
        .tv-items-meta {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #6d7175;
        }
        .tv-items-meta strong { color: #EC6B23; font-weight: 900; }
        .tv-items-empty {
          color: #6d7175;
          font-size: 14px;
          padding: 18px 0;
          text-align: center;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .tv-items-table-wrap {
          flex: 1 1 0;
          min-height: 0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }
        .tv-items-table {
          width: 100%;
          border-collapse: collapse;
          table-layout: auto;
        }
        .tv-items-table thead th {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #6d7175;
          padding: 4px 10px 6px;
          border-bottom: 1px solid #E6E3E0;
          text-align: right;
          white-space: nowrap;
        }
        .tv-items-table thead th.tv-items-col-product {
          text-align: left;
        }
        .tv-items-table tbody tr {
          border-bottom: 1px solid #f3f0ed;
        }
        .tv-items-table tbody tr:last-child {
          border-bottom: none;
        }
        .tv-items-table td {
          padding: 6px 10px;
          font-size: 13px;
          font-weight: 600;
          color: #2F2F2F;
          font-variant-numeric: tabular-nums;
          text-align: right;
          white-space: nowrap;
        }
        .tv-items-col-product {
          text-align: left !important;
          max-width: 0;
          width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .tv-items-col-num {
          color: #4a4a4a;
          width: 70px;
        }
        .tv-items-col-total {
          font-weight: 900 !important;
          color: #2F2F2F;
          width: 70px;
        }
        .tv-items-name {
          font-weight: 700;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: inline;
        }
        .tv-items-tag {
          display: inline-block;
          background: #EC6B23;
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 3px;
          margin-right: 6px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          vertical-align: middle;
        }

        /* Head — inline layout: exit btn + brand on left, date + time on right */
        .tv-head-left {
          display: inline-flex;
          align-items: center;
          gap: 14px;
        }
        .tv-head-right {
          display: inline-flex;
          align-items: baseline;
          gap: 16px;
        }
        .tv-date {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #6d7175;
          line-height: 1;
        }
        .tv-exit {
          color: #6d7175;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          text-decoration: none;
          padding: 6px 10px;
          border: 1px solid #E6E3E0;
          border-radius: 4px;
          background: #fff;
          opacity: 0.55;
          line-height: 1;
        }
        .tv-exit:hover { color: #EC6B23; border-color: #EC6B23; opacity: 1; }
      `}</style>
    </div>
  );
}
