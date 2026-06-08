
import { Card, Text, BlockStack } from "@shopify/polaris";

interface ActivityItem {
  time: string;
  text: React.ReactNode;
}

interface Props {
  items: ActivityItem[];
}

export function ActivityFeed({ items }: Props) {
  return (
    <Card padding="0">
      <div
        style={{
          padding: "16px",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          📋 Recent Activity
        </Text>
      </div>
      <BlockStack gap="0">
        {items.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              gap: 10,
              padding: "10px 16px",
              fontSize: 13,
              borderBottom:
                idx < items.length - 1
                  ? "1px solid var(--p-color-border-subdued)"
                  : "none",
            }}
          >
            <div
              style={{
                color: "#8c9196",
                fontSize: 11,
                width: 64,
                flexShrink: 0,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {item.time}
            </div>
            <div style={{ flex: 1 }}>{item.text}</div>
          </div>
        ))}
      </BlockStack>
    </Card>
  );
}
