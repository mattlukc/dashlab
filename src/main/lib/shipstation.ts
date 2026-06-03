// ShipStation V1 REST client.
// Docs: https://www.shipstation.com/docs/api/

import { loadSettings } from "./settings";
import { toUtcIso } from "./dates";
import type { Channel, LineItem, Order, OrderStatus } from "./types";

const BASE_URL = "https://ssapi.shipstation.com";

interface ShipStationOptionRaw {
  name: string;
  value: string;
}

interface ShipStationOrderItemRaw {
  orderItemId: number;
  lineItemKey?: string | null;
  sku?: string | null;
  name?: string | null;
  quantity: number;
  unitPrice?: number;
  options?: ShipStationOptionRaw[] | null;
}

interface ShipStationOrderRaw {
  orderId: number;
  orderNumber: string;
  orderKey?: string;
  orderDate: string;
  createDate: string;
  modifyDate: string;
  paymentDate?: string | null;
  shipByDate?: string | null;
  orderStatus: string;
  orderTotal?: number;
  amountPaid?: number;
  taxAmount?: number;
  shippingAmount?: number;
  customerUsername?: string | null;
  customerEmail?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  giftMessage?: string | null;
  requestedShippingService?: string | null;
  serviceCode?: string | null;
  packageCode?: string | null;
  confirmation?: string | null;
  shipDate?: string | null;
  holdUntilDate?: string | null;
  weight?: { value: number; units: string };
  dimensions?: unknown;
  insuranceOptions?: unknown;
  internationalOptions?: unknown;
  advancedOptions?: {
    warehouseId?: number;
    nonMachinable?: boolean;
    saturdayDelivery?: boolean;
    containsAlcohol?: boolean;
    storeId?: number;
    customField1?: string | null;
    customField2?: string | null;
    customField3?: string | null;
    source?: string | null;
  } | null;
  tagIds?: number[] | null;
  userId?: string | null;
  externallyFulfilled?: boolean;
  externallyFulfilledBy?: string | null;
  shipTo?: {
    name?: string | null;
    company?: string | null;
    street1?: string | null;
    street2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
  } | null;
  billTo?: { name?: string | null } | null;
  items?: ShipStationOrderItemRaw[];
}

interface ShipStationListOrdersResponse {
  orders: ShipStationOrderRaw[];
  total: number;
  page: number;
  pages: number;
}

class ShipStationError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ShipStationError";
  }
}

function getAuthHeader(): string {
  const { shipstation } = loadSettings();
  if (!shipstation.apiKey || !shipstation.apiSecret) {
    throw new ShipStationError("ShipStation credentials missing in settings.", 0);
  }
  const token = Buffer.from(
    `${shipstation.apiKey}:${shipstation.apiSecret}`
  ).toString("base64");
  return `Basic ${token}`;
}

async function shipstationFetch(
  pathAndQuery: string,
  opts: { method?: string } = {},
  attempt = 0
): Promise<Response> {
  const res = await fetch(`${BASE_URL}${pathAndQuery}`, {
    method: opts.method ?? "GET",
    headers: {
      Authorization: getAuthHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  if (res.status === 429 && attempt < 5) {
    // Exponential backoff: respect Retry-After if present, else 2^attempt seconds.
    const retryAfter = Number(res.headers.get("retry-after") ?? 0);
    const delayMs = (retryAfter > 0 ? retryAfter : 2 ** attempt) * 1000;
    await new Promise((r) => setTimeout(r, delayMs));
    return shipstationFetch(pathAndQuery, opts, attempt + 1);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ShipStationError(
      `ShipStation ${res.status} ${res.statusText} for ${pathAndQuery}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      res.status
    );
  }
  return res;
}

export interface ListOrdersOptions {
  /** Override the default page size (100). */
  pageSize?: number;
  /** Optional cap on number of pages to fetch — useful for tests. */
  maxPages?: number;
}

/**
 * Fetch all orders in the `awaiting_shipment` state, across all pages.
 * Returns raw ShipStation order objects.
 *
 * Kept for back-compat / targeted ship-queue refreshes. Prefer
 * `listRecentOrders` for the main poller since it also captures
 * shipped + cancelled orders (needed for accurate revenue KPIs).
 */
export async function listOrdersAwaitingShipment(
  opts: ListOrdersOptions = {}
): Promise<ShipStationOrderRaw[]> {
  const pageSize = opts.pageSize ?? 100;
  const collected: ShipStationOrderRaw[] = [];
  let page = 1;
  // ShipStation caps page numbers, but we also respect maxPages if provided.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = new URLSearchParams({
      orderStatus: "awaiting_shipment",
      pageSize: String(pageSize),
      page: String(page),
      sortBy: "OrderDate",
      sortDir: "DESC",
    });
    const res = await shipstationFetch(`/orders?${qs.toString()}`);
    const data = (await res.json()) as ShipStationListOrdersResponse;
    if (Array.isArray(data.orders)) collected.push(...data.orders);
    if (page >= data.pages || data.orders.length === 0) break;
    if (opts.maxPages && page >= opts.maxPages) break;
    page++;
  }
  return collected;
}

/** ShipStation expects "YYYY-MM-DD HH:MM:SS" for date filters. */
function toShipstationDate(iso: string): string {
  return iso.slice(0, 19).replace("T", " ");
}

/**
 * Fetch ShipStation orders inside a date range (exclusive end), paginated.
 * Hard-limited by ShipStation to 2500 orders per call — caller must chunk if
 * the range is expected to exceed that.
 */
async function listOrdersInWindow(
  startISO: string,
  endISO: string,
  pageSize = 200
): Promise<ShipStationOrderRaw[]> {
  const collected: ShipStationOrderRaw[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = new URLSearchParams({
      createDateStart: toShipstationDate(startISO),
      createDateEnd: toShipstationDate(endISO),
      pageSize: String(pageSize),
      page: String(page),
      sortBy: "OrderDate",
      sortDir: "DESC",
    });
    const res = await shipstationFetch(`/orders?${qs.toString()}`);
    const data = (await res.json()) as ShipStationListOrdersResponse;
    if (Array.isArray(data.orders)) collected.push(...data.orders);
    if (page >= data.pages || data.orders.length === 0) break;
    page++;
  }
  return collected;
}

/**
 * Fetch all orders (any status) created in the last `daysBack` days.
 * Splits into month-sized chunks to avoid ShipStation's 2500-order-per-query
 * hard limit, then concatenates. This is the right call for the full backfill.
 */
export async function listRecentOrders(
  opts: ListOrdersOptions & { daysBack?: number } = {}
): Promise<ShipStationOrderRaw[]> {
  const daysBack = opts.daysBack ?? 30;
  const now = new Date();
  const oldest = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

  // Walk month-by-month forward from the oldest day to now.
  const chunks: { start: string; end: string }[] = [];
  let cursor = new Date(oldest.getFullYear(), oldest.getMonth(), 1);
  while (cursor < now) {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    const chunkStart = cursor < oldest ? oldest : cursor;
    const chunkEnd = next > now ? now : next;
    chunks.push({
      start: chunkStart.toISOString(),
      end: chunkEnd.toISOString(),
    });
    cursor = next;
  }

  const collected: ShipStationOrderRaw[] = [];
  for (const chunk of chunks) {
    const part = await listOrdersInWindow(chunk.start, chunk.end);
    collected.push(...part);
  }
  return collected;
}

interface ShipStationStoreRaw {
  storeId: number;
  storeName: string;
  marketplaceId?: number;
  marketplaceName?: string;
  accountName?: string | null;
  active: boolean;
}

/** In-memory cache of storeId → { channel, name }. Refreshed by refreshStoreMap(). */
const storeMap = new Map<number, { channel: Channel; name: string }>();

/** Fetch all active stores and refresh the in-memory channel map. */
export async function refreshStoreMap(): Promise<void> {
  const res = await shipstationFetch(`/stores?showInactive=false`);
  const stores = (await res.json()) as ShipStationStoreRaw[];
  storeMap.clear();
  for (const s of stores) {
    storeMap.set(s.storeId, {
      channel: channelFromStoreInfo(s.storeName, s.marketplaceName),
      name: s.storeName,
    });
  }
}

export async function listStores(): Promise<ShipStationStoreRaw[]> {
  const res = await shipstationFetch(`/stores?showInactive=false`);
  return (await res.json()) as ShipStationStoreRaw[];
}

/**
 * Tell ShipStation to re-pull orders from a specific connected store right now.
 * Bypasses ShipStation's own polling schedule (which can lag 30+ minutes).
 *
 * Rate-limited by ShipStation — they only allow one refresh per store every
 * few minutes. 429s are expected and we just log + continue.
 */
export async function refreshStoreOnShipStation(
  storeId: number
): Promise<{ ok: boolean; status: number; message?: string }> {
  try {
    const res = await shipstationFetch(
      `/stores/refreshstore?storeId=${storeId}`,
      { method: "POST" }
    );
    if (res.ok) return { ok: true, status: res.status };
    const text = await res.text().catch(() => "");
    return { ok: false, status: res.status, message: text.slice(0, 200) };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      message: (err as Error).message,
    };
  }
}

/**
 * Fire a refresh on every active connected store. Runs them in parallel,
 * doesn't fail the batch if some return 429 / rate-limited.
 */
export async function refreshAllShipstationStores(): Promise<{
  triggered: number;
  rateLimited: number;
  failed: number;
}> {
  const stores = await listStores();
  const results = await Promise.allSettled(
    stores.map((s) => refreshStoreOnShipStation(s.storeId))
  );
  let triggered = 0;
  let rateLimited = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status !== "fulfilled") {
      failed++;
      continue;
    }
    if (r.value.ok) triggered++;
    else if (r.value.status === 429) rateLimited++;
    else failed++;
  }
  return { triggered, rateLimited, failed };
}

/**
 * Map a ShipStation store to a DashLab channel by name/marketplace.
 */
function channelFromStoreInfo(
  storeName: string | undefined,
  marketplaceName?: string
): Channel {
  const haystack = `${storeName ?? ""} ${marketplaceName ?? ""}`.toLowerCase();
  if (haystack.includes("shopify")) return "shopify";
  if (haystack.includes("amazon")) return "amazon_fbm";
  if (haystack.includes("etsy")) return "etsy";
  if (haystack.includes("ebay")) return "ebay";
  if (haystack.includes("manual")) return "manual";
  return "other";
}

/** Look up channel + store name for a given storeId; "other" if unknown. */
function resolveStore(
  storeId: number | undefined
): { channel: Channel; name: string | null } {
  if (!storeId) return { channel: "other", name: null };
  const hit = storeMap.get(storeId);
  if (hit) return { channel: hit.channel, name: hit.name };
  return { channel: "other", name: null };
}

function mapStatus(shipstationStatus: string): OrderStatus {
  switch (shipstationStatus) {
    case "awaiting_shipment":
    case "awaiting_payment":
    case "on_hold":
      return "awaiting_print";
    case "shipped":
      return "shipped";
    case "cancelled":
      return "cancelled";
    default:
      return "awaiting_print";
  }
}

function mapLineItem(raw: ShipStationOrderItemRaw): LineItem {
  const options = raw.options ?? [];
  const isCustom = options.length > 0;
  const personalization = isCustom
    ? options
        .map((o) => o.value)
        .filter((v): v is string => Boolean(v))
        .join(" · ")
    : null;
  return {
    sku: raw.sku ?? null,
    productName: raw.name ?? "(unnamed item)",
    quantity: raw.quantity,
    isCustom: isCustom || undefined,
    personalization,
  };
}

function detectRush(raw: ShipStationOrderRaw): boolean {
  const service = (raw.requestedShippingService ?? "").toLowerCase();
  return (
    service.includes("priority") ||
    service.includes("express") ||
    service.includes("overnight") ||
    service.includes("next day")
  );
}

export function mapShipstationOrderToDashLab(
  raw: ShipStationOrderRaw
): Order {
  const items = raw.items ?? [];
  const lineItems = items.map(mapLineItem);
  const totalItems = lineItems.reduce((sum, li) => sum + li.quantity, 0);

  const storeId = raw.advancedOptions?.storeId;
  const { channel, name: storeName } = resolveStore(storeId);

  return {
    id: String(raw.orderId),
    orderNumber: raw.orderNumber,
    channel,
    storeId: storeId ?? null,
    storeName: storeName ?? null,
    customerName:
      raw.shipTo?.name ?? raw.billTo?.name ?? raw.customerUsername ?? "Unknown",
    customerCity: raw.shipTo?.city ?? null,
    customerState: raw.shipTo?.state ?? null,
    customerCountry: raw.shipTo?.country ?? null,
    customerNotes: raw.customerNotes ?? raw.giftMessage ?? null,
    // ShipStation returns naive account-local timestamps (no offset). Normalize all
    // of them to UTC so created_at sorts correctly against the UTC bounds in db.ts
    // and so the ship-time / on-time julianday() math stays internally consistent.
    shipBy: toUtcIso(raw.shipByDate),
    shipMethod: raw.requestedShippingService ?? raw.serviceCode ?? null,
    isRush: detectRush(raw),
    status: mapStatus(raw.orderStatus),
    lineItems,
    totalItems,
    createdAt:
      toUtcIso(raw.createDate ?? raw.orderDate) ??
      raw.createDate ??
      raw.orderDate,
    shippedAt: toUtcIso(raw.shipDate),
    orderTotal: raw.orderTotal ?? 0,
    amountPaid: raw.amountPaid ?? 0,
    taxAmount: raw.taxAmount ?? 0,
    shippingAmount: raw.shippingAmount ?? 0,
  };
}

export type { ShipStationOrderRaw };
export { ShipStationError };
