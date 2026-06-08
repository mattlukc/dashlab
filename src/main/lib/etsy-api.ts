// Etsy Open API v3 client.
// Handles OAuth refresh-token rotation automatically — if the saved access
// token is expired or near-expiry, we refresh and persist the new tokens.

import { loadSettings, saveSettings } from "./settings";
import type { Order, LineItem } from "./types";

const API_BASE = "https://openapi.etsy.com/v3/application";

interface EtsyReceiptTransaction {
  transaction_id: number;
  listing_id?: number;
  product_id?: number;
  sku?: string | null;
  title?: string;
  quantity: number;
  price?: { amount: number; divisor: number; currency_code: string };
  variations?: Array<{ formatted_name?: string; formatted_value?: string }>;
  personalization?: string | null;
}

interface EtsyReceipt {
  receipt_id: number;
  receipt_type?: number;
  status?: string; // "Open" | "Paid" | "Completed" | "Cancelled"
  payment_method?: string;
  message_from_buyer?: string | null;
  message_to_buyer?: string | null;
  is_shipped?: boolean;
  is_paid?: boolean;
  create_timestamp?: number;
  created_timestamp?: number;
  update_timestamp?: number;
  updated_timestamp?: number;
  buyer_user_id?: number;
  buyer_email?: string;
  name?: string;
  first_line?: string | null;
  second_line?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country_iso?: string | null;
  grandtotal?: { amount: number; divisor: number; currency_code: string };
  subtotal?: { amount: number; divisor: number; currency_code: string };
  total_tax_cost?: { amount: number; divisor: number; currency_code: string };
  total_shipping_cost?: { amount: number; divisor: number; currency_code: string };
  transactions?: EtsyReceiptTransaction[];
}

interface EtsyReceiptsResponse {
  count: number;
  results: EtsyReceipt[];
}

/**
 * Returns a valid access token, refreshing first if the saved one is expired
 * (or within 60 seconds of expiry). Persists the new tokens back to settings.
 */
async function getValidAccessToken(): Promise<string> {
  const settings = loadSettings();
  if (!settings.etsy.keystring) {
    throw new Error("Etsy Keystring not set");
  }
  if (!settings.etsy.refreshToken) {
    throw new Error("Etsy refreshToken not set — reconnect via Settings");
  }
  const now = Math.floor(Date.now() / 1000);
  if (
    settings.etsy.accessToken &&
    settings.etsy.tokenExpiresAt - 60 > now
  ) {
    return settings.etsy.accessToken;
  }

  // Refresh.
  const res = await fetch("https://api.etsy.com/v3/public/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: settings.etsy.keystring,
      refresh_token: settings.etsy.refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Etsy token refresh failed (${res.status}): ${text.slice(0, 300)}`
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  const next = loadSettings();
  next.etsy = {
    ...next.etsy,
    accessToken: json.access_token,
    refreshToken: json.refresh_token, // Etsy rotates refresh tokens
    tokenExpiresAt: Math.floor(Date.now() / 1000) + json.expires_in,
  };
  saveSettings(next);
  return json.access_token;
}

async function etsyFetch(path: string): Promise<Response> {
  const settings = loadSettings();
  const token = await getValidAccessToken();
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "x-api-key": settings.etsy.keystring,
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Etsy API ${res.status} ${res.statusText} for ${path}: ${text.slice(0, 300)}`
    );
  }
  return res;
}

/**
 * Fetch receipts (Etsy's name for orders) created since the given ISO timestamp.
 * Paginates 100-at-a-time using min_created. `include=Transactions` gives us
 * line items embedded — saves a separate fetch per receipt.
 */
export async function fetchEtsyReceiptsSince(
  isoStart: string
): Promise<EtsyReceipt[]> {
  const settings = loadSettings();
  if (!settings.etsy.shopId) {
    throw new Error(
      "Etsy shopId not set — reconnect from Settings, or paste it manually"
    );
  }
  const minCreated = Math.floor(new Date(isoStart).getTime() / 1000);
  const collected: EtsyReceipt[] = [];
  let offset = 0;
  const limit = 100;
  // Safety cap so we never spin forever
  for (let page = 0; page < 50; page++) {
    const qs = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
      min_created: String(minCreated),
    });
    const res = await etsyFetch(
      `/shops/${settings.etsy.shopId}/receipts?${qs.toString()}`
    );
    const data = (await res.json()) as EtsyReceiptsResponse;
    collected.push(...(data.results ?? []));
    if (!data.results || data.results.length < limit) break;
    offset += limit;
  }
  return collected;
}

function moneyToFloat(m?: {
  amount: number;
  divisor: number;
  currency_code: string;
}): number {
  if (!m) return 0;
  return m.amount / (m.divisor || 100);
}

function mapEtsyTransactionToLineItem(t: EtsyReceiptTransaction): LineItem {
  const variantParts: string[] = [];
  if (t.variations) {
    for (const v of t.variations) {
      if (v.formatted_name && v.formatted_value) {
        variantParts.push(`${v.formatted_name}: ${v.formatted_value}`);
      }
    }
  }
  const variant = variantParts.length > 0 ? variantParts.join(" · ") : null;
  const isCustom = Boolean(t.personalization);
  return {
    sku: t.sku || null,
    productName: t.title || `Etsy item #${t.transaction_id}`,
    quantity: t.quantity,
    variant,
    isCustom: isCustom || undefined,
    personalization: t.personalization ?? null,
  };
}

function mapEtsyStatus(s: EtsyReceipt): Order["status"] {
  const status = (s.status || "").toLowerCase();
  if (status === "cancelled" || status === "canceled") return "cancelled";
  if (s.is_shipped) return "shipped";
  return "awaiting_print";
}

/** Convert a raw Etsy receipt into DashLab's canonical Order shape. */
export function mapEtsyReceiptToDashLab(r: EtsyReceipt): Order {
  const lineItems = (r.transactions ?? []).map(mapEtsyTransactionToLineItem);
  const totalItems = lineItems.reduce((s, li) => s + li.quantity, 0);
  const created =
    r.created_timestamp ?? r.create_timestamp ?? Math.floor(Date.now() / 1000);
  const createdISO = new Date(created * 1000).toISOString();

  return {
    id: `etsy-${r.receipt_id}`,
    orderNumber: String(r.receipt_id),
    channel: "etsy",
    customerName: r.name || r.buyer_email || "Etsy buyer",
    customerCity: r.city ?? null,
    customerState: r.state ?? null,
    customerCountry: r.country_iso ?? null,
    customerNotes: r.message_from_buyer ?? null,
    shipBy: null,
    shipMethod: null,
    isRush: false,
    status: mapEtsyStatus(r),
    lineItems,
    totalItems,
    createdAt: createdISO,
    shippedAt: null,
    orderTotal: moneyToFloat(r.grandtotal),
    amountPaid: r.is_paid ? moneyToFloat(r.grandtotal) : 0,
    taxAmount: moneyToFloat(r.total_tax_cost),
    shippingAmount: moneyToFloat(r.total_shipping_cost),
    storeId: null,
    storeName: "Etsy",
  };
}
