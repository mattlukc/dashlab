
import { Button } from "@shopify/polaris";

interface Props {
  orderNumber: string;
  variant?: "primary" | "secondary";
  label?: string;
}

/**
 * Opens the standalone 4x6 slip for a single order in a new tab, where the user
 * prints it via the browser dialog. Replaces the old CUPS call to
 * /api/print/{orderNumber}.
 */
export function PrintButton({ orderNumber, variant, label }: Props) {
  return (
    <Button
      onClick={() =>
        window.open(`/orders/${orderNumber}/slip-print`, "_blank")
      }
      variant={variant === "primary" ? "primary" : undefined}
    >
      {label ?? "Print slip"}
    </Button>
  );
}
