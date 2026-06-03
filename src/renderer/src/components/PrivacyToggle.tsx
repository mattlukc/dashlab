
import { useEffect, useState } from "react";

const STORAGE_KEY = "dl-privacy-mode";

/**
 * Toggle "privacy mode" for live-streaming / recording sessions.
 * When on, the `.dl-privacy-on` class is applied to <body>, which blurs
 * any element marked with `.dl-private`.
 */
export function PrivacyToggle() {
  const [on, setOn] = useState(false);

  // Read saved state on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "1") {
      setOn(true);
      document.body.classList.add("dl-privacy-on");
    }
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    if (next) {
      document.body.classList.add("dl-privacy-on");
      localStorage.setItem(STORAGE_KEY, "1");
    } else {
      document.body.classList.remove("dl-privacy-on");
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <button
      onClick={toggle}
      className={`dl-privacy-btn ${on ? "active" : ""}`}
      aria-label={on ? "Disable privacy mode" : "Enable privacy mode"}
      title={on ? "Privacy mode ON — click to reveal numbers" : "Privacy mode (for streaming / recording)"}
    >
      {/* Eye icon — closed when privacy is on, open when off */}
      {on ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
          <path d="M17.94 17.94A10.06 10.06 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {on && <span className="dl-privacy-label">PRIVACY</span>}
      <style>{`
        .dl-privacy-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 10px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 4px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          cursor: pointer;
          transition: background 0.12s;
        }
        .dl-privacy-btn:hover { background: rgba(255, 255, 255, 0.16); }
        .dl-privacy-btn.active {
          background: var(--dl-primary);
          border-color: var(--dl-primary);
          color: #fff;
        }
        .dl-privacy-label { font-weight: 800; }
      `}</style>
    </button>
  );
}
