// Core types used across DashLab.
// Keep these in sync with the SQLite schema in src/lib/db.ts.

export type Channel =
  | "shopify"
  | "amazon_fbm"
  | "amazon_fba"
  | "etsy"
  | "ebay"
  | "manual"
  | "other";

export type OrderStatus =
  | "awaiting_print"
  | "printing"
  | "slip_printed"
  | "shipped"
  | "cancelled";

export interface LineItem {
  sku: string | null;
  productName: string;
  quantity: number;
  variant?: string | null;
  isCustom?: boolean;
  personalization?: string | null;
  /** Handwritten in shop today; eventually auto-assigned. */
  printerNumber?: number | null;
  /** Tracks whether the print farm marked it done. */
  done?: boolean;
}

export interface Order {
  id: string;                  // ShipStation / Shopify order id
  orderNumber: string;         // e.g., "11962"
  channel: Channel;
  customerName: string;
  customerCity?: string | null;
  customerState?: string | null;
  customerCountry?: string | null;
  customerNotes?: string | null;
  shipBy: string | null;       // ISO date string
  shipMethod?: string | null;
  isRush?: boolean;
  status: OrderStatus;
  lineItems: LineItem[];
  totalItems: number;
  createdAt: string;           // ISO
  shippedAt?: string | null;
  /** Order totals from ShipStation (USD). */
  orderTotal?: number;
  amountPaid?: number;
  taxAmount?: number;
  shippingAmount?: number;
  /** ShipStation store metadata for channel attribution. */
  storeId?: number | null;
  storeName?: string | null;
}

export interface PrintJob {
  id: string;
  orderId: string;
  orderNumber: string;
  status: "queued" | "printing" | "printed" | "failed";
  attemptedAt: string | null;
  completedAt: string | null;
  errorMessage?: string | null;
}

export interface DashboardKPIs {
  ordersToday: number;
  grossSalesToday: number;
  netSalesToday: number;
  itemsSoldToday: number;
  ordersTodayDeltaPct: number;
  grossDeltaPct: number;
}

export interface MonthlyStats {
  ordersThisMonth: number;
  revenueThisMonth: number;
  shipped: number;
  unshipped: number;
  onTimeRate: number; // 0-1
}

export interface FBAStats {
  ordersToday: number;
  revenueToday: number;
  skusAtAmazon: number;
  inStock: number;
  lowStockSkus: string[];
}

export interface PrinterStatus {
  number: number;
  state: "busy" | "idle" | "error";
  currentOrderNumber?: string;
  currentSku?: string;
}
