// OTA auto-update prompt. The main process (electron-updater, see
// setupAutoUpdater in src/main/index.ts) fires "update-available" when a newer
// GitHub release exists and "update-downloaded" once the user has pulled it.
// This banner drives the two-step flow: Download → Restart & Install.

import { useEffect, useState } from "react";
import { Banner, Button } from "@shopify/polaris";

export function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    window.electron.on("update-available", (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      if (info?.version) setVersion(info.version);
    });
    window.electron.on("update-downloaded", (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      if (info?.version) setVersion(info.version);
      setDownloading(false);
      setDownloaded(true);
    });
    return () => {
      window.electron.removeAllListeners("update-available");
      window.electron.removeAllListeners("update-downloaded");
    };
  }, []);

  if (!version) return null;

  async function download() {
    setDownloading(true);
    await window.electron.downloadUpdate();
    // The button stays in its "Downloading…" state until the main process emits
    // "update-downloaded", which flips the banner to the install step.
  }

  async function install() {
    await window.electron.installUpdate();
  }

  return (
    <div style={{ padding: "8px 16px" }}>
      {downloaded ? (
        <Banner
          tone="success"
          title={`DashLab v${version} downloaded`}
          action={{ content: "Restart & Install", onAction: install }}
        >
          <p>Restart DashLab to finish installing the update.</p>
        </Banner>
      ) : (
        <Banner tone="info" title={`DashLab v${version} is available`}>
          <p>A new version is ready to download.</p>
          <div style={{ marginTop: "8px" }}>
            <Button
              variant="primary"
              onClick={download}
              disabled={downloading}
              loading={downloading}
            >
              {downloading ? "Downloading…" : "Download Update"}
            </Button>
          </div>
        </Banner>
      )}
    </div>
  );
}
