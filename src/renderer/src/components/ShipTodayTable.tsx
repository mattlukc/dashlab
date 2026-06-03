
import {
  Card,
  Text,
  Badge,
  InlineStack,
  Button,
} from "@shopify/polaris";
import type { Order } from "../lib/types";

interface Props {
  orders: Order[];
  /** Orders due in the next ~6 days (after today). Optional. */
  weekOrders?: Order[];
  /** Max rows shown per section before "+N more" appears. */
  maxPerSection?: number;
}

function channelLabel(channel: Order["channel"]) {
  switch (channel) {
    case "shopify":
      return "Shopify";
    case "amazon_fbm":
      return "Amazon FBM";
    case "amazon_fba":
      return "Amazon FBA";
    case "etsy":
      return "Etsy";
    case "ebay":
      return "eBay";
    case "manual":
      return "Manual";
    default:
      return "Other";
  }
}

function statusTone(
  status: Order["status"]
): "info" | "warning" | "success" | "critical" | undefined {
  switch (status) {
    case "printing":
      return "info";
    case "awaiting_print":
      return "warning";
    case "slip_printed":
      return "success";
    case "shipped":
      return "success";
    case "cancelled":
      return "critical";
    default:
      return undefined;
  }
}

/** Human-readable label for a ship-by date. */
function formatShipByLabel(shipBy: string | null | undefined): string {
  if (!shipBy) return "—";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const ship = new Date(shipBy);
  ship.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (ship.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "TODAY";
  if (diffDays === -1) return "OVERDUE · 1 day";
  if (diffDays < 0) return `OVERDUE · ${Math.abs(diffDays)} days`;
  if (diffDays === 1) return "Tomorrow";
  return ship.toLocaleDateString("en-US", {
    weekday: "short",
    month: "numeric",
    day: "numeric",
  });
}

function statusLabel(status: Order["status"]) {
  switch (status) {
    case "awaiting_print":
      return "Awaiting print";
    case "printing":
      return "Printing";
    case "slip_printed":
      return "Slip printed";
    case "shipped":
      return "Shipped";
    case "cancelled":
      return "Cancelled";
  }
}

function OrderRow({ order }: { order: Order }) {
  const customLineCount = order.lineItems.filter((li) => li.isCustom).length;
  const label = formatShipByLabel(order.shipBy);
  const overdue = label.startsWith("OVERDUE");

  return (
    <tr>
      <td>
        <a href={`/orders/${order.orderNumber}`} className="dl-order-link">
          #{order.orderNumber}
        </a>
      </td>
      <td>
        <div className="dl-cust-name">{order.customerName}</div>
        <div className="dl-cust-sub">
          {order.lineItems.length} items
          {customLineCount > 0 && ` · ${customLineCount} custom`}
        </div>
      </td>
      <td className="dl-channel">{channelLabel(order.channel)}</td>
      <td>
        {order.isRush ? (
          <Badge tone="critical">RUSH</Badge>
        ) : (
          <Badge tone={statusTone(order.status)}>
            {statusLabel(order.status) ?? "—"}
          </Badge>
        )}
      </td>
      <td
        className={
          "dl-shipby" +
          (overdue || order.isRush ? " dl-shipby-urgent" : "")
        }
      >
        {order.isRush ? `${label} · Priority` : label}
      </td>
      <td className="dl-print-cell">
        <RowPrintLink orderNumber={order.orderNumber} />
      </td>
    </tr>
  );
}

function RowPrintLink({ orderNumber }: { orderNumber: string }) {
  return (
    <a
      href={`/api/print/${orderNumber}`}
      onClick={async (e) => {
        e.preventDefault();
        const target = e.currentTarget;
        target.textContent = "…";
        try {
          const res = await fetch(`/api/print/${orderNumber}`, {
            method: "POST",
          });
          const data = await res.json();
          target.textContent = data.ok ? "Sent ✓" : "Failed";
        } catch {
          target.textContent = "Failed";
        }
        setTimeout(() => (target.textContent = "Print"), 2500);
      }}
      className="dl-print-link"
    >
      Print
    </a>
  );
}

export function ShipTodayTable({
  orders,
  weekOrders = [],
  maxPerSection = 5,
}: Props) {
  // FBM channels only — FBA orders are fulfilled by Amazon
  const fbmToday = orders.filter((o) => o.channel !== "amazon_fba");
  const fbmWeek = weekOrders.filter((o) => o.channel !== "amazon_fba");

  const todayShown = fbmToday.slice(0, maxPerSection);
  const todayHidden = fbmToday.length - todayShown.length;
  const weekShown = fbmWeek.slice(0, maxPerSection);
  const weekHidden = fbmWeek.length - weekShown.length;

  return (
    <Card padding="0">
      <div className="dl-ship-header">
        <InlineStack gap="200" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Ship Queue
          </Text>
          <Badge tone="warning">{`${fbmToday.length} today`}</Badge>
          {fbmWeek.length > 0 && (
            <Badge tone="info">{`${fbmWeek.length} this week`}</Badge>
          )}
        </InlineStack>
        <InlineStack gap="200">
          <Button>Open in ShipStation</Button>
        </InlineStack>
      </div>

      <table className="dl-ship-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Channel</th>
            <th>Status</th>
            <th>Ship by</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {/* Section: Ship today */}
          <tr className="dl-section">
            <td colSpan={6}>Ship today / overdue</td>
          </tr>
          {todayShown.length === 0 && (
            <tr>
              <td colSpan={6} className="dl-empty">
                Nothing due today
              </td>
            </tr>
          )}
          {todayShown.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
          {todayHidden > 0 && (
            <tr className="dl-more">
              <td colSpan={6}>
                <a href="/orders">+{todayHidden} more — view all</a>
              </td>
            </tr>
          )}

          {/* Section: Ship this week */}
          {fbmWeek.length > 0 && (
            <>
              <tr className="dl-section">
                <td colSpan={6}>Ship this week</td>
              </tr>
              {weekShown.map((o) => (
                <OrderRow key={o.id} order={o} />
              ))}
              {weekHidden > 0 && (
                <tr className="dl-more">
                  <td colSpan={6}>
                    <a href="/orders">+{weekHidden} more — view all</a>
                  </td>
                </tr>
              )}
            </>
          )}
        </tbody>
      </table>

      <style>{`
        .dl-ship-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px;
          border-bottom: 1px solid var(--p-color-border);
        }
        .dl-ship-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          table-layout: fixed;
        }
        .dl-ship-table thead th {
          text-align: left;
          padding: 10px 16px;
          background: #fafbfb;
          color: #6d7175;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-weight: 600;
          border-bottom: 1px solid var(--p-color-border);
        }
        .dl-ship-table tbody td {
          padding: 10px 16px;
          border-bottom: 1px solid #eef0f2;
          vertical-align: middle;
        }
        /* Column widths — keep both sections aligned */
        .dl-ship-table thead th:nth-child(1),
        .dl-ship-table tbody td:nth-child(1) { width: 12%; }
        .dl-ship-table thead th:nth-child(2),
        .dl-ship-table tbody td:nth-child(2) { width: 32%; }
        .dl-ship-table thead th:nth-child(3),
        .dl-ship-table tbody td:nth-child(3) { width: 13%; }
        .dl-ship-table thead th:nth-child(4),
        .dl-ship-table tbody td:nth-child(4) { width: 15%; }
        .dl-ship-table thead th:nth-child(5),
        .dl-ship-table tbody td:nth-child(5) { width: 18%; }
        .dl-ship-table thead th:nth-child(6),
        .dl-ship-table tbody td:nth-child(6) { width: 10%; text-align: right; }

        .dl-print-link {
          color: var(--dl-primary);
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          text-decoration: none;
          padding: 4px 10px;
          border: 1px solid var(--dl-primary);
          border-radius: 4px;
          transition: background 0.12s, color 0.12s;
        }
        .dl-print-link:hover {
          background: var(--dl-primary);
          color: #fff;
        }

        .dl-section td {
          background: #fafbfb;
          padding: 8px 16px !important;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 700;
          color: #6d7175;
          border-bottom: 1px solid var(--p-color-border) !important;
          border-top: 1px solid var(--p-color-border) !important;
        }
        .dl-empty td {
          color: #8c9196;
          font-style: italic;
          text-align: center;
          padding: 16px !important;
        }
        .dl-more td {
          padding: 8px 16px !important;
        }
        .dl-more a {
          color: #2c6ecb;
          text-decoration: none;
          font-size: 12px;
          font-weight: 500;
        }
        .dl-more a:hover { text-decoration: underline; }

        .dl-order-link {
          color: #5c1bb8;
          font-weight: 700;
          text-decoration: none;
        }
        .dl-order-link:hover { text-decoration: underline; }
        .dl-cust-name { font-weight: 600; }
        .dl-cust-sub { color: #6d7175; font-size: 12px; }
        .dl-channel { font-size: 12px; }
        .dl-shipby { white-space: nowrap; }
        .dl-shipby-urgent { color: #c4314b; font-weight: 700; }
      `}</style>
    </Card>
  );
}
