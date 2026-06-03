
import { Card, Text, InlineStack, Button } from "@shopify/polaris";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  data: { day: string; revenue: number }[];
}

export function SalesTrendCard({ data }: Props) {
  return (
    <Card padding="0">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          📈 Sales — last 30 days
        </Text>
        <InlineStack gap="200">
          <Button size="slim">30d</Button>
          <Button size="slim" variant="primary">
            MTD
          </Button>
        </InlineStack>
      </div>
      <div style={{ padding: "8px 8px 0 8px", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid stroke="#eef0f2" vertical={false} />
            <XAxis dataKey="day" hide />
            <YAxis tick={{ fontSize: 10, fill: "#8c9196" }} width={40} />
            <Tooltip
              formatter={(v: number) => [`$${v.toLocaleString()}`, "Revenue"]}
              labelFormatter={() => ""}
            />
            <Line
              type="monotone"
              dataKey="revenue"
              stroke="#2c6ecb"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
