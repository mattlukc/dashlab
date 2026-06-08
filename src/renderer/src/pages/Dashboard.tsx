// Dashboard page. Fetches the aggregated analytics payload from the main
// process (api:dashboard:post, computed in src/main/dashboard.ts) and renders
// it. Re-fetches when the date/compare URL params change and on window focus
// (so the background AutoSync's reload, or a manual refresh, shows fresh data).

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SkeletonBodyText, SkeletonDisplayText } from "@shopify/polaris";
import { BigKPICard } from "../components/BigKPICard";
import { RealSalesTrendCard } from "../components/RealSalesTrendCard";
import { DateNavigator } from "../components/DateNavigator";
import { CompareSelector, type CompareMode } from "../components/CompareSelector";
import { DailyGoalBar } from "../components/DailyGoalBar";
import { ItemsSoldTodayCard } from "../components/ItemsSoldTodayCard";
import { SalesByStateCard } from "../components/SalesByStateCard";
import { SocialFollowersStrip } from "../components/SocialFollowersStrip";

type Delta = { pct: number; label: string; priorValue?: string };
interface DashboardData {
  useMock: boolean;
  today: string;
  selectedDate: string;
  isToday: boolean;
  compareMode: CompareMode;
  fbaEnabled: boolean;
  dailySalesGoal: number;
  displayMode: "gross" | "net";
  fbmOrdersToday: number;
  fbmGrossToday: number;
  fbmItemsToday: number;
  fbaOrderCount: number;
  fbaUnitCount: number;
  fbaGrossToday: number;
  totalOrdersToday: number;
  totalNetToday: number;
  totalGrossToday: number;
  totalItemsToday: number;
  aovToday: number;
  projectedTodayGross: number;
  projectedTodayNet: number;
  oldest: { ageHours: number; orderNumber: string; customerName: string | null } | null;
  customStat: { custom: number; total: number; pct: number };
  avgShipHours: number | null;
  onTime: { shipped: number; onTime: number; pct: number };
  queueCount: number;
  wtdRevenue: number; mtdRevenue: number; qtdRevenue: number; ytdRevenue: number;
  wtdFbm: number; mtdFbm: number; qtdFbm: number; ytdFbm: number;
  wtdFba: number; mtdFba: number; qtdFba: number; ytdFba: number;
  wtdNet: number; mtdNet: number; qtdNet: number; ytdNet: number;
  wtdFbmNet: number; mtdFbmNet: number; qtdFbmNet: number; ytdFbmNet: number;
  wtdFbaNet: number; mtdFbaNet: number; qtdFbaNet: number; ytdFbaNet: number;
  wtdDelta: Delta | null; mtdDelta: Delta | null; qtdDelta: Delta | null; ytdDelta: Delta | null;
  wtdTotalCount: number; mtdTotalCount: number; qtdTotalCount: number; ytdTotalCount: number;
  wtdCount: number; mtdCount: number; qtdCount: number; ytdCount: number;
  wtdCountFba: number; mtdCountFba: number; qtdCountFba: number; ytdCountFba: number;
  wtdCountDelta: Delta | null;
  mtdTotalCountPrior: number; qtdTotalCountPrior: number; ytdTotalCountPrior: number;
  itemsToday: Array<{ sku: string; name: string; isCustom: boolean; total: number; perChannel: Record<string, number> }>;
  itemChannels: string[];
  pendingFbaUnits: number;
  stateRows: { state: string; revenue: number; orders: number }[];
  socialPills: Array<{ platform: "youtube" | "facebook" | "instagram" | "tiktok"; handle: string; followers: number; contentCount?: number }>;
  trendData: { day: string; revenue: number; orders: number }[];
}

function pctDelta(current: number, prior: number): number {
  if (prior <= 0) return 0;
  return ((current - prior) / prior) * 100;
}

export default function DashboardPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get("date") ?? "";
  const compareParam = searchParams.get("compare") ?? "";
  const compareMode: CompareMode =
    compareParam === "lp" || compareParam === "off" ? (compareParam as CompareMode) : "ly";

  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date: dateParam || undefined, compare: compareParam || undefined }),
        });
        const json = (await res.json()) as DashboardData & { error?: string };
        // The shim wraps a thrown handler as { error }; ignore those so the
        // skeleton stays up instead of rendering against an incomplete payload.
        if (!cancelled && json && !json.error && typeof json.today === "string") {
          setData(json);
        } else if (json?.error) {
          console.error("[dashboard] handler error:", json.error);
        }
      } catch {
        // leave the skeleton up on failure
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [dateParam, compareParam, refreshKey]);

  const today = data?.today ?? "";
  const selectedDate = data?.selectedDate ?? dateParam ?? today;
  const isToday = data ? data.isToday : true;

  const dateLabel = selectedDate
    ? (() => {
        const [sy, sm, sd] = selectedDate.split("-").map(Number);
        return new Date(sy, sm - 1, sd).toLocaleDateString("en-US", {
          weekday: "long",
          year: "numeric",
          month: "long",
          day: "numeric",
        });
      })()
    : "";

  if (!data) {
    return (
      <>
        <div className="dl-page-title">
          <h1>Loading…</h1>
        </div>
        <div className="dl-today-band">
          <SkeletonDisplayText size="large" />
          <div style={{ marginTop: 16 }}>
            <SkeletonBodyText lines={3} />
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          <SkeletonBodyText lines={6} />
        </div>
      </>
    );
  }

  const { fbaEnabled } = data;
  const net = data.displayMode === "net";
  // The headline figure + goal/pace follow the display mode (gross vs net).
  const headlineToday = net ? data.totalNetToday : data.totalGrossToday;
  const goalCurrent = net ? data.totalNetToday : data.totalGrossToday;
  const pace = net ? data.projectedTodayNet : data.projectedTodayGross;
  const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

  return (
    <>
      <div className="dl-page-title">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 12,
            width: "100%",
          }}
        >
          <DateNavigator selectedDate={selectedDate} today={today} />
          <h1>{isToday ? `Today · ${dateLabel}` : dateLabel}</h1>
          <CompareSelector mode={compareMode} />
        </div>
        {data.useMock && (
          <div className="dl-page-meta">Mock data mode · enable real APIs in Settings</div>
        )}
      </div>

      {/* Today highlight band */}
      <div className="dl-today-band">
        <div className="dl-today-band-header">
          <span className="dl-today-band-tag">{isToday ? "Today" : "Selected day"}</span>
          <span className="dl-today-band-title">Live snapshot</span>
        </div>
        {isToday && (
          <DailyGoalBar current={goalCurrent} goal={data.dailySalesGoal} />
        )}
        <div className="dl-grid-3" style={{ marginBottom: 0 }}>
          <BigKPICard
            label={isToday ? "Orders Today" : "Orders on Date"}
            value={data.totalOrdersToday.toString()}
            sub={fbaEnabled ? `${data.fbmOrdersToday} ShipStation · ${data.fbaOrderCount} FBA` : "from ShipStation"}
            accent="#EC6B23"
          />
          <BigKPICard
            label={
              net
                ? isToday ? "Net Sales Today" : "Net Sales"
                : isToday ? "Sales Today" : "Sales"
            }
            value={money(headlineToday)}
            sub={
              net
                ? fbaEnabled ? "ShipStation + FBA · est. after fees" : "est. after channel fees"
                : fbaEnabled ? "ShipStation + FBA · gross revenue" : "gross revenue"
            }
            accent="#2F2F2F"
          />
          <BigKPICard
            label={isToday ? "Items Sold Today" : "Items Sold"}
            value={data.totalItemsToday.toString()}
            sub={fbaEnabled ? `${data.fbmItemsToday} ShipStation · ${data.fbaUnitCount} FBA` : "units"}
            accent="#EC6B23"
          />
        </div>
      </div>

      {/* Today extras */}
      <div className="dl-section-heading">Today · Details</div>
      <div className="dl-grid-4">
        <BigKPICard compact label="AOV Today" value={`$${Math.round(data.aovToday).toLocaleString()}`} sub="combined avg order value" />
        <BigKPICard compact label="Today's Pace" value={money(pace)} sub={net ? "projected net at current pace" : "projected at current pace"} />
        <BigKPICard
          compact
          label="Oldest Unshipped"
          value={
            data.oldest
              ? data.oldest.ageHours < 1
                ? "<1 hr"
                : data.oldest.ageHours < 24
                  ? `${Math.round(data.oldest.ageHours)} ${Math.round(data.oldest.ageHours) === 1 ? "hr" : "hrs"}`
                  : (() => {
                      const d = Math.round(data.oldest.ageHours / 24);
                      return `${d} ${d === 1 ? "day" : "days"}`;
                    })()
              : "—"
          }
          sub={data.oldest ? `#${data.oldest.orderNumber} · ${data.oldest.customerName ?? "unknown"}` : "queue is clear"}
          accent={data.oldest && data.oldest.ageHours > 72 ? "#C4314B" : undefined}
        />
        <BigKPICard compact label="% Custom Today" value={`${Math.round(data.customStat.pct)}%`} sub={`${data.customStat.custom} of ${data.customStat.total} orders`} />
      </div>

      <div className="dl-section-heading">{net ? "Net Sales · Periods" : "Sales · Periods"}</div>
      <div className="dl-grid-4">
        <BigKPICard compact label={`${net ? "Net" : "Sales"} · WTD`} value={money(net ? data.wtdNet : data.wtdRevenue)} delta={data.wtdDelta ?? undefined} sub={fbaEnabled ? `${money(net ? data.wtdFbmNet : data.wtdFbm)} SS · ${money(net ? data.wtdFbaNet : data.wtdFba)} FBA` : "this week"} />
        <BigKPICard compact label={`${net ? "Net" : "Sales"} · MTD`} value={money(net ? data.mtdNet : data.mtdRevenue)} delta={data.mtdDelta ?? undefined} sub={fbaEnabled ? `${money(net ? data.mtdFbmNet : data.mtdFbm)} SS · ${money(net ? data.mtdFbaNet : data.mtdFba)} FBA` : "this month"} />
        <BigKPICard compact label={`${net ? "Net" : "Sales"} · QTD`} value={money(net ? data.qtdNet : data.qtdRevenue)} delta={data.qtdDelta ?? undefined} sub={fbaEnabled ? `${money(net ? data.qtdFbmNet : data.qtdFbm)} SS · ${money(net ? data.qtdFbaNet : data.qtdFba)} FBA` : "this quarter"} />
        <BigKPICard compact label={`${net ? "Net" : "Sales"} · YTD`} value={money(net ? data.ytdNet : data.ytdRevenue)} delta={data.ytdDelta ?? undefined} sub={fbaEnabled ? `${money(net ? data.ytdFbmNet : data.ytdFbm)} SS · ${money(net ? data.ytdFbaNet : data.ytdFba)} FBA` : "this year"} />
      </div>

      <div className="dl-section-heading">Orders · Periods</div>
      <div className="dl-grid-4">
        <BigKPICard compact label="Orders · WTD" value={data.wtdTotalCount.toLocaleString()} delta={data.wtdCountDelta ?? undefined} sub={fbaEnabled ? `${data.wtdCount} SS · ${data.wtdCountFba} FBA` : "this week"} />
        <BigKPICard
          compact
          label="Orders · MTD"
          value={data.mtdTotalCount.toLocaleString()}
          delta={data.mtdTotalCountPrior > 0 ? { pct: pctDelta(data.mtdTotalCount, data.mtdTotalCountPrior), label: data.compareMode === "lp" ? "vs prev period" : "vs last year", priorValue: data.mtdTotalCountPrior.toLocaleString() } : undefined}
          sub={fbaEnabled ? `${data.mtdCount} SS · ${data.mtdCountFba} FBA` : "this month"}
          accent="#EC6B23"
        />
        <BigKPICard
          compact
          label="Orders · QTD"
          value={data.qtdTotalCount.toLocaleString()}
          delta={data.qtdTotalCountPrior > 0 ? { pct: pctDelta(data.qtdTotalCount, data.qtdTotalCountPrior), label: data.compareMode === "lp" ? "vs prev period" : "vs last year", priorValue: data.qtdTotalCountPrior.toLocaleString() } : undefined}
          sub={fbaEnabled ? `${data.qtdCount} SS · ${data.qtdCountFba} FBA` : "this quarter"}
          accent="#EC6B23"
        />
        <BigKPICard
          compact
          label="Orders · YTD"
          value={data.ytdTotalCount.toLocaleString()}
          delta={data.ytdTotalCountPrior > 0 ? { pct: pctDelta(data.ytdTotalCount, data.ytdTotalCountPrior), label: data.compareMode === "lp" ? "vs prev period" : "vs last year", priorValue: data.ytdTotalCountPrior.toLocaleString() } : undefined}
          sub={fbaEnabled ? `${data.ytdCount} SS · ${data.ytdCountFba} FBA` : "this year"}
          accent="#2F2F2F"
        />
      </div>

      {/* Operations Health */}
      <div className="dl-section-heading">Operations Health · Last 30 Days</div>
      <div className="dl-grid-3">
        <BigKPICard
          compact
          label="Avg Ship Time"
          value={data.avgShipHours == null ? "—" : data.avgShipHours < 48 ? `${Math.round(data.avgShipHours)}h` : `${(data.avgShipHours / 24).toFixed(1)}d`}
          sub="order created → shipped"
          accent={data.avgShipHours && data.avgShipHours > 72 ? "#B54708" : undefined}
        />
        <BigKPICard
          compact
          label="On-Time Ship Rate"
          value={`${Math.round(data.onTime.pct)}%`}
          sub={`${data.onTime.onTime} of ${data.onTime.shipped} shipped on time`}
          accent={data.onTime.pct >= 95 ? "#2F7A3A" : data.onTime.pct >= 85 ? undefined : "#C4314B"}
        />
        <BigKPICard compact label="Ship Queue" value={data.queueCount.toString()} sub="orders waiting to ship" accent={data.queueCount > 30 ? "#B54708" : undefined} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <ItemsSoldTodayCard items={data.itemsToday} channels={data.itemChannels} pendingFbaUnits={data.pendingFbaUnits} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <SalesByStateCard rows={data.stateRows} />
      </div>

      {data.socialPills.length > 0 && (
        <>
          <div className="dl-section-heading">Social</div>
          <SocialFollowersStrip pills={data.socialPills} size="dashboard" />
        </>
      )}

      <div style={{ marginBottom: 18 }}>
        <RealSalesTrendCard data={data.trendData} />
      </div>
    </>
  );
}
