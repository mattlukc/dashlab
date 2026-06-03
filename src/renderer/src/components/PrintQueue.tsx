
// Inline print queue for the Orders page. Shows what's queued (count + list) and
// a "Print All Slips" button. Printing happens silently in-place: every slip is
// rendered into a hidden container portaled to <body>, which is the ONLY thing
// visible in @media print. window.print() fires the OS dialog (one 4x6 page per
// slip); afterprint marks the orders slip_printed and refreshes the count.
// No navigation, no new tab.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PrintingSlip } from "./PrintingSlip";
import { useRefresh } from "../RefreshContext";
import type { Order } from "../lib/types";

export function PrintQueue({ orders }: { orders: Order[] }) {
  const triggerRefresh = useRefresh();
  const marked = useRef(false);
  const [mounted, setMounted] = useState(false);
  const idsKey = orders.map((o) => o.id).join(",");

  // Portals need document.body, so only render the print container after mount.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onAfterPrint() {
      if (marked.current) return; // mark once per print run
      const orderIds = idsKey ? idsKey.split(",") : [];
      if (orderIds.length === 0) return;
      marked.current = true;
      fetch("/api/print/mark-printed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds }),
      })
        .catch(() => {
          // best-effort — never block on marking
        })
        .finally(() => {
          // Soft refresh so printed orders drop out of the queue + count updates
          // (no reload/flash).
          triggerRefresh();
        });
    }
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  function handlePrintAll() {
    if (orders.length === 0) return;
    marked.current = false; // let this run mark when the dialog closes
    window.print();
  }

  const count = orders.length;

  return (
    <section className="dl-print-queue dl-no-print">
      <div className="dl-pq-bar">
        <div className="dl-pq-title">
          Print Queue
          <span className="dl-pq-count">{count}</span>
          <span className="dl-pq-sub">
            {count === 1 ? "slip awaiting print" : "slips awaiting print"}
          </span>
        </div>
        <button
          className="dl-pq-btn"
          onClick={handlePrintAll}
          disabled={count === 0}
        >
          🖨️ Print All Slips
        </button>
      </div>

      {count === 0 ? (
        <div className="dl-pq-empty">
          Nothing waiting to print — new orders show up here automatically.
        </div>
      ) : (
        <ul className="dl-pq-list">
          {orders.map((o) => (
            <li className="dl-pq-row" key={o.id}>
              <span className="dl-pq-num">#{o.orderNumber}</span>
              <span className="dl-pq-cust">{o.customerName || "—"}</span>
              <span className="dl-pq-items">
                {o.totalItems} {o.totalItems === 1 ? "item" : "items"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* Hidden, print-only slip container. Portaled to <body> so it's a direct
          child of body and the print CSS below can hide every other top-level
          node (topbar, main, etc.). Invisible on screen. */}
      {mounted &&
        count > 0 &&
        createPortal(
          <div className="dl-print-container">
            {orders.map((o) => (
              <div className="dl-print-slip" key={o.id}>
                <PrintingSlip order={o} preview={false} />
              </div>
            ))}
          </div>,
          document.body
        )}
    </section>
  );
}
