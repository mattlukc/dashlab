// Shopify Admin REST API client.
// Uses the shop's Admin access token (shpat_...) to pull orders directly,
// bypassing ShipStation for Shopify channel data.

import { loadSettings } from "./settings";
import { toUtcIso } from "./dates";
import type { Order, LineItem } from "./types";

const API_VERSION = "2026-04";

interface ShopifyMoney {
  amount: string;
  currency_code?: string;
}

interface ShopifyAddress {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  country?: string | null;
  country_code?: string | null;
}

interface ShopifyLineItem {
  id: number;
  sku: string | null;
  name: string;
  title?: string;
  variant_title?: string | null;
  quantity: number;
  properties?: { name: string; value: string }[];
}

interface ShopifyOrder {
  id: number;
  name: string; // e.g., "#1234"
  order_number: number; // numeric form, e.g., 1234
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  fulfillment_status: string | null; // null | "fulfilled" | "partial" | "restocked"
  financial_status: string | null; // "pending" | "paid" | "refunded" | ...
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_shipping_price_set?: { shop_money: ShopifyMoney };
  total_discounts: string;
  currency: string;
  email: string | null;
  phone: string | null;
  note: string | null;
  tags: string;
  customer: {
    id: number;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
  } | null;
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  line_items: ShopifyLineItem[];
  fulfillments?: { created_at: string; status: string }[];
}

interface ShopifyOrdersResponse {
  orders: ShopifyOrder[];
}

function ensureCreds(): { shop: string; token: string } {
  const settings = loadSettings();
  const shop = settings.shopify.storeDomain;
  const token = settings.shopify.adminAccessToken;
  if (!shop) throw new Error("Shopify storeDomain not set");
  if (!token) throw new Error("Shopify adminAccessToken not set");
  return { shop, token };
}

async function shopifyFetch(path: string): Promise<Response> {
  const { shop, token } = ensureCreds();
  const url = `https://${shop}/admin/api/${API_VERSION}${path}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": token,
      "content-type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Shopify API ${res.status} ${res.statusText}: ${text.slice(0, 300)}`
    );
  }
  return res;
}

/**
 * Fetch Shopify orders created or updated since the given ISO timestamp.
 * Paginates using Link headers (Shopify cursor-based pagination).
 */
export async function fetchShopifyOrdersSince(
  isoStart: string
): Promise<ShopifyOrder[]> {
  const collected: ShopifyOrder[] = [];

  const params = new URLSearchParams({
    status: "any",
    limit: "250",
    updated_at_min: isoStart,
  });

  let path: string | null = `/orders.json?${params.toString()}`;

  while (path) {
    const res = await shopifyFetch(path);
    const json = (await res.json()) as ShopifyOrdersResponse;
    collected.push(...json.orders);

    // Shopify returns a Link header with rel="next" when more pages exist.
    const link = res.headers.get("link") ?? res.headers.get("Link") ?? "";
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      // Strip the host — shopifyFetch re-adds it.
      const u = new URL(nextMatch[1]);
      path = `${u.pathname.replace(/.*\/admin\/api\/[^/]+/, "")}${u.search}`;
    } else {
      path = null;
    }
  }

  return collected;
}

function mapShopifyLineItem(raw: ShopifyLineItem): LineItem {
  const properties = raw.properties ?? [];
  const isCustom = properties.length > 0;
  const personalization = isCustom
    ? properties.map((p) => `${p.name}: ${p.value}`).join(" · ")
    : null;
  return {
    sku: raw.sku || null,
    productName: raw.name || raw.title || "(unnamed item)",
    quantity: raw.quantity,
    variant: raw.variant_title ?? null,
    isCustom: isCustom || undefined,
    personalization,
  };
}

function customerNameFrom(o: ShopifyOrder): string {
  const fromCustomer = [o.customer?.first_name, o.customer?.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromCustomer) return fromCustomer;
  const fromShipping = [
    o.shipping_address?.first_name,
    o.shipping_address?.last_name,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (fromShipping) return fromShipping;
  return o.shipping_address?.name ?? o.email ?? "Unknown";
}

/**
 * Convert a raw Shopify order into DashLab's canonical Order shape.
 * IDs are prefixed with "shop-" so they never collide with ShipStation IDs.
 */
export function mapShopifyOrderToDashLab(raw: ShopifyOrder): Order {
  const lineItems = (raw.line_items ?? []).map(mapShopifyLineItem);
  const totalItems = lineItems.reduce((sum, li) => sum + li.quantity, 0);

  // Status mapping:
  //   cancelled → cancelled
  //   fulfillment_status === "fulfilled" → shipped
  //   else → awaiting_print
  let status: Order["status"] = "awaiting_print";
  if (raw.cancelled_at) {
    status = "cancelled";
  } else if (raw.fulfillment_status === "fulfilled") {
    status = "shipped";
  }

  // Shopify timestamps carry the shop's UTC offset (e.g. "...-07:00"). Normalize to
  // UTC `Z` so created_at sorts correctly against the UTC bounds used in db.ts.
  const shippedAt =
    raw.fulfillments && raw.fulfillments.length > 0
      ? toUtcIso(raw.fulfillments[raw.fulfillments.length - 1].created_at)
      : null;

  const tags = (raw.tags || "")
    .split(",")
    .map((t) => t.trim().toLowerCase());
  const isRush = tags.includes("rush") || tags.includes("priority");

  return {
    id: `shop-${raw.id}`,
    orderNumber: String(raw.order_number),
    channel: "shopify",
    customerName: customerNameFrom(raw),
    customerCity: raw.shipping_address?.city ?? null,
    customerState:
      raw.shipping_address?.province_code ??
      raw.shipping_address?.province ??
      null,
    customerCountry:
      raw.shipping_address?.country_code ??
      raw.shipping_address?.country ??
      null,
    customerNotes: raw.note ?? null,
    shipBy: null, // Shopify doesn't expose a ship-by; computed downstream from createdAt + lead time
    shipMethod: null,
    isRush,
    status,
    lineItems,
    totalItems,
    createdAt: toUtcIso(raw.created_at) ?? raw.created_at,
    shippedAt,
    orderTotal: parseFloat(raw.total_price || "0"),
    amountPaid:
      raw.financial_status === "paid" || raw.financial_status === "partially_paid"
        ? parseFloat(raw.total_price || "0")
        : 0,
    taxAmount: parseFloat(raw.total_tax || "0"),
    shippingAmount: raw.total_shipping_price_set
      ? parseFloat(raw.total_shipping_price_set.shop_money.amount || "0")
      : 0,
    storeId: null,
    storeName: "Shopify",
  };
}
