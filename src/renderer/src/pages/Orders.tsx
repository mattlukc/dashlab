// Orders page. Fetches the ship-today / ship-this-week split + print queue
// from the main process (api:orders-page:get, computed in src/main/dashboard.ts).
// Re-fetches on window focus so a print run or sync reflects immediately.

import { useEffect, useState } from "react";
import { ShipTodayTable } from "../components/ShipTodayTable";
import { AutoPrintQueue } from "../components/AutoPrintQueue";
import { PrintQueue } from "../components/PrintQueue";
import type { Order } from "../lib/types";

interface OrdersData {
  shipTodayOrders: Order[];
  shipWeekOrders: Order[];
  printQueue: Order[];
}

export default function OrdersPage({ refreshKey = 0 }: { refreshKey?: number }) {
  const [data, setData] = useState<OrdersData | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/orders-page", { cache: "no-store" });
        const json = (await res.json()) as OrdersData;
        if (!cancelled) setData(json);
      } catch {
        // keep prior frame
      }
    }
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshKey]);

  const shipTodayOrders = data?.shipTodayOrders ?? [];
  const shipWeekOrders = data?.shipWeekOrders ?? [];
  const printQueue = data?.printQueue ?? [];

  return (
    <>
      <div className="dl-page-title">
        <h1>Orders</h1>
      </div>

      <PrintQueue orders={printQueue} />

      <div className="dl-grid-2">
        <ShipTodayTable orders={shipTodayOrders} weekOrders={shipWeekOrders} />
        {/* Auto-print farm jobs aren't tracked server-side yet — empty for now. */}
        <AutoPrintQueue jobs={[]} />
      </div>
    </>
  );
}
