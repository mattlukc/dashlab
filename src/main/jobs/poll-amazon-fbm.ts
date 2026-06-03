// Background poller for Amazon merchant-fulfilled (FBM) orders.
// Pulls MFN orders from SP-API and writes them into the main `orders` table
// with id prefix "fbm-" and channel="amazon_fbm" so KPI math just works.

import { recordSyncFinish, recordSyncStart, upsertOrder } from "../lib/db";
import {
  listAmazonOrders,
  getOrderItems,
  type FBAOrderRaw,
  type FBAOrderItemRaw,
} from "../lib/amazon-sp-api";
import { loadSettings } from "../lib/settings";
import { toUtcIso } from "../lib/dates";
import type { Order, LineItem, OrderStatus } from "../lib/types";

const SERVICE = "amazon_fbm";

declare global {
  // eslint-disable-next-line no-var
  var __dashlabAmazonFbmPoller:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        inFlight: boolean;
        backfilled: boolean;
      }
    | undefined;
}

function state() {
  if (!globalThis.__dashlabAmazonFbmPoller) {
    globalThis.__dashlabAmazonFbmPoller = {
      timer: null,
      running: false,
      inFlight: false,
      backfilled: false,
    };
  }
  return globalThis.__dashlabAmazonFbmPoller;
}

function mapStatus(amzStatus: string): OrderStatus {
  switch (amzStatus) {
    case "Shipped":
      return "shipped";
    case "Canceled":
    case "Cancelled":
      return "cancelled";
    case "Unshipped":
    case "PartiallyShipped":
    case "Pending":
    case "PendingAvailability":
      return "awaiting_print";
    default:
      return "awaiting_print";
  }
}

function mapAmazonOrderToDashLab(
  raw: FBAOrderRaw,
  items: FBAOrderItemRaw[]
): Order {
  const lineItems: LineItem[] = items.map((it) => ({
    sku: it.SellerSKU ?? null,
    productName: it.Title ?? `Item ${it.OrderItemId}`,
    quantity: it.QuantityOrdered,
  }));
  const totalItems = lineItems.reduce((s, li) => s + li.quantity, 0);
  const orderTotal = raw.OrderTotal ? parseFloat(raw.OrderTotal.Amount) : 0;
  // Amazon's order header doesn't break out tax/shipping cleanly without
  // additional API calls, so we leave those at 0 — orderTotal is gross.

  return {
    id: `fbm-${raw.AmazonOrderId}`,
    orderNumber: raw.AmazonOrderId,
    channel: "amazon_fbm",
    customerName:
      raw.BuyerInfo?.BuyerName ?? raw.BuyerInfo?.BuyerEmail ?? "Amazon buyer",
    customerCity: null,
    customerState: null,
    customerCountry: null,
    customerNotes: null,
    shipBy: null,
    shipMethod: raw.ShipmentServiceLevelCategory ?? null,
    isRush:
      (raw.ShipmentServiceLevelCategory ?? "").toLowerCase().includes("expedited") ||
      Boolean(raw.IsPrime),
    status: mapStatus(raw.OrderStatus),
    lineItems,
    totalItems,
    // Amazon PurchaseDate is already UTC `Z`; normalize anyway for uniformity.
    createdAt: toUtcIso(raw.PurchaseDate) ?? raw.PurchaseDate,
    shippedAt: null,
    orderTotal,
    amountPaid: orderTotal,
    taxAmount: 0,
    shippingAmount: 0,
    storeId: null,
    storeName: "Amazon FBM",
  };
}

async function runOnce(): Promise<
  { synced: number } | { skipped: string }
> {
  const settings = loadSettings();
  if (settings.general.useMockData) return { skipped: "useMockData" };
  if (!settings.amazonSpApi.enabled) return { skipped: "amazon disabled" };
  if (!settings.amazonSpApi.fbmEnabled) return { skipped: "fbm disabled" };
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
    // First run: pull last 30 days. After that, every poll just catches the
    // last 24h of new + updated orders (status changes etc).
    const daysBack = s.backfilled ? 1 : 30;
    const since = new Date(
      Date.now() - daysBack * 24 * 60 * 60 * 1000
    ).toISOString();

    const raws = await listAmazonOrders({
      createdAfterISO: since,
      fulfillmentChannel: "MFN",
    });

    let kept = 0;
    for (const raw of raws) {
      // Fetch line items per order. SP-API rate-limit is 0.5/sec restore +
      // 30 burst — a small throttle keeps us safe.
      let items: FBAOrderItemRaw[] = [];
      try {
        items = await getOrderItems(raw.AmazonOrderId);
      } catch (err) {
        console.warn(
          `[amazon-fbm-poller] getOrderItems failed for ${raw.AmazonOrderId}:`,
          (err as Error).message
        );
      }
      const order = mapAmazonOrderToDashLab(raw, items);
      upsertOrder(order, { raw, items });
      kept++;
      await new Promise((r) => setTimeout(r, 200));
    }

    s.backfilled = true;
    recordSyncFinish(logId, { status: "ok", recordsSynced: kept });
    return { synced: kept };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    recordSyncFinish(logId, { status: "error", errorMessage: msg });
    console.error("[amazon-fbm-poller] sync failed:", msg);
    throw err;
  } finally {
    s.inFlight = false;
  }
}

export async function pollAmazonFbmNow() {
  return runOnce();
}

export function startAmazonFbmPoller(): void {
  const s = state();
  if (s.running) return;
  const settings = loadSettings();
  if (settings.general.useMockData) {
    console.log("[amazon-fbm-poller] skipped — useMockData on");
    return;
  }
  if (!settings.amazonSpApi.enabled || !settings.amazonSpApi.fbmEnabled) {
    console.log("[amazon-fbm-poller] skipped — FBM not enabled");
    return;
  }

  // Reuse the same interval as the FBA poller (they share rate-limit budget)
  const intervalMs =
    Math.max(2, settings.amazonSpApi.pollIntervalMinutes || 2) * 60 * 1000;

  s.running = true;
  runOnce().catch((err) => {
    console.error("[amazon-fbm-poller] initial poll failed:", err);
  });
  s.timer = setInterval(() => {
    runOnce().catch((err) => {
      console.error("[amazon-fbm-poller] tick failed:", err);
    });
  }, intervalMs);
  console.log(`[amazon-fbm-poller] started — every ${intervalMs / 60_000} min`);
}

export function stopAmazonFbmPoller(): void {
  const s = state();
  if (s.timer) {
    clearInterval(s.timer);
    s.timer = null;
  }
  s.running = false;
}
