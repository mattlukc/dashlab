
import { Link, useLocation } from "react-router-dom";

export function TvButton() {
  const pathname = useLocation().pathname;
  const onTv = pathname?.startsWith("/tv");
  return (
    <Link
      to={onTv ? "/" : "/tv"}
      className="dl-tv-btn"
      aria-label={onTv ? "Exit TV mode" : "Open TV mode"}
      title={onTv ? "Exit TV mode" : "TV / wall display mode"}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="square"
        aria-hidden
      >
        <rect x="2" y="4" width="20" height="14" rx="2" />
        <line x1="8" y1="22" x2="16" y2="22" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
      <span>TV</span>
      <style>{`
        .dl-tv-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 10px;
          background: rgba(255,255,255,0.08);
          color: #fff;
          border: 1px solid rgba(255,255,255,0.16);
          border-radius: 4px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-decoration: none;
          cursor: pointer;
          transition: background 0.12s;
        }
        .dl-tv-btn:hover {
          background: var(--dl-primary);
          border-color: var(--dl-primary);
        }
      `}</style>
    </Link>
  );
}
