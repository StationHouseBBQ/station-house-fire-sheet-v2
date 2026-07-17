/**
 * Money is integer cents everywhere. Floating point never touches totals.
 * Sales tax is fixed at 7.5% per owner directive — changing this constant
 * requires explicit owner approval.
 */
export const SALES_TAX_RATE_BP = 750; // basis points

export function lineTotalCents(unitPriceCents: number, qty: number): number {
  if (!Number.isInteger(unitPriceCents) || unitPriceCents < 0) throw new Error("unitPriceCents must be a non-negative integer");
  if (!Number.isInteger(qty) || qty < 0) throw new Error("qty must be a non-negative integer");
  return unitPriceCents * qty;
}

export function taxCents(subtotalCents: number): number {
  if (!Number.isInteger(subtotalCents) || subtotalCents < 0) throw new Error("subtotalCents must be a non-negative integer");
  // Round half up, matching Square's tax rounding.
  return Math.floor((subtotalCents * SALES_TAX_RATE_BP) / 10000 + 0.5);
}

export interface OrderTotals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function orderTotals(lines: Array<{ unitPriceCents: number; qty: number }>): OrderTotals {
  const subtotalCents = lines.reduce((s, l) => s + lineTotalCents(l.unitPriceCents, l.qty), 0);
  const tax = taxCents(subtotalCents);
  return { subtotalCents, taxCents: tax, totalCents: subtotalCents + tax };
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}
