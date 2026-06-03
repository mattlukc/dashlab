// Amazon Selling Partner API (SP-API) client.
// Currently scoped to: FBA orders (Orders API v0) + FBA inventory (FBA Inventory v1).
//
// Auth flow:
//   refresh_token + LWA Client ID/Secret → POST https://api.amazon.com/auth/o2/token
//                                       → access_token (valid 1h)
// We cache the access token in-process until ~5 min before expiry.

import { loadSettings } from "./settings";

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
  // Cache key derived from the creds used to mint this token — so when
  // the user updates their refresh token / client id, the cache is invalidated
  // automatically on the next call.
  credKey: string;
}

let tokenCache: CachedToken | null = null;

/** Force-invalidate the token cache. Called when settings are saved/tested. */
export function clearAccessTokenCache() {
  tokenCache = null;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  const { amazonSpApi } = loadSettings();
  if (
    !amazonSpApi.clientId ||
    !amazonSpApi.clientSecret ||
    !amazonSpApi.refreshToken
  ) {
    throw new Error("Amazon SP-API credentials missing in settings.");
  }
  const credKey = `${amazonSpApi.clientId}|${amazonSpApi.refreshToken.slice(0, 24)}|${amazonSpApi.useSandbox ? "sandbox" : "prod"}`;
  if (
    tokenCache &&
    tokenCache.credKey === credKey &&
    tokenCache.expiresAt - 5 * 60 * 1000 > now
  ) {
    return tokenCache.accessToken;
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: amazonSpApi.refreshToken,
    client_id: amazonSpApi.clientId,
    client_secret: amazonSpApi.clientSecret,
  });
  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `LWA token exchange failed: ${res.status} ${res.statusText} — ${txt.slice(0, 200)}`
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
    credKey,
  };
  return tokenCache.accessToken;
}

/** Base URL for the user's region. NA covers US/CA/MX. */
function baseUrl(useSandbox: boolean): string {
  return useSandbox
    ? "https://sandbox.sellingpartnerapi-na.amazon.com"
    : "https://sellingpartnerapi-na.amazon.com";
}

async function spApiFetch(
  pathAndQuery: string,
  opts: { method?: string; body?: unknown } = {}
): Promise<Response> {
  const settings = loadSettings();
  const useSandbox = settings.amazonSpApi.useSandbox ?? true;
  const token = await getAccessToken();
  const res = await fetch(`${baseUrl(useSandbox)}${pathAndQuery}`, {
    method: opts.method ?? "GET",
    headers: {
      "x-amz-access-token": token,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `SP-API ${res.status} ${res.statusText} for ${pathAndQuery} — ${txt.slice(0, 200)}`
    );
  }
  return res;
}

export interface FBAOrderRaw {
  AmazonOrderId: string;
  PurchaseDate: string;
  OrderStatus: string;
  OrderTotal?: { CurrencyCode: string; Amount: string };
  FulfillmentChannel?: string;
  MarketplaceId?: string;
  ShipmentServiceLevelCategory?: string;
  IsPrime?: boolean;
  BuyerInfo?: { BuyerEmail?: string; BuyerName?: string };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
}

/**
 * List Amazon orders since a given timestamp, scoped by fulfillment channel.
 *   AFN = Amazon Fulfilled (FBA)
 *   MFN = Merchant Fulfilled (FBM — seller ships)
 */
export async function listAmazonOrders(opts: {
  createdAfterISO: string;
  fulfillmentChannel: "AFN" | "MFN";
}): Promise<FBAOrderRaw[]> {
  const settings = loadSettings();
  const collected: FBAOrderRaw[] = [];
  let nextToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      MarketplaceIds: settings.amazonSpApi.marketplaceId || "ATVPDKIKX0DER",
      FulfillmentChannels: opts.fulfillmentChannel,
      CreatedAfter: opts.createdAfterISO,
    });
    if (nextToken) qs.set("NextToken", nextToken);
    const res = await spApiFetch(`/orders/v0/orders?${qs.toString()}`);
    const data = (await res.json()) as {
      payload?: {
        Orders?: FBAOrderRaw[];
        NextToken?: string;
      };
    };
    if (data.payload?.Orders) collected.push(...data.payload.Orders);
    nextToken = data.payload?.NextToken;
  } while (nextToken);
  return collected;
}

/** Back-compat wrapper: existing FBA poller still uses this name. */
export async function listFbaOrders(opts: {
  createdAfterISO: string;
}): Promise<FBAOrderRaw[]> {
  return listAmazonOrders({
    createdAfterISO: opts.createdAfterISO,
    fulfillmentChannel: "AFN",
  });
}

export interface FBAInventoryItemRaw {
  asin: string;
  sellerSku: string;
  totalQuantity?: number;
  inventoryDetails?: {
    fulfillableQuantity?: number;
    inboundWorkingQuantity?: number;
    inboundShippedQuantity?: number;
    inboundReceivingQuantity?: number;
    reservedQuantity?: {
      totalReservedQuantity?: number;
    };
  };
}

export interface OrderMetricsRaw {
  interval: string;
  unitCount: number;
  orderItemCount: number;
  orderCount: number;
  averageUnitPrice?: { amount: string; currencyCode: string };
  totalSales?: { amount: string; currencyCode: string };
}

/**
 * Aggregated order metrics for a given time interval — this is what Amazon's
 * own seller dashboard uses. Works for pending orders (where individual
 * order OrderTotal is null).
 *
 * Pass fulfillmentNetwork = "AFN" for FBA, "MFN" for merchant-fulfilled.
 */
export async function getOrderMetrics(opts: {
  intervalStart: string; // ISO 8601 with timezone offset, e.g. 2026-05-27T00:00:00-07:00
  intervalEnd: string;
  fulfillmentNetwork?: "AFN" | "MFN";
  granularity?: "Total" | "Hour" | "Day" | "Week" | "Month" | "Year";
}): Promise<OrderMetricsRaw[]> {
  const settings = loadSettings();
  const qs = new URLSearchParams({
    interval: `${opts.intervalStart}--${opts.intervalEnd}`,
    granularity: opts.granularity ?? "Total",
    marketplaceIds: settings.amazonSpApi.marketplaceId || "ATVPDKIKX0DER",
  });
  if (opts.fulfillmentNetwork) {
    qs.set("fulfillmentNetwork", opts.fulfillmentNetwork);
  }
  const res = await spApiFetch(`/sales/v1/orderMetrics?${qs.toString()}`);
  const data = (await res.json()) as {
    payload?: OrderMetricsRaw[];
  };
  return data.payload ?? [];
}

export interface FBAOrderItemRaw {
  ASIN?: string;
  SellerSKU?: string;
  OrderItemId: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: { CurrencyCode: string; Amount: string };
  ShippingPrice?: { CurrencyCode: string; Amount: string };
  ItemTax?: { CurrencyCode: string; Amount: string };
  PromotionDiscount?: { CurrencyCode: string; Amount: string };
}

/**
 * Fetch line items for a single FBA order. Paginated via NextToken.
 * Rate limit: 0.5 req/sec restore, 30 burst.
 */
export async function getOrderItems(
  amazonOrderId: string
): Promise<FBAOrderItemRaw[]> {
  const collected: FBAOrderItemRaw[] = [];
  let nextToken: string | undefined;
  do {
    const qs = new URLSearchParams();
    if (nextToken) qs.set("NextToken", nextToken);
    const path = `/orders/v0/orders/${encodeURIComponent(amazonOrderId)}/orderItems${qs.toString() ? `?${qs.toString()}` : ""}`;
    const res = await spApiFetch(path);
    const data = (await res.json()) as {
      payload?: {
        OrderItems?: FBAOrderItemRaw[];
        NextToken?: string;
      };
    };
    if (data.payload?.OrderItems) collected.push(...data.payload.OrderItems);
    nextToken = data.payload?.NextToken;
  } while (nextToken);
  return collected;
}

export async function getFbaInventorySummaries(): Promise<FBAInventoryItemRaw[]> {
  const settings = loadSettings();
  const collected: FBAInventoryItemRaw[] = [];
  let nextToken: string | undefined;
  do {
    const qs = new URLSearchParams({
      details: "true",
      granularityType: "Marketplace",
      granularityId: settings.amazonSpApi.marketplaceId || "ATVPDKIKX0DER",
      marketplaceIds: settings.amazonSpApi.marketplaceId || "ATVPDKIKX0DER",
    });
    if (nextToken) qs.set("nextToken", nextToken);
    const res = await spApiFetch(
      `/fba/inventory/v1/summaries?${qs.toString()}`
    );
    const data = (await res.json()) as {
      payload?: {
        inventorySummaries?: FBAInventoryItemRaw[];
      };
      pagination?: { nextToken?: string };
    };
    if (data.payload?.inventorySummaries) {
      collected.push(...data.payload.inventorySummaries);
    }
    nextToken = data.pagination?.nextToken;
  } while (nextToken);
  return collected;
}

/** Lightweight credential test for the Settings UI. */
export async function testSpApiConnection(): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  try {
    // Always force a fresh token on test — caller just changed creds.
    clearAccessTokenCache();
    await getAccessToken();
    // Make a minimal API call too — listFbaOrders for last 24h.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const orders = await listFbaOrders({ createdAfterISO: since });
    return {
      ok: true,
      message: `Connected. Found ${orders.length} FBA order${orders.length === 1 ? "" : "s"} in last 24 hours.`,
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
