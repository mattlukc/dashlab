
import { Card, Text, Badge, BlockStack, Banner } from "@shopify/polaris";
import type { FBAStats } from "../lib/types";

// Short codes for the active-marketplace breakdown label (e.g. "US + CA + MX").
const MARKETPLACE_CODES: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A2EUQ1WTGCTBG2: "CA",
  A1AM78C64UM0Y8: "MX",
};

interface Props {
  stats: FBAStats;
  /** Active SP-API marketplace IDs — drives the combined-totals breakdown badge. */
  marketplaceIds?: string[];
}

export function FBASection({ stats, marketplaceIds = [] }: Props) {
  // When more than one marketplace feeds these numbers, show which ones the
  // combined totals span (e.g. "US + CA + MX").
  const breakdown =
    marketplaceIds.length > 1
      ? marketplaceIds
          .map((id) => MARKETPLACE_CODES[id] ?? id)
          .join(" + ")
      : null;
  return (
    <Card padding="0">
      <div
        style={{
          borderTop: "4px solid var(--dl-amazon)",
          padding: "16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          📦 Amazon FBA
        </Text>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {breakdown && <Badge tone="info">{breakdown}</Badge>}
          <Badge>Amazon ships these</Badge>
        </div>
      </div>

      <div
        style={{
          padding: "16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px",
        }}
      >
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            FBA ORDERS TODAY
          </Text>
          <Text as="p" variant="headingXl">
            {stats.ordersToday}
          </Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            FBA REVENUE TODAY
          </Text>
          <Text as="p" variant="headingXl">
            ${stats.revenueToday.toLocaleString()}
          </Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            SKUS AT AMAZON
          </Text>
          <Text as="p" variant="headingXl">
            {stats.skusAtAmazon}
          </Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            IN STOCK
          </Text>
          <Text as="p" variant="headingXl" tone="success">
            {stats.inStock}
          </Text>
        </BlockStack>

        <div style={{ gridColumn: "1 / -1" }}>
          {stats.lowStockSkus.length > 0 && (
            <Banner tone="warning">
              <Text as="span" variant="bodySm">
                <strong>{stats.lowStockSkus.length} SKUs low at FBA</strong> —{" "}
                {stats.lowStockSkus.join(", ")}. Restock recommended.
              </Text>
            </Banner>
          )}
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Text as="p" variant="bodySm" tone="subdued">
            FBA orders never appear in &ldquo;Needs to Ship Today&rdquo; — Amazon
            fulfills these from their warehouses. DashLab only tracks revenue
            + inventory health for FBA.
          </Text>
        </div>
      </div>
    </Card>
  );
}
