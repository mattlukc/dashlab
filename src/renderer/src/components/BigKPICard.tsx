
import { Card } from "@shopify/polaris";

interface BigKPICardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  /** Compact variant — smaller font, less visual weight. Used for period rows. */
  compact?: boolean;
  /** Optional comparison delta. Positive = up (green), negative = down (red). */
  delta?: {
    pct: number;
    label: string;
    priorValue?: string;
  };
}

/**
 * KPI card designed for wall-display readability — large label, huge value,
 * readable from across the shop.
 */
export function BigKPICard({
  label,
  value,
  sub,
  accent,
  delta,
  compact = false,
}: BigKPICardProps) {
  const deltaColor =
    delta == null
      ? undefined
      : delta.pct > 0
      ? "var(--dl-success)"
      : delta.pct < 0
      ? "var(--dl-danger)"
      : "var(--dl-slate-mid)";
  const arrow = delta == null ? "" : delta.pct > 0 ? "▲" : delta.pct < 0 ? "▼" : "■";
  // Auto-privacy: any value with $ is sensitive
  const isMoney = value.includes("$");
  const subIsMoney = sub?.includes("$") ?? false;
  const priorIsMoney = delta?.priorValue?.includes("$") ?? false;
  return (
    <Card>
      <div className={`dl-kpi ${compact ? "dl-kpi-compact" : ""}`}>
        <div className="dl-kpi-label">{label.toUpperCase()}</div>
        <div
          className={`dl-kpi-value ${isMoney ? "dl-private" : ""}`}
          style={{ color: accent ?? "var(--dl-dark)" }}
        >
          {value}
        </div>
        {delta != null && (
          <div className="dl-kpi-delta" style={{ color: deltaColor }}>
            {arrow} {Math.abs(delta.pct).toFixed(0)}%{" "}
            <span className="dl-kpi-delta-label">{delta.label}</span>
            {delta.priorValue && (
              <span className={`dl-kpi-delta-prior ${priorIsMoney ? "dl-private" : ""}`}> · was {delta.priorValue}</span>
            )}
          </div>
        )}
        {sub && <div className={`dl-kpi-sub ${subIsMoney ? "dl-private" : ""}`}>{sub}</div>}
      </div>
      <style>{`
        .dl-kpi {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 8px 4px 4px;
        }
        .dl-kpi-label {
          font-size: 16px;
          font-weight: 800;
          letter-spacing: 0.1em;
          color: var(--dl-slate-mid);
        }
        .dl-kpi-value {
          font-size: 56px;
          font-weight: 900;
          line-height: 1;
          font-variant-numeric: tabular-nums;
          word-break: break-word;
        }
        .dl-kpi-sub {
          font-size: 14px;
          font-weight: 600;
          color: var(--dl-slate-mid);
          letter-spacing: 0.02em;
        }
        .dl-kpi-delta {
          font-size: 14px;
          font-weight: 800;
          letter-spacing: 0.02em;
        }
        .dl-kpi-delta-label {
          color: var(--dl-slate-mid);
          font-weight: 600;
        }
        .dl-kpi-delta-prior {
          color: var(--dl-slate-mid);
          font-weight: 500;
          font-size: 12px;
        }
        @media (max-width: 1100px) {
          .dl-kpi-value { font-size: 44px; }
          .dl-kpi-label { font-size: 14px; }
          .dl-kpi-sub { font-size: 12px; }
        }

        /* Compact variant — smaller for secondary period rows */
        .dl-kpi-compact .dl-kpi-label { font-size: 12px; }
        .dl-kpi-compact .dl-kpi-value { font-size: 28px; }
        .dl-kpi-compact .dl-kpi-sub { font-size: 12px; }
        .dl-kpi-compact .dl-kpi-delta { font-size: 12px; }
        .dl-kpi-compact .dl-kpi-delta-prior { font-size: 11px; }
      `}</style>
    </Card>
  );
}
