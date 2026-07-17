import { describe, expect, it } from "vitest";
import { formatCents, orderTotals, taxCents } from "./money";

describe("7.5% sales tax (owner-fixed)", () => {
  it.each([
    [0, 0], [100, 8], [1000, 75], [5800, 435],       // $58.00 → $4.35
    [28918 - 2018, 2018 - 0 > 0 ? Math.floor(((28918 - 2018) * 750) / 10000 + 0.5) : 0], // sanity
    [9999, 750], [13, 1], [7, 1], [6, 0],
  ])("tax on %i cents = %i cents", (sub, tax) => {
    expect(taxCents(sub)).toBe(tax);
  });

  it("computes order totals in integer cents only", () => {
    const t = orderTotals([
      { unitPriceCents: 2900, qty: 2 },  // Tampa Diamonds × 2
      { unitPriceCents: 0, qty: 1 },
    ]);
    expect(t.subtotalCents).toBe(5800);
    expect(t.taxCents).toBe(435);
    expect(t.totalCents).toBe(6235);
    expect(Number.isInteger(t.totalCents)).toBe(true);
  });

  it("rejects fractional or negative money", () => {
    expect(() => taxCents(10.5)).toThrow();
    expect(() => orderTotals([{ unitPriceCents: -100, qty: 1 }])).toThrow();
    expect(() => orderTotals([{ unitPriceCents: 100, qty: 1.5 }])).toThrow();
  });

  it("formats cents as USD", () => {
    expect(formatCents(6235)).toBe("$62.35");
  });
});
