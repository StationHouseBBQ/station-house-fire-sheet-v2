/**
 * Funnel → operations interaction test. Drives each public checkout through
 * the DAL exactly as the storefront does, then asserts the order lands on the
 * board a customer/staffer would look for. This is the CI guard for the whole
 * customer→floor path that manual clicking exercised (confirmation ref +
 * demo-clock bugs both lived here).
 */
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { createDemoDal } from "./adapter";

beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear();
});
afterEach(() => vi.useRealTimers());

const et = (iso: string) => new Date(iso + "-04:00");

describe("Weekend Pre-Order funnel → FOH pickup board", () => {
  it("places a Friday order that is trackable and appears in preorders", async () => {
    vi.useFakeTimers(); vi.setSystemTime(et("2026-07-14T10:00:00")); // Tue, ordering open
    const dal = createDemoDal();
    const drop = await dal.fireDrop.currentDrop();
    const product = drop.products.find(p => !p.soldOut && (p.capQty === null || p.soldQty < p.capQty))!;
    const slot = drop.slots.find(s => s.day === "friday" && s.booked < s.capacity)!;

    const res = await dal.publicCheckout.checkout({
      channel: "fire_drop", day: "friday", slotId: slot.id,
      items: [{ productId: product.id, qty: 2 }],
      customer: { name: "Loop Weekend", phone: "813-555-0001", email: "w@example.com" },
      attribution: null,
    });
    expect(res.orderRef).toMatch(/^FD-/);

    // trackable (confirmation page path)
    const tracked = await dal.publicCheckout.trackByRef(res.orderRef);
    expect(tracked?.customer).toBe("Loop Weekend");
    expect(tracked?.status).toBe("paid");
    expect(tracked?.totalCents).toBe(res.totalCents);

    // on the FOH preorders board
    const board = await dal.preorders.list({ channel: "fire_drop" });
    expect(board.some(p => p.orderRef === res.orderRef && p.pickupDate === drop.fridayDate)).toBe(true);
  });

  it("rejects a Friday order after the Thursday 5pm cutoff", async () => {
    vi.useFakeTimers(); vi.setSystemTime(et("2026-07-16T17:30:00")); // Thu 5:30pm
    const dal = createDemoDal();
    const drop = await dal.fireDrop.currentDrop();
    const product = drop.products[0];
    const slot = drop.slots.find(s => s.day === "friday")!;
    await expect(dal.publicCheckout.checkout({
      channel: "fire_drop", day: "friday", slotId: slot.id,
      items: [{ productId: product.id, qty: 1 }],
      customer: { name: "Too Late", phone: "1", email: "t@example.com" }, attribution: null,
    })).rejects.toThrow();
  });
});

describe("Cuban Thursday funnel → FOH pickup board", () => {
  it("places a Cuban order (open window) that lands on the board", async () => {
    vi.useFakeTimers(); vi.setSystemTime(et("2026-07-14T10:00:00")); // Tue, Cuban ordering open
    const dal = createDemoDal();
    const items = await dal.menu.items();
    const cuban = items.find(i => i.thursdayOnly && i.active && i.priceCents > 0 && /Cuban/i.test(i.name))!;
    const res = await dal.publicCheckout.checkout({
      channel: "cuban_thursday", day: "thursday", slotId: null,
      items: [{ productId: cuban.id, qty: 3 }],
      customer: { name: "Loop Cuban", phone: "813-555-0002", email: "c@example.com" }, attribution: null,
    });
    expect(res.orderRef).toBeTruthy();
    const board = await dal.preorders.list({ channel: "cuban_thursday" });
    expect(board.some(p => p.orderRef === res.orderRef && p.customer === "Loop Cuban")).toBe(true);
  });

  it("rejects a non-thursday-only item on the Cuban funnel", async () => {
    vi.useFakeTimers(); vi.setSystemTime(et("2026-07-14T10:00:00"));
    const dal = createDemoDal();
    const nonThu = (await dal.menu.items()).find(i => !i.thursdayOnly && i.active)!;
    await expect(dal.publicCheckout.checkout({
      channel: "cuban_thursday", day: "thursday", slotId: null,
      items: [{ productId: nonThu.id, qty: 1 }],
      customer: { name: "Wrong Item", phone: "1", email: "x@example.com" }, attribution: null,
    })).rejects.toThrow();
  });
});

describe("Express Catering funnel → kitchen catering ticket", () => {
  it("places an express order that becomes a catering ticket on the kitchen board", async () => {
    vi.useFakeTimers(); vi.setSystemTime(et("2026-07-14T10:00:00"));
    const dal = createDemoDal();
    const { getDal } = await import("../index");
    void getDal;
    const settings = await dal.settings.get("expressCatering", null as unknown);
    // package id: read defaults through the settings-backed express menu
    const { EXPRESS_DEFAULTS } = await import("../../lib/expressMenu");
    const pkg = (settings as { packages?: Array<{ id: string }> } | null)?.packages?.[0] ?? EXPRESS_DEFAULTS.packages[1];

    const res = await dal.publicCheckout.expressCheckout({
      guests: 20, eventAt: "2026-07-25T12:00", fulfillment: "pickup",
      items: [{ id: pkg.id, qty: 1 }],
      customer: { name: "Loop Express", email: "e@example.com", phone: "813-555-0003" },
      notes: null, discountCode: null,
    });
    expect(res.orderRef).toMatch(/^EX-/);

    // trackable
    const tracked = await dal.publicCheckout.trackByRef(res.orderRef);
    expect(tracked?.customer).toBe("Loop Express");

    // a catering ticket exists on the kitchen orders board for the event date
    const tickets = await dal.orders.list({ channel: "catering" });
    expect(tickets.some(t => t.orderRef === res.orderRef && t.serviceDate === "2026-07-25")).toBe(true);
  });

  it("rejects an express order with under 24h notice", async () => {
    vi.useFakeTimers(); vi.setSystemTime(et("2026-07-25T10:00:00"));
    const dal = createDemoDal();
    const { EXPRESS_DEFAULTS } = await import("../../lib/expressMenu");
    await expect(dal.publicCheckout.expressCheckout({
      guests: 20, eventAt: "2026-07-25T12:00", fulfillment: "pickup",
      items: [{ id: EXPRESS_DEFAULTS.packages[1].id, qty: 1 }],
      customer: { name: "Too Soon", email: "s@example.com", phone: "1" },
      notes: null, discountCode: null,
    })).rejects.toThrow();
  });
});

describe("Client Portal shares the company seed (no seeding-order dependency)", () => {
  it("portal.companies() returns portal-enabled companies on a fresh load", async () => {
    const dal = createDemoDal();
    // Read the portal FIRST, before any admin/companies view has loaded.
    const companies = await dal.portal.companies();
    expect(companies.length).toBeGreaterThan(0);
    expect(companies.every(c => c.portalEnabled)).toBe(true);
    expect(companies.some(c => c.name === "Tampa Tech Co.")).toBe(true);
  });
});
