// IPC bridge — the Electron main-process replacement for the old Next.js
// /api/* route handlers. Every channel is named `api:resource:action` and
// matches exactly what the renderer's fetch shim generates from a `/api/...`
// URL + HTTP method (see src/renderer/src/main.tsx), so existing components
// that call `fetch('/api/...')` keep working unchanged.
//
// Each handler returns a plain JSON-serializable value; the shim wraps it in a
// Response. Throwing rejects the invoke() promise and the shim turns it into a
// 500 { error }.

import { ipcMain, shell } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  loadSettings,
  saveSettings,
  maskSettingsForClient,
  reconcileThemePresets,
  activeThemeColors,
  type AppSettings,
} from "./lib/settings";
import {
  getDb,
  getLatestSyncLog,
  getLastSuccessfulSyncAt,
  getOrdersForToday,
  getLatestNonCancelledOrder,
  getSocialStat,
  markOrdersSlipPrinted,
} from "./lib/db";
import { clearAccessTokenCache, testSpApiConnection } from "./lib/amazon-sp-api";
import { testYouTubeConnection } from "./lib/youtube-api";
import { testFacebookConnection, testInstagramConnection } from "./lib/meta-api";
import { refreshAllShipstationStores } from "./lib/shipstation";
import { computeDashboard, computeTv, computeOrdersPage, type DashboardParams } from "./dashboard";

import {
  pollShipStationNow,
  startShipStationPoller,
} from "./jobs/poll-shipstation";
import { pollAmazonFbaNow, startAmazonFbaPoller } from "./jobs/poll-amazon-fba";
import { pollAmazonFbmNow, startAmazonFbmPoller } from "./jobs/poll-amazon-fbm";
import { pollShopifyNow, startShopifyPoller } from "./jobs/poll-shopify";
import { pollEtsyNow, startEtsyPoller } from "./jobs/poll-etsy";
import { pollYouTubeNow, startYouTubePoller } from "./jobs/poll-youtube";
import { pollMetaNow, startMetaPoller } from "./jobs/poll-meta";

/**
 * Merge an incoming (possibly partial, possibly masked) settings object into the
 * saved settings and persist. Ported verbatim from the old PUT /api/settings
 * handler — masked secrets (•••) are preserved, presets reconciled, and the
 * Amazon token cache is invalidated so the next call uses fresh creds.
 * Returns the masked, saved settings.
 */
function mergeAndSaveSettings(incoming: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  // If the client sends a masked value (only •), keep the existing secret.
  const mergeSecret = (incomingVal: string | undefined, currentVal: string) =>
    !incomingVal || /^•+$/.test(incomingVal) ? currentVal : incomingVal;

  const merged: AppSettings = {
    shipstation: {
      ...current.shipstation,
      ...incoming.shipstation,
      apiSecret: mergeSecret(
        incoming.shipstation?.apiSecret,
        current.shipstation.apiSecret
      ),
    },
    amazonSpApi: {
      ...current.amazonSpApi,
      ...incoming.amazonSpApi,
      clientSecret: mergeSecret(
        incoming.amazonSpApi?.clientSecret,
        current.amazonSpApi.clientSecret
      ),
      refreshToken: mergeSecret(
        incoming.amazonSpApi?.refreshToken,
        current.amazonSpApi.refreshToken
      ),
    },
    shopify: {
      ...current.shopify,
      ...incoming.shopify,
      adminAccessToken: mergeSecret(
        incoming.shopify?.adminAccessToken,
        current.shopify.adminAccessToken
      ),
      clientSecret: mergeSecret(
        incoming.shopify?.clientSecret,
        current.shopify.clientSecret
      ),
    },
    etsy: {
      ...current.etsy,
      ...incoming.etsy,
      sharedSecret: mergeSecret(
        incoming.etsy?.sharedSecret,
        current.etsy.sharedSecret
      ),
      accessToken: mergeSecret(
        incoming.etsy?.accessToken,
        current.etsy.accessToken
      ),
      refreshToken: mergeSecret(
        incoming.etsy?.refreshToken,
        current.etsy.refreshToken
      ),
    },
    social: {
      youtube: {
        ...current.social.youtube,
        ...incoming.social?.youtube,
        apiKey: mergeSecret(
          incoming.social?.youtube?.apiKey,
          current.social.youtube.apiKey
        ),
      },
      facebook: {
        ...current.social.facebook,
        ...incoming.social?.facebook,
        pageAccessToken: mergeSecret(
          incoming.social?.facebook?.pageAccessToken,
          current.social.facebook.pageAccessToken
        ),
      },
      instagram: {
        ...current.social.instagram,
        ...incoming.social?.instagram,
        accessToken: mergeSecret(
          incoming.social?.instagram?.accessToken,
          current.social.instagram.accessToken
        ),
      },
      tiktok: {
        ...current.social.tiktok,
        ...incoming.social?.tiktok,
      },
    },
    print: { ...current.print, ...incoming.print },
    general: { ...current.general, ...incoming.general },
    theme: {
      ...current.theme,
      ...incoming.theme,
      presets: reconcileThemePresets(
        incoming.theme?.presets ?? current.theme.presets
      ),
    },
    googleDrivePath: incoming.googleDrivePath ?? current.googleDrivePath,
    googleDriveSyncedAt:
      incoming.googleDriveSyncedAt ?? current.googleDriveSyncedAt,
  };

  saveSettings(merged);
  clearAccessTokenCache();
  // If a Google Drive folder is configured, mirror the full config out to it so
  // other machines pick it up on their next launch.
  writeConfigToDrive(merged);
  return merged;
}

/** Write the full settings as dashlab-config.json into the configured Drive folder. */
function writeConfigToDrive(settings: AppSettings): void {
  if (!settings.googleDrivePath) return;
  try {
    if (!fs.existsSync(settings.googleDrivePath)) return;
    const configPath = path.join(settings.googleDrivePath, "dashlab-config.json");
    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), "utf-8");
  } catch (err) {
    console.error("[config-sync] failed to write to Google Drive folder:", err);
  }
}

/** Test a single integration's saved credentials. Ported from /api/settings/test. */
async function testConnection(service: string): Promise<{
  ok: boolean;
  message?: string;
  error?: string;
}> {
  const settings = loadSettings();

  if (service === "shipstation") {
    const { apiKey, apiSecret } = settings.shipstation;
    if (!apiKey || !apiSecret) {
      return { ok: false, error: "Missing ShipStation API key or secret." };
    }
    try {
      const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
      const res = await fetch("https://ssapi.shipstation.com/stores", {
        headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      });
      if (!res.ok) {
        return {
          ok: false,
          error: `ShipStation responded ${res.status}: ${res.statusText}`,
        };
      }
      const stores = (await res.json()) as Array<{ storeName: string }>;
      pollShipStationNow().catch((err) =>
        console.error("[settings/test] immediate poll failed:", err)
      );
      return {
        ok: true,
        message: `Connected. Found ${stores.length} store${stores.length === 1 ? "" : "s"}: ${stores.map((s) => s.storeName).join(", ")}`,
      };
    } catch (err) {
      return { ok: false, error: `Network error: ${(err as Error).message}` };
    }
  }

  if (service === "amazon") {
    const result = await testSpApiConnection();
    if (result.ok) {
      pollAmazonFbaNow().catch((err) =>
        console.error("[settings/test] immediate FBA poll failed:", err)
      );
    }
    return result;
  }

  if (service === "youtube") {
    const result = await testYouTubeConnection();
    if (result.ok) {
      pollYouTubeNow().catch((err) =>
        console.error("[settings/test] yt poll failed:", err)
      );
    }
    return result;
  }

  if (service === "facebook") {
    const result = await testFacebookConnection();
    if (result.ok) {
      pollMetaNow().catch((err) =>
        console.error("[settings/test] meta poll failed:", err)
      );
    }
    return result;
  }

  if (service === "instagram") {
    const result = await testInstagramConnection();
    if (result.ok) {
      pollMetaNow().catch((err) =>
        console.error("[settings/test] meta poll failed:", err)
      );
    }
    return result;
  }

  return { ok: false, error: `Unknown service: ${service}` };
}

const SHOPIFY_SCOPES = [
  "read_orders",
  "read_products",
  "read_customers",
  "read_inventory",
  "read_locations",
].join(",");

const ETSY_SCOPES = ["transactions_r", "listings_r", "profile_r", "shops_r"].join(
  " "
);

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Register every IPC handler. Called once from the main process after the app
 * is ready (and after the DB is opened / pollers started).
 */
export function registerIpcHandlers(): void {
  // ---- settings ----
  ipcMain.handle("api:settings:get", async () =>
    maskSettingsForClient(loadSettings())
  );

  ipcMain.handle("api:settings:put", async (_e, body: Partial<AppSettings>) => {
    const merged = mergeAndSaveSettings(body ?? {});
    return { ok: true, settings: maskSettingsForClient(merged) };
  });

  ipcMain.handle("api:settings:test:post", async (_e, body: { service?: string }) =>
    testConnection(body?.service ?? "")
  );

  // ---- config (full backup / import) ----
  ipcMain.handle("api:config:get", async () => loadSettings());

  ipcMain.handle("api:config:post", async (_e, incoming: Partial<AppSettings>) => {
    if (
      !incoming ||
      typeof incoming !== "object" ||
      (!("shipstation" in incoming) && !("shopify" in incoming))
    ) {
      throw new Error(
        "This doesn't look like a DashLab config (missing shipstation/shopify keys)."
      );
    }
    mergeAndSaveSettings(incoming);
    return { success: true };
  });

  // ---- theme ----
  ipcMain.handle("api:theme:get", async () => activeThemeColors(loadSettings()));

  // ---- aggregated dashboard + TV analytics ----
  // POST so the {date, compare} params ride through the fetch shim's body.
  ipcMain.handle("api:dashboard:post", async (_e, body: DashboardParams) =>
    computeDashboard(body ?? {})
  );
  ipcMain.handle("api:tv:get", async () => computeTv());
  ipcMain.handle("api:orders-page:get", async () => computeOrdersPage());

  // ---- orders ----
  ipcMain.handle("api:orders:get", async () => ({
    orders: getOrdersForToday(),
    sync: getLatestSyncLog("shipstation"),
  }));

  ipcMain.handle("api:orders:latest:get", async () => {
    const row = getLatestNonCancelledOrder();
    if (!row) return { order: null };
    const sales =
      (row.order_total ?? 0) - (row.shipping_amount ?? 0) - (row.tax_amount ?? 0);
    return {
      order: {
        id: row.id,
        orderNumber: row.order_number,
        customerName: row.customer_name,
        channel: row.channel,
        storeName: row.store_name,
        sales,
        totalItems: row.total_items,
        createdAt: row.created_at,
      },
    };
  });

  // ---- sync ----
  ipcMain.handle("api:sync:status:get", async () => {
    const s = loadSettings();
    const mock = s.general.useMockData;
    return {
      shipstation: getLatestSyncLog("shipstation"),
      amazon: getLatestSyncLog("amazon_fba"),
      amazon_fbm: getLatestSyncLog("amazon_fbm"),
      shopify: getLatestSyncLog("shopify"),
      etsy: getLatestSyncLog("etsy"),
      youtube: getLatestSyncLog("youtube"),
      meta: getLatestSyncLog("meta"),
      lastSuccessful: {
        shipstation: getLastSuccessfulSyncAt("shipstation"),
        shopify: getLastSuccessfulSyncAt("shopify"),
        amazon_fba: getLastSuccessfulSyncAt("amazon_fba"),
        amazon_fbm: getLastSuccessfulSyncAt("amazon_fbm"),
        etsy: getLastSuccessfulSyncAt("etsy"),
        youtube: getLastSuccessfulSyncAt("youtube"),
        meta: getLastSuccessfulSyncAt("meta"),
      },
      enabled: {
        shipstation: !mock && s.shipstation.enabled,
        shopify: !mock && s.shopify.enabled,
        amazon_fba: !mock && s.amazonSpApi.enabled,
        amazon_fbm: !mock && s.amazonSpApi.enabled && s.amazonSpApi.fbmEnabled,
        etsy: !mock && s.etsy.enabled,
        youtube: !mock && s.social.youtube.enabled,
        meta: !mock && (s.social.facebook.enabled || s.social.instagram.enabled),
      },
    };
  });

  ipcMain.handle("api:sync:now:post", async () => {
    const settings = loadSettings();
    let shipstationRefresh: unknown = { skipped: "shipstation disabled" };
    if (settings.shipstation.enabled && settings.shipstation.apiKey) {
      try {
        shipstationRefresh = await refreshAllShipstationStores();
      } catch (err) {
        shipstationRefresh = { error: (err as Error).message };
      }
    }
    const results = await Promise.allSettled([
      pollShipStationNow(),
      pollAmazonFbaNow(),
      pollAmazonFbmNow(),
      pollShopifyNow(),
      pollEtsyNow(),
      pollYouTubeNow(),
      pollMetaNow(),
    ]);
    const val = (i: number) => {
      const r = results[i];
      return r.status === "fulfilled"
        ? r.value
        : { error: (r.reason as Error).message };
    };
    return {
      shipstation_store_refresh: shipstationRefresh,
      shipstation: val(0),
      amazon: val(1),
      amazon_fbm: val(2),
      shopify: val(3),
      etsy: val(4),
      youtube: val(5),
      meta: val(6),
    };
  });

  // ---- social ----
  ipcMain.handle("api:social:current:get", async () => ({
    youtube: getSocialStat("youtube")?.followers ?? null,
    facebook: getSocialStat("facebook")?.followers ?? null,
    instagram: getSocialStat("instagram")?.followers ?? null,
  }));

  // ---- print ----
  ipcMain.handle("api:print:mark-printed:post", async (_e, body: { orderIds?: unknown }) => {
    const orderIds = Array.isArray(body?.orderIds)
      ? body.orderIds.filter((id): id is string => typeof id === "string")
      : [];
    if (orderIds.length === 0) {
      return { ok: false, error: "orderIds must be a non-empty string array", updated: 0 };
    }
    return { ok: true, updated: markOrdersSlipPrinted(orderIds) };
  });

  // CUPS printer enumeration was removed; Settings falls back to a text field.
  ipcMain.handle("api:print:list-printers:get", async () => ({ printers: [] }));

  // Decommissioned CUPS/Puppeteer print endpoints — kept so stale callers get a
  // clear message instead of a missing-handler crash. The fetch shim collapses
  // the dynamic [orderNumber] segment, so `/api/print/<n>` → `api:print::post`.
  const decommissionedPrint = async () => ({
    ok: false,
    error: "Direct/CUPS printing was removed. Use Print All Slips on the Orders page.",
  });
  ipcMain.handle("api:print:batch:post", decommissionedPrint);
  ipcMain.handle("api:print::post", decommissionedPrint);

  // ---- debug ----
  ipcMain.handle("api:debug:fba-metrics:get", async () => {
    const db = getDb();
    return {
      fba_metrics: db.prepare(`SELECT * FROM fba_metrics`).all(),
      fba_orders_summary: db
        .prepare(
          `SELECT COUNT(*) as count, MIN(purchase_date) as oldest, MAX(purchase_date) as newest FROM fba_orders`
        )
        .get(),
    };
  });

  // ---- OAuth (Shopify / Etsy) ----
  // NOTE: the old flow relied on browser redirects + cookies back to
  // localhost:3000/api/*/callback. In the server-less desktop model the install
  // handlers return the authorize URL and open it in the system browser; the
  // callback handlers do the token exchange given params. Wiring the redirect
  // back into the app (custom protocol / loopback BrowserWindow) is Phase 3+.
  ipcMain.handle("api:shopify:install:get", async (_e, body: { shop?: string }) => {
    const settings = loadSettings();
    const shop = body?.shop || settings.shopify.storeDomain;
    if (!shop) {
      return { error: "No shop domain. Set it in Settings → Shopify first." };
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop)) {
      return { error: `Invalid shop domain: ${shop}` };
    }
    if (!settings.shopify.clientId) {
      return { error: "Missing Client ID — paste it into Settings → Shopify and save first." };
    }
    const state = crypto.randomBytes(16).toString("hex");
    const authorize = new URL(`https://${shop}/admin/oauth/authorize`);
    authorize.searchParams.set("client_id", settings.shopify.clientId);
    authorize.searchParams.set("scope", SHOPIFY_SCOPES);
    authorize.searchParams.set("redirect_uri", "dashlab://shopify/callback");
    authorize.searchParams.set("state", state);
    const url = authorize.toString();
    shell.openExternal(url).catch(() => {});
    return { url, state };
  });

  ipcMain.handle("api:etsy:install:get", async () => {
    const settings = loadSettings();
    if (!settings.etsy.keystring) {
      return { error: "Missing Etsy Keystring (API key). Set it in Settings → Etsy first." };
    }
    const codeVerifier = base64UrlEncode(crypto.randomBytes(64));
    const codeChallenge = base64UrlEncode(
      crypto.createHash("sha256").update(codeVerifier).digest()
    );
    const state = base64UrlEncode(crypto.randomBytes(16));
    const authorize = new URL("https://www.etsy.com/oauth/connect");
    authorize.searchParams.set("response_type", "code");
    authorize.searchParams.set("client_id", settings.etsy.keystring);
    authorize.searchParams.set("redirect_uri", "dashlab://etsy/callback");
    authorize.searchParams.set("scope", ETSY_SCOPES);
    authorize.searchParams.set("state", state);
    authorize.searchParams.set("code_challenge", codeChallenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    const url = authorize.toString();
    shell.openExternal(url).catch(() => {});
    // Caller must hold onto codeVerifier + state to complete the exchange.
    return { url, state, codeVerifier };
  });
}

/** Start every background poller. Mirrors the old lib/server-init.ts. */
export function startPollers(): void {
  startShipStationPoller();
  startAmazonFbaPoller();
  startAmazonFbmPoller();
  startShopifyPoller();
  startEtsyPoller();
  startYouTubePoller();
  startMetaPoller();
}
