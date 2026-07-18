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
  const fridaySlot = drop.slots.find(s => s.day === "friday")!;
  return { dal, drop, product, fridaySlot };
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
      const { dal, product, fridaySlot } = await fireDropSetup();
      const remaining = (product.capQty ?? 0) - product.soldQty;
      expect(remaining).toBeGreaterThan(0);
      await dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: product.id, qty: remaining }], customer: CUSTOMER, attribution: null,
      });
      await expect(dal.publicCheckout.checkout({
        channel: "fire_drop", day: "friday", slotId: fridaySlot.id,
        items: [{ productId: product.id, qty: 1 }], customer: CUSTOMER, attribution: null,
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
      const cuban = items.find(i => i.thursdayOnly && /Cuban/i.test(i.name))!;
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
