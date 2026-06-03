import { useEffect, useState } from "react";

/**
 * Live clock for the TV header, updates every 15s. (Data refresh is handled by
 * the TV page itself via an interval re-fetch — a full reload would bounce the
 * MemoryRouter back to the dashboard.)
 */
export function TvAutoRefresh() {
  const [now, setNow] = useState<string>("");

  useEffect(() => {
    function tick() {
      setNow(
        new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
      );
    }
    tick();
    const ti = setInterval(tick, 15_000);
    return () => clearInterval(ti);
  }, []);

  return (
    <div
      style={{
        fontSize: 36,
        fontWeight: 900,
        letterSpacing: "0.04em",
        color: "#2F2F2F",
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      }}
    >
      {now}
    </div>
  );
}
