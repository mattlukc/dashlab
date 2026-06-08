// Order detail page. Looks the order up from mock data by route param.
// Phase 4 will fetch the real order via IPC.

import { useParams } from "react-router-dom";
import { PrintingSlip } from "../components/PrintingSlip";
import { PrintButton } from "../components/PrintButton";
import { mockOrders } from "../lib/mocks";
import { Card, Text, BlockStack, Button, InlineStack } from "@shopify/polaris";

export default function OrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const order = mockOrders.find((o) => o.orderNumber === orderNumber);

  if (!order) {
    return (
      <div className="dl-page-title">
        <h1>Order not found</h1>
        <div className="dl-page-meta">No order #{orderNumber} in the current data.</div>
      </div>
    );
  }

  return (
    <>
      <div className="dl-page-title">
        <h1>Order #{order.orderNumber}</h1>
        <InlineStack gap="200">
          <PrintButton orderNumber={order.orderNumber} label="Re-print slip" />
          <Button variant="primary">Open in ShipStation</Button>
        </InlineStack>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "start",
        }}
      >
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Order details
            </Text>
            <BlockStack gap="200">
              <Text as="p"><strong>Customer:</strong> {order.customerName}</Text>
              <Text as="p"><strong>Channel:</strong> {order.channel}</Text>
              <Text as="p"><strong>Status:</strong> {order.status}</Text>
              <Text as="p"><strong>Ship by:</strong> {order.shipBy ?? "—"}</Text>
              <Text as="p"><strong>Ship method:</strong> {order.shipMethod ?? "—"}</Text>
              <Text as="p"><strong>Total items:</strong> {order.totalItems}</Text>
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="200">
            <Text as="h2" variant="headingMd">
              Printing Slip preview
            </Text>
            <Text as="p" variant="bodySm" tone="subdued">
              Shown at actual print size (4&quot; × 6&quot;). What you see here
              is what the thermal printer will produce.
            </Text>
            <div style={{ marginTop: 12 }}>
              <PrintingSlip order={order} />
            </div>
          </BlockStack>
        </Card>
      </div>
    </>
  );
}
