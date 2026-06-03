
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useState } from "react";

interface Props {
  /** Date currently shown, format YYYY-MM-DD. Empty = today. */
  selectedDate: string;
  /** Today's date in YYYY-MM-DD (server local). */
  today: string;
}

function DateInput({
  initial,
  today,
  onPick,
  onCancel,
}: {
  initial: string;
  today: string;
  onPick: (d: string) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(initial);
  function commit(v: string) {
    // Only navigate when we have a valid full YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      const t = new Date(v);
      if (!isNaN(t.getTime())) onPick(v);
    }
  }
  return (
    <input
      type="date"
      className="dl-date-input"
      value={val}
      max={today}
      onChange={(e) => {
        setVal(e.target.value);
        // If user picked via the native calendar UI, the value is complete — commit
        // Only commit if the change came from selection (length check) not partial typing
        if (e.target.value && e.target.value.length === 10) {
          commit(e.target.value);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit(val);
        if (e.key === "Escape") onCancel();
      }}
      autoFocus
    />
  );
}

function shiftDate(yyyyMmDd: string, deltaDays: number): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + deltaDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function DateNavigator({ selectedDate, today }: Props) {
  const routerPush = useNavigate();
  const [params] = useSearchParams();
  const [showCal, setShowCal] = useState(false);

  function navigate(toDate: string) {
    const q = new URLSearchParams(params.toString());
    if (toDate === today) {
      q.delete("date");
    } else {
      q.set("date", toDate);
    }
    const qs = q.toString();
    routerPush(qs ? `/?${qs}` : "/");
  }

  const isToday = selectedDate === today;

  // Keyboard arrows ← / → step day-by-day. Ignored while typing in inputs.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(shiftDate(selectedDate, -1));
      } else if (e.key === "ArrowRight") {
        if (!isToday) {
          e.preventDefault();
          navigate(shiftDate(selectedDate, 1));
        }
      } else if (e.key === "t" || e.key === "T") {
        if (!isToday) {
          e.preventDefault();
          navigate(today);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, today, isToday]);

  return (
    <div className="dl-date-nav">
      <button
        className="dl-date-arrow"
        aria-label="Previous day"
        onClick={() => navigate(shiftDate(selectedDate, -1))}
      >
        ‹
      </button>

      <button
        className="dl-date-cal-btn"
        aria-label="Pick a date"
        onClick={() => setShowCal((v) => !v)}
        title="Pick a date"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="square"
          strokeLinejoin="miter"
          aria-hidden
        >
          <rect x="3" y="5" width="18" height="16" rx="1" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="8" y1="3" x2="8" y2="7" />
          <line x1="16" y1="3" x2="16" y2="7" />
        </svg>
      </button>

      {showCal && (
        <DateInput
          initial={selectedDate}
          today={today}
          onPick={(d) => {
            navigate(d);
            setShowCal(false);
          }}
          onCancel={() => setShowCal(false)}
        />
      )}

      <button
        className="dl-date-arrow"
        aria-label="Next day"
        onClick={() => navigate(shiftDate(selectedDate, 1))}
        disabled={isToday}
      >
        ›
      </button>

      {!isToday && (
        <button className="dl-today-btn" onClick={() => navigate(today)}>
          Go to today
        </button>
      )}

      <style>{`
        .dl-date-nav {
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .dl-date-arrow,
        .dl-date-cal-btn {
          width: 28px;
          height: 28px;
          border: 1px solid var(--dl-light);
          background: #fff;
          color: var(--dl-dark);
          border-radius: 4px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .dl-date-arrow:hover:not(:disabled),
        .dl-date-cal-btn:hover {
          background: var(--dl-light);
        }
        .dl-date-arrow:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .dl-date-input {
          border: 1px solid var(--dl-light);
          border-radius: 4px;
          padding: 4px 8px;
          font-family: inherit;
          font-size: 13px;
        }
        .dl-today-btn {
          background: var(--dl-primary);
          color: #fff;
          border: none;
          padding: 5px 12px;
          border-radius: 4px;
          font-family: inherit;
          font-weight: 700;
          font-size: 11px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          cursor: pointer;
        }
        .dl-today-btn:hover {
          background: var(--dl-primary-hover);
        }
      `}</style>
    </div>
  );
}
