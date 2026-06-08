
interface Pill {
  platform: "youtube" | "facebook" | "instagram" | "tiktok";
  handle: string;
  followers: number;
  contentCount?: number;
}

interface Props {
  pills: Pill[];
  /** "tv" = larger sizes for wall display; "dashboard" = smaller inline. */
  size?: "tv" | "dashboard";
  /** "row" = horizontal grid (default), "column" = single-column stack. */
  layout?: "row" | "column";
}

const BRAND_COLORS: Record<string, { bg: string; fg: string }> = {
  youtube: { bg: "#FF0033", fg: "#fff" },
  facebook: { bg: "#1877F2", fg: "#fff" },
  instagram: {
    bg: "linear-gradient(135deg, #f9ce34 0%, #ee2a7b 50%, #6228d7 100%)",
    fg: "#fff",
  },
  tiktok: { bg: "#000000", fg: "#fff" },
};

function platformLabel(p: string): string {
  switch (p) {
    case "youtube":
      return "YouTube";
    case "facebook":
      return "Facebook";
    case "instagram":
      return "Instagram";
    case "tiktok":
      return "TikTok";
    default:
      return p;
  }
}

function followerLabel(p: string): string {
  switch (p) {
    case "youtube":
      return "subscribers";
    default:
      return "followers";
  }
}

/** Inline SVG brand glyphs. White fill so they sit on the colored circle. */
function PlatformIcon({ p, size }: { p: string; size: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "currentColor",
    "aria-hidden": true,
  } as const;
  switch (p) {
    case "youtube":
      return (
        <svg {...props}>
          <path d="M21.6 7.2c-.2-1.4-.9-2.4-2.3-2.6C16.9 4.2 12 4.2 12 4.2s-4.9 0-7.3.4c-1.4.2-2.1 1.2-2.3 2.6C2 9.4 2 12 2 12s0 2.6.4 4.8c.2 1.4.9 2.4 2.3 2.6 2.4.4 7.3.4 7.3.4s4.9 0 7.3-.4c1.4-.2 2.1-1.2 2.3-2.6.4-2.2.4-4.8.4-4.8s0-2.6-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z" />
        </svg>
      );
    case "facebook":
      return (
        <svg {...props}>
          <path d="M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12z" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...props}>
          <path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2 0 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.9.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.9.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.9-.9-1.4-.2-.4-.4-1.1-.4-2.2-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.9-.7 1.4-.9.4-.2 1.1-.4 2.2-.4 1.2-.1 1.6-.1 4.8-.1M12 0C8.7 0 8.3 0 7.1.1 5.8.1 4.9.3 4.2.6c-.8.3-1.5.7-2.2 1.4S.9 3.4.6 4.2C.3 4.9.1 5.8.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.1 1.2.3 2.1.6 2.9.3.8.7 1.5 1.4 2.2.7.7 1.4 1.1 2.2 1.4.7.3 1.6.5 2.9.6 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c1.2-.1 2.1-.3 2.9-.6.8-.3 1.5-.7 2.2-1.4.7-.7 1.1-1.4 1.4-2.2.3-.7.5-1.6.6-2.9.1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.1-1.2-.3-2.1-.6-2.9-.3-.8-.7-1.5-1.4-2.2-.7-.7-1.4-1.1-2.2-1.4-.7-.3-1.6-.5-2.9-.6C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...props}>
          <path d="M19.6 6.3a4.8 4.8 0 0 1-3.8-4.3h-3.4v13.7c0 1.5-1.2 2.7-2.7 2.7s-2.7-1.2-2.7-2.7 1.2-2.7 2.7-2.7c.3 0 .6 0 .9.1V9.5c-.3-.1-.6-.1-.9-.1A6 6 0 1 0 15.7 15.4V8.7a8.1 8.1 0 0 0 3.9 1V6.3z" />
        </svg>
      );
    default:
      return null;
  }
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function SocialFollowersStrip({
  pills,
  size = "dashboard",
  layout = "row",
}: Props) {
  if (pills.length === 0) return null;
  const isTv = size === "tv";
  const isColumn = layout === "column";
  // Sort most followers to least, left-to-right (or top-to-bottom in column mode)
  pills = [...pills].sort((a, b) => b.followers - a.followers);

  return (
    <div className={`dl-social ${isTv ? "tv" : ""} ${isColumn ? "column" : ""}`}>
      {pills.map((p) => {
        const colors = BRAND_COLORS[p.platform];
        return (
          <div className="dl-social-card" key={p.platform}>
            <div
              className="dl-social-icon"
              style={{ background: colors.bg, color: colors.fg }}
            >
              <PlatformIcon p={p.platform} size={isTv ? 28 : 22} />
            </div>
            <div className="dl-social-body">
              <div className="dl-social-platform">{platformLabel(p.platform)}</div>
              <div className="dl-social-count">
                {formatFollowers(p.followers)}
              </div>
              <div className="dl-social-handle">
                {p.handle}
                {p.contentCount != null && p.contentCount > 0 && (
                  <span className="dl-social-sub">
                    {" · "}
                    {p.contentCount.toLocaleString()}{" "}
                    {p.platform === "youtube" ? "videos" : "posts"}
                  </span>
                )}
              </div>
              <div className="dl-social-foot">{followerLabel(p.platform)}</div>
            </div>
          </div>
        );
      })}
      <style>{`
        .dl-social {
          display: grid;
          grid-template-columns: repeat(${pills.length}, 1fr);
          column-gap: 12px;
          row-gap: 12px;
          margin-bottom: 18px;
        }
        .dl-social.column {
          grid-template-columns: 1fr;
        }
        @media (max-width: 1100px) {
          .dl-social:not(.column) { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 600px) {
          .dl-social:not(.column) { grid-template-columns: 1fr; }
        }
        .dl-social-card {
          display: flex;
          align-items: stretch;
          gap: 14px;
          background: #fff;
          border: 1px solid #E6E3E0;
          border-radius: 10px;
          padding: 14px 16px;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          overflow: hidden;
        }
        .dl-social-icon {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .dl-social.tv .dl-social-icon {
          width: 64px;
          height: 64px;
          border-radius: 14px;
        }
        .dl-social-body {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .dl-social-platform {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #6d7175;
          margin-bottom: 2px;
        }
        .dl-social.tv .dl-social-platform { font-size: 12px; }
        .dl-social-count {
          font-size: 28px;
          font-weight: 900;
          color: #2F2F2F;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .dl-social.tv .dl-social-count { font-size: 36px; }
        .dl-social-handle {
          font-size: 12px;
          font-weight: 600;
          color: #4a4a4a;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .dl-social-sub { color: #8c9196; font-weight: 500; }
        .dl-social-foot {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #8c9196;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
}
