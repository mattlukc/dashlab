
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import type { Order } from "../lib/types";

interface Props {
  order: Order;
  /** When true, scales the slip to fit on screen. Real print mode = false. */
  preview?: boolean;
}

/**
 * Renders a single 4x6 Printing Slip.
 *
 * Visually mirrors mockup-printing-slip.html. When integrated with the
 * print engine, this component is rendered headlessly via Puppeteer → PDF
 * → CUPS print queue.
 */
export function PrintingSlip({ order, preview = true }: Props) {
  const barcodeRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (barcodeRef.current) {
      JsBarcode(barcodeRef.current, order.orderNumber, {
        format: "CODE128",
        width: 1.6,
        height: 50,
        displayValue: false,
        margin: 0,
      });
    }
  }, [order.orderNumber]);

  const channelLabel =
    order.channel === "amazon_fbm"
      ? "Amazon FBM"
      : order.channel === "amazon_fba"
        ? "Amazon FBA"
        : order.channel === "etsy"
          ? "Etsy"
          : "Shopify";

  const shipByLabel = (() => {
    if (!order.shipBy) return "—";
    const today = new Date();
    const shipBy = new Date(order.shipBy);
    const sameDay =
      today.toDateString() === shipBy.toDateString();
    if (sameDay) return "TODAY";
    return shipBy.toLocaleDateString("en-US", {
      weekday: "short",
      month: "numeric",
      day: "numeric",
    });
  })();

  const isShipByToday = shipByLabel === "TODAY";

  return (
    <div
      className="dl-slip-wrap"
      style={{
        // Scale to fit on screen during preview
        transform: preview ? "scale(1)" : "none",
      }}
    >
      <div className={`dl-slip ${order.isRush ? "has-rush" : ""}`}>
        {order.isRush && <div className="dl-rush">RUSH · PRIORITY MAIL</div>}

        <div className="dl-slip-header">
          <div className="dl-brand">
            <div className="dl-brand-mark">NEAT TOOLS</div>
            <div className="dl-brand-tag">Printing Slip</div>
          </div>
          <div className="dl-order-id">
            <div className="dl-order-num">#{order.orderNumber}</div>
            <span className="dl-channel">{channelLabel}</span>
          </div>
        </div>

        <div className="dl-barcode">
          <svg ref={barcodeRef} />
        </div>

        <div className="dl-customer-row">
          <div>
            <div className="dl-customer-name">{order.customerName}</div>
            <div className="dl-customer-loc">
              {[order.customerCity, order.customerState, order.customerCountry]
                .filter(Boolean)
                .join(", ")}
            </div>
          </div>
          <div className="dl-ship-by">
            <span className="dl-ship-by-label">Ship by</span>
            <span
              className={`dl-ship-by-date ${isShipByToday ? "urgent" : ""}`}
            >
              {shipByLabel}
            </span>
          </div>
        </div>

        <div className="dl-items">
          <table>
            <thead>
              <tr>
                <th className="col-sku">SKU</th>
                <th className="col-prod">Product</th>
                <th className="col-qty center">Qty</th>
                <th className="col-prn center">Printer #</th>
                <th className="col-done center">✓</th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((item, idx) => (
                <tr key={idx} className={item.isCustom ? "row-custom" : ""}>
                  <td className="col-sku">{item.sku ?? "—"}</td>
                  <td className="col-prod">
                    {item.isCustom && (
                      <span className="custom-tag">Custom</span>
                    )}
                    {item.productName}
                    {item.personalization && (
                      <span className="personalization">
                        {item.personalization}
                      </span>
                    )}
                  </td>
                  <td
                    className={`col-qty ${item.quantity >= 5 ? "qty-big" : ""}`}
                  >
                    {item.quantity}
                  </td>
                  <td className="col-prn">
                    <span className="printer-box" />
                  </td>
                  <td className="col-done">
                    <span className="done-box" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {order.customerNotes && (
          <div className="dl-notes">
            <span className="dl-notes-label">Customer note</span>
            {order.customerNotes}
          </div>
        )}

        <div className="dl-slip-footer">
          <span className="dl-total-pill">{order.totalItems} ITEMS</span>
          <span className="dl-ship-method">{order.shipMethod}</span>
        </div>
      </div>

      <style>{`
        .dl-slip-wrap {
          display: inline-block;
        }
        .dl-slip {
          width: 384px;
          height: 576px;
          background: #fff;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          color: #0a0a0a;
          font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Helvetica, Arial, sans-serif;
          position: relative;
          overflow: hidden;
          box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        }
        .dl-slip.has-rush { padding-top: 22px; }

        .dl-rush {
          position: absolute; top: 0; left: 0; right: 0;
          background: #d62828; color: #fff;
          text-align: center; font-weight: 800; font-size: 12px;
          letter-spacing: 0.18em; padding: 3px 0;
          text-transform: uppercase;
        }

        .dl-slip-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 6px; border-bottom: 1px solid #111; margin-bottom: 8px;
        }
        .dl-brand-mark { font-weight: 900; font-size: 13px; letter-spacing: 0.04em; }
        .dl-brand-tag { font-size: 9px; color: #555; text-transform: uppercase; letter-spacing: 0.12em; }
        .dl-order-id { text-align: right; }
        .dl-order-num { font-size: 26px; font-weight: 800; line-height: 1; font-variant-numeric: tabular-nums; }
        .dl-channel {
          display: inline-block; margin-top: 4px; border: 1px solid #111;
          border-radius: 3px; padding: 1px 6px; font-size: 9px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.08em;
        }

        .dl-barcode { display: flex; justify-content: center; margin: 6px 0 8px; }
        .dl-barcode svg { display: block; }

        .dl-customer-row {
          display: flex; justify-content: space-between; align-items: baseline;
          border-bottom: 1px solid #ccc; padding-bottom: 6px; margin-bottom: 8px; font-size: 11px;
        }
        .dl-customer-name { font-weight: 700; text-transform: capitalize; font-size: 12px; }
        .dl-customer-loc { color: #555; font-size: 10px; }
        .dl-ship-by { text-align: right; }
        .dl-ship-by-label { display: block; font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #555; }
        .dl-ship-by-date { font-weight: 700; font-size: 12px; }
        .dl-ship-by-date.urgent { color: #d62828; }

        .dl-items { flex: 1; overflow: hidden; border-top: 1px solid #111; }
        .dl-items table { width: 100%; border-collapse: collapse; font-size: 10px; table-layout: fixed; }
        .dl-items thead th {
          text-align: left; font-size: 8px; text-transform: uppercase;
          letter-spacing: 0.08em; color: #555; padding: 4px 4px;
          border-bottom: 1px solid #111; font-weight: 700;
        }
        .dl-items thead th.center { text-align: center; }
        .dl-items tbody td { padding: 6px 4px; border-bottom: 1px solid #ccc; vertical-align: middle; }
        .col-sku { width: 22%; font-variant-numeric: tabular-nums; font-weight: 600; }
        .col-prod { width: 38%; }
        .col-qty { width: 10%; text-align: center; font-weight: 700; }
        .col-prn { width: 18%; text-align: center; }
        .col-done { width: 12%; text-align: center; }
        .qty-big { font-size: 13px; }
        .printer-box { display: inline-block; width: 38px; height: 22px; border: 1px solid #111; border-radius: 2px; background: #fff; }
        .done-box { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #111; border-radius: 2px; background: #fff; }

        .row-custom { background: #fff4cc; }
        .custom-tag {
          display: inline-block; background: #000; color: #fff;
          font-size: 8px; font-weight: 800; padding: 1px 4px;
          border-radius: 2px; letter-spacing: 0.08em;
          text-transform: uppercase; margin-right: 4px; vertical-align: middle;
        }
        .personalization { display: block; font-size: 9px; color: #333; margin-top: 2px; font-style: italic; }

        .dl-notes {
          margin-top: 6px; padding: 6px 7px; border: 1px dashed #111; border-radius: 3px; font-size: 9px;
        }
        .dl-notes-label {
          font-size: 8px; text-transform: uppercase; letter-spacing: 0.1em; color: #555;
          display: block; margin-bottom: 2px;
        }

        .dl-slip-footer {
          margin-top: 6px; border-top: 1px solid #111; padding-top: 6px;
          display: flex; justify-content: space-between; align-items: center; font-size: 10px;
        }
        .dl-total-pill {
          background: #000; color: #fff; font-weight: 800; padding: 3px 8px;
          border-radius: 3px; font-size: 10px; letter-spacing: 0.04em;
        }
        .dl-ship-method { color: #555; font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; }
      `}</style>
    </div>
  );
}
