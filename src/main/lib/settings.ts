// Server-side settings persistence.
// Settings are stored as JSON at /data/settings.json (gitignored).
// API keys live here so the user never has to touch .env manually.

import fs from "node:fs";
import path from "node:path";
import { app } from "electron";

/**
 * Six brand colors that drive the whole dashboard. These are injected at runtime
 * as CSS custom properties on :root (see layout.tsx), overriding the fallback
 * defaults baked into globals.css. Field names map to vars like so:
 *   primaryColor → --dl-primary       darkColor  → --dl-dark
 *   primaryHover → --dl-primary-hover  lightColor → --dl-light
 *   primarySoft  → --dl-primary-soft   paperColor → --dl-paper
 */
export interface ThemeColors {
  primaryColor: string;
  primaryHover: string;
  primarySoft: string;
  darkColor: string;
  lightColor: string;
  paperColor: string;
}

/** A saved, named set of theme colors. Built-in presets are not user-deletable. */
export interface ThemePreset extends ThemeColors {
  name: string;
  builtIn?: boolean;
}

export interface ThemeSettings extends ThemeColors {
  /** Name of the preset currently applied (matches a preset's `name`). */
  activePreset: string;
  /** Built-in + user-saved presets. Built-ins are always re-injected on load. */
  presets: ThemePreset[];
}

export interface AppSettings {
  // ShipStation
  shipstation: {
    apiKey: string;
    apiSecret: string;
    pollIntervalSeconds: number;
    /**
     * How often (minutes) to ask ShipStation to refresh each connected store
     * from its source channel (Shopify, Amazon, Etsy, etc.). 0 = never auto-refresh.
     * The "Refresh" button always fires this once, regardless of cadence.
     */
    forceRefreshIntervalMinutes: number;
    enabled: boolean;
  };
  // Amazon Selling Partner API (FBA orders + inventory)
  amazonSpApi: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    sellerId: string;
    marketplaceId: string;
    pollIntervalMinutes: number;
    enabled: boolean;
    /** Use Amazon's sandbox endpoint (returns dummy data) instead of production. */
    useSandbox: boolean;
    /** Pull merchant-fulfilled (FBM) orders directly from SP-API instead of via ShipStation. */
    fbmEnabled: boolean;
  };
  // Etsy Open API v3 (orders + listings)
  etsy: {
    keystring: string; // App API key (acts as client_id)
    sharedSecret: string;
    shopId: string;
    shopName: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number; // unix seconds
    pollIntervalSeconds: number;
    enabled: boolean;
  };
  // Shopify Admin API (KPI widgets)
  shopify: {
    storeDomain: string;
    adminAccessToken: string;
    /** OAuth client ID (from the Shopify Partner Dashboard app). */
    clientId: string;
    /** OAuth client secret (from the Shopify Partner Dashboard app). */
    clientSecret: string;
    pollIntervalSeconds: number;
    enabled: boolean;
  };
  // Social media follower counters
  social: {
    youtube: {
      enabled: boolean;
      apiKey: string;
      channelId: string;
      handle: string;
      pollIntervalMinutes: number;
    };
    facebook: {
      enabled: boolean;
      pageId: string;
      pageAccessToken: string;
      handle: string;
      pollIntervalMinutes: number;
    };
    instagram: {
      enabled: boolean;
      handle: string;
      instagramBusinessAccountId: string;
      accessToken: string;
      followers: number;
      pollIntervalMinutes: number;
    };
    tiktok: {
      enabled: boolean;
      handle: string;
      followers: number;
    };
  };
  // Print engine
  print: {
    autoPrintEnabled: boolean;
    printerName: string; // CUPS printer queue name
    labelSize: string;   // e.g. "4x6"
  };
  // Dev / general
  general: {
    useMockData: boolean;
    timezone: string;
    /**
     * Production lead time in calendar days. Used to compute the *effective*
     * ship-by date for each order (created_at + leadTime), since most channels
     * don't pass a real ship-by and default it to the order date.
     */
    productionLeadTimeDays: number;
    /** Play a ka-ching sound + confetti when a new order arrives. */
    celebrateNewOrders: boolean;
    /** Play a sound + confetti when follower/subscriber count goes up. */
    celebrateNewFollowers: boolean;
    /** Daily gross sales goal (USD). 0 hides the progress bar. Monthly goal is auto-derived (daily × days in month). */
    dailySalesGoal: number;
  };
  // Appearance / brand theming
  theme: ThemeSettings;
  /** Folder in Google Drive (or any synced folder) that holds dashlab-config.json. */
  googleDrivePath: string;
  /** ISO timestamp of the last successful Google Drive config load. */
  googleDriveSyncedAt: string;
}

// Built-in presets. These ship with the app, are always present (loadSettings
// re-injects them), and cannot be deleted from the UI. Neat Tools is the default.
export const BUILTIN_THEME_PRESETS: ThemePreset[] = [
  {
    name: "Neat Tools",
    primaryColor: "#EC6B23",
    primaryHover: "#D45C1C",
    primarySoft: "#FCE5D3",
    darkColor: "#2F2F2F",
    lightColor: "#E6E3E0",
    paperColor: "#FAFAF8",
    builtIn: true,
  },
  {
    name: "Yes Dental Parts",
    primaryColor: "#1565C0",
    primaryHover: "#0D47A1",
    primarySoft: "#E3F2FD",
    darkColor: "#1A1A2E",
    lightColor: "#E8EAF6",
    paperColor: "#F8F9FF",
    builtIn: true,
  },
];

const DEFAULT_THEME_PRESET = BUILTIN_THEME_PRESETS[0];

/**
 * Ensures both built-in presets are always present (with their canonical colors)
 * and de-dupes by name, appending any user-saved presets after the built-ins.
 * Built-ins can't be removed or shadowed, so the UI's "not user-deletable" rule
 * survives even a hand-edited settings.json.
 */
export function reconcileThemePresets(saved?: ThemePreset[]): ThemePreset[] {
  const builtinNames = new Set(BUILTIN_THEME_PRESETS.map((p) => p.name));
  const userPresets = (saved ?? []).filter(
    (p) => p && p.name && !builtinNames.has(p.name) && !p.builtIn
  );
  return [...BUILTIN_THEME_PRESETS, ...userPresets];
}

/** The six colors currently applied — used by /api/theme and the layout injector. */
export function activeThemeColors(settings: AppSettings): ThemeColors {
  const t = settings.theme;
  return {
    primaryColor: t.primaryColor,
    primaryHover: t.primaryHover,
    primarySoft: t.primarySoft,
    darkColor: t.darkColor,
    lightColor: t.lightColor,
    paperColor: t.paperColor,
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  shipstation: {
    apiKey: "",
    apiSecret: "",
    pollIntervalSeconds: 10,
    forceRefreshIntervalMinutes: 15,
    enabled: false,
  },
  amazonSpApi: {
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    sellerId: "",
    marketplaceId: "ATVPDKIKX0DER", // US default
    pollIntervalMinutes: 2,
    enabled: false,
    useSandbox: true,
    fbmEnabled: false,
  },
  etsy: {
    keystring: "",
    sharedSecret: "",
    shopId: "",
    shopName: "",
    accessToken: "",
    refreshToken: "",
    tokenExpiresAt: 0,
    pollIntervalSeconds: 60,
    enabled: false,
  },
  shopify: {
    storeDomain: "",
    adminAccessToken: "",
    clientId: "",
    clientSecret: "",
    pollIntervalSeconds: 30,
    enabled: false,
  },
  social: {
    youtube: {
      enabled: false,
      apiKey: "",
      channelId: "",
      handle: "",
      pollIntervalMinutes: 2,
    },
    facebook: {
      enabled: false,
      pageId: "",
      pageAccessToken: "",
      handle: "",
      pollIntervalMinutes: 2,
    },
    instagram: {
      enabled: false,
      handle: "",
      instagramBusinessAccountId: "",
      accessToken: "",
      followers: 0,
      pollIntervalMinutes: 2,
    },
    tiktok: { enabled: false, handle: "", followers: 0 },
  },
  print: {
    autoPrintEnabled: false,
    printerName: "",
    labelSize: "4x6",
  },
  general: {
    useMockData: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    productionLeadTimeDays: 3,
    celebrateNewOrders: true,
    celebrateNewFollowers: true,
    dailySalesGoal: 1000,
  },
  theme: {
    // Active colors default to the Neat Tools preset, so nothing looks different
    // until someone picks another preset or edits the colors.
    primaryColor: DEFAULT_THEME_PRESET.primaryColor,
    primaryHover: DEFAULT_THEME_PRESET.primaryHover,
    primarySoft: DEFAULT_THEME_PRESET.primarySoft,
    darkColor: DEFAULT_THEME_PRESET.darkColor,
    lightColor: DEFAULT_THEME_PRESET.lightColor,
    paperColor: DEFAULT_THEME_PRESET.paperColor,
    activePreset: DEFAULT_THEME_PRESET.name,
    presets: BUILTIN_THEME_PRESETS,
  },
  googleDrivePath: "",
  googleDriveSyncedAt: "",
};

// Settings live in Electron's per-user data directory (resolved at runtime so
// `app` is ready), alongside the SQLite DB — survives updates, no cwd assumptions.
function dataDir(): string {
  return app.getPath("userData");
}
function settingsPath(): string {
  return path.join(dataDir(), "settings.json");
}

function ensureDataDir() {
  const dir = dataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function loadSettings(): AppSettings {
  try {
    ensureDataDir();
    const SETTINGS_PATH = settingsPath();
    if (!fs.existsSync(SETTINGS_PATH)) {
      return DEFAULT_SETTINGS;
    }
    const raw = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    // Deep-merge with defaults so newly added fields aren't undefined
    return {
      shipstation: { ...DEFAULT_SETTINGS.shipstation, ...parsed.shipstation },
      amazonSpApi: { ...DEFAULT_SETTINGS.amazonSpApi, ...parsed.amazonSpApi },
      etsy: { ...DEFAULT_SETTINGS.etsy, ...parsed.etsy },
      shopify: { ...DEFAULT_SETTINGS.shopify, ...parsed.shopify },
      social: {
        youtube: {
          ...DEFAULT_SETTINGS.social.youtube,
          ...(parsed.social?.youtube ?? {}),
        },
        facebook: {
          ...DEFAULT_SETTINGS.social.facebook,
          ...(parsed.social?.facebook ?? {}),
        },
        instagram: {
          ...DEFAULT_SETTINGS.social.instagram,
          ...(parsed.social?.instagram ?? {}),
        },
        tiktok: {
          ...DEFAULT_SETTINGS.social.tiktok,
          ...(parsed.social?.tiktok ?? {}),
        },
      },
      print: { ...DEFAULT_SETTINGS.print, ...parsed.print },
      general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
      theme: {
        ...DEFAULT_SETTINGS.theme,
        ...parsed.theme,
        // Built-ins are always re-injected so they can't be lost or deleted.
        presets: reconcileThemePresets(parsed.theme?.presets),
      },
      googleDrivePath: parsed.googleDrivePath ?? DEFAULT_SETTINGS.googleDrivePath,
      googleDriveSyncedAt:
        parsed.googleDriveSyncedAt ?? DEFAULT_SETTINGS.googleDriveSyncedAt,
    };
  } catch (err) {
    console.error("Failed to load settings, returning defaults:", err);
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  ensureDataDir();
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Settings sent to the client should never include raw secrets.
 * Masks anything sensitive so the dashboard form can show "saved" state
 * without leaking secrets in the page source.
 */
export function maskSettingsForClient(settings: AppSettings): AppSettings {
  const mask = (s: string) => (s ? "•".repeat(Math.min(s.length, 16)) : "");
  return {
    ...settings,
    shipstation: {
      ...settings.shipstation,
      apiSecret: mask(settings.shipstation.apiSecret),
    },
    amazonSpApi: {
      ...settings.amazonSpApi,
      clientSecret: mask(settings.amazonSpApi.clientSecret),
      refreshToken: mask(settings.amazonSpApi.refreshToken),
    },
    shopify: {
      ...settings.shopify,
      adminAccessToken: mask(settings.shopify.adminAccessToken),
      clientSecret: mask(settings.shopify.clientSecret),
    },
    etsy: {
      ...settings.etsy,
      sharedSecret: mask(settings.etsy.sharedSecret),
      accessToken: mask(settings.etsy.accessToken),
      refreshToken: mask(settings.etsy.refreshToken),
    },
    social: {
      ...settings.social,
      youtube: {
        ...settings.social.youtube,
        apiKey: mask(settings.social.youtube.apiKey),
      },
      facebook: {
        ...settings.social.facebook,
        pageAccessToken: mask(settings.social.facebook.pageAccessToken),
      },
      instagram: {
        ...settings.social.instagram,
        accessToken: mask(settings.social.instagram.accessToken),
      },
    },
  };
}
