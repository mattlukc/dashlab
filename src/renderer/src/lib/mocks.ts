// Mock data so the dashboard renders before any real API is wired up.
// Replace usages of these with real DB / API queries once we plug in ShipStation.

import type {
  Order,
  PrintJob,
  DashboardKPIs,
  MonthlyStats,
  FBAStats,
  PrinterStatus,
} from "./types";

export const mockOrders: Order[] = [
  {
    id: "ss_11962",
    orderNumber: "11962",
    channel: "shopify",
    customerName: "Vitali Melnikau",
    customerCity: "Madison",
    customerState: "WI",
    customerCountry: "USA",
    shipBy: "2026-05-27",
    shipMethod: "USPS Ground Advantage",
    isRush: false,
    status: "printing",
    totalItems: 12,
    createdAt: "2026-05-26T14:32:00Z",
    lineItems: [
      {
        sku: null,
        productName: "Label for Milwaukee Packout Low Profile",
        quantity: 1,
        isCustom: true,
        personalization: 'Black PETG · "Vitali\'s Garage"',
      },
      { sku: "MWSOCB4", productName: "Milw. Center Bins (4-Bins)", quantity: 1 },
      { sku: "MWSOSBS1", productName: "Milw. Stack Bins (SM) 1-Slot", quantity: 5 },
      { sku: "MWSOSBS1", productName: "Milw. Stack Bins (SM) 1-Slot", quantity: 1 },
      { sku: "MWSOSBS2", productName: "Milw. Stack Bins (SM) 2-Slot", quantity: 1 },
      { sku: "MWSOSBS2", productName: "Milw. Stack Bins (SM) 2-Slot", quantity: 1 },
      { sku: "MWSOSBS3", productName: "Milw. Stack Bins (SM) 3-Slot", quantity: 2 },
    ],
  },
  {
    id: "ss_11970",
    orderNumber: "11970",
    channel: "amazon_fbm",
    customerName: "Jordan T.",
    customerCity: "Brooklyn",
    customerState: "NY",
    customerCountry: "USA",
    customerNotes:
      "This is a Father's Day gift — please double-check the engraving spelling.",
    shipBy: "2026-05-27",
    shipMethod: "USPS Priority Mail",
    isRush: true,
    status: "awaiting_print",
    totalItems: 13,
    createdAt: "2026-05-27T08:18:00Z",
    lineItems: [
      { sku: "MWSOCB4", productName: "Milw. Center Bins (4-Bins)", quantity: 2 },
      { sku: "MWSOSBL6", productName: "Milw. Stack Bins (LG) 6-Slot", quantity: 10 },
      {
        sku: null,
        productName: "Engraved Lid",
        quantity: 1,
        isCustom: true,
        personalization: '"For Dad — 5/30"',
      },
    ],
  },
  {
    id: "ss_11971",
    orderNumber: "11971",
    channel: "shopify",
    customerName: "Mike Robertson",
    customerCity: "Austin",
    customerState: "TX",
    customerCountry: "USA",
    shipBy: "2026-05-27",
    shipMethod: "USPS Ground Advantage",
    status: "awaiting_print",
    totalItems: 2,
    createdAt: "2026-05-27T07:11:00Z",
    lineItems: [
      { sku: "MWSOSBS2", productName: "Milw. Stack Bins (SM) 2-Slot", quantity: 1 },
      { sku: "MWSOSBL6", productName: "Milw. Stack Bins (LG) 6-Slot", quantity: 1 },
    ],
  },
  {
    id: "ss_11973",
    orderNumber: "11973",
    channel: "etsy",
    customerName: "Sarah Chen",
    customerCity: "Seattle",
    customerState: "WA",
    customerCountry: "USA",
    shipBy: "2026-05-27",
    shipMethod: "USPS Ground Advantage",
    status: "printing",
    totalItems: 4,
    createdAt: "2026-05-27T07:48:00Z",
    lineItems: [
      { sku: "MWSOCB4", productName: "Milw. Center Bins (4-Bins)", quantity: 2 },
      { sku: "MWSOSBS1", productName: "Milw. Stack Bins (SM) 1-Slot", quantity: 2 },
    ],
  },
  {
    id: "ss_11975",
    orderNumber: "11975",
    channel: "shopify",
    customerName: "Brandon Lee",
    customerCity: "Portland",
    customerState: "OR",
    customerCountry: "USA",
    shipBy: "2026-05-27",
    shipMethod: "USPS Ground Advantage",
    status: "slip_printed",
    totalItems: 1,
    createdAt: "2026-05-27T08:54:00Z",
    lineItems: [
      { sku: "MWSOSBS3", productName: "Milw. Stack Bins (SM) 3-Slot", quantity: 1 },
    ],
  },
];

export const mockPrintQueue: PrintJob[] = [
  {
    id: "pj_1",
    orderId: "ss_11962",
    orderNumber: "11962",
    status: "printing",
    attemptedAt: "2026-05-27T08:55:00Z",
    completedAt: null,
  },
  {
    id: "pj_2",
    orderId: "ss_11971",
    orderNumber: "11971",
    status: "queued",
    attemptedAt: null,
    completedAt: null,
  },
  {
    id: "pj_3",
    orderId: "ss_11960",
    orderNumber: "11960",
    status: "printed",
    attemptedAt: "2026-05-27T08:42:00Z",
    completedAt: "2026-05-27T08:42:18Z",
  },
  {
    id: "pj_4",
    orderId: "ss_11959",
    orderNumber: "11959",
    status: "printed",
    attemptedAt: "2026-05-27T08:31:00Z",
    completedAt: "2026-05-27T08:31:14Z",
  },
  {
    id: "pj_5",
    orderId: "ss_11958",
    orderNumber: "11958",
    status: "failed",
    attemptedAt: "2026-05-27T08:22:00Z",
    completedAt: null,
    errorMessage: "Printer offline — retry pending",
  },
  {
    id: "pj_6",
    orderId: "ss_11957",
    orderNumber: "11957",
    status: "printed",
    attemptedAt: "2026-05-27T07:55:00Z",
    completedAt: "2026-05-27T07:55:11Z",
  },
];

export const mockKPIs: DashboardKPIs = {
  ordersToday: 14,
  grossSalesToday: 1248,
  netSalesToday: 1094,
  itemsSoldToday: 63,
  ordersTodayDeltaPct: 22,
  grossDeltaPct: 18,
};

export const mockMonthly: MonthlyStats = {
  ordersThisMonth: 312,
  revenueThisMonth: 28450,
  shipped: 298,
  unshipped: 14,
  onTimeRate: 0.96,
};

export const mockFBA: FBAStats = {
  ordersToday: 22,
  revenueToday: 1820,
  skusAtAmazon: 38,
  inStock: 31,
  lowStockSkus: ["MWSOSBS1", "MWSOCB4", "MWSOSBL6"],
};

export const mockPrinters: PrinterStatus[] = [
  { number: 1, state: "busy" },
  { number: 2, state: "busy" },
  { number: 3, state: "idle" },
  { number: 4, state: "busy" },
  { number: 5, state: "busy" },
  { number: 6, state: "idle" },
  { number: 7, state: "busy" },
  { number: 8, state: "error" },
  { number: 9, state: "busy" },
  { number: 10, state: "idle" },
];

/** Mock daily revenue series for the trend chart (last 30 days). */
export const mockSalesTrend: { day: string; revenue: number }[] = [
  820, 1200, 980, 1340, 1100, 1450, 920, 1280, 1390, 1180, 1610, 1240, 980,
  1450, 1370, 1290, 1520, 1840, 990, 1320, 1450, 1180, 1610, 1730, 1290, 1410,
  1580, 1740, 1620, 1248,
].map((revenue, i) => ({ day: `D${i + 1}`, revenue }));
