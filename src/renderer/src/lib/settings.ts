// Settings TYPE definitions for the renderer.
//
// The runtime settings logic (load/save/mask, fs access) lives in the main
// process at src/main/lib/settings.ts. The renderer only needs the shapes so
// the Settings page can type the JSON it fetches/sends over IPC. Keep these in
// sync with the main-process copy.

export interface ThemeColors {
  primaryColor: string;
  primaryHover: string;
  primarySoft: string;
  darkColor: string;
  lightColor: string;
  paperColor: string;
}

export interface ThemePreset extends ThemeColors {
  name: string;
  builtIn?: boolean;
}

export interface ThemeSettings extends ThemeColors {
  activePreset: string;
  presets: ThemePreset[];
}

export interface AppSettings {
  shipstation: {
    apiKey: string;
    apiSecret: string;
    pollIntervalSeconds: number;
    forceRefreshIntervalMinutes: number;
    enabled: boolean;
  };
  amazonSpApi: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    sellerId: string;
    marketplaceId: string;
    pollIntervalMinutes: number;
    enabled: boolean;
    useSandbox: boolean;
    fbmEnabled: boolean;
  };
  etsy: {
    keystring: string;
    sharedSecret: string;
    shopId: string;
    shopName: string;
    accessToken: string;
    refreshToken: string;
    tokenExpiresAt: number;
    pollIntervalSeconds: number;
    enabled: boolean;
  };
  shopify: {
    storeDomain: string;
    adminAccessToken: string;
    clientId: string;
    clientSecret: string;
    pollIntervalSeconds: number;
    enabled: boolean;
  };
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
  print: {
    autoPrintEnabled: boolean;
    printerName: string;
    labelSize: string;
  };
  general: {
    useMockData: boolean;
    timezone: string;
    productionLeadTimeDays: number;
    celebrateNewOrders: boolean;
    celebrateNewFollowers: boolean;
    dailySalesGoal: number;
  };
  theme: ThemeSettings;
  googleDrivePath: string;
  googleDriveSyncedAt: string;
}
