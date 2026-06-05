// Auto-update prompt. The main process watches the synced Google Drive folder
// for a newer build (see checkForUpdate in src/main/index.ts) and fires an
// "update-available" IPC event with the version + the path to the synced
// installer. We surface that as a dismissible banner with an Install action.

import { useEffect, useState } from "react";
import { Banner } from "@shopify/polaris";

interface UpdateInfo {
  version: string;
  installerPath: string;
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    window.electron.on("update-available", (...args: unknown[]) => {
      const info = args[0] as UpdateInfo | undefined;
      if (info?.version && info?.installerPath) setUpdate(info);
    });
    return () => window.electron.removeAllListeners("update-available");
  }, []);

  if (!update) return null;

  const isWindows = window.electron.platform === "win32";
  const note = isWindows
    ? "The app will close and reinstall automatically."
    : "The installer will open in Finder.";

  async function install() {
    if (!update) return;
    await window.electron.invoke("install-update", update.installerPath);
    setUpdate(null);
  }

  return (
    <div style={{ padding: "8px 16px" }}>
      <Banner
        tone="info"
        title={`Update available — DashLab v${update.version}`}
        action={{ content: "Install Update", onAction: install }}
        onDismiss={() => setUpdate(null)}
      >
        <p>{note}</p>
      </Banner>
    </div>
  );
}
