
import { Card, Text, InlineStack, BlockStack, Button } from "@shopify/polaris";
import type { PrintJob } from "../lib/types";

interface Props {
  jobs: PrintJob[];
}

function statusColor(status: PrintJob["status"]) {
  switch (status) {
    case "printing":
      return "#2c6ecb";
    case "printed":
      return "#007f5f";
    case "failed":
      return "#c4314b";
    case "queued":
    default:
      return "#8c9196";
  }
}

function formatTimeLabel(job: PrintJob): string {
  if (job.status === "printing") return "printing now…";
  if (job.status === "queued") return "queued";
  if (job.status === "failed") return job.errorMessage ?? "failed — retry";

  const ts = job.completedAt ?? job.attemptedAt;
  if (!ts) return "";
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function AutoPrintQueue({ jobs }: Props) {
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
          🖨️ Auto-Print Queue
        </Text>
        <Button size="slim">Pause</Button>
      </div>
      <BlockStack gap="0">
        {jobs.map((job) => (
          <div
            key={job.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderBottom: "1px solid var(--p-color-border-subdued)",
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: statusColor(job.status),
                flexShrink: 0,
                animation:
                  job.status === "printing"
                    ? "dl-pulse 1.6s ease-in-out infinite"
                    : undefined,
              }}
            />
            <Text as="span" fontWeight="bold">
              #{job.orderNumber}
            </Text>
            <span style={{ marginLeft: "auto" }}>
              <Text
                as="span"
                variant="bodySm"
                tone={job.status === "failed" ? "critical" : "subdued"}
              >
                {formatTimeLabel(job)}
              </Text>
            </span>
          </div>
        ))}
      </BlockStack>

      <style>{`
        @keyframes dl-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </Card>
  );
}
