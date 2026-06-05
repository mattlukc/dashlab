// OTA update toast — bottom-left popup driven by electron-updater events from
// the main process (setupAutoUpdater in src/main/index.ts):
//   update-available  → "Update available" with Download / Later
//   update-progress    → progress bar + "Downloading… X% (XMB / XMB)"
//   update-downloaded  → "Ready to install" with Restart & Install
//   update-manual-required → unsigned-macOS fallback: "Download from GitHub"
// Plain HTML/CSS, no Polaris, so it can render its own card + overlay anywhere.

import { useEffect, useState } from "react";

type Stage =
  | "hidden"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "manual";

interface Progress {
  percent: number;
  transferred: number;
  total: number;
}

const mb = (bytes: number) => (bytes / 1e6).toFixed(0);

export function UpdateBanner() {
  const [stage, setStage] = useState<Stage>("hidden");
  const [version, setVersion] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState(
    "https://github.com/mattlukc/dashlab/releases/latest"
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    window.electron.on("update-available", (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      if (info?.version) {
        setVersion(info.version);
        // Don't yank a download/install already in progress back to the start.
        setStage((s) =>
          s === "downloading" || s === "ready" || s === "installing" ? s : "available"
        );
      }
    });
    window.electron.on("update-progress", (...args: unknown[]) => {
      const p = args[0] as Progress | undefined;
      if (p) {
        setProgress(p);
        setStage((s) => (s === "ready" || s === "installing" ? s : "downloading"));
      }
    });
    window.electron.on("update-downloaded", (...args: unknown[]) => {
      const info = args[0] as { version?: string } | undefined;
      if (info?.version) setVersion(info.version);
      setStage((s) => (s === "installing" ? s : "ready"));
    });
    window.electron.on("update-manual-required", (...args: unknown[]) => {
      const info = args[0] as { downloadUrl?: string } | undefined;
      if (info?.downloadUrl) setDownloadUrl(info.downloadUrl);
      setStage("manual");
    });
    return () => {
      window.electron.removeAllListeners("update-available");
      window.electron.removeAllListeners("update-progress");
      window.electron.removeAllListeners("update-downloaded");
      window.electron.removeAllListeners("update-manual-required");
    };
  }, []);

  function startDownload() {
    setStage("downloading");
    setProgress({ percent: 0, transferred: 0, total: 0 });
    window.electron.downloadUpdate();
  }

  function restartAndInstall() {
    // Show the blocking overlay immediately; on Windows the app quits, on
    // unsigned macOS the main process replies with update-manual-required.
    setStage("installing");
    window.electron.installUpdate();
  }

  if (dismissed && stage !== "installing" && stage !== "manual") return null;
  if (stage === "hidden") return null;

  return (
    <>
      {stage !== "installing" && (
        <div className="dl-update-toast">
          {stage === "manual" ? (
            <>
              <div className="dl-update-title">Manual install required</div>
              <div className="dl-update-sub">
                macOS requires manual install — click to download the DMG.
              </div>
              <div className="dl-update-actions">
                <button
                  className="dl-update-btn"
                  onClick={() => window.electron.openExternal(downloadUrl)}
                >
                  Download from GitHub
                </button>
              </div>
            </>
          ) : stage === "ready" ? (
            <>
              <div className="dl-update-title">Ready to install</div>
              <div className="dl-update-sub">DashLab v{version} downloaded</div>
              <div className="dl-update-actions">
                <button className="dl-update-btn" onClick={restartAndInstall}>
                  Restart &amp; Install
                </button>
              </div>
            </>
          ) : stage === "downloading" ? (
            <>
              <div className="dl-update-title">Downloading update</div>
              <div className="dl-update-sub">
                Downloading… {Math.round(progress?.percent ?? 0)}% (
                {mb(progress?.transferred ?? 0)}MB / {mb(progress?.total ?? 0)}MB)
              </div>
              <div className="dl-update-track">
                <div
                  className="dl-update-bar"
                  style={{ width: `${Math.round(progress?.percent ?? 0)}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="dl-update-title">Update available</div>
              <div className="dl-update-sub">
                DashLab v{version} is ready to download
              </div>
              <div className="dl-update-actions">
                <button className="dl-update-btn" onClick={startDownload}>
                  Download
                </button>
                <button
                  className="dl-update-later"
                  onClick={() => setDismissed(true)}
                >
                  Later
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {stage === "installing" && (
        <div className="dl-update-overlay">
          <div className="dl-update-overlay-card">
            <div className="dl-update-spinner" />
            <div className="dl-update-overlay-text">
              Installing update…
              <br />
              DashLab will restart shortly
            </div>
          </div>
        </div>
      )}

      <style>{`
        .dl-update-toast {
          position: fixed;
          bottom: 24px;
          left: 24px;
          z-index: 9999;
          width: 320px;
          background: #fff;
          border-radius: 12px;
          border-left: 4px solid var(--dl-primary);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
          padding: 16px 20px;
          animation: dl-update-in 0.3s ease-out;
        }
        @keyframes dl-update-in {
          from { opacity: 0; transform: translateX(-24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .dl-update-title {
          font-weight: 700;
          font-size: 15px;
          color: var(--dl-dark, #2f2f2f);
        }
        .dl-update-sub {
          margin-top: 4px;
          font-size: 12px;
          color: #888;
        }
        .dl-update-actions {
          margin-top: 12px;
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .dl-update-btn {
          background: var(--dl-primary);
          color: #fff;
          border: none;
          border-radius: 6px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .dl-update-btn:hover { filter: brightness(0.95); }
        .dl-update-later {
          background: none;
          border: none;
          color: #888;
          font-size: 13px;
          cursor: pointer;
          padding: 4px;
        }
        .dl-update-later:hover { color: #555; }
        .dl-update-track {
          margin-top: 12px;
          height: 6px;
          background: #eee;
          border-radius: 999px;
          overflow: hidden;
        }
        .dl-update-bar {
          height: 100%;
          background: var(--dl-primary);
          border-radius: 999px;
          transition: width 0.2s ease-out;
        }
        .dl-update-overlay {
          position: fixed;
          inset: 0;
          z-index: 99999;
          background: rgba(0, 0, 0, 0.55);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .dl-update-overlay-card {
          background: #fff;
          border-radius: 14px;
          padding: 32px 40px;
          text-align: center;
          box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
        }
        .dl-update-spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto 18px;
          border: 4px solid #eee;
          border-top-color: var(--dl-primary);
          border-radius: 50%;
          animation: dl-update-spin 0.8s linear infinite;
        }
        @keyframes dl-update-spin {
          to { transform: rotate(360deg); }
        }
        .dl-update-overlay-text {
          font-size: 14px;
          font-weight: 600;
          color: var(--dl-dark, #2f2f2f);
          line-height: 1.5;
        }
      `}</style>
    </>
  );
}
