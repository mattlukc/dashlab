// Print engine — DECOMMISSIONED.
//
// This module used to render an order's slip to a 4x6 PDF with headless Chrome
// (Puppeteer) and send it to a CUPS printer queue via `lp -d <printer>`. That
// approach was Mac/Linux-only (CUPS) and did silent auto-printing.
//
// Printing was rearchitected to a cross-platform, browser-based model:
//   - Slips render into a hidden container on the Orders page print queue.
//   - The user clicks "Print All Slips" → window.print() → the OS print dialog.
//   - After printing, orders are marked slip_printed via /api/print/mark-printed.
//
// No CUPS, no `lp`, no Puppeteer, no silent auto-print. There is nothing left to
// export here. The `puppeteer` npm dependency is now unused and can be dropped
// from package.json in a future cleanup (left in place for now to avoid an
// unrelated lockfile change).

export {};
