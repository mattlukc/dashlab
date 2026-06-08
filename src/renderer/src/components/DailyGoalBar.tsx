
interface Props {
  current: number;
  goal: number;
}

export function DailyGoalBar({ current, goal }: Props) {
  if (goal <= 0) return null;
  const pct = Math.min(100, (current / goal) * 100);
  const hit = current >= goal;
  const remaining = Math.max(0, goal - current);

  return (
    <div className="dl-goal">
      <div className="dl-goal-row">
        <div className="dl-goal-label">
          Daily Sales Goal
          {hit && <span className="dl-goal-hit">✓ Hit!</span>}
        </div>
        <div className="dl-goal-numbers dl-private">
          <span className="dl-goal-current">
            ${Math.round(current).toLocaleString()}
          </span>
          <span className="dl-goal-sep">/</span>
          <span className="dl-goal-target">
            ${Math.round(goal).toLocaleString()}
          </span>
          <span className="dl-goal-pct">{Math.round(pct)}%</span>
        </div>
      </div>
      <div className="dl-goal-track">
        <div
          className={`dl-goal-fill ${hit ? "hit" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {!hit && (
        <div className="dl-goal-foot dl-private">
          ${Math.round(remaining).toLocaleString()} to go
        </div>
      )}
      <style>{`
        .dl-goal {
          margin-bottom: 14px;
        }
        .dl-goal-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 6px;
        }
        .dl-goal-label {
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--dl-dark);
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .dl-goal-hit {
          background: var(--dl-primary);
          color: #fff;
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 3px;
          letter-spacing: 0.08em;
        }
        .dl-goal-numbers {
          font-size: 15px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: var(--dl-dark);
        }
        .dl-goal-current { color: var(--dl-primary); }
        .dl-goal-sep    { color: var(--dl-slate-mid); margin: 0 4px; }
        .dl-goal-target { color: var(--dl-slate-mid); }
        .dl-goal-pct {
          margin-left: 10px;
          color: var(--dl-slate-mid);
          font-weight: 700;
          font-size: 13px;
        }
        .dl-goal-track {
          height: 14px;
          background: #fff;
          border: 1px solid var(--dl-primary);
          border-radius: 999px;
          overflow: hidden;
        }
        .dl-goal-fill {
          height: 100%;
          background: var(--dl-primary);
          border-radius: 999px;
          transition: width 0.4s ease-out;
        }
        .dl-goal-fill.hit {
          background: linear-gradient(
            90deg,
            var(--dl-primary) 0%,
            #f59e0b 50%,
            var(--dl-primary) 100%
          );
          background-size: 200% 100%;
          animation: dl-goal-shimmer 2.4s linear infinite;
        }
        @keyframes dl-goal-shimmer {
          0%   { background-position: 0% 0; }
          100% { background-position: -200% 0; }
        }
        .dl-goal-foot {
          margin-top: 5px;
          font-size: 11px;
          font-weight: 600;
          color: var(--dl-slate-mid);
          letter-spacing: 0.04em;
          text-align: right;
        }
      `}</style>
    </div>
  );
}
