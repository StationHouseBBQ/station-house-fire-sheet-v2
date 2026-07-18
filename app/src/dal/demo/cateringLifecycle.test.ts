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
});
