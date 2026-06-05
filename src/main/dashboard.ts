// Aggregated dashboard + TV analytics, computed in the main process where the
// SQLite DB lives. These are direct ports of the data-loading that the old
// Next.js server components (app/page.tsx, app/tv/page.tsx) did inline. Each
// returns a flat, display-ready payload the renderer page renders 1:1, so all
// the date-range / delta math stays in one place next to the DB.

import {
  getLatestSyncLog,
  getOrdersForToday,
  getOrdersInPrintQueue,
  getOrdersOnLocalDate,
  getDailyRevenueLastNDays,
  getFbaOrdersToday,
  getFbaMetric,
  getRevenueSince,
  getRevenueInRange,
  getOrderCountInRange,
  getOldestUnshippedOrder,
  getAvgShipTimeHours,
  getItemsSoldByChannelInRange,
  getRevenueByState,
  getCustomOrderPctOnDate,
  getOnTimeShipRate,
  getTopSKUsInRange,
  getSocialStat,
} from "./lib/db";
import { getOrderMetrics } from "./lib/amazon-sp-api";
import { loadSettings } from "./lib/settings";
import type { Order } from "./lib/types";

type CompareMode = "ly" | "lp" | "off";

interface Delta {
  pct: number;
  label: string;
  priorValue?: string;
}

const NET_MULTIPLIER: Record<string, number> = {
  shopify: 0.97,
  amazon_fbm: 0.85,
  amazon_fba: 0.7,
  etsy: 0.935,
  ebay: 0.87,
  manual: 1.0,
  other: 0.95,
};

function estimateNet(order: Order): number {
  const productSales =
    (order.orderTotal ?? 0) - (order.shippingAmount ?? 0) - (order.taxAmount ?? 0);
  return productSales * (NET_MULTIPLIER[order.channel] ?? 0.95);
}
function fbaNet(grossFba: number): number {
  return grossFba * 0.85;
}
function startOfWeek(): Date {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfMonth(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfQuarter(): Date {
  const d = new Date();
  d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function startOfYear(): Date {
  const d = new Date();
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localISOForDate(yyyyMmDd: string, endOfDay = false): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const date = endOfDay ? new Date(y, m - 1, d + 1) : new Date(y, m - 1, d);
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const offH = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, "0");
  const offM = String(Math.abs(tzOffsetMin) % 60).padStart(2, "0");
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T00:00:00${sign}${offH}:${offM}`;
}
function pctDelta(current: number, prior: number): number {
  if (prior <= 0) return 0;
  return ((current - prior) / prior) * 100;
}
function periodRanges(period: "mtd" | "qtd" | "ytd", mode: CompareMode) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const tomorrow = new Date(y, m, now.getDate() + 1);
  let curStart: Date;
  let priorStart: Date;
  let priorEnd: Date;
  if (period === "mtd") {
    curStart = new Date(y, m, 1);
    if (mode === "ly") {
      priorStart = new Date(y - 1, m, 1);
      priorEnd = new Date(y - 1, m, now.getDate() + 1);
    } else {
      priorStart = new Date(y, m - 1, 1);
      priorEnd = new Date(y, m - 1, now.getDate() + 1);
    }
  } else if (period === "qtd") {
    const qStart = Math.floor(m / 3) * 3;
    curStart = new Date(y, qStart, 1);
    if (mode === "ly") {
      priorStart = new Date(y - 1, qStart, 1);
      priorEnd = new Date(y - 1, m, now.getDate() + 1);
    } else {
      const prevQStart = qStart - 3 < 0 ? qStart - 3 + 12 : qStart - 3;
      const yearShift = qStart - 3 < 0 ? -1 : 0;
      priorStart = new Date(y + yearShift, prevQStart, 1);
      const daysIn = Math.ceil(
        (tomorrow.getTime() - curStart.getTime()) / (1000 * 60 * 60 * 24)
      );
      priorEnd = new Date(priorStart);
      priorEnd.setDate(priorEnd.getDate() + daysIn);
    }
  } else {
    curStart = new Date(y, 0, 1);
    priorStart = new Date(y - 1, 0, 1);
    priorEnd = new Date(y - 1, m, now.getDate() + 1);
  }
  return {
    curStart: curStart.toISOString(),
    curEnd: tomorrow.toISOString(),
    priorStart: priorStart.toISOString(),
    priorEnd: priorEnd.toISOString(),
  };
}

export interface DashboardParams {
  date?: string;
  compare?: string;
}

/** Full dashboard payload — direct port of the old app/page.tsx server component. */
export async function computeDashboard(params: DashboardParams) {
  const settings = loadSettings();
  const useMock = settings.general.useMockData;

  const today = todayYmd();
  const selectedDate =
    params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const isToday = selectedDate === today;

  const compareMode: CompareMode =
    params.compare === "lp" || params.compare === "off"
      ? (params.compare as CompareMode)
      : "ly";
  const compareLabel = compareMode === "lp" ? "vs prev period" : "vs last year";
  const showDelta = compareMode !== "off" && !useMock;

  const todaysOrders: Order[] = getOrdersOnLocalDate(selectedDate);
  const trendData = getDailyRevenueLastNDays(30);

  const fbmOrdersToday = todaysOrders.length;
  const fbmGrossToday = todaysOrders.reduce((s, o) => s + (o.orderTotal ?? 0), 0);
  const fbmNetToday = todaysOrders.reduce((s, o) => s + estimateNet(o), 0);
  const fbmItemsToday = todaysOrders.reduce((s, o) => s + o.totalItems, 0);

  const fbaEnabled = !useMock && settings.amazonSpApi.enabled;
  let fbaOrderCount = 0;
  let fbaUnitCount = 0;
  let fbaGrossToday = 0;
  if (fbaEnabled) {
    if (isToday) {
      const cached = getFbaMetric("today");
      if (cached) {
        fbaOrderCount = cached.order_count;
        fbaUnitCount = cached.unit_count;
        fbaGrossToday = cached.total_sales;
      } else {
        const t = getFbaOrdersToday();
        fbaOrderCount = t.length;
        fbaUnitCount = t.reduce((s, o) => s + (o.number_of_items ?? 0), 0);
      }
    } else {
      try {
        // Sum live metrics across every configured marketplace (US/CA/MX).
        const marketplaceIds =
          settings.amazonSpApi.marketplaceIds?.length
            ? settings.amazonSpApi.marketplaceIds
            : ["ATVPDKIKX0DER"];
        for (const marketplaceId of marketplaceIds) {
          const metrics = await getOrderMetrics({
            intervalStart: localISOForDate(selectedDate, false),
            intervalEnd: localISOForDate(selectedDate, true),
            fulfillmentNetwork: "AFN",
            granularity: "Total",
            marketplaceId,
          });
          const m = metrics[0];
          if (m) {
            fbaOrderCount += m.orderCount ?? 0;
            fbaUnitCount += m.unitCount ?? 0;
            fbaGrossToday += m.totalSales ? parseFloat(m.totalSales.amount) : 0;
          }
        }
      } catch (err) {
        console.warn("[dashboard] FBA live fetch failed:", (err as Error).message);
      }
    }
  }
  const fbaNetToday = fbaNet(fbaGrossToday);

  const totalOrdersToday = fbmOrdersToday + fbaOrderCount;
  const totalNetToday = fbmNetToday + fbaNetToday;
  const totalItemsToday = fbmItemsToday + fbaUnitCount;

  // Period revenue
  const wtdFbm = getRevenueSince(startOfWeek().toISOString());
  const mtdFbm = getRevenueSince(startOfMonth().toISOString());
  const qtdFbm = getRevenueSince(startOfQuarter().toISOString());
  const ytdFbm = getRevenueSince(startOfYear().toISOString());

  const wtdFbaMetric = fbaEnabled ? getFbaMetric("wtd") : null;
  const mtdFbaMetric = fbaEnabled ? getFbaMetric("mtd") : null;
  const qtdFbaMetric = fbaEnabled ? getFbaMetric("qtd") : null;
  const ytdFbaMetric = fbaEnabled ? getFbaMetric("ytd") : null;
  const wtdFba = wtdFbaMetric?.total_sales ?? 0;
  const mtdFba = mtdFbaMetric?.total_sales ?? 0;
  const qtdFba = qtdFbaMetric?.total_sales ?? 0;
  const ytdFba = ytdFbaMetric?.total_sales ?? 0;

  const mtdRevenue = mtdFbm + mtdFba;
  const qtdRevenue = qtdFbm + qtdFba;
  const ytdRevenue = ytdFbm + ytdFba;

  const lyWtdFba = fbaEnabled ? getFbaMetric("ly-wtd")?.total_sales ?? 0 : 0;
  const lyMtdFba = fbaEnabled ? getFbaMetric("ly-mtd")?.total_sales ?? 0 : 0;
  const lyQtdFba = fbaEnabled ? getFbaMetric("ly-qtd")?.total_sales ?? 0 : 0;
  const lyYtdFba = fbaEnabled ? getFbaMetric("ly-ytd")?.total_sales ?? 0 : 0;

  let mtdPriorFbm = 0;
  let qtdPriorFbm = 0;
  let ytdPriorFbm = 0;
  let mtdCount = 0;
  let qtdCount = 0;
  let ytdCount = 0;
  let mtdCountPrior = 0;
  let qtdCountPrior = 0;
  let ytdCountPrior = 0;
  if (!useMock) {
    const mtdR = periodRanges("mtd", compareMode === "off" ? "ly" : compareMode);
    const qtdR = periodRanges("qtd", compareMode === "off" ? "ly" : compareMode);
    const ytdR = periodRanges("ytd", compareMode === "off" ? "ly" : compareMode);
    mtdCount = getOrderCountInRange(mtdR.curStart, mtdR.curEnd);
    qtdCount = getOrderCountInRange(qtdR.curStart, qtdR.curEnd);
    ytdCount = getOrderCountInRange(ytdR.curStart, ytdR.curEnd);
    if (compareMode !== "off") {
      mtdPriorFbm = getRevenueInRange(mtdR.priorStart, mtdR.priorEnd);
      qtdPriorFbm = getRevenueInRange(qtdR.priorStart, qtdR.priorEnd);
      ytdPriorFbm = getRevenueInRange(ytdR.priorStart, ytdR.priorEnd);
      mtdCountPrior = getOrderCountInRange(mtdR.priorStart, mtdR.priorEnd);
      qtdCountPrior = getOrderCountInRange(qtdR.priorStart, qtdR.priorEnd);
      ytdCountPrior = getOrderCountInRange(ytdR.priorStart, ytdR.priorEnd);
    }
  }
  const wtdCountFba = wtdFbaMetric?.order_count ?? 0;
  const mtdCountFba = mtdFbaMetric?.order_count ?? 0;
  const qtdCountFba = qtdFbaMetric?.order_count ?? 0;
  const ytdCountFba = ytdFbaMetric?.order_count ?? 0;
  const lyWtdCountFba = fbaEnabled ? getFbaMetric("ly-wtd")?.order_count ?? 0 : 0;
  const lyMtdCountFba = fbaEnabled ? getFbaMetric("ly-mtd")?.order_count ?? 0 : 0;
  const lyQtdCountFba = fbaEnabled ? getFbaMetric("ly-qtd")?.order_count ?? 0 : 0;
  const lyYtdCountFba = fbaEnabled ? getFbaMetric("ly-ytd")?.order_count ?? 0 : 0;
  const mtdTotalCount = mtdCount + mtdCountFba;
  const qtdTotalCount = qtdCount + qtdCountFba;
  const ytdTotalCount = ytdCount + ytdCountFba;
  const mtdTotalCountPrior = mtdCountPrior + (compareMode === "ly" ? lyMtdCountFba : 0);
  const qtdTotalCountPrior = qtdCountPrior + (compareMode === "ly" ? lyQtdCountFba : 0);
  const ytdTotalCountPrior = ytdCountPrior + (compareMode === "ly" ? lyYtdCountFba : 0);
  const mtdPrior = mtdPriorFbm + (compareMode === "ly" ? lyMtdFba : 0);
  const qtdPrior = qtdPriorFbm + (compareMode === "ly" ? lyQtdFba : 0);
  const ytdPrior = ytdPriorFbm + (compareMode === "ly" ? lyYtdFba : 0);

  const mkRevDelta = (cur: number, prior: number): Delta | null =>
    showDelta && prior > 0
      ? { pct: pctDelta(cur, prior), label: compareLabel, priorValue: `$${Math.round(prior).toLocaleString()}` }
      : null;
  const mkCountDelta = (cur: number, prior: number): Delta | null =>
    showDelta && prior > 0
      ? { pct: pctDelta(cur, prior), label: compareLabel, priorValue: prior.toLocaleString() }
      : null;

  const mtdDelta = mkRevDelta(mtdRevenue, mtdPrior);
  const qtdDelta = mkRevDelta(qtdRevenue, qtdPrior);
  const ytdDelta = mkRevDelta(ytdRevenue, ytdPrior);

  const queueOrders = getOrdersForToday();
  const queueCount = queueOrders.length;
  const lastSync = getLatestSyncLog("shipstation");

  // Social pills
  type SocialPill = {
    platform: "youtube" | "facebook" | "instagram" | "tiktok";
    handle: string;
    followers: number;
    contentCount?: number;
  };
  const socialPills: SocialPill[] = [];
  if (!useMock) {
    const yt = settings.social.youtube.enabled ? getSocialStat("youtube") : null;
    const fb = settings.social.facebook.enabled ? getSocialStat("facebook") : null;
    const ig = settings.social.instagram.enabled ? getSocialStat("instagram") : null;
    if (settings.social.youtube.enabled && yt) {
      socialPills.push({ platform: "youtube", handle: settings.social.youtube.handle || "@neattools", followers: yt.followers, contentCount: yt.content_count });
    }
    if (settings.social.facebook.enabled && fb) {
      socialPills.push({ platform: "facebook", handle: settings.social.facebook.handle || "Neat Tools", followers: fb.followers });
    }
    if (settings.social.instagram.enabled) {
      socialPills.push({ platform: "instagram", handle: settings.social.instagram.handle || "@neattools", followers: ig?.followers || settings.social.instagram.followers, contentCount: ig?.content_count });
    }
    if (settings.social.tiktok.enabled) {
      socialPills.push({ platform: "tiktok", handle: settings.social.tiktok.handle || "@neattools", followers: settings.social.tiktok.followers });
    }
  }

  const aovToday = totalOrdersToday > 0 ? (fbmGrossToday + fbaGrossToday) / totalOrdersToday : 0;
  const now = new Date();
  const hourOfDay = now.getHours() + now.getMinutes() / 60;
  const dayFraction = Math.max(0.05, hourOfDay / 24);
  const projectedTodayGross = (fbmGrossToday + fbaGrossToday) / dayFraction;

  const oldest = getOldestUnshippedOrder();
  const customStat = getCustomOrderPctOnDate(selectedDate);
  const avgShipHours = getAvgShipTimeHours(30);
  const onTime = getOnTimeShipRate(30);

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const { items: itemsToday, channels: itemChannels } = getItemsSoldByChannelInRange(
    todayStart.toISOString(),
    tomorrowStart.toISOString(),
    50
  );
  const aggUnitsToday = itemsToday.reduce((s, r) => s + r.total, 0);
  const pendingFbaUnits = fbaEnabled && fbaUnitCount > aggUnitsToday ? fbaUnitCount - aggUnitsToday : 0;

  const stateRows = getRevenueByState(startOfYear().toISOString(), tomorrowStart.toISOString(), 10);

  // WTD
  let wtdPriorFbm = 0;
  let wtdCount = 0;
  let wtdCountPrior = 0;
  if (!useMock) {
    const wtdCurStart = startOfWeek();
    const wtdCurEnd = new Date(now);
    wtdCurEnd.setDate(wtdCurEnd.getDate() + 1);
    wtdCurEnd.setHours(0, 0, 0, 0);
    wtdCount = getOrderCountInRange(wtdCurStart.toISOString(), wtdCurEnd.toISOString());
    const priorStart = new Date(wtdCurStart);
    const priorEnd = new Date(wtdCurEnd);
    if (compareMode === "lp") {
      priorStart.setDate(priorStart.getDate() - 7);
      priorEnd.setDate(priorEnd.getDate() - 7);
    } else {
      priorStart.setFullYear(priorStart.getFullYear() - 1);
      priorEnd.setFullYear(priorEnd.getFullYear() - 1);
    }
    wtdPriorFbm = getRevenueInRange(priorStart.toISOString(), priorEnd.toISOString());
    wtdCountPrior = getOrderCountInRange(priorStart.toISOString(), priorEnd.toISOString());
  }
  const wtdRevenue = wtdFbm + wtdFba;
  const wtdPrior = wtdPriorFbm + (compareMode === "ly" ? lyWtdFba : 0);
  const wtdTotalCount = wtdCount + wtdCountFba;
  const wtdTotalCountPrior = wtdCountPrior + (compareMode === "ly" ? lyWtdCountFba : 0);
  const wtdDelta = mkRevDelta(wtdRevenue, wtdPrior);
  const wtdCountDelta = mkCountDelta(wtdTotalCount, wtdTotalCountPrior);

  return {
    useMock,
    today,
    selectedDate,
    isToday,
    compareMode,
    fbaEnabled,
    lastSync,
    dailySalesGoal: settings.general.dailySalesGoal,
    // today
    fbmOrdersToday,
    fbmGrossToday,
    fbmItemsToday,
    fbaOrderCount,
    fbaUnitCount,
    fbaGrossToday,
    totalOrdersToday,
    totalNetToday,
    totalItemsToday,
    aovToday,
    projectedTodayGross,
    oldest,
    customStat,
    avgShipHours,
    onTime,
    queueCount,
    // periods — revenue
    wtdRevenue, mtdRevenue, qtdRevenue, ytdRevenue,
    wtdFbm, mtdFbm, qtdFbm, ytdFbm,
    wtdFba, mtdFba, qtdFba, ytdFba,
    wtdDelta, mtdDelta, qtdDelta, ytdDelta,
    // periods — counts
    wtdTotalCount, mtdTotalCount, qtdTotalCount, ytdTotalCount,
    wtdCount, mtdCount, qtdCount, ytdCount,
    wtdCountFba, mtdCountFba, qtdCountFba, ytdCountFba,
    wtdCountDelta,
    mtdTotalCountPrior, qtdTotalCountPrior, ytdTotalCountPrior,
    // tables
    itemsToday, itemChannels, pendingFbaUnits,
    stateRows,
    socialPills,
    trendData,
  };
}

export type DashboardPayload = Awaited<ReturnType<typeof computeDashboard>>;

/** TV payload — direct port of the old app/tv/page.tsx server component. */
export function computeTv() {
  const settings = loadSettings();
  const today = todayYmd();
  const todaysOrders = getOrdersOnLocalDate(today);

  const fbmOrders = todaysOrders.length;
  const fbmGross = todaysOrders.reduce(
    (s, o) => s + ((o.orderTotal ?? 0) - (o.shippingAmount ?? 0) - (o.taxAmount ?? 0)),
    0
  );
  const fbmItems = todaysOrders.reduce((s, o) => s + o.totalItems, 0);

  const fbaEnabled = settings.amazonSpApi.enabled;
  const fbaCache = fbaEnabled ? getFbaMetric("today") : null;
  const fbaOrders = fbaCache?.order_count ?? 0;
  const fbaGross = fbaCache?.total_sales ?? 0;
  const fbaItems = fbaCache?.unit_count ?? 0;

  const totalGross = fbmGross + fbaGross;
  const fbmNet = todaysOrders.reduce((s, o) => s + estimateNet(o), 0);
  // Use the shared fbaNet() helper (× 0.85) so the TV matches getDashboardData().
  const fbaNetAmount = fbaEnabled ? fbaNet(fbaGross) : 0;
  const totalNet = fbmNet + fbaNetAmount;
  const totalOrders = fbmOrders + fbaOrders;
  const totalItems = fbmItems + fbaItems;
  const aov = totalOrders > 0 ? totalGross / totalOrders : 0;

  const now = new Date();
  const mtdFbm = getRevenueSince(startOfMonth().toISOString());
  const mtdFba = fbaEnabled ? getFbaMetric("mtd")?.total_sales ?? 0 : 0;
  const mtdTotal = mtdFbm + mtdFba;

  const lyMtdStart = new Date(now.getFullYear() - 1, now.getMonth(), 1);
  const lyMtdEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 1);
  const lyMtdFbm = getRevenueInRange(lyMtdStart.toISOString(), lyMtdEnd.toISOString());
  const lyMtdFba = fbaEnabled ? getFbaMetric("ly-mtd")?.total_sales ?? 0 : 0;
  const lyMtdTotal = lyMtdFbm + lyMtdFba;
  const mtdDeltaPct = lyMtdTotal > 0 ? ((mtdTotal - lyMtdTotal) / lyMtdTotal) * 100 : 0;

  const oldest = getOldestUnshippedOrder();
  const queueCount = getOrdersForToday().length;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const topSku =
    getTopSKUsInRange(todayStart.toISOString(), tomorrowStart.toISOString(), 1)[0] ?? null;
  const { items: todayItems, channels: todayChannels } = getItemsSoldByChannelInRange(
    todayStart.toISOString(),
    tomorrowStart.toISOString(),
    50
  );
  const todayUnits = todayItems.reduce((s, r) => s + r.total, 0);

  type Pill = {
    platform: "youtube" | "facebook" | "instagram" | "tiktok";
    handle: string;
    followers: number;
    contentCount?: number;
  };
  const socialPills: Pill[] = [];
  const ytStat = settings.social.youtube.enabled ? getSocialStat("youtube") : null;
  const fbStat = settings.social.facebook.enabled ? getSocialStat("facebook") : null;
  const igStat = settings.social.instagram.enabled ? getSocialStat("instagram") : null;
  if (settings.social.youtube.enabled && ytStat) {
    socialPills.push({ platform: "youtube", handle: settings.social.youtube.handle || "@neattools", followers: ytStat.followers, contentCount: ytStat.content_count });
  }
  if (settings.social.facebook.enabled && fbStat) {
    socialPills.push({ platform: "facebook", handle: settings.social.facebook.handle || "Neat Tools", followers: fbStat.followers });
  }
  if (settings.social.instagram.enabled) {
    socialPills.push({ platform: "instagram", handle: settings.social.instagram.handle || "@neattools", followers: igStat?.followers || settings.social.instagram.followers, contentCount: igStat?.content_count });
  }
  if (settings.social.tiktok.enabled) {
    socialPills.push({ platform: "tiktok", handle: settings.social.tiktok.handle || "@neattools", followers: settings.social.tiktok.followers });
  }

  const goal = settings.general.dailySalesGoal;

  return {
    totalGross,
    totalNet,
    totalOrders,
    totalItems,
    aov,
    mtdTotal,
    mtdDeltaPct,
    oldest,
    queueCount,
    topSku,
    todayItems,
    todayChannels,
    todayUnits,
    fbaEnabled,
    fbaItems,
    socialPills,
    goal,
  };
}

export type TvPayload = ReturnType<typeof computeTv>;

// ---- Orders page ----
// Port of app/orders/page.tsx: splits the open queue into "ship today" vs
// "ship within 6 days" using each order's effective ship-by (real ship-by if
// it's meaningfully later than the order date, else created_at + lead time).

function hasMeaningfulShipBy(order: Order): boolean {
  if (!order.shipBy) return false;
  const created = new Date(order.createdAt);
  const ship = new Date(order.shipBy);
  return (
    created.getFullYear() !== ship.getFullYear() ||
    created.getMonth() !== ship.getMonth() ||
    created.getDate() !== ship.getDate()
  );
}
function effectiveShipBy(order: Order, leadTimeDays: number): Date {
  if (hasMeaningfulShipBy(order)) {
    const d = new Date(order.shipBy!);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const d = new Date(order.createdAt);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + leadTimeDays);
  return d;
}

export function computeOrdersPage() {
  const settings = loadSettings();
  const leadTimeDays = settings.general.productionLeadTimeDays;

  const allOrders = getOrdersForToday();
  const printQueue = getOrdersInPrintQueue();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const inSixDays = new Date(today);
  inSixDays.setDate(inSixDays.getDate() + 6);

  const shipTodayOrders: Order[] = [];
  const shipWeekOrders: Order[] = [];
  for (const o of allOrders) {
    const eff = effectiveShipBy(o, leadTimeDays);
    const overlaid = { ...o, shipBy: eff.toISOString() };
    if (eff.getTime() <= today.getTime()) shipTodayOrders.push(overlaid);
    else if (eff.getTime() <= inSixDays.getTime()) shipWeekOrders.push(overlaid);
  }
  const byDate = (a: Order, b: Order) =>
    new Date(a.shipBy!).getTime() - new Date(b.shipBy!).getTime();
  shipTodayOrders.sort(byDate);
  shipWeekOrders.sort(byDate);

  return { shipTodayOrders, shipWeekOrders, printQueue };
}

export type OrdersPagePayload = ReturnType<typeof computeOrdersPage>;
