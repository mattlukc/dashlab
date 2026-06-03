
import { Card, Text, Button, InlineStack } from "@shopify/polaris";
import type { PrinterStatus } from "../lib/types";

interface Props {
  printers: PrinterStatus[];
}

function tileStyle(state: PrinterStatus["state"]): React.CSSProperties {
  const base: React.CSSProperties = {
    flex: 1,
    minWidth: 80,
    border: "1px solid var(--p-color-border)",
    borderRadius: 6,
    padding: 8,
    textAlign: "center",
    fontSize: 12,
  };
  if (state === "busy") {
    return {
      ...base,
      background: "#e4ecf7",
      borderColor: "#2c6ecb",
    };
  }
  if (state === "error") {
    return {
      ...base,
      background: "#fdebee",
      borderColor: "#c4314b",
      color: "#c4314b",
    };
  }
  return {
    ...base,
    background: "#fafbfb",
    color: "#6d7175",
  };
}

export function PrintFarmStrip({ printers }: Props) {
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
          🖨️ Print Farm Status
        </Text>
        <Button size="slim">Manage printers</Button>
      </div>
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          gap: 8,
          overflowX: "auto",
        }}
      >
        {printers.map((p) => (
          <div key={p.number} style={tileStyle(p.state)}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>#{p.number}</div>
            <div
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginTop: 2,
              }}
            >
              {p.state}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
