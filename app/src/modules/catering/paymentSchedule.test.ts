import { describe, it, expect } from "vitest";
import { buildPaymentSchedule } from "./CateringOrders";
import type { CateringOrder } from "../../dal/types";

function mkOrder(over: Partial<CateringOrder> & { eventDate: string | null; totalCents: number; depositCents?: number }): CateringOrder {
  return {
    id: "o1", ref: "CAT-TEST", stage: "quoting", priority: "normal", customer: "Test",
    companyName: null, source: "demo",
    event: { eventDate: over.eventDate, eventTime: null, guests: 40, serviceType: "Full Service", venueId: null, address: null, contactName: "Test", phone: "", email: "" },
    lines: [], subtotalCents: over.totalCents, taxCents: 0, depositCents: over.depositCents ?? 0, paidCents: 0,
    totalCents: over.totalCents, quotePublicToken: "t", quoteSentAt: null, acceptedAt: null, invoicedAt: null, paidAt: null,
    kitchen: { handedOffAt: null, prepNotes: null, pullSheetConfirmed: false, ticketStatus: "none" },
    staff: [], equipment: [], fulfillment: "pickup", deliveryFeeCents: 0, timeline: [], notes: null,
    createdAt: "", updatedAt: "",
  } as CateringOrder;
}

function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

describe("buildPaymentSchedule", () => {
  it("charges full amount when no event date", () => {
    const s = buildPaymentSchedule(mkOrder({ eventDate: null, totalCents: 100000 }));
    expect(s).toHaveLength(1);
    expect(s[0]!.amountCents).toBe(100000);
  });

  it("charges full amount within 30 days", () => {
    const s = buildPaymentSchedule(mkOrder({ eventDate: isoInDays(10), totalCents: 100000 }));
    expect(s).toHaveLength(1);
    expect(s[0]!.amountCents).toBe(100000);
  });

  it("deposit + final within 6 months (no 2nd payment)", () => {
    const s = buildPaymentSchedule(mkOrder({ eventDate: isoInDays(90), totalCents: 100000, depositCents: 50000 }));
    expect(s.map(m => m.key)).toEqual(["deposit", "final"]);
    expect(s[0]!.amountCents + s[1]!.amountCents).toBe(100000);
  });

  it("deposit + 2nd + final beyond 6 months", () => {
    const s = buildPaymentSchedule(mkOrder({ eventDate: isoInDays(300), totalCents: 100000, depositCents: 30000 }));
    expect(s.map(m => m.key)).toEqual(["deposit", "second", "final"]);
    expect(s.reduce((t, m) => t + m.amountCents, 0)).toBe(100000);
  });
});
