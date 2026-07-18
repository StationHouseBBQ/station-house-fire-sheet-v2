import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoDal } from "./adapter";

beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear();
});

const CUSTOMER = { name: "Test Customer", phone: "813-555-0100", email: "t@example.com" };

async function fireDropSetup(dal = createDemoDal()) {
  const drop = await dal.fireDrop.currentDrop();
  const product = drop.products[0];
  // Live seed caps only a few products (Brisket 1 lb, sausage links, PBBE ½ lb).
  const cappedProduct = drop.products.find(p => p.capQty !== null)!;
  const fridaySlot = drop.slots.find(s => s.day === "friday")!;
  return { dal, drop, product, cappedProduct, fridaySlot };
}

describe("public demo checkout — Fire Drop rules enforced server-side style", () => {
  it("accepts a valid Friday order inside the window and computes 7.5% totals", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-14T10:00:00-04:00")); // Tuesday ET
      const { dal, product, fridaySlot } = await fireDropSetup();
      const r = await dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: product.id, qty: 2 }], customer: CUSTOMER, attribution: null,
      });
      const expectedSub = product.priceCents * 2;
      expect(r.totalCents).toBe(expectedSub + Math.floor((expectedSub * 750) / 10000 + 0.5));
      const tracked = await dal.publicCheckout.trackByRef(r.orderRef);
      expect(tracked?.status).toBe("paid");
    } finally { vi.useRealTimers(); }
  });

  it("rejects Friday orders after Thursday 5 PM ET", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-16T17:01:00-04:00")); // Thu 5:01 PM
      const { dal, product, fridaySlot } = await fireDropSetup();
      await expect(dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: product.id, qty: 1 }], customer: CUSTOMER, attribution: null,
      })).rejects.toThrow(/closed Thursday/);
    } finally { vi.useRealTimers(); }
  });

  it("enforces product caps across sequential checkouts", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-14T10:00:00-04:00"));
      const { dal, cappedProduct, fridaySlot } = await fireDropSetup();
      const remaining = (cappedProduct.capQty ?? 0) - cappedProduct.soldQty;
      expect(remaining).toBeGreaterThan(0);
      await dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: cappedProduct.id, qty: remaining }], customer: CUSTOMER, attribution: null,
      });
      await expect(dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: cappedProduct.id, qty: 1 }], customer: CUSTOMER, attribution: null,
      })).rejects.toThrow(/left of|sold out/i);
    } finally { vi.useRealTimers(); }
  });

  it("rejects 86'd products and drop-level sold out", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-14T10:00:00-04:00"));
      const { dal, product, fridaySlot } = await fireDropSetup();
      await dal.fireDrop.toggleProductSoldOut(product.id, "test");
      await expect(dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: product.id, qty: 1 }], customer: CUSTOMER, attribution: null,
      })).rejects.toThrow(/sold out/i);
      await dal.fireDrop.updateDrop({ soldOut: true }, "test");
      const other = (await dal.fireDrop.currentDrop()).products[1];
      await expect(dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: other.id, qty: 1 }], customer: CUSTOMER, attribution: null,
      })).rejects.toThrow(/sold out/i);
    } finally { vi.useRealTimers(); }
  });

  it("Cuban Thursday checkout only accepts thursday-only menu items", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-14T10:00:00-04:00")); // Tuesday, ordering open
      const dal = createDemoDal();
      const items = await dal.menu.items();
      const cuban = items.find(i => i.thursdayOnly && i.name === "Smokin Cuban" && i.active)!;
      expect(cuban.priceCents).toBe(1299); // live Cuban Thursday price
      const brisket = items.find(i => !i.thursdayOnly)!;
      const ok = await dal.publicCheckout.checkout({
        channel: "cuban_thursday", day: "thursday", slotId: null,
        items: [{ productId: cuban.id, qty: 2 }], customer: CUSTOMER, attribution: null,
      });
      expect(ok.pickupDate.slice(0, 10)).toMatch(/\d{4}-\d{2}-\d{2}/);
      await expect(dal.publicCheckout.checkout({
        channel: "cuban_thursday", day: "thursday", slotId: null,
        items: [{ productId: brisket.id, qty: 1 }], customer: CUSTOMER, attribution: null,
      })).rejects.toThrow(/not part of Cuban Thursday/);
    } finally { vi.useRealTimers(); }
  });
});

describe("Cuban Thursday ordering window — open Sunday 00:00 ET, close Thursday 9:00 AM ET", () => {
  async function cubanCheckoutAt(iso: string) {
    vi.setSystemTime(new Date(iso));
    const dal = createDemoDal();
    const items = await dal.menu.items();
    const cuban = items.find(i => i.thursdayOnly && i.name === "Smokin Cuban" && i.active)!;
    return dal.publicCheckout.checkout({
      channel: "cuban_thursday", day: "thursday", slotId: null,
      items: [{ productId: cuban.id, qty: 1 }], customer: CUSTOMER, attribution: null,
    });
  }

  it("accepts Thursday 8:59 AM ET for same-day pickup", async () => {
    vi.useFakeTimers();
    try {
      const r = await cubanCheckoutAt("2026-07-16T08:59:00-04:00"); // Thursday
      expect(r.pickupDate).toBe("2026-07-16");
      expect(r.pickupWindow).toBe("11AM–2PM"); // pickup starts 11 AM
    } finally { vi.useRealTimers(); }
  });

  it("rejects Thursday 9:01 AM ET", async () => {
    vi.useFakeTimers();
    try {
      await expect(cubanCheckoutAt("2026-07-16T09:01:00-04:00")).rejects.toThrow(/9:00 AM/);
    } finally { vi.useRealTimers(); }
  });

  it("rejects Friday (closed until Sunday)", async () => {
    vi.useFakeTimers();
    try {
      await expect(cubanCheckoutAt("2026-07-17T12:00:00-04:00")).rejects.toThrow(/open Sunday/);
    } finally { vi.useRealTimers(); }
  });

  it("accepts Sunday, targeting the NEXT Thursday", async () => {
    vi.useFakeTimers();
    try {
      const r = await cubanCheckoutAt("2026-07-19T10:00:00-04:00"); // Sunday
      expect(r.pickupDate).toBe("2026-07-23"); // upcoming Thursday
    } finally { vi.useRealTimers(); }
  });
});
describe("Express Catering checkout — settings prices, minimums, discounts, 24h notice", () => {
  const NOW = "2026-07-14T10:00:00-04:00";           // Tuesday ET
  const EVENT = "2026-07-18T12:00:00-04:00";         // Saturday noon ET (≥24h out)
  const CUSTOMER_EX = { name: "Test Customer", email: "t@example.com", phone: "813-555-0100" };

  function expressInput(overrides: Partial<Parameters<ReturnType<typeof createDemoDal>["publicCheckout"]["expressCheckout"]>[0]> = {}) {
    return {
      guests: 20, eventAt: EVENT, fulfillment: "pickup" as const,
      items: [{ id: "pkg-feeds-20", qty: 1 }],
      customer: CUSTOMER_EX, notes: null, discountCode: null,
      ...overrides,
    };
  }

  it("happy path: Feeds 20 pickup → subtotal 56900, tax 4268, total 61168 (exact live numbers)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      const r = await dal.publicCheckout.expressCheckout(expressInput());
      expect(r.orderRef).toMatch(/^EX-/);
      expect(r.totalCents).toBe(61168); // 56900 + 4268 tax
      const receipt = await dal.publicCheckout.trackByRef(r.orderRef);
      expect(receipt?.subtotalCents).toBe(56900);
      expect(receipt?.taxCents).toBe(4268);
      expect(receipt?.totalCents).toBe(61168);
      // operational ticket lands in the orders collection on the event date
      const tickets = await dal.orders.list({ date: "2026-07-18" });
      const ticket = tickets.find(t => t.orderRef === r.orderRef)!;
      expect(ticket.channel).toBe("catering");
      expect(ticket.status).toBe("confirmed");
      expect(ticket.guests).toBe(20);
      expect(ticket.timeWindow).toBe("12–1PM");
      expect(ticket.notes).toMatch(/EXPRESS PICKUP/);
    } finally { vi.useRealTimers(); }
  });

  it("rejects events with less than 24 hours notice", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      await expect(dal.publicCheckout.expressCheckout(
        expressInput({ eventAt: "2026-07-15T09:00:00-04:00" }), // 23h out
      )).rejects.toThrow(/at least 24 hours notice/);
    } finally { vi.useRealTimers(); }
  });

  it("rejects pickup below the $250 minimum (2 sausage links)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      await expect(dal.publicCheckout.expressCheckout(
        expressInput({ items: [{ id: "alc-sausage", qty: 2 }] }),
      )).rejects.toThrow(/\$250 minimum/);
    } finally { vi.useRealTimers(); }
  });

  it("rejects delivery below the $500 minimum but accepts the SAME cart as pickup (≥ $250)", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      const cart = [{ id: "pkg-feeds-10", qty: 1 }]; // $269.00
      await expect(dal.publicCheckout.expressCheckout(
        expressInput({ fulfillment: "delivery", items: cart }),
      )).rejects.toThrow(/\$500 minimum/);
      const ok = await dal.publicCheckout.expressCheckout(expressInput({ items: cart }));
      expect(ok.totalCents).toBe(26900 + Math.floor((26900 * 750) / 10000 + 0.5));
    } finally { vi.useRealTimers(); }
  });

  it("delivery adds the flat $50.00 fee line before tax", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      const r = await dal.publicCheckout.expressCheckout(expressInput({ fulfillment: "delivery" }));
      const taxed = 56900 + 5000;
      expect(r.totalCents).toBe(taxed + Math.floor((taxed * 750) / 10000 + 0.5)); // 61900 + 4643 = 66543
      const receipt = await dal.publicCheckout.trackByRef(r.orderRef);
      const feeLine = receipt?.items.find(i => /Delivery fee/.test(i.name));
      expect(feeLine?.unitPriceCents).toBe(5000);
    } finally { vi.useRealTimers(); }
  });

  it("applies the WELCOME10 percent discount to the subtotal before tax", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      const r = await dal.publicCheckout.expressCheckout(expressInput({ discountCode: "WELCOME10" }));
      const discounted = 56900 - 5690;   // 10% off before tax
      expect(r.totalCents).toBe(discounted + Math.floor((discounted * 750) / 10000 + 0.5)); // 51210 + 3841
      const receipt = await dal.publicCheckout.trackByRef(r.orderRef);
      expect(receipt?.items.some(i => i.name === "Discount (WELCOME10)" && i.unitPriceCents === -5690)).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it("rejects unknown or inactive discount codes", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      await expect(dal.publicCheckout.expressCheckout(
        expressInput({ discountCode: "NOTACODE" }),
      )).rejects.toThrow(/discount code/i);
    } finally { vi.useRealTimers(); }
  });

  it("is trackable by ref after checkout with a paid receipt", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(NOW));
      const dal = createDemoDal();
      const r = await dal.publicCheckout.expressCheckout(expressInput());
      const receipt = await dal.publicCheckout.trackByRef(r.orderRef.toLowerCase());
      expect(receipt).not.toBeNull();
      expect(receipt?.status).toBe("paid");
      expect(receipt?.channel).toBe("catering");
      expect(receipt?.pickupDate).toBe("2026-07-18");
      expect(receipt?.totalCents).toBe(r.totalCents);
    } finally { vi.useRealTimers(); }
  });
});
