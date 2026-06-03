
import { useNavigate, useSearchParams } from "react-router-dom";

export type CompareMode = "ly" | "lp" | "off";

interface Props {
  mode: CompareMode;
}

const OPTIONS: { value: CompareMode; label: string }[] = [
  { value: "ly", label: "vs Last Year" },
  { value: "lp", label: "vs Prev Period" },
  { value: "off", label: "Off" },
];

export function CompareSelector({ mode }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  function pick(v: CompareMode) {
    const q = new URLSearchParams(params.toString());
    if (v === "ly") q.delete("compare");
    else q.set("compare", v);
    const qs = q.toString();
    navigate(qs ? `/?${qs}` : "/");
  }

  return (
    <div className="dl-compare">
      <span className="dl-compare-label">Compare:</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          className={`dl-compare-btn ${mode === o.value ? "active" : ""}`}
          onClick={() => pick(o.value)}
        >
          {o.label}
        </button>
      ))}
      <style>{`
        .dl-compare {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-left: auto;
        }
        .dl-compare-label {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--dl-slate-mid);
          margin-right: 4px;
        }
        .dl-compare-btn {
          background: #fff;
          border: 1px solid var(--dl-light);
          color: var(--dl-dark);
          padding: 5px 10px;
          border-radius: 4px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .dl-compare-btn:hover {
          background: var(--dl-light);
        }
        .dl-compare-btn.active {
          background: var(--dl-primary);
          color: #fff;
          border-color: var(--dl-primary);
        }
      `}</style>
    </div>
  );
}
