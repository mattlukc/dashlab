
import { Card, Text } from "@shopify/polaris";

interface Row {
  sku: string;
  name: string;
  isCustom: boolean;
  total: number;
  perChannel: Record<string, number>;
}

interface Props {
  items: Row[];
  channels: string[];
  title?: string;
  /** Optional: also surface FBA aggregate that's not yet itemized. */
  pendingFbaUnits?: number;
}

function channelLabel(c: string): string {
  switch (c) {
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
    case "other":
      return "Other";
    default:
      return c;
  }
}

/**
 * Per-channel items-sold table, matching the TV view's style.
 * Wrapped in a Polaris Card so it slots cleanly into the main dashboard grid.
 */
export function ItemsSoldTodayCard({
  items,
  channels,
  title = "Items Sold · Today",
  pendingFbaUnits,
}: Props) {
  const totalUnits = items.reduce((s, r) => s + r.total, 0);
  return (
    <Card padding="0">
      <div className="dl-items-head">
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        {items.length > 0 && (
          <span className="dl-items-meta">
            {items.length} {items.length === 1 ? "product" : "products"} ·{" "}
            <strong>{totalUnits}</strong> units
            {pendingFbaUnits != null && pendingFbaUnits > 0 && (
              <>
                {" · "}
                <em>+ {pendingFbaUnits} FBA pending itemization</em>
              </>
            )}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="dl-items-empty">No products sold yet today.</div>
      ) : (
        <div className="dl-items-table-wrap">
          <table className="dl-items-table">
            <thead>
              <tr>
                <th className="dl-items-col-product">Product</th>
                {channels.map((c) => (
                  <th key={c} className="dl-items-col-num">
                    {channelLabel(c)}
                  </th>
                ))}
                <th className="dl-items-col-total">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.sku + row.name}>
                  <td className="dl-items-col-product">
                    {row.isCustom && (
                      <span className="dl-items-tag">Custom</span>
                    )}
                    {row.sku && row.sku !== "—" && (
                      <span className="dl-items-sku">{row.sku}</span>
                    )}
                    <span className="dl-items-name">{row.name}</span>
                  </td>
                  {channels.map((c) => (
                    <td key={c} className="dl-items-col-num">
                      {row.perChannel[c] || ""}
                    </td>
                  ))}
                  <td className="dl-items-col-total">{row.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <style>{`
        .dl-items-head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 14px 16px 10px;
          border-bottom: 2px solid var(--dl-primary);
        }
        .dl-items-meta {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--dl-slate-mid);
        }
        .dl-items-meta strong { color: var(--dl-primary); font-weight: 900; }
        .dl-items-meta em { font-style: normal; opacity: 0.7; }
        .dl-items-empty {
          padding: 18px 16px;
          color: var(--dl-slate-mid);
          font-size: 13px;
        }
        .dl-items-table-wrap {
          overflow-x: auto;
        }
        .dl-items-table {
          width: 100%;
          border-collapse: collapse;
        }
        .dl-items-table thead th {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--dl-slate-mid);
          padding: 8px 12px;
          background: #fafafa;
          text-align: right;
          white-space: nowrap;
          border-bottom: 1px solid var(--p-color-border);
        }
        .dl-items-table thead th.dl-items-col-product { text-align: left; }
        .dl-items-table tbody tr {
          border-bottom: 1px solid #f3f0ed;
        }
        .dl-items-table tbody tr:last-child { border-bottom: none; }
        .dl-items-table td {
          padding: 8px 12px;
          font-size: 13px;
          font-weight: 600;
          color: var(--dl-dark);
          font-variant-numeric: tabular-nums;
          text-align: right;
          white-space: nowrap;
        }
        .dl-items-col-product {
          text-align: left !important;
          width: 100%;
          max-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dl-items-col-num { color: #4a4a4a; width: 88px; }
        .dl-items-col-total {
          font-weight: 900 !important;
          color: var(--dl-dark);
          width: 72px;
        }
        .dl-items-sku {
          color: var(--dl-slate-mid);
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 11px;
          margin-right: 8px;
        }
        .dl-items-name {
          font-weight: 700;
        }
        .dl-items-tag {
          display: inline-block;
          background: var(--dl-primary);
          color: #fff;
          font-size: 9px;
          font-weight: 800;
          padding: 1px 5px;
          border-radius: 3px;
          margin-right: 8px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          vertical-align: middle;
        }
      `}</style>
    </Card>
  );
}
