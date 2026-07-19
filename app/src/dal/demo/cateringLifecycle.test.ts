import { beforeEach, describe, expect, it } from "vitest";
import { createDemoDal } from "./adapter";

// reset the in-memory idb shim between tests
beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear();
});

const ACTOR = "test-director";

async function freshOrder(dal = createDemoDal()) {
  const o = await dal.cateringLifecycle.createFromLead(
    null,
    {
      customer: "Priya Shah",
      companyName: "Shah Events",
      source: "google",
      event: { eventDate: "2026-09-12", eventTime: "6:00 PM", guests: 50, serviceType: "Buffet Setup", email: "priya@example.com" },
      lines: [{ name: "Party Sampler — Feeds 50", qty: 1, unitPriceCents: 132900 }],
    },
    ACTOR,
  );
  return { dal, o };
}

describe("Demo catering lifecycle (quote → invoice → kitchen)", () => {
  it("runs the full happy path with exact recomputed totals and a real kitchen ticket", async () => {
    const { dal, o } = await freshOrder();
    expect(o.stage).toBe("quoting");

    // updateLines recomputes authoritative totals (2 × 132900).
    const withLines = await dal.cateringLifecycle.updateLines(
      o.id,
      [{ name: "Party Sampler — Feeds 50", qty: 2, unitPriceCents: 132900 }],
      ACTOR,
    );
    expect(withLines.subtotalCents).toBe(265800);
    expect(withLines.taxCents).toBe(19935);
    expect(withLines.totalCents).toBe(285735);

    // sendQuote → quote_sent, quoteSentAt set.
    const sent = await dal.cateringLifecycle.sendQuote(o.id, ACTOR);
    expect(sent.stage).toBe("quote_sent");
    expect(sent.quoteSentAt).not.toBeNull();

    // Customer accepts via public token → accepted.
    const accepted = await dal.cateringLifecycle.respondByToken(sent.quotePublicToken, "accepted", "Priya");
    expect(accepted.stage).toBe("accepted");
    expect(accepted.acceptedAt).not.toBeNull();

    // Issue invoice → invoiced.
    const invoiced = await dal.cateringLifecycle.issueInvoice(o.id, ACTOR);
    expect(invoiced.stage).toBe("invoiced");
    expect(invoiced.invoicedAt).not.toBeNull();

    // Full payment → paid, paidCents = total.
    const paid = await dal.cateringLifecycle.recordPayment(o.id, invoiced.totalCents, ACTOR);
    expect(paid.stage).toBe("paid");
    expect(paid.paidCents).toBe(285735);

    // Hand to kitchen → in_kitchen, ticket queued, and a real order ticket exists.
    const inKitchen = await dal.cateringLifecycle.handToKitchen(o.id, "No pork — allergy", ACTOR);
    expect(inKitchen.stage).toBe("in_kitchen");
    expect(inKitchen.kitchen.ticketStatus).toBe("queued");
    expect(inKitchen.kitchen.prepNotes).toBe("No pork — allergy");
    const tickets = await dal.orders.list();
    expect(tickets.some(t => t.orderRef === inKitchen.ref)).toBe(true);

    // Advance kitchen to ready → stage ready.
    const ready = await dal.cateringLifecycle.advanceKitchen(o.id, "ready", ACTOR);
    expect(ready.stage).toBe("ready");
    expect(ready.kitchen.ticketStatus).toBe("ready");

    // Mark completed.
    const done = await dal.cateringLifecycle.markCompleted(o.id, ACTOR);
    expect(done.stage).toBe("completed");
  });

  it("sendQuote throws when there are no lines", async () => {
    const dal = createDemoDal();
    const o = await dal.cateringLifecycle.createFromLead(
      null,
      { customer: "No Lines", companyName: null, source: "organic", event: {}, lines: [] },
      ACTOR,
    );
    expect(o.stage).toBe("inquiry");
    await expect(dal.cateringLifecycle.sendQuote(o.id, ACTOR)).rejects.toThrow(/at least one line/i);
  });

  it("issueInvoice before acceptance throws", async () => {
    const { dal, o } = await freshOrder();
    // Straight from quoting, without sending/accepting.
    await expect(dal.cateringLifecycle.issueInvoice(o.id, ACTOR)).rejects.toThrow(/accepted/i);
  });

  it("logComm appends a timeline entry", async () => {
    const { dal, o } = await freshOrder();
    const before = o.timeline.length;
    const after = await dal.cateringLifecycle.logComm(o.id, "call", "Called to confirm headcount.", ACTOR);
    expect(after.timeline.length).toBe(before + 1);
    expect(after.timeline[0].kind).toBe("call");
    expect(after.timeline[0].body).toBe("Called to confirm headcount.");
  });

  it("respondByToken decline moves the order to lost", async () => {
    const { dal, o } = await freshOrder();
    const sent = await dal.cateringLifecycle.sendQuote(o.id, ACTOR);
    const declined = await dal.cateringLifecycle.respondByToken(sent.quotePublicToken, "declined", "Priya");
    expect(declined.stage).toBe("lost");
  });

  it("setStaff persists rows and appends a timeline entry", async () => {
    const { dal, o } = await freshOrder();
    const before = o.timeline.length;
    const updated = await dal.cateringLifecycle.setStaff(o.id, [
      { role: "Event lead", name: "Marcus", callTime: "3:30 PM" },
      { role: "Server", name: "Dana", callTime: "4:00 PM" },
    ], ACTOR);
    expect(updated.staff).toHaveLength(2);
    expect(updated.staff[0]).toMatchObject({ role: "Event lead", name: "Marcus", callTime: "3:30 PM" });
    expect(updated.staff[0].id).toBeTruthy();
    expect(updated.timeline.length).toBe(before + 1);
    // Persisted across reload.
    const reloaded = await dal.cateringLifecycle.get(o.id);
    expect(reloaded?.staff).toHaveLength(2);
  });

  it("setEquipment persists rows and appends a timeline entry", async () => {
    const { dal, o } = await freshOrder();
    const before = o.timeline.length;
    const updated = await dal.cateringLifecycle.setEquipment(o.id, [
      { name: "Chafers (full size)", qty: 4 },
      { name: "6ft folding tables", qty: 3 },
    ], ACTOR);
    expect(updated.equipment).toHaveLength(2);
    expect(updated.equipment[0]).toMatchObject({ name: "Chafers (full size)", qty: 4 });
    expect(updated.timeline.length).toBe(before + 1);
    const reloaded = await dal.cateringLifecycle.get(o.id);
    expect(reloaded?.equipment[1]).toMatchObject({ name: "6ft folding tables", qty: 3 });
  });

  it("setFulfillment delivery sets the fee and adds it to the total; pickup clears it", async () => {
    const { dal, o } = await freshOrder();
    // Baseline (pickup, 1 × 132900): subtotal 132900, tax 9968, total 142868.
    expect(o.fulfillment).toBe("pickup");
    expect(o.deliveryFeeCents).toBe(0);
    expect(o.subtotalCents).toBe(132900);
    expect(o.taxCents).toBe(9968);
    expect(o.totalCents).toBe(142868);

    const delivery = await dal.cateringLifecycle.setFulfillment(o.id, "delivery", 15000, ACTOR);
    expect(delivery.fulfillment).toBe("delivery");
    expect(delivery.deliveryFeeCents).toBe(15000);
    // Subtotal/tax unchanged; total gains the flat delivery fee.
    expect(delivery.subtotalCents).toBe(132900);
    expect(delivery.taxCents).toBe(9968);
    expect(delivery.totalCents).toBe(157868);

    const pickup = await dal.cateringLifecycle.setFulfillment(o.id, "pickup", 15000, ACTOR);
    expect(pickup.fulfillment).toBe("pickup");
    expect(pickup.deliveryFeeCents).toBe(0);
    expect(pickup.totalCents).toBe(142868);
  });

  it("confirmPullSheet toggles the kitchen flag", async () => {
    const { dal, o } = await freshOrder();
    expect(o.kitchen.pullSheetConfirmed).toBe(false);
    const on = await dal.cateringLifecycle.confirmPullSheet(o.id, true, ACTOR);
    expect(on.kitchen.pullSheetConfirmed).toBe(true);
    const off = await dal.cateringLifecycle.confirmPullSheet(o.id, false, ACTOR);
    expect(off.kitchen.pullSheetConfirmed).toBe(false);
  });

  it("convertLead creates an order from a seeded lead and books the lead", async () => {
    const dal = createDemoDal();
    const leads = await dal.leads.list();
    expect(leads.length).toBeGreaterThan(0);
    const lead = leads[0];

    const order = await dal.cateringLifecycle.convertLead(lead.id, ACTOR);
    // Order carries the lead's identity + details.
    expect(order.customer).toContain(lead.name);
    expect(order.event.guests).toBe(lead.guests ?? null);
    expect(order.source).toBe(lead.source);
    // New orders with no lines start at inquiry.
    expect(order.stage).toBe("inquiry");

    // The order is now listed.
    const orders = await dal.cateringLifecycle.list();
    expect(orders.some(o => o.id === order.id)).toBe(true);

    // The lead moved to booked.
    const after = (await dal.leads.list()).find(l => l.id === lead.id);
    expect(after?.stage).toBe("booked");
  });
});
