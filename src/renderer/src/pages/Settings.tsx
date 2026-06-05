
import { useEffect, useRef, useState } from "react";
import {
  Card,
  Page,
  Layout,
  TextField,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Banner,
  Checkbox,
  Divider,
  Box,
  Select,
  Tabs,
} from "@shopify/polaris";
import {
  AMAZON_MARKETPLACES,
  type AppSettings,
  type ThemeColors,
  type ThemePreset,
} from "../lib/settings";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

/** A hex text field paired with a native color-picker swatch, kept in sync. */
function ColorField({
  label,
  value,
  onChange,
  helpText,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  helpText?: string;
}) {
  return (
    <InlineStack gap="300" blockAlign="center" wrap={false}>
      <input
        type="color"
        value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000"}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        aria-label={`${label} color picker`}
        style={{
          width: 42,
          height: 42,
          minWidth: 42,
          border: "1px solid #c9c9c9",
          borderRadius: 6,
          padding: 2,
          cursor: "pointer",
          background: "#fff",
        }}
      />
      <div style={{ flex: 1 }}>
        <TextField
          label={label}
          value={value}
          onChange={onChange}
          autoComplete="off"
          helpText={helpText}
          maxLength={7}
        />
      </div>
    </InlineStack>
  );
}

// Maps each ThemeColors field to a human label for the Appearance form.
const THEME_FIELDS: { key: keyof ThemeColors; label: string; help: string }[] = [
  { key: "primaryColor", label: "Primary", help: "Buttons, links, accents (--dl-primary)." },
  { key: "primaryHover", label: "Primary hover", help: "Darker primary for hover states (--dl-primary-hover)." },
  { key: "primarySoft", label: "Primary soft", help: "Tinted background for highlight bands (--dl-primary-soft)." },
  { key: "darkColor", label: "Dark", help: "Headings + top bar (--dl-dark)." },
  { key: "lightColor", label: "Light", help: "Borders + subtle fills (--dl-light)." },
  { key: "paperColor", label: "Paper", help: "Page background (--dl-paper)." },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Config Sync (Google Drive) — local edit buffer for the folder path.
  const [drivePath, setDrivePath] = useState("");
  const [driveSaving, setDriveSaving] = useState(false);
  const [shipstationTest, setShipstationTest] = useState<TestState>({
    status: "idle",
  });
  const [amazonTest, setAmazonTest] = useState<TestState>({ status: "idle" });
  const [youtubeTest, setYoutubeTest] = useState<TestState>({ status: "idle" });
  const [facebookTest, setFacebookTest] = useState<TestState>({ status: "idle" });
  const [instagramTest, setInstagramTest] = useState<TestState>({ status: "idle" });
  const [installedPrinters, setInstalledPrinters] = useState<string[]>([]);
  const [tabIndex, setTabIndex] = useState(0);
  const [newPresetName, setNewPresetName] = useState("");
  const [configStatus, setConfigStatus] = useState<TestState>({ status: "idle" });
  const importInputRef = useRef<HTMLInputElement>(null);

  const tabs = [
    { id: "general", content: "General", panelID: "general-panel" },
    { id: "sales", content: "Sales Channels", panelID: "sales-panel" },
    { id: "social", content: "Social Media", panelID: "social-panel" },
    { id: "print", content: "Print Engine", panelID: "print-panel" },
    { id: "appearance", content: "Appearance", panelID: "appearance-panel" },
    { id: "config", content: "Config", panelID: "config-panel" },
    { id: "configsync", content: "Config Sync", panelID: "configsync-panel" },
  ];

  function reloadSettings() {
    setLoading(true);
    return fetch("/api/settings")
      .then((r) => r.json())
      .then((data: AppSettings) => {
        setSettings(data);
        setDrivePath(data.googleDrivePath ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  async function browseDriveFolder() {
    const picked = (await window.electron.invoke("dialog:open-folder")) as
      | string
      | null;
    if (picked) setDrivePath(picked);
  }

  async function saveDrivePath() {
    setDriveSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ googleDrivePath: drivePath }),
      });
      const result = await res.json();
      if (result?.settings) setSettings(result.settings as AppSettings);
    } finally {
      setDriveSaving(false);
    }
  }

  useEffect(() => {
    reloadSettings();
    fetch("/api/print/list-printers")
      .then((r) => r.json())
      .then((data: { printers: string[] }) => {
        setInstalledPrinters(data.printers ?? []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only the object-valued sections are editable via `update` (string-valued
  // top-level keys like googleDrivePath are handled separately).
  type SectionKey = {
    [K in keyof AppSettings]: AppSettings[K] extends object ? K : never;
  }[keyof AppSettings];

  function update<S extends SectionKey, F extends keyof AppSettings[S]>(
    section: S,
    field: F,
    value: AppSettings[S][F]
  ) {
    setSettings((s) =>
      s ? { ...s, [section]: { ...s[section], [field]: value } } : s
    );
    setSaved(false);
  }

  // Load a preset's six colors into the live theme + mark it active.
  function applyPreset(preset: ThemePreset) {
    setSettings((s) =>
      s
        ? {
            ...s,
            theme: {
              ...s.theme,
              primaryColor: preset.primaryColor,
              primaryHover: preset.primaryHover,
              primarySoft: preset.primarySoft,
              darkColor: preset.darkColor,
              lightColor: preset.lightColor,
              paperColor: preset.paperColor,
              activePreset: preset.name,
            },
          }
        : s
    );
    setSaved(false);
  }

  // Snapshot the current colors as a named user preset (replaces a same-named
  // user preset; built-in names are rejected so the built-ins stay canonical).
  function saveAsPreset() {
    const name = newPresetName.trim();
    if (!name || !settings) return;
    if (settings.theme.presets.some((p) => p.builtIn && p.name === name)) {
      alert(`"${name}" is a built-in preset name — pick a different name.`);
      return;
    }
    const snapshot: ThemePreset = {
      name,
      primaryColor: settings.theme.primaryColor,
      primaryHover: settings.theme.primaryHover,
      primarySoft: settings.theme.primarySoft,
      darkColor: settings.theme.darkColor,
      lightColor: settings.theme.lightColor,
      paperColor: settings.theme.paperColor,
    };
    setSettings((s) => {
      if (!s) return s;
      const others = s.theme.presets.filter(
        (p) => p.builtIn || p.name !== name
      );
      return {
        ...s,
        theme: { ...s.theme, presets: [...others, snapshot], activePreset: name },
      };
    });
    setNewPresetName("");
    setSaved(false);
  }

  async function handleSave() {
    if (!settings) return;
    if (settings.amazonSpApi.marketplaceIds.length === 0) {
      alert("Select at least one Amazon marketplace before saving.");
      return;
    }
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const result = await res.json();
      if (result.ok) {
        setSettings(result.settings);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        alert(`Save failed: ${result.error}`);
      }
    } finally {
      setSaving(false);
    }
  }

  // Download all current settings as dashlab-config.json via a temporary object URL.
  async function handleExportConfig() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "dashlab-config.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setConfigStatus({ status: "error", message: (err as Error).message });
    }
  }

  // Read a chosen .json file, POST it to /api/config, then reload on success.
  async function handleImportConfig(file: File) {
    setConfigStatus({ status: "testing" });
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error("Selected file is not valid JSON.");
      }
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error ?? "Import failed.");
      }
      setConfigStatus({
        status: "success",
        message: "Config imported.",
      });
      // Re-pull settings into the form instead of reloading the renderer.
      await reloadSettings();
    } catch (err) {
      setConfigStatus({ status: "error", message: (err as Error).message });
    }
  }

  async function testGenericSocial(service: "facebook" | "instagram", setTest: (s: TestState) => void) {
    if (!settings) return;
    setTest({ status: "testing" });
    try {
      const saveRes = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const saveResult = await saveRes.json();
      if (!saveResult.ok) {
        setTest({ status: "error", message: `Save failed: ${saveResult.error}` });
        return;
      }
      setSettings(saveResult.settings);
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (data.ok) {
        setTest({ status: "success", message: data.message });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setTest({ status: "error", message: data.error });
      }
    } catch (err) {
      setTest({ status: "error", message: (err as Error).message });
    }
  }

  async function testYoutube() {
    if (!settings) return;
    setYoutubeTest({ status: "testing" });
    try {
      const saveRes = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const saveResult = await saveRes.json();
      if (!saveResult.ok) {
        setYoutubeTest({
          status: "error",
          message: `Save failed before test: ${saveResult.error}`,
        });
        return;
      }
      setSettings(saveResult.settings);

      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "youtube" }),
      });
      const data = await res.json();
      if (data.ok) {
        setYoutubeTest({ status: "success", message: data.message });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setYoutubeTest({ status: "error", message: data.error });
      }
    } catch (err) {
      setYoutubeTest({ status: "error", message: (err as Error).message });
    }
  }

  async function testAmazon() {
    if (!settings) return;
    setAmazonTest({ status: "testing" });
    try {
      const saveRes = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const saveResult = await saveRes.json();
      if (!saveResult.ok) {
        setAmazonTest({
          status: "error",
          message: `Save failed before test: ${saveResult.error}`,
        });
        return;
      }
      setSettings(saveResult.settings);

      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "amazon" }),
      });
      const data = await res.json();
      if (data.ok) {
        setAmazonTest({ status: "success", message: data.message });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setAmazonTest({ status: "error", message: data.error });
      }
    } catch (err) {
      setAmazonTest({ status: "error", message: (err as Error).message });
    }
  }

  async function testShipstation() {
    if (!settings) return;
    setShipstationTest({ status: "testing" });
    try {
      // Save current form values first so the server test endpoint reads them
      const saveRes = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const saveResult = await saveRes.json();
      if (!saveResult.ok) {
        setShipstationTest({
          status: "error",
          message: `Save failed before test: ${saveResult.error}`,
        });
        return;
      }
      // Update masked settings from save response
      setSettings(saveResult.settings);

      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "shipstation" }),
      });
      const data = await res.json();
      if (data.ok) {
        setShipstationTest({ status: "success", message: data.message });
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setShipstationTest({ status: "error", message: data.error });
      }
    } catch (err) {
      setShipstationTest({
        status: "error",
        message: (err as Error).message,
      });
    }
  }

  if (loading || !settings) {
    return (
      <Page title="Settings">
        <Text as="p">Loading…</Text>
      </Page>
    );
  }

  return (
    <Page
      title="Settings"
      subtitle="Manage API connections, print engine, and dashboard preferences"
      primaryAction={{
        content: saving ? "Saving…" : saved ? "Saved ✓" : "Save settings",
        loading: saving,
        onAction: handleSave,
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <Card padding="0">
          <Tabs tabs={tabs} selected={tabIndex} onSelect={setTabIndex} />
        </Card>
      </div>
      <Layout>
        {tabIndex === 0 && (
        <>
        {/* ---------- General ---------- */}
        <Layout.AnnotatedSection
          title="General"
          description="Top-level dashboard preferences."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Use mock data (development mode)"
                checked={settings.general.useMockData}
                onChange={(v) => update("general", "useMockData", v)}
                helpText="When on, the dashboard shows sample orders. Turn off once your APIs are connected."
              />
              <TextField
                label="Timezone"
                value={settings.general.timezone}
                onChange={(v) => update("general", "timezone", v)}
                autoComplete="off"
                helpText="Used for 'today' calculations and timestamps."
              />
              <TextField
                label="Production lead time (days)"
                type="number"
                value={settings.general.productionLeadTimeDays.toString()}
                onChange={(v) =>
                  update(
                    "general",
                    "productionLeadTimeDays",
                    Math.max(0, parseInt(v) || 0)
                  )
                }
                autoComplete="off"
                min={0}
                max={30}
                helpText="How many days you typically need to produce an order before shipping. Used to compute when each order actually needs to ship (since Shopify/ShipStation usually doesn't set a real ship-by date)."
              />
              <Checkbox
                label="Celebrate new orders (popup + confetti + ka-ching sound)"
                checked={settings.general.celebrateNewOrders}
                onChange={(v) => update("general", "celebrateNewOrders", v)}
                helpText="When a new order comes in, briefly take over the screen with a popup showing the order, throw confetti, and play a ka-ching sound. Auto-dismisses after a few seconds."
              />
              <Checkbox
                label="Celebrate new followers / subscribers (popup + confetti + grunt headshot sound)"
                checked={settings.general.celebrateNewFollowers}
                onChange={(v) => update("general", "celebrateNewFollowers", v)}
                helpText="When YouTube / Facebook / Instagram follower count goes up, fire a popup + confetti + grunt headshot sound."
              />
              <TextField
                label="Daily sales goal ($)"
                type="number"
                value={settings.general.dailySalesGoal.toString()}
                onChange={(v) =>
                  update("general", "dailySalesGoal", Math.max(0, parseInt(v) || 0))
                }
                autoComplete="off"
                min={0}
                helpText="Target gross sales for the day. Drives the progress bars on the dashboard. Monthly goal = this × days in the month, computed automatically."
              />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        </>
        )}

        {tabIndex === 1 && (
        <>
        {/* ---------- ShipStation ---------- */}
        <Layout.AnnotatedSection
          title="ShipStation"
          description={
            <Text as="p" tone="subdued">
              FBM orders, shipping data. Get your key + secret from Account
              Settings → API Settings in ShipStation.
            </Text>
          }
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Enable ShipStation sync"
                checked={settings.shipstation.enabled}
                onChange={(v) => update("shipstation", "enabled", v)}
              />
              <TextField
                label="API Key"
                value={settings.shipstation.apiKey}
                onChange={(v) => update("shipstation", "apiKey", v)}
                autoComplete="off"
              />
              <TextField
                label="API Secret"
                type="password"
                value={settings.shipstation.apiSecret}
                onChange={(v) => update("shipstation", "apiSecret", v)}
                autoComplete="off"
                helpText="Secrets are stored locally on this machine only. Never transmitted except to ShipStation."
              />
              <TextField
                label="Poll interval (seconds)"
                type="number"
                value={settings.shipstation.pollIntervalSeconds.toString()}
                onChange={(v) =>
                  update("shipstation", "pollIntervalSeconds", parseInt(v) || 10)
                }
                autoComplete="off"
                min={10}
                max={3600}
                helpText="How often DashLab checks for new orders. 10s is the minimum."
              />
              <TextField
                label="Force ShipStation to re-pull stores every (minutes)"
                type="number"
                value={settings.shipstation.forceRefreshIntervalMinutes.toString()}
                onChange={(v) =>
                  update(
                    "shipstation",
                    "forceRefreshIntervalMinutes",
                    Math.max(0, parseInt(v) || 0)
                  )
                }
                autoComplete="off"
                min={0}
                max={1440}
                helpText="Tells ShipStation to re-sync every connected store (Shopify, Amazon, Etsy, etc.) from its source at this cadence. ShipStation's own polling can lag 30+ min — this forces it. 0 = never auto. The Refresh button on the dashboard always fires this once."
              />
              <Divider />
              <InlineStack gap="200" align="start">
                <Button
                  onClick={testShipstation}
                  loading={shipstationTest.status === "testing"}
                  disabled={
                    !settings.shipstation.apiKey ||
                    !settings.shipstation.apiSecret
                  }
                >
                  Test connection
                </Button>
                {shipstationTest.status === "success" && (
                  <Banner tone="success" title="Connected">
                    <Text as="p">{shipstationTest.message}</Text>
                  </Banner>
                )}
                {shipstationTest.status === "error" && (
                  <Banner tone="critical" title="Failed">
                    <Text as="p">{shipstationTest.message}</Text>
                  </Banner>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        {/* ---------- Amazon SP-API ---------- */}
        <Layout.AnnotatedSection
          title="Amazon FBA"
          description={
            <BlockStack gap="200">
              <Text as="p" tone="subdued">
                Amazon Selling Partner API (SP-API). Powers the FBA orders +
                inventory section. Requires registering as a Selling Partner
                Developer in Seller Central (30-60 min setup).
              </Text>
              <Text as="p" tone="subdued">
                Recommend skipping until ShipStation is working.
              </Text>
            </BlockStack>
          }
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Enable Amazon SP-API sync"
                checked={settings.amazonSpApi.enabled}
                onChange={(v) => update("amazonSpApi", "enabled", v)}
              />
              <TextField
                label="Client ID"
                value={settings.amazonSpApi.clientId}
                onChange={(v) => update("amazonSpApi", "clientId", v)}
                autoComplete="off"
              />
              <TextField
                label="Client Secret"
                type="password"
                value={settings.amazonSpApi.clientSecret}
                onChange={(v) => update("amazonSpApi", "clientSecret", v)}
                autoComplete="off"
              />
              <TextField
                label="Refresh Token"
                type="password"
                value={settings.amazonSpApi.refreshToken}
                onChange={(v) => update("amazonSpApi", "refreshToken", v)}
                autoComplete="off"
              />
              <TextField
                label="Seller ID"
                value={settings.amazonSpApi.sellerId}
                onChange={(v) => update("amazonSpApi", "sellerId", v)}
                autoComplete="off"
              />
              <BlockStack gap="100">
                <Text as="span" variant="bodyMd">
                  Marketplaces
                </Text>
                {AMAZON_MARKETPLACES.map((mp) => {
                  const selected =
                    settings.amazonSpApi.marketplaceIds.includes(mp.id);
                  // Don't let the user uncheck the last remaining marketplace —
                  // the pollers need at least one.
                  const isLast =
                    selected && settings.amazonSpApi.marketplaceIds.length === 1;
                  return (
                    <Checkbox
                      key={mp.id}
                      label={`${mp.label} (${mp.id})`}
                      checked={selected}
                      disabled={isLast}
                      onChange={(checked) =>
                        update(
                          "amazonSpApi",
                          "marketplaceIds",
                          checked
                            ? [...settings.amazonSpApi.marketplaceIds, mp.id]
                            : settings.amazonSpApi.marketplaceIds.filter(
                                (id) => id !== mp.id
                              )
                        )
                      }
                    />
                  );
                })}
                <Text as="span" variant="bodySm" tone="subdued">
                  Pick at least one. US, Canada, and Mexico all use the same NA
                  SP-API endpoint and are polled together.
                </Text>
              </BlockStack>
              <TextField
                label="Poll interval (minutes)"
                type="number"
                value={settings.amazonSpApi.pollIntervalMinutes.toString()}
                onChange={(v) =>
                  update(
                    "amazonSpApi",
                    "pollIntervalMinutes",
                    parseInt(v) || 2
                  )
                }
                autoComplete="off"
                min={2}
                max={60}
                helpText="Amazon SP-API rate-limits the orders endpoint to ~1 request/minute, so 2 min is the floor. Lower = more responsive, but risk occasional throttling."
              />
              <Checkbox
                label="Use sandbox endpoint (test data, not real orders)"
                checked={settings.amazonSpApi.useSandbox}
                onChange={(v) => update("amazonSpApi", "useSandbox", v)}
                helpText="Turn off only after promoting the SP-API app to production in Solution Provider Portal."
              />
              <Checkbox
                label="Pull Amazon FBM orders directly (skip ShipStation for FBM)"
                checked={settings.amazonSpApi.fbmEnabled}
                onChange={(v) => update("amazonSpApi", "fbmEnabled", v)}
                helpText="When on, DashLab pulls merchant-fulfilled Amazon orders straight from SP-API and the ShipStation poller skips them (so you don't double-count). Requires the orders + line items roles on the SP-API app."
              />
              <Divider />
              <InlineStack gap="200" align="start">
                <Button
                  onClick={testAmazon}
                  loading={amazonTest.status === "testing"}
                  disabled={
                    !settings.amazonSpApi.clientId ||
                    !settings.amazonSpApi.clientSecret ||
                    !settings.amazonSpApi.refreshToken
                  }
                >
                  Test connection
                </Button>
                {amazonTest.status === "success" && (
                  <Banner tone="success" title="Connected">
                    <Text as="p">{amazonTest.message}</Text>
                  </Banner>
                )}
                {amazonTest.status === "error" && (
                  <Banner tone="critical" title="Failed">
                    <Text as="p">{amazonTest.message}</Text>
                  </Banner>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        {/* ---------- Shopify ---------- */}
        <Layout.AnnotatedSection
          title="Shopify"
          description="Direct Shopify Admin API access for orders, products, and inventory. Paste your Client ID + Secret from the Partner Dashboard, save, then install the app from Shopify — the Admin access token will populate automatically."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Enable Shopify sync"
                checked={settings.shopify.enabled}
                onChange={(v) => update("shopify", "enabled", v)}
              />
              <TextField
                label="Store domain"
                value={settings.shopify.storeDomain}
                onChange={(v) => update("shopify", "storeDomain", v)}
                autoComplete="off"
                placeholder="neattools.myshopify.com"
                helpText="Auto-fills after a successful install."
              />
              <TextField
                label="Client ID"
                value={settings.shopify.clientId}
                onChange={(v) => update("shopify", "clientId", v)}
                autoComplete="off"
                helpText="From Partner Dashboard → your app → Client credentials."
              />
              <TextField
                label="Client Secret"
                type="password"
                value={settings.shopify.clientSecret}
                onChange={(v) => update("shopify", "clientSecret", v)}
                autoComplete="off"
                helpText="From Partner Dashboard → your app → Client credentials. Used once to exchange the install code for an Admin access token."
              />
              <TextField
                label="Admin access token"
                type="password"
                value={settings.shopify.adminAccessToken}
                onChange={(v) => update("shopify", "adminAccessToken", v)}
                autoComplete="off"
                helpText="Populated automatically after you click 'Connect to Shopify' below."
              />
              <TextField
                label="Poll interval (seconds)"
                type="number"
                value={settings.shopify.pollIntervalSeconds.toString()}
                onChange={(v) =>
                  update(
                    "shopify",
                    "pollIntervalSeconds",
                    Math.max(30, parseInt(v) || 30)
                  )
                }
                autoComplete="off"
                min={30}
                max={3600}
                helpText="How often to pull new orders from Shopify. 30s is the minimum."
              />
              <InlineStack gap="300" align="start">
                <Button
                  onClick={() => {
                    const shop =
                      settings.shopify.storeDomain || "neattools.myshopify.com";
                    window.location.href = `/api/shopify/install?shop=${encodeURIComponent(shop)}`;
                  }}
                  disabled={!settings.shopify.clientId}
                >
                  {settings.shopify.adminAccessToken
                    ? "Reconnect to Shopify"
                    : "Connect to Shopify"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        {/* ---------- Etsy ---------- */}
        <Layout.AnnotatedSection
          title="Etsy"
          description="Direct Etsy Open API v3 access for receipts (orders), line items, and shipping address. Paste your Keystring from etsy.com/developers, save, then click Connect to authorize."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Enable Etsy sync"
                checked={settings.etsy.enabled}
                onChange={(v) => update("etsy", "enabled", v)}
              />
              <TextField
                label="Keystring (API key)"
                value={settings.etsy.keystring}
                onChange={(v) => update("etsy", "keystring", v)}
                autoComplete="off"
                helpText="From etsy.com/developers → your app → Keystring."
              />
              <TextField
                label="Shared Secret"
                type="password"
                value={settings.etsy.sharedSecret}
                onChange={(v) => update("etsy", "sharedSecret", v)}
                autoComplete="off"
                helpText="Not required for v3 PKCE, but worth pasting for completeness."
              />
              <TextField
                label="Shop ID"
                value={settings.etsy.shopId}
                onChange={(v) => update("etsy", "shopId", v)}
                autoComplete="off"
                helpText="Auto-fills after a successful connect."
              />
              <TextField
                label="Shop name"
                value={settings.etsy.shopName}
                onChange={(v) => update("etsy", "shopName", v)}
                autoComplete="off"
              />
              <TextField
                label="Poll interval (seconds)"
                type="number"
                value={settings.etsy.pollIntervalSeconds.toString()}
                onChange={(v) =>
                  update(
                    "etsy",
                    "pollIntervalSeconds",
                    Math.max(30, parseInt(v) || 60)
                  )
                }
                autoComplete="off"
                min={30}
                max={3600}
                helpText="How often to pull new receipts from Etsy. 60s is plenty."
              />
              <InlineStack gap="300" align="start">
                <Button
                  onClick={() => {
                    window.location.href = "/api/etsy/install";
                  }}
                  disabled={!settings.etsy.keystring}
                >
                  {settings.etsy.refreshToken
                    ? "Reconnect to Etsy"
                    : "Connect to Etsy"}
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        </>
        )}

        {tabIndex === 2 && (
        <>
        {/* ---------- YouTube ---------- */}
        <Layout.AnnotatedSection
          title="YouTube"
          description="Live subscriber count via YouTube Data API v3. Free tier (~10k requests/day). Get an API key at console.cloud.google.com and your channel ID at youtube.com/account_advanced."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Enable YouTube live subscriber count"
                checked={settings.social.youtube.enabled}
                onChange={(v) => update("social", "youtube", { ...settings.social.youtube, enabled: v })}
              />
              <TextField
                label="API Key"
                type="password"
                value={settings.social.youtube.apiKey}
                onChange={(v) => update("social", "youtube", { ...settings.social.youtube, apiKey: v })}
                autoComplete="off"
                helpText="Restrict to YouTube Data API v3 in the Google Cloud Console."
              />
              <TextField
                label="Channel ID"
                value={settings.social.youtube.channelId}
                onChange={(v) => update("social", "youtube", { ...settings.social.youtube, channelId: v })}
                autoComplete="off"
                placeholder="UCxxxxxxxxxxxxxxxxxxxxxxxx"
                helpText="Starts with UC."
              />
              <TextField
                label="Handle (display name)"
                value={settings.social.youtube.handle}
                onChange={(v) => update("social", "youtube", { ...settings.social.youtube, handle: v })}
                autoComplete="off"
                placeholder="@neattools"
              />
              <TextField
                label="Poll interval (minutes)"
                type="number"
                value={settings.social.youtube.pollIntervalMinutes.toString()}
                onChange={(v) =>
                  update("social", "youtube", {
                    ...settings.social.youtube,
                    pollIntervalMinutes: Math.max(2, parseInt(v) || 2),
                  })
                }
                autoComplete="off"
                min={2}
                max={60}
                helpText="How often to refresh YouTube subscriber count. 2 min is the minimum (well under free quota)."
              />
              <InlineStack gap="200" align="start">
                <Button
                  onClick={testYoutube}
                  loading={youtubeTest.status === "testing"}
                  disabled={!settings.social.youtube.apiKey || !settings.social.youtube.channelId}
                >
                  Test connection
                </Button>
                {youtubeTest.status === "success" && (
                  <Banner tone="success" title="Connected">
                    <Text as="p">{youtubeTest.message}</Text>
                  </Banner>
                )}
                {youtubeTest.status === "error" && (
                  <Banner tone="critical" title="Failed">
                    <Text as="p">{youtubeTest.message}</Text>
                  </Banner>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        {/* ---------- Facebook Page ---------- */}
        <Layout.AnnotatedSection
          title="Facebook Page"
          description="Live Facebook Page follower count via the Meta Graph API. Requires a Meta developer app + long-lived Page Access Token."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Show Facebook Page follower count"
                checked={settings.social.facebook.enabled}
                onChange={(v) => update("social", "facebook", { ...settings.social.facebook, enabled: v })}
              />
              <TextField
                label="Page ID"
                value={settings.social.facebook.pageId}
                onChange={(v) => update("social", "facebook", { ...settings.social.facebook, pageId: v })}
                autoComplete="off"
                helpText="Numeric Page ID. Find it via Meta Business Suite → Page Info."
              />
              <TextField
                label="Page Access Token"
                type="password"
                value={settings.social.facebook.pageAccessToken}
                onChange={(v) => update("social", "facebook", { ...settings.social.facebook, pageAccessToken: v })}
                autoComplete="off"
                helpText="Long-lived token from your Meta app's Graph API Explorer."
              />
              <TextField
                label="Handle (display name)"
                value={settings.social.facebook.handle}
                onChange={(v) => update("social", "facebook", { ...settings.social.facebook, handle: v })}
                autoComplete="off"
                placeholder="Neat Tools"
              />
              <TextField
                label="Poll interval (minutes)"
                type="number"
                value={settings.social.facebook.pollIntervalMinutes.toString()}
                onChange={(v) =>
                  update("social", "facebook", {
                    ...settings.social.facebook,
                    pollIntervalMinutes: Math.max(2, parseInt(v) || 2),
                  })
                }
                autoComplete="off"
                min={2}
                max={60}
                helpText="2 min is the minimum (Meta caches counts internally for a few minutes anyway)."
              />
              <InlineStack gap="200" align="start">
                <Button
                  onClick={() => testGenericSocial("facebook", setFacebookTest)}
                  loading={facebookTest.status === "testing"}
                  disabled={!settings.social.facebook.pageId || !settings.social.facebook.pageAccessToken}
                >
                  Test connection
                </Button>
                {facebookTest.status === "success" && (
                  <Banner tone="success" title="Connected">
                    <Text as="p">{facebookTest.message}</Text>
                  </Banner>
                )}
                {facebookTest.status === "error" && (
                  <Banner tone="critical" title="Failed">
                    <Text as="p">{facebookTest.message}</Text>
                  </Banner>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        {/* ---------- Instagram ---------- */}
        <Layout.AnnotatedSection
          title="Instagram"
          description="Live Instagram follower count via the Meta Graph API. Uses the same Meta app as Facebook Page — typically the same access token."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Show Instagram follower count"
                checked={settings.social.instagram.enabled}
                onChange={(v) => update("social", "instagram", { ...settings.social.instagram, enabled: v })}
              />
              <TextField
                label="Handle"
                value={settings.social.instagram.handle}
                onChange={(v) => update("social", "instagram", { ...settings.social.instagram, handle: v })}
                autoComplete="off"
                placeholder="@neattools"
              />
              <TextField
                label="Instagram Business Account ID"
                value={settings.social.instagram.instagramBusinessAccountId}
                onChange={(v) => update("social", "instagram", { ...settings.social.instagram, instagramBusinessAccountId: v })}
                autoComplete="off"
                helpText="From the Meta app's Graph API Explorer. Leave blank to use the manual count below."
              />
              <TextField
                label="Long-lived access token"
                type="password"
                value={settings.social.instagram.accessToken}
                onChange={(v) => update("social", "instagram", { ...settings.social.instagram, accessToken: v })}
                autoComplete="off"
                helpText="Same Meta token as Facebook Page (60-day token)."
              />
              <TextField
                label="Manual follower count (fallback)"
                type="number"
                value={settings.social.instagram.followers.toString()}
                onChange={(v) => update("social", "instagram", { ...settings.social.instagram, followers: Math.max(0, parseInt(v) || 0) })}
                autoComplete="off"
                helpText="Used only if the live API fields above are empty."
              />
              <TextField
                label="Poll interval (minutes)"
                type="number"
                value={settings.social.instagram.pollIntervalMinutes.toString()}
                onChange={(v) =>
                  update("social", "instagram", {
                    ...settings.social.instagram,
                    pollIntervalMinutes: Math.max(2, parseInt(v) || 2),
                  })
                }
                autoComplete="off"
                min={2}
                max={60}
                helpText="Shared with Facebook poll cycle (uses the lower of the two)."
              />
              <InlineStack gap="200" align="start">
                <Button
                  onClick={() => testGenericSocial("instagram", setInstagramTest)}
                  loading={instagramTest.status === "testing"}
                  disabled={!settings.social.instagram.instagramBusinessAccountId || !settings.social.instagram.accessToken}
                >
                  Test connection
                </Button>
                {instagramTest.status === "success" && (
                  <Banner tone="success" title="Connected">
                    <Text as="p">{instagramTest.message}</Text>
                  </Banner>
                )}
                {instagramTest.status === "error" && (
                  <Banner tone="critical" title="Failed">
                    <Text as="p">{instagramTest.message}</Text>
                  </Banner>
                )}
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        {/* ---------- TikTok ---------- */}
        <Layout.AnnotatedSection
          title="TikTok"
          description="Manual follower count for now — TikTok's Display API requires business verification (often 1-3 days). Update the number weekly until the live integration is wired."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Show TikTok follower count"
                checked={settings.social.tiktok.enabled}
                onChange={(v) => update("social", "tiktok", { ...settings.social.tiktok, enabled: v })}
              />
              <TextField
                label="Handle"
                value={settings.social.tiktok.handle}
                onChange={(v) => update("social", "tiktok", { ...settings.social.tiktok, handle: v })}
                autoComplete="off"
                placeholder="@neattools"
              />
              <TextField
                label="Follower count"
                type="number"
                value={settings.social.tiktok.followers.toString()}
                onChange={(v) => update("social", "tiktok", { ...settings.social.tiktok, followers: Math.max(0, parseInt(v) || 0) })}
                autoComplete="off"
                helpText="Update manually until the live TikTok integration is approved."
              />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        </>
        )}

        {tabIndex === 3 && (
        <>
        {/* ---------- Print engine ---------- */}
        <Layout.AnnotatedSection
          title="Print Engine"
          description="Auto-print Printing Slips when new orders come in. Requires a connected thermal printer."
        >
          <Card>
            <BlockStack gap="400">
              <Checkbox
                label="Enable auto-print on new orders"
                checked={settings.print.autoPrintEnabled}
                onChange={(v) => update("print", "autoPrintEnabled", v)}
                helpText="When on, every new ShipStation order prints automatically."
              />
              {installedPrinters.length > 0 ? (
                <Select
                  label="Printer (auto-detected)"
                  options={[
                    { label: "— Select a printer —", value: "" },
                    ...installedPrinters.map((p) => ({ label: p, value: p })),
                  ]}
                  value={settings.print.printerName}
                  onChange={(v) => update("print", "printerName", v)}
                  helpText={`${installedPrinters.length} printer${installedPrinters.length === 1 ? "" : "s"} detected on this machine.`}
                />
              ) : (
                <TextField
                  label="Printer name (CUPS queue)"
                  value={settings.print.printerName}
                  onChange={(v) => update("print", "printerName", v)}
                  autoComplete="off"
                  placeholder="ZebraGK420 or Rollo"
                  helpText="No printers auto-detected. Type the queue name from your Mac/Linux printer settings."
                />
              )}
              <TextField
                label="Label size"
                value={settings.print.labelSize}
                onChange={(v) => update("print", "labelSize", v)}
                autoComplete="off"
                helpText="4x6 is the default thermal label size."
              />
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
        </>
        )}

        {tabIndex === 4 && (
        <>
        {/* ---------- Appearance / theming ---------- */}
        <Layout.AnnotatedSection
          title="Appearance"
          description="Set the brand colors that drive the whole dashboard. Pick a preset or tweak the six colors, then Save. Changes apply on the next page load."
        >
          <Card>
            <BlockStack gap="500">
              {/* Preset chips */}
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Presets
                </Text>
                <InlineStack gap="200" wrap>
                  {settings.theme.presets.map((preset) => (
                    <Button
                      key={preset.name}
                      pressed={settings.theme.activePreset === preset.name}
                      variant={
                        settings.theme.activePreset === preset.name
                          ? "primary"
                          : "secondary"
                      }
                      onClick={() => applyPreset(preset)}
                    >
                      {preset.builtIn ? preset.name : `${preset.name} (custom)`}
                    </Button>
                  ))}
                </InlineStack>
                <Text as="p" tone="subdued">
                  Built-in presets (Neat Tools, Yes Dental Parts) can&apos;t be
                  deleted. Saving with an existing custom name overwrites it.
                </Text>
              </BlockStack>

              <Divider />

              {/* Color pickers */}
              <BlockStack gap="400">
                {THEME_FIELDS.map((f) => (
                  <ColorField
                    key={f.key}
                    label={f.label}
                    value={settings.theme[f.key]}
                    helpText={f.help}
                    onChange={(v) => {
                      update("theme", f.key, v);
                      // Editing a color means we're no longer on a named preset.
                      update("theme", "activePreset", "Custom");
                    }}
                  />
                ))}
              </BlockStack>

              <Divider />

              {/* Save-as-preset */}
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  Save current colors as a preset
                </Text>
                <InlineStack gap="300" blockAlign="end" wrap={false}>
                  <div style={{ flex: 1 }}>
                    <TextField
                      label="Preset name"
                      labelHidden
                      placeholder="e.g. Holiday 2026"
                      value={newPresetName}
                      onChange={setNewPresetName}
                      autoComplete="off"
                    />
                  </div>
                  <Button onClick={saveAsPreset} disabled={!newPresetName.trim()}>
                    Save as preset
                  </Button>
                </InlineStack>
                <Text as="p" tone="subdued">
                  This only adds the preset to the list. Click{" "}
                  <strong>Save settings</strong> above to persist everything.
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
        </>
        )}

        {tabIndex === 5 && (
        <>
        {/* ---------- Config ---------- */}
        <Layout.AnnotatedSection
          title="Export Config"
          description="Download all your settings as a file you can import on another machine."
        >
          <Card>
            <BlockStack gap="400">
              {configStatus.status === "error" && (
                <Banner tone="critical" title="Something went wrong">
                  <Text as="p">{configStatus.message}</Text>
                </Banner>
              )}
              {configStatus.status === "success" && (
                <Banner tone="success" title="Success">
                  <Text as="p">{configStatus.message}</Text>
                </Banner>
              )}
              <Text as="p" tone="subdued">
                Exports the complete configuration, including API credentials.
                Keep the downloaded file somewhere safe.
              </Text>
              <InlineStack>
                <Button onClick={handleExportConfig}>Export config</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection
          title="Import Config"
          description="Import a dashlab-config.json file to overwrite all settings."
        >
          <Card>
            <BlockStack gap="400">
              <Text as="p" tone="subdued">
                This replaces your current settings with the contents of the
                chosen file. The page reloads automatically after a successful
                import.
              </Text>
              <input
                ref={importInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportConfig(file);
                  // Reset so selecting the same file again re-triggers onChange.
                  e.target.value = "";
                }}
              />
              <InlineStack>
                <Button
                  onClick={() => importInputRef.current?.click()}
                  loading={configStatus.status === "testing"}
                >
                  Choose config file…
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
        </>
        )}

        {tabIndex === 6 && (
        <>
        {/* ---------- Config Sync (Google Drive) ---------- */}
        <Layout.AnnotatedSection
          title="Google Drive Sync"
          description="Point DashLab at a folder in your Google Drive. On every launch, settings are loaded from that folder — keeping all your machines in sync."
        >
          <Card>
            <BlockStack gap="400">
              <BlockStack gap="150">
                <Text as="span" variant="bodyMd">
                  Google Drive folder
                </Text>
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  <div
                    title={drivePath || undefined}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      padding: "8px 12px",
                      border: "1px solid var(--p-color-border)",
                      borderRadius: "8px",
                      background: "var(--p-color-bg-surface-secondary)",
                      color: drivePath ? undefined : "var(--p-color-text-subdued)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {drivePath || "No folder chosen"}
                  </div>
                  <Button onClick={browseDriveFolder}>Choose Folder…</Button>
                </InlineStack>
                <Text as="span" variant="bodySm" tone="subdued">
                  Pick the folder that holds (or will hold) dashlab-config.json.
                </Text>
              </BlockStack>
              <InlineStack>
                <Button variant="primary" onClick={saveDrivePath} loading={driveSaving}>
                  Save Path
                </Button>
              </InlineStack>
              <Text as="p" tone="subdued">
                {settings.googleDriveSyncedAt
                  ? `Last synced: ${new Date(settings.googleDriveSyncedAt).toLocaleString()}`
                  : settings.googleDrivePath
                    ? "Configured — will sync on next launch."
                    : "Not configured"}
              </Text>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
        </>
        )}

        <Layout.Section>
          <Box paddingBlockStart="400" paddingBlockEnd="800">
            <InlineStack gap="200" align="end">
              <Button
                variant="primary"
                onClick={handleSave}
                loading={saving}
              >
                {saved ? "Saved ✓" : "Save settings"}
              </Button>
            </InlineStack>
          </Box>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
