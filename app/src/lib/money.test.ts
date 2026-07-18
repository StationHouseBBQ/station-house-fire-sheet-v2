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

describe("tips (optional second arg — total = subtotal + tax + tip)", () => {
  it("spec example: $23.00 item is exactly 2300 cents", () => {
    const t = orderTotals([{ unitPriceCents: 2300, qty: 1 }]);
    expect(t.subtotalCents).toBe(2300);
    expect(t.taxCents).toBe(173);           // 2300 × 7.5% = 172.5 → half-up 173
    expect(t.tipCents).toBe(0);             // default
    expect(t.totalCents).toBe(2473);
  });

  it("20% tip on 2300 = 460 → total 2300 + 173 + 460 = 2933", () => {
    const t = orderTotals([{ unitPriceCents: 2300, qty: 1 }], 460);
    expect(t.subtotalCents).toBe(2300);
    expect(t.taxCents).toBe(173);
    expect(t.tipCents).toBe(460);
    expect(t.totalCents).toBe(2933);
  });

  it("spec example: $45.99 item is exactly 4599 cents", () => {
    const t = orderTotals([{ unitPriceCents: 4599, qty: 1 }]);
    expect(t.subtotalCents).toBe(4599);
    expect(t.taxCents).toBe(345);           // 344.925 → half-up 345
    expect(t.totalCents).toBe(4944);
  });

  it("odd-cent price × multiple quantities: 4599 × 3", () => {
    const t = orderTotals([{ unitPriceCents: 4599, qty: 3 }], 200);
    expect(t.subtotalCents).toBe(13797);
    expect(t.taxCents).toBe(1035);          // 1034.775 → half-up 1035
    expect(t.tipCents).toBe(200);
    expect(t.totalCents).toBe(13797 + 1035 + 200);
  });

  it("mixed cart with tip stays integer cents", () => {
    const t = orderTotals(
      [
        { unitPriceCents: 2300, qty: 2 },   // 4600
        { unitPriceCents: 4599, qty: 1 },   // 4599
        { unitPriceCents: 1250, qty: 4 },   // 5000
      ],
      1000,
    );
    expect(t.subtotalCents).toBe(14199);
    expect(t.taxCents).toBe(1065);          // 1064.925 → half-up 1065
    expect(t.totalCents).toBe(14199 + 1065 + 1000);
    expect(Number.isInteger(t.totalCents)).toBe(true);
  });

  it.each([
    // rounding half-up boundaries: subtotal → tax
    [6, 0],       // 0.45   → 0
    [7, 1],       // 0.525  → 1 (half-up crosses at .5)
    [20, 2],      // 1.5    → exactly half → rounds up to 2
    [60, 5],      // 4.5    → 5
    [100, 8],     // 7.5    → 8
    [180, 14],    // 13.5   → 14
  ])("half-up boundary: tax on %i = %i", (sub, tax) => {
    const t = orderTotals([{ unitPriceCents: sub, qty: 1 }], 0);
    expect(t.taxCents).toBe(tax);
  });

  it("rejects fractional or negative tips", () => {
    expect(() => orderTotals([{ unitPriceCents: 100, qty: 1 }], 10.5)).toThrow();
    expect(() => orderTotals([{ unitPriceCents: 100, qty: 1 }], -1)).toThrow();
    expect(() => orderTotals([{ unitPriceCents: 100, qty: 1 }], Number.NaN)).toThrow();
  });

  it("does not break existing callers (no second arg → tip 0)", () => {
    const t = orderTotals([{ unitPriceCents: 2900, qty: 2 }]);
    expect(t.totalCents).toBe(5800 + 435);
  });
});
