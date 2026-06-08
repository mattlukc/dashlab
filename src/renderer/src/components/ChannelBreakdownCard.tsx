
import { Card, Text, BlockStack } from "@shopify/polaris";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface ChannelSlice {
  channel: string;
  revenue: number;
  orders: number;
}

interface Props {
  data: ChannelSlice[];
  title?: string;
}

const COLORS: Record<string, string> = {
  shopify: "#95bf47",
  amazon_fbm: "#ff9900",
  amazon_fba: "#ff7700",
  etsy: "#f56500",
  ebay: "#0064d2",
  manual: "#6d7175",
  other: "#bdc3c7",
};

function channelDisplay(c: string) {
  switch (c) {
    case "shopify":
      return "Shopify";
    case "amazon_fbm":
      return "Amazon FBM";
    case "amazon_fba":
      return "Amazon FBA";
    case "etsy":
      return "Etsy";
    case "ebay":
      return "eBay";
    case "manual":
      return "Manual";
    default:
      return "Other";
  }
}

export function ChannelBreakdownCard({ data, title = "Sales by Channel · Today" }: Props) {
  const total = data.reduce((sum, d) => sum + d.revenue, 0);
  const slices = data.map((d) => ({
    name: channelDisplay(d.channel),
    value: d.revenue,
    raw: d.channel,
    orders: d.orders,
  }));

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
      <div style={{ padding: 16 }}>
        {total === 0 ? (
          <BlockStack gap="200">
            <Text as="p" tone="subdued">
              No sales recorded today yet.
            </Text>
          </BlockStack>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {slices.map((s) => (
                    <Cell
                      key={s.raw}
                      fill={COLORS[s.raw] ?? COLORS.other}
                      stroke="#fff"
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => `$${Math.round(v).toLocaleString()}`}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(value, entry) => {
                    const e = entry as unknown as { payload?: { orders?: number } };
                    const orders = e.payload?.orders ?? 0;
                    return `${value} (${orders})`;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
}
