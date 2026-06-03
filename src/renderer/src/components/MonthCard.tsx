
import { Card, Text, BlockStack, ProgressBar } from "@shopify/polaris";
import type { MonthlyStats } from "../lib/types";

interface Props {
  stats: MonthlyStats;
}

export function MonthCard({ stats }: Props) {
  return (
    <Card padding="0">
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          🗓️ This Month
        </Text>
      </div>
      <div
        style={{
          padding: "16px",
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "16px 24px",
        }}
      >
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            ORDERS
          </Text>
          <Text as="p" variant="headingLg">
            {stats.ordersThisMonth}
          </Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            REVENUE
          </Text>
          <Text as="p" variant="headingLg">
            ${stats.revenueThisMonth.toLocaleString()}
          </Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            SHIPPED
          </Text>
          <Text as="p" variant="headingLg">
            {stats.shipped}
          </Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">
            UNSHIPPED
          </Text>
          <Text as="p" variant="headingLg">
            {stats.unshipped}
          </Text>
        </BlockStack>

        <div style={{ gridColumn: "1 / -1" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: "#6d7175",
              marginBottom: 6,
            }}
          >
            <span>On-time ship rate</span>
            <strong>{Math.round(stats.onTimeRate * 100)}%</strong>
          </div>
          <ProgressBar progress={stats.onTimeRate * 100} tone="success" size="small" />
        </div>
      </div>
    </Card>
  );
}
