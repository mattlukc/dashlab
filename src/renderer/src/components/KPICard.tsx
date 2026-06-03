
import { Card, BlockStack, Text, InlineStack } from "@shopify/polaris";

interface KPICardProps {
  label: string;
  value: string;
  delta?: { pct: number; label: string };
  sub?: string;
}

export function KPICard({ label, value, delta, sub }: KPICardProps) {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="span" variant="bodySm" tone="subdued">
          {label.toUpperCase()}
        </Text>
        <Text as="p" variant="heading2xl">
          {value}
        </Text>
        {delta && (
          <InlineStack gap="100" align="start">
            <Text
              as="span"
              variant="bodySm"
              tone={delta.pct >= 0 ? "success" : "critical"}
              fontWeight="bold"
            >
              {delta.pct >= 0 ? "▲" : "▼"} {Math.abs(delta.pct)}%
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {delta.label}
            </Text>
          </InlineStack>
        )}
        {!delta && sub && (
          <Text as="span" variant="bodySm" tone="subdued">
            {sub}
          </Text>
        )}
      </BlockStack>
    </Card>
  );
}
