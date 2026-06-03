// Background poller for Amazon FBA orders + inventory via SP-API.
// Singleton (HMR-safe) like the ShipStation poller.

import {
  recordSyncFinish,
  recordSyncStart,
  upsertFbaInventory,
  upsertFbaMetric,
  upsertFbaOrder,
  setFbaOrderLineItems,
  getFbaOrdersMissingLineItems,
} from "../lib/db";
import {
  getFbaInventorySummaries,
  getOrderItems,
  getOrderMetrics,
  listFbaOrders,
} from "../lib/amazon-sp-api";
import { loadSettings } from "../lib/settings";

/** Local-time ISO 8601 string with timezone offset. */
function toLocalISO(d: Date): string {
  const tzOffsetMin = -d.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? "+" : "-";
  const offH = String(Math.floor(Math.abs(tzOffsetMin) / 60)).padStart(2, "0");
  const offM = String(Math.abs(tzOffsetMin) % 60).padStart(2, "0");
  const tz = `${sign}${offH}:${offM}`;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}T00:00:00${tz}`;
}

/** Intervals for the dashboard period KPIs + last-year comparisons, in local time. */
function buildIntervals() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const todayStart = new Date(y, m, d);
  const tomorrow = new Date(todayStart);
  tomorrow.setDate(tomorrow.getDate() + 1);
  // Week starts Sunday, matching startOfWeek() on the dashboard (page.tsx).
  const weekStart = new Date(y, m, d - now.getDay());
  const monthStart = new Date(y, m, 1);
  const quarterStart = new Date(y, Math.floor(m / 3) * 3, 1);
  const yearStart = new Date(y, 0, 1);

  // Last-year same period: shift each by 1 year.
  const lyTodayStart = new Date(y - 1, m, d);
  const lyTomorrow = new Date(lyTodayStart);
  lyTomorrow.setDate(lyTomorrow.getDate() + 1);
  const lyWeekStart = new Date(
    weekStart.getFullYear() - 1,
    weekStart.getMonth(),
    weekStart.getDate()
  );
  const lyMonthStart = new Date(y - 1, m, 1);
  const lyQuarterStart = new Date(y - 1, Math.floor(m / 3) * 3, 1);
  const lyYearStart = new Date(y - 1, 0, 1);

  return {
    today: { start: toLocalISO(todayStart), end: toLocalISO(tomorrow) },
    wtd: { start: toLocalISO(weekStart), end: toLocalISO(tomorrow) },
    mtd: { start: toLocalISO(monthStart), end: toLocalISO(tomorrow) },
    qtd: { start: toLocalISO(quarterStart), end: toLocalISO(tomorrow) },
    ytd: { start: toLocalISO(yearStart), end: toLocalISO(tomorrow) },
    "ly-today": { start: toLocalISO(lyTodayStart), end: toLocalISO(lyTomorrow) },
    "ly-wtd": { start: toLocalISO(lyWeekStart), end: toLocalISO(lyTomorrow) },
    "ly-mtd": { start: toLocalISO(lyMonthStart), end: toLocalISO(lyTomorrow) },
    "ly-qtd": { start: toLocalISO(lyQuarterStart), end: toLocalISO(lyTomorrow) },
    "ly-ytd": { start: toLocalISO(lyYearStart), end: toLocalISO(lyTomorrow) },
  };
}

const SERVICE = "amazon_fba";

declare global {
  // eslint-disable-next-line no-var
  var __dashlabAmazonFbaPoller:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        inFlight: boolean;
      }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabAmazonFbaPoller) {
    globalThis.__dashlabAmazonFbaPoller = {
      timer: null,
      running: false,
      inFlight: false,
    };
  }
  return globalThis.__dashlabAmazonFbaPoller;
}

async function runOnce(): Promise<
  { orders: number; inventory: number } | { skipped: string }
> {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.amazonSpApi.enabled) return { skipped: "disabled" };
  if (
    !settings.amazonSpApi.clientId ||
    !settings.amazonSpApi.clientSecret ||
    !settings.amazonSpApi.refreshToken
  ) {
    return { skipped: "missing credentials" };
  }

  const s = state();
  if (s.inFlight) return { skipped: "already running" };
  s.inFlight = true;

  const logId = recordSyncStart(SERVICE);
  try {
    // FBA orders — last 7 days
    const since = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();
    const orders = await listFbaOrders({ createdAfterISO: since });
    for (const o of orders) {
      upsertFbaOrder({
        amazonOrderId: o.AmazonOrderId,
        purchaseDate: o.PurchaseDate,
        orderStatus: o.OrderStatus,
        orderTotal: o.OrderTotal ? parseFloat(o.OrderTotal.Amount) : 0,
        currency: o.OrderTotal?.CurrencyCode ?? null,
        marketplaceId: o.MarketplaceId ?? null,
        shipmentServiceLevel: o.ShipmentServiceLevelCategory ?? null,
        isPrime: Boolean(o.IsPrime),
        numberOfItems:
          (o.NumberOfItemsShipped ?? 0) + (o.NumberOfItemsUnshipped ?? 0),
        rawJson: o,
      });
    }

    // Fetch line items for any orders that don't have them yet.
    // SP-API getOrderItems is rate-limited (0.5/sec restore, 30 burst), so
    // we cap at 20 orders per poll cycle and sleep briefly between calls.
    const missing = getFbaOrdersMissingLineItems(since, 20);
    let itemsFetched = 0;
    for (const orderId of missing) {
      try {
        const raw = await getOrderItems(orderId);
        const mapped = raw.map((it) => ({
          sku: it.SellerSKU ?? null,
          asin: it.ASIN ?? null,
          name: it.Title ?? `FBA item (${it.OrderItemId})`,
          quantity: it.QuantityOrdered,
        }));
        setFbaOrderLineItems(orderId, mapped);
        itemsFetched++;
        // Throttle: ~2s between calls keeps us well under the 0.5/sec limit
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        console.warn(
          `[amazon-fba-poller] getOrderItems failed for ${orderId}:`,
          (err as Error).message
        );
      }
    }
    if (itemsFetched > 0) {
      console.log(
        `[amazon-fba-poller] fetched line items for ${itemsFetched} FBA orders`
      );
    }

    // FBA inventory
    const inventory = await getFbaInventorySummaries();
    for (const item of inventory) {
      const details = item.inventoryDetails ?? {};
      upsertFbaInventory({
        sku: item.sellerSku,
        asin: item.asin ?? null,
        fulfillableQuantity: details.fulfillableQuantity ?? 0,
        totalQuantity: item.totalQuantity ?? 0,
        inboundQuantity:
          (details.inboundWorkingQuantity ?? 0) +
          (details.inboundShippedQuantity ?? 0) +
          (details.inboundReceivingQuantity ?? 0),
        reservedQuantity:
          details.reservedQuantity?.totalReservedQuantity ?? 0,
        marketplaceId: settings.amazonSpApi.marketplaceId || null,
      });
    }

    // Order metrics — Amazon's own dashboard data source. One call per period.
    // Each period key gets its OWN interval (see buildIntervals): mtd starts on
    // the 1st of this month, qtd on the 1st of this quarter, ytd on Jan 1 — all
    // ending "now". They never share a window. The per-write log below prints the
    // exact interval + value so identical MTD/QTD/YTD numbers can be diagnosed
    // (most commonly: the SP-API sandbox returns the same canned figures for any
    // interval — flip off useSandbox to see real per-period values).
    const intervals = buildIntervals();
    for (const [periodKey, range] of Object.entries(intervals)) {
      try {
        const metrics = await getOrderMetrics({
          intervalStart: range.start,
          intervalEnd: range.end,
          fulfillmentNetwork: "AFN",
          granularity: "Total",
        });
        const m = metrics[0];
        const totalSales = m?.totalSales ? parseFloat(m.totalSales.amount) : 0;
        const orderCount = m?.orderCount ?? 0;
        const unitCount = m?.unitCount ?? 0;
        console.log(
          `[amazon-fba-poller] metric "${periodKey}" interval=${range.start}..${range.end} → sales=${totalSales} orders=${orderCount} units=${unitCount}`
        );
        upsertFbaMetric({
          periodKey,
          orderCount,
          unitCount,
          totalSales,
          currency: m?.totalSales?.currencyCode ?? null,
        });
      } catch (err) {
        console.warn(
          `[amazon-fba-poller] metrics fetch failed for ${periodKey}:`,
          (err as Error).message
        );
      }
    }

    recordSyncFinish(logId, {
      status: "ok",
      recordsSynced: orders.length + inventory.length,
    });
    return { orders: orders.length, inventory: inventory.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    console.error("[amazon-fba-poller] sync failed:", msg);
    throw err;
  } finally {
    s.inFlight = false;
  }
}

export async function pollAmazonFbaNow() {
  return runOnce();
}

export function startAmazonFbaPoller(): void {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) {
    console.log("[amazon-fba-poller] skipped — useMockData on");
    return;
  }
  if (!settings.amazonSpApi.enabled) {
    console.log("[amazon-fba-poller] skipped — amazonSpApi.enabled is false");
    return;
  }

  const intervalMs =
    Math.max(5, settings.amazonSpApi.pollIntervalMinutes || 15) * 60 * 1000;

  s.running = true;

  runOnce().catch((err) => {
    console.error("[amazon-fba-poller] initial poll failed:", err);
  });

  s.timer = setInterval(() => {
    runOnce().catch((err) => {
      console.error("[amazon-fba-poller] tick failed:", err);
    });
  }, intervalMs);

  console.log(
    `[amazon-fba-poller] started — every ${intervalMs / 60000} min`
  );
}

export function stopAmazonFbaPoller(): void {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
