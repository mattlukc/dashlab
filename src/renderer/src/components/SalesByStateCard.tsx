
import { Card, Text, BlockStack } from "@shopify/polaris";

interface StateRow {
  state: string;
  revenue: number;
  orders: number;
}

interface Props {
  rows: StateRow[];
  title?: string;
}

export function SalesByStateCard({ rows, title = "Top States · YTD" }: Props) {
  const total = rows.reduce((sum, r) => sum + r.revenue, 0);
  const max = rows[0]?.revenue ?? 0;
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
              No data yet.
            </Text>
          </BlockStack>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((row) => {
              const pct = total === 0 ? 0 : (row.revenue / total) * 100;
              return (
                <div key={row.state}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 13,
                      marginBottom: 4,
                      gap: 10,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{row.state}</span>
                    <span style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
                      <span className="dl-private" style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                        ${Math.round(row.revenue).toLocaleString()}
                      </span>
                      <span style={{ color: "#6d7175", fontSize: 11 }}>
                        {row.orders} ord
                      </span>
                      <span style={{ color: "#6d7175", fontSize: 11, minWidth: 32, textAlign: "right" }}>
                        {pct.toFixed(1)}%
                      </span>
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
                        width: `${(row.revenue / max) * 100}%`,
                        background: "var(--dl-primary)",
                        borderRadius: 4,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}
