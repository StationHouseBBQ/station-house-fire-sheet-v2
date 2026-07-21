/**
 * Unified catering lifecycle: one record carries a catering order from
 * inquiry → quote → invoice → payment → kitchen → completed, with a single
 * shared timeline (stage changes, notes, calls, emails, texts) so the whole
 * team sees one accurate story. Money always flows through orderTotals
 * (integer cents, 7.5%). One-click transitions perform their side effects
 * and write timeline + audit entries.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { todayEt } from "./domains";
import { orderTotals } from "../../lib/money";
import type {
  AuditRepository, CateringEventDetails, CateringOrder, CateringStage,
  CateringLifecycleRepository, LeadPriority, LeadsRepository, OrdersRepository, QuoteLine,
} from "../types";

const COL = "cateringOrders.v1";

function refFor(eventDate: string | null): string {
  const d = (eventDate ?? todayEt()).replace(/-/g, "");
  return `CAT-${d}-${1000 + Math.floor(Math.random() * 8999)}`;
}

function recompute(o: CateringOrder): void {
  const t = orderTotals(o.lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
  o.subtotalCents = t.subtotalCents;
  o.taxCents = t.taxCents;
  // Delivery fee is a flat pass-through added after tax (not taxed as food).
  const fee = o.fulfillment === "delivery" ? o.deliveryFeeCents : 0;
  o.totalCents = t.totalCents + fee;
}

const STAGE_LABEL: Record<CateringStage, string> = {
  inquiry: "Inquiry", quoting: "Building quote", quote_sent: "Quote sent",
  accepted: "Accepted", invoiced: "Invoiced", paid: "Paid", in_kitchen: "In kitchen",
  ready: "Ready", completed: "Completed", lost: "Lost", cancelled: "Cancelled",
};

function seed(): CateringOrder[] {
  const now = nowIso();
  const mk = (
    ref: string, stage: CateringStage, customer: string, company: string | null,
    eventDate: string, guests: number, serviceType: string,
    lines: Array<[string, number, number]>, priority: LeadPriority, source: string,
  ): CateringOrder => {
    const qLines: QuoteLine[] = lines.map(([name, qty, unitPriceCents]) => ({ id: uid(), name, qty, unitPriceCents }));
    const o: CateringOrder = {
      id: uid(), ref, stage, priority, customer, companyName: company, source,
      event: { eventDate, eventTime: "5:00 PM", guests, serviceType, venueId: null, address: "Tampa, FL", contactName: customer, phone: "813-555-0100", email: `${customer.split(" ")[0].toLowerCase()}@example.com` },
      lines: qLines, subtotalCents: 0, taxCents: 0, depositCents: 0, paidCents: 0, totalCents: 0,
      staff: [], equipment: [], fulfillment: "pickup", deliveryFeeCents: 0,
      quotePublicToken: uid(), quoteSentAt: null, acceptedAt: null, invoicedAt: null, paidAt: null,
      kitchen: { handedOffAt: null, prepNotes: null, pullSheetConfirmed: false, ticketStatus: "none" },
      timeline: [{ id: uid(), at: now, actor: "demo-seed", kind: "stage", toStage: stage, body: `Order created at stage “${STAGE_LABEL[stage]}”.` }],
      notes: null, createdAt: now, updatedAt: now,
    };
    recompute(o);
    return o;
  };
  return [
    mk("CAT-20260801-1042", "quote_sent", "Rachel Nguyen", "Bayfront Realty", "2026-08-01", 45, "Buffet Setup",
      [["Party Sampler — Feeds 50", 1, 132900], ["Texas White Bread", 3, 999]], "high", "google"),
    mk("CAT-20260808-1044", "accepted", "Derek Owens", null, "2026-08-08", 120, "Full Service",
      [["Brisket (per lb)", 40, 3299], ["Pulled Pork (per lb)", 30, 1899], ["Mac & Cheese (Full Pan)", 4, 12000]], "urgent", "facebook"),
    mk("CAT-20260725-1039", "in_kitchen", "Tampa Tech Co.", "Tampa Tech", "2026-07-25", 60, "Drop-off",
      [["Party Sampler — Feeds 50", 1, 132900], ["Sauce Pint", 4, 999]], "normal", "referral"),
    mk("CAT-20260720-1031", "inquiry", "Luis Ramirez", null, "2026-07-20", 30, "Buffet Setup",
      [], "normal", "organic"),
  ];
}

export class DemoCateringLifecycle implements CateringLifecycleRepository {
  constructor(private audit: AuditRepository, private orders: OrdersRepository, private leads: LeadsRepository) {}

  private async all(): Promise<CateringOrder[]> {
    const rows = await loadCol(COL, seed);
    // Backfill fields added after a record was first stored, so older demo
    // data (or data from a prior build) can never crash a document/panel.
    let dirty = false;
    for (const o of rows as CateringOrder[]) {
      if (!Array.isArray(o.staff)) { o.staff = []; dirty = true; }
      if (!Array.isArray(o.equipment)) { o.equipment = []; dirty = true; }
      if (o.fulfillment !== "pickup" && o.fulfillment !== "delivery") { o.fulfillment = "pickup"; dirty = true; }
      if (typeof o.deliveryFeeCents !== "number") { o.deliveryFeeCents = 0; dirty = true; }
      if (!o.kitchen) { o.kitchen = { handedOffAt: null, prepNotes: null, pullSheetConfirmed: false, ticketStatus: "none" }; dirty = true; }
      if (!Array.isArray(o.timeline)) { o.timeline = []; dirty = true; }
    }
    if (dirty) await saveCol(COL, rows);
    return rows;
  }

  private async mutate(id: string, actor: string, action: string, fn: (o: CateringOrder) => void, timelineEntry?: (o: CateringOrder) => CateringOrder["timeline"][number]): Promise<CateringOrder> {
    const rows = await this.all();
    const o = rows.find(r => r.id === id);
    if (!o) throw new Error("Catering order not found");
    const before = JSON.parse(JSON.stringify({ stage: o.stage, total: o.totalCents, paid: o.paidCents }));
    fn(o);
    o.updatedAt = nowIso();
    if (timelineEntry) o.timeline.unshift(timelineEntry(o));
    await saveCol(COL, rows);
    await this.audit.log({ actor, action, entity: "catering_order", entityId: o.ref, before, after: { stage: o.stage, total: o.totalCents, paid: o.paidCents } });
    return { ...o };
  }

  private entry(actor: string, kind: CateringOrder["timeline"][number]["kind"], body: string, toStage?: CateringStage): CateringOrder["timeline"][number] {
    return { id: uid(), at: nowIso(), actor, kind, body, toStage };
  }

  async list(filter?: { stage?: CateringStage | "all" }): Promise<CateringOrder[]> {
    let rows = await this.all();
    if (filter?.stage && filter.stage !== "all") rows = rows.filter(r => r.stage === filter.stage);
    return rows.sort((a, b) => (a.event.eventDate ?? "9999").localeCompare(b.event.eventDate ?? "9999"));
  }
  async get(id: string) { return (await this.all()).find(r => r.id === id) ?? null; }
  async byToken(token: string) { return (await this.all()).find(r => r.quotePublicToken === token) ?? null; }

  async createFromLead(leadId: string | null, input: { customer: string; companyName: string | null; source: string; event: Partial<CateringEventDetails>; lines: Array<Omit<QuoteLine, "id">>; }, actor: string): Promise<CateringOrder> {
    if (!input.customer.trim()) throw new Error("Customer name required");
    const now = nowIso();
    const ev: CateringEventDetails = {
      eventDate: input.event.eventDate ?? null, eventTime: input.event.eventTime ?? null,
      guests: input.event.guests ?? null, serviceType: input.event.serviceType ?? null,
      venueId: input.event.venueId ?? null, address: input.event.address ?? null,
      contactName: input.event.contactName ?? input.customer, phone: input.event.phone ?? "", email: input.event.email ?? "",
    };
    const o: CateringOrder = {
      id: uid(), ref: refFor(ev.eventDate), stage: input.lines.length ? "quoting" : "inquiry",
      priority: "normal", customer: input.customer.trim(), companyName: input.companyName, source: input.source,
      event: ev, lines: input.lines.map(l => ({ id: uid(), ...l })), subtotalCents: 0, taxCents: 0,
      depositCents: 0, paidCents: 0, totalCents: 0,
      staff: [], equipment: [], fulfillment: "pickup", deliveryFeeCents: 0,
      quotePublicToken: uid(),
      quoteSentAt: null, acceptedAt: null, invoicedAt: null, paidAt: null,
      kitchen: { handedOffAt: null, prepNotes: null, pullSheetConfirmed: false, ticketStatus: "none" },
      timeline: [this.entry(actor, "stage", leadId ? "Converted from pipeline lead." : "Catering order created.", input.lines.length ? "quoting" : "inquiry")],
      notes: null, createdAt: now, updatedAt: now,
    };
    recompute(o);
    const rows = await this.all(); rows.push(o); await saveCol(COL, rows);
    await this.audit.log({ actor, action: "catering.create", entity: "catering_order", entityId: o.ref, before: null, after: { stage: o.stage } });
    return o;
  }

  updateEvent(id: string, event: Partial<CateringEventDetails>, actor: string) {
    return this.mutate(id, actor, "catering.event", o => { o.event = { ...o.event, ...event }; },
      () => this.entry(actor, "note", "Event details updated."));
  }
  updateLines(id: string, lines: Array<Omit<QuoteLine, "id"> & { id?: string }>, actor: string) {
    if (!lines.length) throw new Error("Keep at least one line");
    for (const l of lines) {
      if (!l.name.trim()) throw new Error("Line name required");
      if (!Number.isInteger(l.qty) || l.qty < 1) throw new Error("Quantities must be whole numbers ≥ 1");
      if (!Number.isInteger(l.unitPriceCents) || l.unitPriceCents < 0) throw new Error("Prices must be non-negative");
    }
    return this.mutate(id, actor, "catering.lines", o => { o.lines = lines.map(l => ({ id: l.id ?? uid(), name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })); recompute(o); },
      () => this.entry(actor, "note", "Order items updated; totals recomputed."));
  }
  setDeposit(id: string, depositCents: number, actor: string) {
    if (!Number.isInteger(depositCents) || depositCents < 0) throw new Error("Deposit must be a non-negative amount");
    return this.mutate(id, actor, "catering.deposit", o => { o.depositCents = depositCents; });
  }
  setStage(id: string, stage: CateringStage, actor: string) {
    return this.mutate(id, actor, "catering.stage", o => { o.stage = stage; },
      () => this.entry(actor, "stage", `Stage moved to “${STAGE_LABEL[stage]}”.`, stage));
  }
  setPriority(id: string, priority: LeadPriority, actor: string) {
    return this.mutate(id, actor, "catering.priority", o => { o.priority = priority; });
  }
  setStaff(id: string, staff: Array<{ id?: string; role: string; name: string; callTime: string | null }>, actor: string) {
    const clean = staff
      .map(r => ({ id: r.id ?? uid(), role: r.role.trim(), name: r.name.trim(), callTime: (r.callTime ?? "").trim() || null }))
      .filter(r => r.role || r.name);
    return this.mutate(id, actor, "catering.staff", o => { o.staff = clean; },
      () => this.entry(actor, "note", `Staffing plan updated (${clean.length} on the BEO).`));
  }
  setEquipment(id: string, equipment: Array<{ id?: string; name: string; qty: number }>, actor: string) {
    const clean = equipment
      .map(r => ({ id: r.id ?? uid(), name: r.name.trim(), qty: Math.max(1, Math.round(Number(r.qty) || 1)) }))
      .filter(r => r.name);
    return this.mutate(id, actor, "catering.equipment", o => { o.equipment = clean; },
      () => this.entry(actor, "note", `Equipment & rentals updated (${clean.length} item${clean.length === 1 ? "" : "s"}).`));
  }
  setFulfillment(id: string, fulfillment: "pickup" | "delivery", deliveryFeeCents: number, actor: string) {
    if (!Number.isInteger(deliveryFeeCents) || deliveryFeeCents < 0) throw new Error("Delivery fee must be a non-negative amount");
    return this.mutate(id, actor, "catering.fulfillment", o => {
      o.fulfillment = fulfillment;
      o.deliveryFeeCents = fulfillment === "delivery" ? deliveryFeeCents : 0;
      recompute(o);
    }, o => this.entry(actor, "note", fulfillment === "delivery"
      ? `Set to delivery (+${(o.deliveryFeeCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} fee).`
      : "Set to customer pickup (no delivery fee)."));
  }
  confirmPullSheet(id: string, confirmed: boolean, actor: string) {
    return this.mutate(id, actor, "catering.pullSheet", o => { o.kitchen.pullSheetConfirmed = confirmed; },
      () => this.entry(actor, "system", confirmed ? "Kitchen confirmed the pull sheet." : "Pull-sheet confirmation cleared."));
  }
  async convertLead(leadId: string, actor: string): Promise<CateringOrder> {
    const leads = await this.leads.list();
    const lead = leads.find(l => l.id === leadId);
    if (!lead) throw new Error("Lead not found");
    const order = await this.createFromLead(lead.id, {
      customer: lead.company ? `${lead.name}` : lead.name,
      companyName: lead.company,
      source: lead.source,
      event: {
        eventDate: lead.eventDate ?? null,
        guests: lead.guests ?? null,
        serviceType: lead.serviceType ?? null,
        address: lead.eventAddress ?? null,
        contactName: lead.name,
        phone: lead.phone,
        email: lead.email,
      },
      lines: [],
    }, actor);
    // Move the lead to booked so the pipeline and cockpit stay consistent.
    await this.leads.updateStage(lead.id, "booked", actor);
    return order;
  }
  logComm(id: string, kind: "note" | "email" | "call" | "text", body: string, actor: string) {
    if (!body.trim()) throw new Error("Message body required");
    return this.mutate(id, actor, "catering.comm", () => {},
      () => this.entry(actor, kind, body.trim()));
  }

  sendQuote(id: string, actor: string) {
    return this.mutate(id, actor, "catering.sendQuote", o => {
      if (!o.lines.length) throw new Error("Add at least one line before sending a quote");
      o.stage = "quote_sent"; o.quoteSentAt = nowIso();
    }, o => this.entry(actor, "email", `Quote ${o.ref} sent to ${o.event.email || o.customer} (accept link generated).`, "quote_sent"));
  }
  respondByToken(token: string, response: "accepted" | "declined", byName: string) {
    return (async () => {
      const rows = await this.all();
      const o = rows.find(r => r.quotePublicToken === token);
      if (!o) throw new Error("Quote not found");
      if (o.stage !== "quote_sent") throw new Error("This quote is no longer open");
      o.stage = response === "accepted" ? "accepted" : "lost";
      if (response === "accepted") o.acceptedAt = nowIso();
      o.updatedAt = nowIso();
      o.timeline.unshift(this.entry(byName || "customer", "system", response === "accepted" ? "Customer accepted the quote." : "Customer declined the quote.", o.stage));
      await saveCol(COL, rows);
      await this.audit.log({ actor: "public", action: "catering.quoteResponse", entity: "catering_order", entityId: o.ref, before: null, after: { response } });
      return { ...o };
    })();
  }
  issueInvoice(id: string, actor: string) {
    return this.mutate(id, actor, "catering.invoice", o => {
      if (o.stage !== "accepted" && o.stage !== "quote_sent") throw new Error("Quote must be accepted before invoicing");
      o.stage = "invoiced"; o.invoicedAt = nowIso();
    }, o => this.entry(actor, "email", `Invoice issued for ${o.customer} — ${(o.totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} due.`, "invoiced"));
  }
  recordPayment(id: string, amountCents: number, actor: string) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error("Payment amount must be positive");
    return this.mutate(id, actor, "catering.payment", o => {
      o.paidCents += amountCents;
      o.paidAt = nowIso();
      if (o.paidCents >= o.totalCents) o.stage = "paid";
    }, o => this.entry(actor, "system", `Payment recorded: ${(amountCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} (${(o.paidCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })} of ${(o.totalCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}).`, o.stage));
  }
  async handToKitchen(id: string, prepNotes: string | null, actor: string): Promise<CateringOrder> {
    const rows = await this.all();
    const o = rows.find(r => r.id === id);
    if (!o) throw new Error("Catering order not found");
    if (!o.lines.length) throw new Error("No items to send to the kitchen");
    // Create the real kitchen ticket on the operations boards.
    await this.orders.create({
      orderRef: o.ref, channel: "catering", customer: o.customer,
      serviceDate: o.event.eventDate ?? todayEt(), timeWindow: o.event.eventTime ?? "TBD",
      guests: o.event.guests, items: o.lines.map(l => ({ name: l.name, qty: l.qty, unit: "order", notes: null })),
      notes: [`Catering ${o.ref}`, o.event.serviceType, prepNotes].filter(Boolean).join(" · "),
    }, actor);
    o.stage = "in_kitchen";
    o.kitchen.handedOffAt = nowIso();
    o.kitchen.prepNotes = prepNotes;
    o.kitchen.ticketStatus = "queued";
    o.updatedAt = nowIso();
    o.timeline.unshift(this.entry(actor, "system", `Sent to kitchen — BEO + pull sheet generated, ticket ${o.ref} queued.`, "in_kitchen"));
    await saveCol(COL, rows);
    await this.audit.log({ actor, action: "catering.handToKitchen", entity: "catering_order", entityId: o.ref, before: null, after: { ticket: o.ref } });
    return { ...o };
  }
  advanceKitchen(id: string, status: CateringOrder["kitchen"]["ticketStatus"], actor: string) {
    return this.mutate(id, actor, "catering.kitchen", o => {
      o.kitchen.ticketStatus = status;
      if (status === "ready") o.stage = "ready";
    }, () => this.entry(actor, "system", `Kitchen status: ${status.replace("_", " ")}.`));
  }
  markCompleted(id: string, actor: string) {
    return this.mutate(id, actor, "catering.complete", o => { o.stage = "completed"; },
      () => this.entry(actor, "stage", "Event completed. 🎉", "completed"));
  }
}
