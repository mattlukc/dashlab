// SQLite persistence for DashLab.
// Single source of truth for the dashboard — pollers upsert here, UI reads from here.
// Keeps the app responsive and resilient to upstream API outages.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import Database from "better-sqlite3";
import type { Order, LineItem, OrderStatus } from "./types";
import { loadSettings } from "./settings";

// The DB lives in Electron's per-user data directory (resolved at runtime, once
// the app is ready) rather than a relative cwd path — so it survives app updates
// and works regardless of where the bundle is launched from.
function getDbPath(): string {
  return path.join(app.getPath("userData"), "dashlab.db");
}
// Pre-rename (NeatBoard → DashLab) database filename, looked for in the same dir.
function getLegacyDbPath(): string {
  return path.join(app.getPath("userData"), "neatboard.db");
}

let dbInstance: Database.Database | null = null;

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * One-time, data-preserving rename of the SQLite file from the old NeatBoard
 * name to the new DashLab name. Runs once at startup, before the DB is opened.
 *
 * Only fires when the legacy file exists AND no new file exists yet, so it is
 * idempotent and never clobbers a real dashlab.db. The WAL/SHM sidecars are
 * renamed alongside the main file so no committed-but-unflushed writes are lost.
 * NEVER deletes data — on any error it logs and continues.
 */
function migrateLegacyDbFile(): void {
  try {
    const legacy = getLegacyDbPath();
    const current = getDbPath();
    if (!fs.existsSync(legacy)) return; // nothing to migrate
    if (fs.existsSync(current)) return; // new db already present — don't touch
    for (const suffix of ["", "-wal", "-shm"]) {
      const from = `${legacy}${suffix}`;
      const to = `${current}${suffix}`;
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.renameSync(from, to);
      }
    }
    console.log(
      "[db] migrated legacy neatboard.db → dashlab.db (existing data preserved)"
    );
  } catch (err) {
    // Don't block startup on a migration hiccup — log and continue with whatever
    // file state exists. Worst case the app starts on a fresh dashlab.db.
    console.error("[db] legacy db rename failed (continuing):", err);
  }
}

/**
 * First-launch seed: if no DB exists in userData yet but one was bundled with
 * the app (electron-builder extraResources copies app/data → resources/data),
 * copy it forward so a fresh install starts with the existing order history.
 * Copies the WAL/SHM sidecars too. Never overwrites an existing userData DB.
 */
function migrateBundledDbFile(): void {
  try {
    const target = getDbPath();
    if (fs.existsSync(target)) return; // user already has a db — leave it
    // resourcesPath is only populated in a packaged app.
    const bundled = path.join(process.resourcesPath ?? "", "data", "dashlab.db");
    if (!fs.existsSync(bundled)) return; // nothing bundled — fresh start
    for (const suffix of ["", "-wal", "-shm"]) {
      const from = `${bundled}${suffix}`;
      const to = `${target}${suffix}`;
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.copyFileSync(from, to);
      }
    }
    console.log("[db] seeded userData DB from bundled resources/data/dashlab.db");
  } catch (err) {
    console.error("[db] bundled db seed failed (continuing):", err);
  }
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL,
      channel TEXT NOT NULL,
      customer_name TEXT,
      customer_city TEXT,
      customer_state TEXT,
      customer_country TEXT,
      customer_notes TEXT,
      ship_by TEXT,
      ship_method TEXT,
      is_rush INTEGER DEFAULT 0,
      status TEXT NOT NULL,
      total_items INTEGER DEFAULT 0,
      line_items_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      raw_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_ship_by ON orders(ship_by);

    CREATE TABLE IF NOT EXISTS sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      records_synced INTEGER DEFAULT 0,
      error_message TEXT
    );
  `);

  // Idempotent ALTER TABLE migrations for fields added after v1.
  // Each is wrapped so re-running on an already-migrated DB is safe.
  const addColumn = (sql: string) => {
    try {
      db.exec(sql);
    } catch (err) {
      // "duplicate column name" is expected on subsequent runs — ignore.
      const msg = (err as Error).message;
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  };
  addColumn(`ALTER TABLE orders ADD COLUMN order_total REAL DEFAULT 0`);
  addColumn(`ALTER TABLE orders ADD COLUMN amount_paid REAL DEFAULT 0`);
  addColumn(`ALTER TABLE orders ADD COLUMN tax_amount REAL DEFAULT 0`);
  addColumn(`ALTER TABLE orders ADD COLUMN shipping_amount REAL DEFAULT 0`);
  addColumn(`ALTER TABLE orders ADD COLUMN store_id INTEGER`);
  addColumn(`ALTER TABLE orders ADD COLUMN store_name TEXT`);
  addColumn(`ALTER TABLE orders ADD COLUMN shipped_at TEXT`);

  // FBA tables (Amazon SP-API)
  db.exec(`
    CREATE TABLE IF NOT EXISTS fba_orders (
      amazon_order_id TEXT PRIMARY KEY,
      purchase_date TEXT NOT NULL,
      order_status TEXT,
      order_total REAL DEFAULT 0,
      currency TEXT,
      marketplace_id TEXT,
      shipment_service_level TEXT,
      is_prime INTEGER DEFAULT 0,
      number_of_items INTEGER DEFAULT 0,
      raw_json TEXT,
      fetched_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_fba_orders_purchase_date
      ON fba_orders(purchase_date);

    CREATE TABLE IF NOT EXISTS fba_metrics (
      period_key TEXT PRIMARY KEY,
      order_count INTEGER DEFAULT 0,
      unit_count INTEGER DEFAULT 0,
      total_sales REAL DEFAULT 0,
      currency TEXT,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS social_stats (
      platform TEXT PRIMARY KEY,
      followers INTEGER DEFAULT 0,
      content_count INTEGER DEFAULT 0,
      total_views INTEGER DEFAULT 0,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fba_inventory (
      sku TEXT PRIMARY KEY,
      asin TEXT,
      fulfillable_quantity INTEGER DEFAULT 0,
      total_quantity INTEGER DEFAULT 0,
      inbound_quantity INTEGER DEFAULT 0,
      reserved_quantity INTEGER DEFAULT 0,
      marketplace_id TEXT,
      last_updated TEXT NOT NULL
    );
  `);

  // Must run AFTER fba_orders is created above — otherwise the ALTER fails with
  // "no such table" on a fresh DB.
  // FBA line items — fetched via /orders/v0/orders/{id}/orderItems on demand
  addColumn(`ALTER TABLE fba_orders ADD COLUMN line_items_json TEXT`);
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const dbFile = getDbPath();
  ensureDir(dbFile);
  // Order matters: seed from the bundled copy first (fresh install), then apply
  // the legacy-name rename, then open whatever file resulted.
  migrateBundledDbFile();
  migrateLegacyDbFile();
  const db = new Database(dbFile);
  db.pragma("journal_mode = WAL");
  migrate(db);
  dbInstance = db;
  return db;
}

interface OrderRow {
  id: string;
  order_number: string;
  channel: string;
  customer_name: string | null;
  customer_city: string | null;
  customer_state: string | null;
  customer_country: string | null;
  customer_notes: string | null;
  ship_by: string | null;
  ship_method: string | null;
  is_rush: number;
  status: string;
  total_items: number;
  line_items_json: string;
  created_at: string;
  updated_at: string;
  raw_json: string | null;
  order_total: number | null;
  amount_paid: number | null;
  tax_amount: number | null;
  shipping_amount: number | null;
  store_id: number | null;
  store_name: string | null;
  shipped_at: string | null;
}

function rowToOrder(row: OrderRow): Order {
  return {
    id: row.id,
    orderNumber: row.order_number,
    channel: row.channel as Order["channel"],
    customerName: row.customer_name ?? "",
    customerCity: row.customer_city,
    customerState: row.customer_state,
    customerCountry: row.customer_country,
    customerNotes: row.customer_notes,
    shipBy: row.ship_by,
    shipMethod: row.ship_method,
    isRush: row.is_rush === 1,
    status: row.status as OrderStatus,
    lineItems: JSON.parse(row.line_items_json) as LineItem[],
    totalItems: row.total_items,
    createdAt: row.created_at,
    orderTotal: row.order_total ?? 0,
    amountPaid: row.amount_paid ?? 0,
    taxAmount: row.tax_amount ?? 0,
    shippingAmount: row.shipping_amount ?? 0,
    storeId: row.store_id,
    storeName: row.store_name,
    shippedAt: row.shipped_at,
  };
}

export function upsertOrder(order: Order, rawJson?: unknown): void {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO orders (
      id, order_number, channel, customer_name, customer_city, customer_state,
      customer_country, customer_notes, ship_by, ship_method, is_rush, status,
      total_items, line_items_json, created_at, updated_at, raw_json,
      order_total, amount_paid, tax_amount, shipping_amount, store_id, store_name, shipped_at
    ) VALUES (
      @id, @order_number, @channel, @customer_name, @customer_city, @customer_state,
      @customer_country, @customer_notes, @ship_by, @ship_method, @is_rush, @status,
      @total_items, @line_items_json, @created_at, @updated_at, @raw_json,
      @order_total, @amount_paid, @tax_amount, @shipping_amount, @store_id, @store_name, @shipped_at
    )
    ON CONFLICT(id) DO UPDATE SET
      order_number = excluded.order_number,
      channel = excluded.channel,
      customer_name = excluded.customer_name,
      customer_city = excluded.customer_city,
      customer_state = excluded.customer_state,
      customer_country = excluded.customer_country,
      customer_notes = excluded.customer_notes,
      ship_by = excluded.ship_by,
      ship_method = excluded.ship_method,
      is_rush = excluded.is_rush,
      total_items = excluded.total_items,
      line_items_json = excluded.line_items_json,
      updated_at = excluded.updated_at,
      raw_json = excluded.raw_json,
      order_total = excluded.order_total,
      amount_paid = excluded.amount_paid,
      tax_amount = excluded.tax_amount,
      shipping_amount = excluded.shipping_amount,
      store_id = excluded.store_id,
      store_name = excluded.store_name,
      shipped_at = excluded.shipped_at,
      -- External status (shipped/cancelled) overrides local;
      -- local-only transitions (printing, slip_printed) are preserved.
      status = CASE
        WHEN excluded.status IN ('shipped', 'cancelled') THEN excluded.status
        ELSE orders.status
      END
  `);
  // Don't overwrite local-only status transitions (printing, slip_printed) on re-poll.
  // Status updates only on insert; subsequent updates preserve local state.
  stmt.run({
    id: order.id,
    order_number: order.orderNumber,
    channel: order.channel,
    customer_name: order.customerName,
    customer_city: order.customerCity ?? null,
    customer_state: order.customerState ?? null,
    customer_country: order.customerCountry ?? null,
    customer_notes: order.customerNotes ?? null,
    ship_by: order.shipBy,
    ship_method: order.shipMethod ?? null,
    is_rush: order.isRush ? 1 : 0,
    status: order.status,
    total_items: order.totalItems,
    line_items_json: JSON.stringify(order.lineItems),
    created_at: order.createdAt,
    updated_at: now,
    raw_json: rawJson ? JSON.stringify(rawJson) : null,
    order_total: order.orderTotal ?? 0,
    amount_paid: order.amountPaid ?? 0,
    tax_amount: order.taxAmount ?? 0,
    shipping_amount: order.shippingAmount ?? 0,
    store_id: order.storeId ?? null,
    store_name: order.storeName ?? null,
    shipped_at: order.shippedAt ?? null,
  });
}

export function getOrdersForToday(): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('awaiting_print', 'printing', 'slip_printed')
       ORDER BY
         CASE WHEN ship_by IS NULL THEN 1 ELSE 0 END,
         ship_by ASC,
         created_at DESC`
    )
    .all() as OrderRow[];
  return rows.map(rowToOrder);
}

/**
 * Orders that still need a slip printed — the Orders page print queue.
 * 'slip_printed' is intentionally excluded so reprints don't pile back up.
 */
export function getOrdersInPrintQueue(): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE status IN ('awaiting_print', 'printing')
       ORDER BY
         CASE WHEN ship_by IS NULL THEN 1 ELSE 0 END,
         ship_by ASC,
         created_at DESC`
    )
    .all() as OrderRow[];
  return rows.map(rowToOrder);
}

/**
 * Mark the given order ids as slip_printed, but only if they're still queued
 * (awaiting_print / printing) — so we never clobber 'shipped' or 'cancelled'.
 * Returns the number of rows actually transitioned.
 */
export function markOrdersSlipPrinted(orderIds: string[]): number {
  if (orderIds.length === 0) return 0;
  const db = getDb();
  const placeholders = orderIds.map(() => "?").join(", ");
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE orders
       SET status = 'slip_printed', updated_at = ?
       WHERE id IN (${placeholders})
         AND status IN ('awaiting_print', 'printing')`
    )
    .run(now, ...orderIds);
  return result.changes;
}

/**
 * All NON-CANCELLED orders created on or after the given ISO timestamp.
 * Used by the dashboard KPI / analytics widgets — cancelled orders are excluded
 * from revenue and item counts.
 */
export function getOrdersCreatedSince(isoStart: string): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE created_at >= ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}
       ORDER BY created_at DESC`
    )
    .all(isoStart) as OrderRow[];
  return rows.map(rowToOrder);
}

/**
 * Orders created on a specific local-time date (YYYY-MM-DD), excluding cancelled.
 * Used by the dashboard date-picker.
 */
export function getOrdersOnLocalDate(yyyyMmDd: string): Order[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT * FROM orders
       WHERE DATE(created_at, 'localtime') = ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}
       ORDER BY created_at DESC`
    )
    .all(yyyyMmDd) as OrderRow[];
  return rows.map(rowToOrder);
}

/** Daily product sales for the last N days. Days with no orders return 0. Cancelled excluded. */
export function getDailyRevenueLastNDays(
  days: number
): { day: string; revenue: number; orders: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         DATE(created_at) as day,
         COALESCE(SUM(${SALES_EXPR}), 0) as revenue,
         COUNT(*) as orders
       FROM orders
       WHERE created_at >= DATE('now', ?)
       AND status != 'cancelled'
       ${directChannelExclusionSql()}
       GROUP BY DATE(created_at)
       ORDER BY day ASC`
    )
    .all(`-${days} days`) as Array<{
    day: string;
    revenue: number;
    orders: number;
  }>;
  return rows;
}

/**
 * created_at storage format — IMPORTANT for the period queries below.
 *
 * Every range/since query (getRevenueSince, getRevenueInRange, getOrderCountInRange,
 * etc.) compares `created_at` against bounds built with `Date#toISOString()`, which
 * are UTC ISO-8601 strings ending in `Z`. SQLite compares TEXT lexicographically, so
 * those comparisons are only correct if `created_at` is ALSO stored as UTC ISO-8601.
 *
 * To guarantee that, all four order mappers normalize createdAt to UTC at ingestion
 * (see lib/shipstation.ts, lib/shopify-api.ts, lib/etsy-api.ts, jobs/poll-amazon-fbm.ts):
 *   • Etsy / Amazon FBM — source dates are already UTC (`Z`); pass through.
 *   • Shopify — source carries the shop's UTC offset; converted to `Z`.
 *   • ShipStation — source is naive account-local time (no offset); interpreted in
 *     the server's local timezone and converted to `Z`. This assumes the server TZ
 *     matches the ShipStation account TZ (both Phoenix on the shop NUC). If that ever
 *     stops being true, ShipStation rows would be off by the offset near day/week
 *     boundaries — revisit the mapper, not these queries.
 * The `DATE(created_at, 'localtime')` helpers (date-picker, % custom) rely on the same
 * UTC-storage assumption.
 */

/**
 * Product-only sales: order_total minus shipping and tax.
 * This matches ShipStation Insights' "Sales (USD)" metric.
 */
const SALES_EXPR =
  `COALESCE(order_total, 0) - COALESCE(shipping_amount, 0) - COALESCE(tax_amount, 0)`;

/**
 * SQL WHERE fragment that excludes ShipStation-sourced rows for channels
 * that have a direct integration enabled. ShipStation still pulls the rows
 * (needed for shipping / packing slips) but analytics queries should treat
 * the direct integration as the source of truth for $$ and item counts.
 *
 * Returns an empty string if no direct integrations are enabled (so the
 * fragment is safe to concatenate into any WHERE clause).
 *
 * Use like:  `WHERE created_at >= ?  ${directChannelExclusionSql()}`
 */
/**
 * Builds a SKU → product-name map sourced from ShipStation rows.
 * ShipStation is the canonical naming source — Matt curates names there —
 * so any aggregation should prefer the ShipStation name when a SKU matches.
 *
 * ShipStation rows are identified as orders WITHOUT a direct-integration id
 * prefix (no "shop-", no "fbm-"). Most-recent name wins per SKU.
 */
function buildShipStationProductNameMap(): Map<string, string> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT line_items_json
       FROM orders
       WHERE id NOT LIKE 'shop-%'
         AND id NOT LIKE 'fbm-%'
         AND id NOT LIKE 'etsy-%'
         AND created_at >= DATE('now', '-180 days')
       ORDER BY created_at DESC`
    )
    .all() as { line_items_json: string }[];

  const skuToName = new Map<string, string>();
  for (const r of rows) {
    let items: Array<{ sku: string | null; productName: string }> = [];
    try {
      items = JSON.parse(r.line_items_json);
    } catch {
      continue;
    }
    for (const it of items) {
      if (it.sku && it.productName && !skuToName.has(it.sku)) {
        skuToName.set(it.sku, it.productName);
      }
    }
  }
  return skuToName;
}

// Remembers the last exclusion set we logged so we don't spam an identical line
// on every one of the dozens of analytics queries per dashboard render.
let __lastExclusionLog = "";

function directChannelExclusionSql(): string {
  // settings.ts doesn't import db.ts, so a static top-level import is safe — and
  // it must be static: the bundled main process has no relative require() paths.
  const settings = loadSettings();
  const exclusions: string[] = [];
  const excludedChannels: string[] = [];
  // A ShipStation row is only a *duplicate* if the direct poller actually pulled
  // the same order. The direct pollers only have recent orders, so excluding ALL
  // ShipStation rows for the channel (the old behavior) erased months of historical
  // revenue that has no direct copy. Instead, only exclude a ShipStation row when a
  // matching direct-integration row (same order_number) exists.
  //
  // Shopify direct: ShipStation copies = channel='shopify' AND id NOT LIKE 'shop-%'.
  if (
    settings.shopify.enabled &&
    settings.shopify.storeDomain &&
    settings.shopify.adminAccessToken
  ) {
    exclusions.push(
      `NOT (channel = 'shopify' AND id NOT LIKE 'shop-%' AND order_number IN (
        SELECT order_number FROM orders WHERE id LIKE 'shop-%'
      ))`
    );
    excludedChannels.push("shopify");
  }
  // Amazon FBM direct: ShipStation copies = channel='amazon_fbm' AND id NOT LIKE 'fbm-%'.
  if (settings.amazonSpApi.enabled && settings.amazonSpApi.fbmEnabled) {
    exclusions.push(
      `NOT (channel = 'amazon_fbm' AND id NOT LIKE 'fbm-%' AND order_number IN (
        SELECT order_number FROM orders WHERE id LIKE 'fbm-%'
      ))`
    );
    excludedChannels.push("amazon_fbm");
  }
  // Etsy direct: ShipStation copies = channel='etsy' AND id NOT LIKE 'etsy-%'.
  if (
    settings.etsy.enabled &&
    settings.etsy.keystring &&
    settings.etsy.refreshToken &&
    settings.etsy.shopId
  ) {
    exclusions.push(
      `NOT (channel = 'etsy' AND id NOT LIKE 'etsy-%' AND order_number IN (
        SELECT order_number FROM orders WHERE id LIKE 'etsy-%'
      ))`
    );
    excludedChannels.push("etsy");
  }

  // Debug (console only, never surfaced in the UI): confirm the dedup is firing
  // and shows exactly which direct channels are hiding their ShipStation copies.
  const logKey = excludedChannels.join(",");
  if (logKey !== __lastExclusionLog) {
    __lastExclusionLog = logKey;
    if (excludedChannels.length > 0) {
      console.log(
        `[dedup] hiding ShipStation rows that have a matching direct copy for: ${excludedChannels.join(", ")} (historical orders with no direct copy are kept)`
      );
    } else {
      console.log("[dedup] no direct channels enabled — no exclusions applied");
    }
  }

  return exclusions.length > 0 ? ` AND ${exclusions.join(" AND ")}` : "";
}

/** Sum of product sales across all non-cancelled FBM orders created since the given timestamp. */
export function getRevenueSince(isoStart: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${SALES_EXPR}), 0) as revenue
       FROM orders
       WHERE created_at >= ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .get(isoStart) as { revenue: number };
  return row.revenue;
}

/** Sum of product sales in [start, end). Non-cancelled only. */
export function getRevenueInRange(isoStart: string, isoEnd: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${SALES_EXPR}), 0) as revenue
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .get(isoStart, isoEnd) as { revenue: number };
  return row.revenue;
}

// Product sales discounted by a per-channel net multiplier. MUST mirror
// NET_MULTIPLIER in src/main/dashboard.ts so net periods match the per-order
// estimateNet() used for "today". (amazon_fba never lands in the orders table —
// FBA net is applied separately via fbaNet() — but it's listed for parity.)
const NET_SALES_EXPR = `(${SALES_EXPR}) * (
  CASE channel
    WHEN 'shopify' THEN 0.97
    WHEN 'amazon_fbm' THEN 0.85
    WHEN 'amazon_fba' THEN 0.7
    WHEN 'etsy' THEN 0.935
    WHEN 'ebay' THEN 0.87
    WHEN 'manual' THEN 1.0
    ELSE 0.95
  END
)`;

/** Net (after-fee) product sales for non-cancelled FBM orders since a timestamp. */
export function getNetRevenueSince(isoStart: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${NET_SALES_EXPR}), 0) as revenue
       FROM orders
       WHERE created_at >= ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .get(isoStart) as { revenue: number };
  return row.revenue;
}

/** Net (after-fee) product sales in [start, end). Non-cancelled only. */
export function getNetRevenueInRange(isoStart: string, isoEnd: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(${NET_SALES_EXPR}), 0) as revenue
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .get(isoStart, isoEnd) as { revenue: number };
  return row.revenue;
}

/**
 * Latest non-cancelled order — used by the new-order ka-ching popup.
 * Dedup-aware so the popup doesn't ring a second time when ShipStation
 * pulls in an order that already came through a direct integration.
 */
export function getLatestNonCancelledOrder(): {
  id: string;
  order_number: string;
  customer_name: string | null;
  channel: string;
  order_total: number | null;
  shipping_amount: number | null;
  tax_amount: number | null;
  total_items: number;
  created_at: string;
  store_name: string | null;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT id, order_number, customer_name, channel, order_total,
              shipping_amount, tax_amount, total_items, created_at, store_name
       FROM orders
       WHERE status != 'cancelled'
       ${directChannelExclusionSql()}
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: string;
        order_number: string;
        customer_name: string | null;
        channel: string;
        order_total: number | null;
        shipping_amount: number | null;
        tax_amount: number | null;
        total_items: number;
        created_at: string;
        store_name: string | null;
      }
    | undefined;
  return row ?? null;
}

/** Returns the oldest non-shipped, non-cancelled order's id, number, and age in hours. */
export function getOldestUnshippedOrder(): {
  orderNumber: string;
  customerName: string | null;
  createdAt: string;
  ageHours: number;
} | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT order_number, customer_name, created_at
       FROM orders
       WHERE status IN ('awaiting_print','printing','slip_printed')
       ORDER BY created_at ASC
       LIMIT 1`
    )
    .get() as { order_number: string; customer_name: string | null; created_at: string } | undefined;
  if (!row) return null;
  const ageHours =
    (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60);
  return {
    orderNumber: row.order_number,
    customerName: row.customer_name,
    createdAt: row.created_at,
    ageHours,
  };
}

/** Avg time-to-ship in hours, for orders shipped in the last N days. */
export function getAvgShipTimeHours(daysBack: number): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT AVG(julianday(shipped_at) - julianday(created_at)) * 24.0 as avgH
       FROM orders
       WHERE shipped_at IS NOT NULL
         AND status != 'cancelled'
         AND shipped_at >= DATE('now', ?)
         ${directChannelExclusionSql()}`
    )
    .get(`-${daysBack} days`) as { avgH: number | null };
  return row.avgH;
}

/** Top SKUs in [start, end), summed quantity, with channel breakdown. */
export function getTopSKUsInRange(
  isoStart: string,
  isoEnd: string,
  limit = 5
): { sku: string; name: string; quantity: number; orderCount: number; isCustom: boolean }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT line_items_json
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .all(isoStart, isoEnd) as { line_items_json: string }[];
  const nameMap = buildShipStationProductNameMap();
  const agg = new Map<string, { sku: string; name: string; quantity: number; orderCount: number; isCustom: boolean }>();
  for (const r of rows) {
    const items = JSON.parse(r.line_items_json) as Array<{
      sku: string | null;
      productName: string;
      quantity: number;
      isCustom?: boolean;
    }>;
    for (const it of items) {
      // Skip discount / promo / refund line items — they're not real products
      // and the customer didn't "order" them.
      const nameLower = (it.productName || "").toLowerCase().trim();
      const skuLower = (it.sku || "").toLowerCase().trim();
      const isNotProduct =
        !nameLower ||
        nameLower === "discount" ||
        nameLower === "promo" ||
        nameLower === "promotion" ||
        nameLower === "refund" ||
        nameLower === "tip" ||
        nameLower === "gift card" ||
        nameLower.startsWith("discount:") ||
        nameLower.startsWith("promo:") ||
        skuLower === "discount" ||
        skuLower === "tip" ||
        it.quantity <= 0;
      if (isNotProduct) continue;

      // Prefer the ShipStation product name when this SKU exists in ShipStation.
      const displayName =
        (it.sku && nameMap.get(it.sku)) || it.productName;
      const key = it.sku ?? `name:${displayName}`;
      const existing = agg.get(key);
      if (existing) {
        existing.quantity += it.quantity;
        existing.orderCount += 1;
      } else {
        agg.set(key, {
          sku: it.sku ?? "—",
          name: displayName,
          quantity: it.quantity,
          orderCount: 1,
          isCustom: Boolean(it.isCustom),
        });
      }
    }
  }
  return Array.from(agg.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, limit);
}

/**
 * Items sold in [start, end) broken down by source channel.
 * Returns each product with per-channel quantities + the list of channels
 * actually represented (so the UI can render exactly those columns).
 */
export function getItemsSoldByChannelInRange(
  isoStart: string,
  isoEnd: string,
  limit = 50
): {
  items: Array<{
    sku: string;
    name: string;
    isCustom: boolean;
    total: number;
    perChannel: Record<string, number>;
  }>;
  channels: string[];
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT channel, line_items_json
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .all(isoStart, isoEnd) as { channel: string; line_items_json: string }[];

  // FBA orders live in fba_orders with a different shape — pull them too.
  const fbaRows = db
    .prepare(
      `SELECT line_items_json
       FROM fba_orders
       WHERE purchase_date >= ? AND purchase_date < ?
       AND COALESCE(order_status, '') NOT IN ('Canceled', 'Cancelled')
       AND line_items_json IS NOT NULL
       AND line_items_json != ''`
    )
    .all(isoStart, isoEnd) as { line_items_json: string }[];

  const nameMap = buildShipStationProductNameMap();
  const agg = new Map<
    string,
    {
      sku: string;
      name: string;
      isCustom: boolean;
      total: number;
      perChannel: Record<string, number>;
    }
  >();
  const channelsSeen = new Set<string>();

  // Helper to add a normalized line item into the aggregator.
  // Prefers ShipStation's product name when the SKU is known there.
  const addItem = (
    channel: string,
    raw: {
      sku: string | null;
      name: string;
      quantity: number;
      isCustom?: boolean;
    }
  ) => {
    const nameLower = (raw.name || "").toLowerCase().trim();
    const skuLower = (raw.sku || "").toLowerCase().trim();
    const isNotProduct =
      !nameLower ||
      nameLower === "discount" ||
      nameLower === "promo" ||
      nameLower === "promotion" ||
      nameLower === "refund" ||
      nameLower === "tip" ||
      nameLower === "gift card" ||
      nameLower.startsWith("discount:") ||
      nameLower.startsWith("promo:") ||
      skuLower === "discount" ||
      skuLower === "tip" ||
      raw.quantity <= 0;
    if (isNotProduct) return;

    channelsSeen.add(channel);
    const displayName = (raw.sku && nameMap.get(raw.sku)) || raw.name;
    const key = raw.sku ?? `name:${displayName}`;
    let existing = agg.get(key);
    if (!existing) {
      existing = {
        sku: raw.sku ?? "—",
        name: displayName,
        isCustom: Boolean(raw.isCustom),
        total: 0,
        perChannel: {},
      };
      agg.set(key, existing);
    }
    existing.total += raw.quantity;
    existing.perChannel[channel] =
      (existing.perChannel[channel] ?? 0) + raw.quantity;
  };

  for (const r of rows) {
    const channel = r.channel || "other";
    const items = JSON.parse(r.line_items_json) as Array<{
      sku: string | null;
      productName: string;
      quantity: number;
      isCustom?: boolean;
    }>;
    for (const it of items) {
      addItem(channel, {
        sku: it.sku,
        name: it.productName,
        quantity: it.quantity,
        isCustom: it.isCustom,
      });
    }
  }

  // FBA items — stored shape is { sku, asin, name, quantity }
  for (const r of fbaRows) {
    const items = JSON.parse(r.line_items_json) as Array<{
      sku: string | null;
      asin: string | null;
      name: string;
      quantity: number;
    }>;
    for (const it of items) {
      addItem("amazon_fba", {
        sku: it.sku,
        name: it.name,
        quantity: it.quantity,
      });
    }
  }

  const channels = Array.from(channelsSeen).sort();
  const items = Array.from(agg.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
  return { items, channels };
}

/** Revenue (product sales) grouped by US state in [start, end). Top N. */
export function getRevenueByState(
  isoStart: string,
  isoEnd: string,
  limit = 10
): { state: string; revenue: number; orders: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         COALESCE(customer_state, '?') as state,
         COALESCE(SUM(${SALES_EXPR}), 0) as revenue,
         COUNT(*) as orders
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       AND status != 'cancelled'
       AND customer_country IN ('US', 'United States', 'USA', NULL)
       ${directChannelExclusionSql()}
       GROUP BY COALESCE(customer_state, '?')
       ORDER BY revenue DESC
       LIMIT ?`
    )
    .all(isoStart, isoEnd, limit) as Array<{
    state: string;
    revenue: number;
    orders: number;
  }>;
  return rows;
}

/** % of orders today with at least one custom line item. */
export function getCustomOrderPctOnDate(yyyyMmDd: string): {
  custom: number;
  total: number;
  pct: number;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT line_items_json
       FROM orders
       WHERE DATE(created_at, 'localtime') = ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .all(yyyyMmDd) as { line_items_json: string }[];
  let custom = 0;
  for (const r of rows) {
    const items = JSON.parse(r.line_items_json) as Array<{ isCustom?: boolean }>;
    if (items.some((i) => i.isCustom)) custom++;
  }
  return {
    custom,
    total: rows.length,
    pct: rows.length === 0 ? 0 : (custom / rows.length) * 100,
  };
}

/** On-time ship rate over last N days. On-time = shipped_at <= ship_by OR no ship_by. */
export function getOnTimeShipRate(daysBack: number): {
  shipped: number;
  onTime: number;
  pct: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) as shipped,
         SUM(CASE
               WHEN ship_by IS NULL OR ship_by = '' THEN 1
               WHEN julianday(shipped_at) <= julianday(ship_by) + 0.5 THEN 1
               ELSE 0
             END) as onTime
       FROM orders
       WHERE shipped_at IS NOT NULL
         AND status != 'cancelled'
         AND shipped_at >= DATE('now', ?)
         ${directChannelExclusionSql()}`
    )
    .get(`-${daysBack} days`) as { shipped: number; onTime: number };
  const shipped = row.shipped ?? 0;
  const onTime = row.onTime ?? 0;
  return {
    shipped,
    onTime,
    pct: shipped === 0 ? 0 : (onTime / shipped) * 100,
  };
}

/** Count of non-cancelled orders in [start, end). */
export function getOrderCountInRange(isoStart: string, isoEnd: string): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as cnt
       FROM orders
       WHERE created_at >= ? AND created_at < ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}`
    )
    .get(isoStart, isoEnd) as { cnt: number };
  return row.cnt;
}

/**
 * Product sales by channel for orders created since the given timestamp.
 * Uses SALES_EXPR (order_total − shipping − tax) and excludes cancelled orders,
 * so it matches every other revenue query — previously this summed gross
 * order_total, which over-reported each channel vs. the dashboard KPIs.
 */
export function getChannelBreakdownSince(
  isoStart: string
): { channel: string; revenue: number; orders: number }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         channel,
         COALESCE(SUM(${SALES_EXPR}), 0) as revenue,
         COUNT(*) as orders
       FROM orders
       WHERE created_at >= ?
       AND status != 'cancelled'
       ${directChannelExclusionSql()}
       GROUP BY channel
       ORDER BY revenue DESC`
    )
    .all(isoStart) as Array<{
    channel: string;
    revenue: number;
    orders: number;
  }>;
  return rows;
}

export interface SyncLogEntry {
  id: number;
  service: string;
  started_at: string;
  finished_at: string | null;
  status: "running" | "ok" | "error";
  records_synced: number;
  error_message: string | null;
}

export function recordSyncStart(service: string): number {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO sync_log (service, started_at, status) VALUES (?, ?, 'running')`
    )
    .run(service, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function recordSyncFinish(
  id: number,
  outcome:
    | { status: "ok"; recordsSynced: number }
    | { status: "error"; errorMessage: string }
): void {
  const db = getDb();
  if (outcome.status === "ok") {
    db.prepare(
      `UPDATE sync_log SET finished_at = ?, status = 'ok', records_synced = ? WHERE id = ?`
    ).run(new Date().toISOString(), outcome.recordsSynced, id);
  } else {
    db.prepare(
      `UPDATE sync_log SET finished_at = ?, status = 'error', error_message = ? WHERE id = ?`
    ).run(new Date().toISOString(), outcome.errorMessage, id);
  }
}

export function getLatestSyncLog(service: string): SyncLogEntry | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM sync_log WHERE service = ? ORDER BY id DESC LIMIT 1`
    )
    .get(service) as SyncLogEntry | undefined;
  return row ?? null;
}

/**
 * ISO timestamp of the most recent *successful* sync for a service, or null if
 * it has never finished a sync with status 'ok'. Unlike getLatestSyncLog this
 * skips over 'running' / 'error' rows, so it answers "when did we last actually
 * have fresh data?" — used by the client-side auto-sync.
 */
export function getLastSuccessfulSyncAt(service: string): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT finished_at FROM sync_log
       WHERE service = ? AND status = 'ok' AND finished_at IS NOT NULL
       ORDER BY id DESC LIMIT 1`
    )
    .get(service) as { finished_at: string } | undefined;
  return row?.finished_at ?? null;
}

// ---------- FBA helpers ----------

export interface FBAOrderRow {
  amazon_order_id: string;
  purchase_date: string;
  order_status: string | null;
  order_total: number | null;
  currency: string | null;
  marketplace_id: string | null;
  shipment_service_level: string | null;
  is_prime: number;
  number_of_items: number;
}

export function upsertFbaOrder(input: {
  amazonOrderId: string;
  purchaseDate: string;
  orderStatus: string;
  orderTotal: number;
  currency: string | null;
  marketplaceId: string | null;
  shipmentServiceLevel: string | null;
  isPrime: boolean;
  numberOfItems: number;
  rawJson?: unknown;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO fba_orders (
       amazon_order_id, purchase_date, order_status, order_total, currency,
       marketplace_id, shipment_service_level, is_prime, number_of_items,
       raw_json, fetched_at
     ) VALUES (
       @amazonOrderId, @purchaseDate, @orderStatus, @orderTotal, @currency,
       @marketplaceId, @shipmentServiceLevel, @isPrime, @numberOfItems,
       @rawJson, @fetchedAt
     )
     ON CONFLICT(amazon_order_id) DO UPDATE SET
       purchase_date = excluded.purchase_date,
       order_status = excluded.order_status,
       order_total = excluded.order_total,
       currency = excluded.currency,
       marketplace_id = excluded.marketplace_id,
       shipment_service_level = excluded.shipment_service_level,
       is_prime = excluded.is_prime,
       number_of_items = excluded.number_of_items,
       raw_json = excluded.raw_json,
       fetched_at = excluded.fetched_at`
  ).run({
    amazonOrderId: input.amazonOrderId,
    purchaseDate: input.purchaseDate,
    orderStatus: input.orderStatus,
    orderTotal: input.orderTotal,
    currency: input.currency,
    marketplaceId: input.marketplaceId,
    shipmentServiceLevel: input.shipmentServiceLevel,
    isPrime: input.isPrime ? 1 : 0,
    numberOfItems: input.numberOfItems,
    rawJson: input.rawJson ? JSON.stringify(input.rawJson) : null,
    fetchedAt: new Date().toISOString(),
  });
}

/** Persist the fetched line items for a single FBA order. */
export function setFbaOrderLineItems(
  amazonOrderId: string,
  lineItems: Array<{
    sku: string | null;
    asin: string | null;
    name: string;
    quantity: number;
  }>
): void {
  const db = getDb();
  db.prepare(
    `UPDATE fba_orders SET line_items_json = ? WHERE amazon_order_id = ?`
  ).run(JSON.stringify(lineItems), amazonOrderId);
}

/** Returns amazon_order_ids that don't have line items yet, scoped to a date range. */
export function getFbaOrdersMissingLineItems(
  sinceISO: string,
  limit = 100
): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT amazon_order_id FROM fba_orders
       WHERE purchase_date >= ?
       AND (line_items_json IS NULL OR line_items_json = '')
       ORDER BY purchase_date DESC
       LIMIT ?`
    )
    .all(sinceISO, limit) as { amazon_order_id: string }[];
  return rows.map((r) => r.amazon_order_id);
}

export interface FBAInventoryRow {
  sku: string;
  asin: string | null;
  fulfillable_quantity: number;
  total_quantity: number;
  inbound_quantity: number;
  reserved_quantity: number;
  marketplace_id: string | null;
  last_updated: string;
}

export function upsertFbaInventory(input: {
  sku: string;
  asin: string | null;
  fulfillableQuantity: number;
  totalQuantity: number;
  inboundQuantity: number;
  reservedQuantity: number;
  marketplaceId: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO fba_inventory (
       sku, asin, fulfillable_quantity, total_quantity, inbound_quantity,
       reserved_quantity, marketplace_id, last_updated
     ) VALUES (
       @sku, @asin, @fulfillableQuantity, @totalQuantity, @inboundQuantity,
       @reservedQuantity, @marketplaceId, @lastUpdated
     )
     ON CONFLICT(sku) DO UPDATE SET
       asin = excluded.asin,
       fulfillable_quantity = excluded.fulfillable_quantity,
       total_quantity = excluded.total_quantity,
       inbound_quantity = excluded.inbound_quantity,
       reserved_quantity = excluded.reserved_quantity,
       marketplace_id = excluded.marketplace_id,
       last_updated = excluded.last_updated`
  ).run({
    sku: input.sku,
    asin: input.asin,
    fulfillableQuantity: input.fulfillableQuantity,
    totalQuantity: input.totalQuantity,
    inboundQuantity: input.inboundQuantity,
    reservedQuantity: input.reservedQuantity,
    marketplaceId: input.marketplaceId,
    lastUpdated: new Date().toISOString(),
  });
}

export function getFbaOrdersToday(): FBAOrderRow[] {
  const db = getDb();
  // Compare both sides in the server's local timezone so Phoenix-evening
  // orders aren't misclassified as "tomorrow" (UTC).
  return db
    .prepare(
      `SELECT * FROM fba_orders
       WHERE DATE(purchase_date, 'localtime') = DATE('now', 'localtime')
       ORDER BY purchase_date DESC`
    )
    .all() as FBAOrderRow[];
}

export function getFbaInventoryRows(): FBAInventoryRow[] {
  const db = getDb();
  return db.prepare(`SELECT * FROM fba_inventory`).all() as FBAInventoryRow[];
}

export interface FBAMetricRow {
  period_key: string;
  order_count: number;
  unit_count: number;
  total_sales: number;
  currency: string | null;
  last_updated: string;
}

export function upsertFbaMetric(input: {
  periodKey: string;
  orderCount: number;
  unitCount: number;
  totalSales: number;
  currency: string | null;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO fba_metrics (period_key, order_count, unit_count, total_sales, currency, last_updated)
     VALUES (@periodKey, @orderCount, @unitCount, @totalSales, @currency, @lastUpdated)
     ON CONFLICT(period_key) DO UPDATE SET
       order_count = excluded.order_count,
       unit_count = excluded.unit_count,
       total_sales = excluded.total_sales,
       currency = excluded.currency,
       last_updated = excluded.last_updated`
  ).run({
    periodKey: input.periodKey,
    orderCount: input.orderCount,
    unitCount: input.unitCount,
    totalSales: input.totalSales,
    currency: input.currency,
    lastUpdated: new Date().toISOString(),
  });
}

export function getFbaMetric(periodKey: string): FBAMetricRow | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM fba_metrics WHERE period_key = ?`)
    .get(periodKey) as FBAMetricRow | undefined;
  return row ?? null;
}

// ---------- Social stats ----------
export interface SocialStatRow {
  platform: string;
  followers: number;
  content_count: number;
  total_views: number;
  last_updated: string;
}

export function upsertSocialStat(input: {
  platform: string;
  followers: number;
  contentCount?: number;
  totalViews?: number;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO social_stats (platform, followers, content_count, total_views, last_updated)
     VALUES (@platform, @followers, @contentCount, @totalViews, @lastUpdated)
     ON CONFLICT(platform) DO UPDATE SET
       followers = excluded.followers,
       content_count = excluded.content_count,
       total_views = excluded.total_views,
       last_updated = excluded.last_updated`
  ).run({
    platform: input.platform,
    followers: input.followers,
    contentCount: input.contentCount ?? 0,
    totalViews: input.totalViews ?? 0,
    lastUpdated: new Date().toISOString(),
  });
}

export function getSocialStat(platform: string): SocialStatRow | null {
  const db = getDb();
  return (
    (db
      .prepare(`SELECT * FROM social_stats WHERE platform = ?`)
      .get(platform) as SocialStatRow | undefined) ?? null
  );
}
