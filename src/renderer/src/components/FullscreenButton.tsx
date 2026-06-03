
import { useEffect, useState } from "react";

export function FullscreenButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function enter() {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  function exit() {
    document.exitFullscreen().catch(() => {});
  }

  return (
    <>
      {/* In-nav button — entering fullscreen */}
      {!isFullscreen && (
        <button
          onClick={enter}
          className="dl-fullscreen-btn"
          aria-label="Enter fullscreen"
          title="Fullscreen (kiosk mode)"
        >
          ⤢
        </button>
      )}

      {/* Floating exit button — only shown when in fullscreen, top-right of paper bg */}
      {isFullscreen && (
        <button
          onClick={exit}
          className="dl-fullscreen-exit"
          aria-label="Exit fullscreen"
          title="Exit fullscreen"
        >
          ⛶
        </button>
      )}

      <style>{`
        .dl-fullscreen-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 4px;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.12s;
        }
        .dl-fullscreen-btn:hover {
          background: rgba(255, 255, 255, 0.16);
        }
        .dl-fullscreen-exit {
          position: fixed;
          top: 14px;
          right: 14px;
          z-index: 9999;
          width: 36px;
          height: 36px;
          background: rgba(0, 0, 0, 0.08);
          color: var(--dl-dark);
          border: 1px solid var(--dl-light);
          border-radius: 4px;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background 0.12s;
        }
        .dl-fullscreen-exit:hover {
          background: rgba(0, 0, 0, 0.16);
        }
      `}</style>
    </>
  );
}
