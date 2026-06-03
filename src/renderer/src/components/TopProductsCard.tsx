
import { Card, Text, BlockStack } from "@shopify/polaris";
import type { Order } from "../lib/types";

interface Props {
  orders: Order[];
  limit?: number;
  title?: string;
}

interface Aggregate {
  key: string;
  sku: string | null;
  name: string;
  quantity: number;
  orders: number;
  isCustom: boolean;
}

function aggregate(orders: Order[]): Aggregate[] {
  const map = new Map<string, Aggregate>();
  for (const order of orders) {
    for (const item of order.lineItems) {
      // Group by SKU when present, else by product name.
      const key = item.sku ?? `name:${item.productName}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.orders += 1;
      } else {
        map.set(key, {
          key,
          sku: item.sku,
          name: item.productName,
          quantity: item.quantity,
          orders: 1,
          isCustom: Boolean(item.isCustom),
        });
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}

export function TopProductsCard({ orders, limit = 5, title = "Top Products · Today" }: Props) {
  const top = aggregate(orders).slice(0, limit);
  const maxQty = top[0]?.quantity ?? 0;

  return (
    <Card padding="0">
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
      </div>
      <div style={{ padding: "8px 16px 16px" }}>
        {top.length === 0 ? (
          <BlockStack gap="200">
            <Text as="p" tone="subdued">
              No products sold today yet.
            </Text>
          </BlockStack>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {top.map((row) => (
              <div key={row.key}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 4,
                    gap: 12,
                  }}
                >
                  <span style={{ fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.sku && (
                      <span
                        style={{
                          color: "#6d7175",
                          fontFamily: "monospace",
                          fontSize: 11,
                          marginRight: 6,
                        }}
                      >
                        {row.sku}
                      </span>
                    )}
                    {row.name}
                  </span>
                  <span
                    style={{
                      fontWeight: 800,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {row.quantity}
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: "#eef0f2",
                    borderRadius: 4,
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(row.quantity / maxQty) * 100}%`,
                      background: "#2c6ecb",
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
