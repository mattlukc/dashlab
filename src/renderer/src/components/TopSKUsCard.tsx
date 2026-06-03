
import { Card, Text, BlockStack } from "@shopify/polaris";

interface SKURow {
  sku: string;
  name: string;
  quantity: number;
  orderCount: number;
  isCustom: boolean;
}

interface Props {
  rows: SKURow[];
  title?: string;
}

export function TopSKUsCard({ rows, title = "Top SKUs · Today" }: Props) {
  const max = rows[0]?.quantity ?? 0;
  return (
    <Card padding="0">
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
      </div>
      <div style={{ padding: "10px 16px 14px" }}>
        {rows.length === 0 ? (
          <BlockStack gap="100">
            <Text as="p" tone="subdued">
              No products sold yet.
            </Text>
          </BlockStack>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((row) => (
              <div key={row.sku + row.name}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginBottom: 4,
                    gap: 10,
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {row.sku !== "—" && (
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
                    {row.isCustom && (
                      <span
                        style={{
                          background: "var(--dl-primary)",
                          color: "#fff",
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "1px 5px",
                          borderRadius: 2,
                          marginRight: 6,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        Custom
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
                      width: `${(row.quantity / max) * 100}%`,
                      background: "var(--dl-primary)",
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
