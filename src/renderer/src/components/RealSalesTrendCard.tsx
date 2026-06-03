
import { Card, Text } from "@shopify/polaris";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DayPoint {
  day: string;
  revenue: number;
  orders: number;
}

interface Props {
  data: DayPoint[];
  title?: string;
}

export function RealSalesTrendCard({ data, title = "Sales — Last 30 Days" }: Props) {
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const orderTotal = data.reduce((sum, d) => sum + d.orders, 0);

  return (
    <Card padding="0">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          padding: "16px",
          borderBottom: "1px solid var(--p-color-border)",
        }}
      >
        <Text as="h2" variant="headingMd">
          {title}
        </Text>
        <Text as="span" variant="bodySm" tone="subdued">
          ${Math.round(total).toLocaleString()} · {orderTotal} orders
        </Text>
      </div>
      <div style={{ padding: "12px 8px 4px", height: 240 }}>
        {data.length === 0 ? (
          <div
            style={{
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#8c9196",
              fontSize: 13,
            }}
          >
            No order history yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="nbSalesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2c6ecb" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#2c6ecb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef0f2" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 10, fill: "#8c9196" }}
                tickFormatter={(d: string) => {
                  // d is YYYY-MM-DD
                  const parts = d.split("-");
                  return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
                }}
                interval="preserveStartEnd"
              />
              <YAxis tick={{ fontSize: 10, fill: "#8c9196" }} width={50} />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === "revenue"
                    ? [`$${Math.round(v).toLocaleString()}`, "Revenue"]
                    : [v, "Orders"]
                }
                labelFormatter={(d) => d}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#2c6ecb"
                strokeWidth={2}
                fill="url(#nbSalesFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
