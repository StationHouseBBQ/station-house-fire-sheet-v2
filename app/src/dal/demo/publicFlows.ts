/**
 * Demo analogs of the server-side public flows. These enforce the SAME rules
 * the Supabase Edge Functions will: ET ordering windows, sold-out flags,
 * product caps, slot capacity, and server-computed totals. The client never
 * supplies prices.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { todayEt, mondayOfWeek } from "./domains";
import { orderTotals } from "../../lib/money";
import { isOrderingOpen, etParts } from "../../lib/time";
import type {
  AuditRepository, Company, MenuRepository, PortalAdminRepository, PortalOrder, PortalRepository,
  Preorder, PublicCheckoutInput, PublicCheckoutRepository, PublicCheckoutResult,
} from "../types";
import { DemoPreorders, DemoFireDrop } from "./retail";

export class DemoPublicCheckout implements PublicCheckoutRepository {
  constructor(
    private audit: AuditRepository,
    private fireDrop: DemoFireDrop,
    private preorders: DemoPreorders,
    private menu: MenuRepository,
  ) {}

  async checkout(input: PublicCheckoutInput): Promise<PublicCheckoutResult> {
    if (!input.customer.name.trim()) throw new Error("Name is required");
    if (!input.customer.phone.trim() && !input.customer.email.trim()) throw new Error("Phone or email is required");
    if (!input.items.length) throw new Error("Cart is empty");
    for (const i of input.items) if (!Number.isInteger(i.qty) || i.qty < 1) throw new Error("Invalid quantity");

    // checkout-attempt analog: persist before "payment"
    const attemptId = uid();
    const attempts = await loadCol<{ id: string; at: string; input: PublicCheckoutInput; status: string }>("checkoutAttempts.v1", () => []);
    attempts.push({ id: attemptId, at: nowIso(), input, status: "created" });
    await saveCol("checkoutAttempts.v1", attempts);

    let result: PublicCheckoutResult;
    if (input.channel === "fire_drop") {
      result = await this.fireDropCheckout(input);
    } else {
      result = await this.cubanCheckout(input);
    }
    // mark attempt completed only after order creation succeeded (idempotent-recovery analog)
    const box = await loadCol<{ id: string; at: string; input: PublicCheckoutInput; status: string }>("checkoutAttempts.v1", () => []);
    const a = box.find(x => x.id === attemptId); if (a) a.status = "completed";
    await saveCol("checkoutAttempts.v1", box);
    await this.audit.log({ actor: "public", action: "checkout.completed", entity: "checkout_attempt", entityId: attemptId, before: null, after: { ref: result.orderRef } });
    return result;
  }

  private async fireDropCheckout(input: PublicCheckoutInput): Promise<PublicCheckoutResult> {
    const day = input.day === "saturday" ? "saturday" : "friday";
    if (!isOrderingOpen(day)) {
      throw new Error(day === "friday"
        ? "Friday pickup ordering closed Thursday at 5:00 PM ET."
        : "Saturday ordering is open Thu 5:00 PM – Fri 3:00 PM ET only.");
    }
    const drop = await this.fireDrop.currentDrop();
    if (drop.soldOut) throw new Error("This week's Fire Drop is sold out.");
    if (!input.slotId) throw new Error("Choose a pickup window");
    const slot = drop.slots.find(s => s.id === input.slotId && s.day === day);
    if (!slot) throw new Error("Pickup window not found for that day");
    if (slot.booked >= slot.capacity) throw new Error("That pickup window is full — choose another.");

    // price from authoritative products; enforce caps & sold-out
    const lines: Array<{ name: string; qty: number; unitPriceCents: number }> = [];
    for (const it of input.items) {
      const p = drop.products.find(x => x.id === it.productId);
      if (!p) throw new Error("Product not found");
      if (p.soldOut) throw new Error(`${p.name} is sold out (86'd).`);
      if (p.capQty !== null && p.soldQty + it.qty > p.capQty) {
        throw new Error(`Only ${Math.max(0, p.capQty - p.soldQty)} left of ${p.name}.`);
      }
      lines.push({ name: p.name, qty: it.qty, unitPriceCents: p.priceCents });
    }
    // "transactional" consumption (caps + slot capacity re-checked atomically)
    await this.fireDrop.consume(input.items.map(i => ({ productId: i.productId, qty: i.qty })), input.slotId);

    const pickupDate = day === "friday" ? drop.fridayDate : drop.saturdayDate;
    const order = await this.preorders.createManual({
      channel: "fire_drop", customer: input.customer.name, phone: input.customer.phone,
      email: input.customer.email, pickupDate, pickupWindow: slot.window, items: lines,
    }, "public-checkout");
    await this.preorders.updateStatus(order.id, "paid", "demo-payment");   // demo: simulated payment
    return { orderRef: order.orderRef, totalCents: order.totalCents, pickupDate, pickupWindow: slot.window };
  }

  private async cubanCheckout(input: PublicCheckoutInput): Promise<PublicCheckoutResult> {
    // Cubans & Smash Burgers are Thursday-only: pickup is always the coming Thursday.
    const monday = mondayOfWeek(todayEt());
    const thursday = (() => { const d = new Date(monday + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10); })();
    const p = etParts(new Date());
    const todayIso = todayEt();
    if (todayIso > thursday || (todayIso === thursday && p.hour >= 14)) {
      throw new Error("Cuban Thursday ordering for this week has closed (Thu 2:00 PM ET). Check back Monday.");
    }
    const items = await this.menu.items();
    const lines: Array<{ name: string; qty: number; unitPriceCents: number }> = [];
    for (const it of input.items) {
      const m = items.find(x => x.id === it.productId);
      if (!m) throw new Error("Menu item not found");
      if (!m.active) throw new Error(`${m.name} is not available.`);
      if (!m.thursdayOnly) throw new Error(`${m.name} is not part of Cuban Thursday.`);
      lines.push({ name: m.name, qty: it.qty, unitPriceCents: m.priceCents });
    }
    const order = await this.preorders.createManual({
      channel: "cuban_thursday", customer: input.customer.name, phone: input.customer.phone,
      email: input.customer.email, pickupDate: thursday, pickupWindow: "11AM–2PM", items: lines,
    }, "public-checkout");
    await this.preorders.updateStatus(order.id, "paid", "demo-payment");
    return { orderRef: order.orderRef, totalCents: order.totalCents, pickupDate: thursday, pickupWindow: "11AM–2PM" };
  }

  async trackByRef(ref: string): Promise<Preorder | null> {
    const all = await this.preorders.list({ includeHidden: true });
    return all.find(p => p.orderRef.toLowerCase() === ref.trim().toLowerCase()) ?? null;
  }
}

export class DemoPortal implements PortalRepository {
  constructor(private audit: AuditRepository, private portalAdmin: PortalAdminRepository) {}
  async companies(): Promise<Company[]> {
    const rows = await loadCol<Company>("companies.v1", () => []);
    return rows.filter(c => c.portalEnabled);
  }
  async ordersForCompany(companyId: string): Promise<PortalOrder[]> {
    return (await this.portalAdmin.orders()).filter(o => o.companyId === companyId);
  }
  async createRequest(companyId: string, eventDate: string, items: Array<{ name: string; qty: number; unitPriceCents: number }>, requestedBy: string): Promise<PortalOrder> {
    if (!items.length) throw new Error("Add at least one item");
    if (!eventDate) throw new Error("Event date required");
    const companies = await loadCol<Company>("companies.v1", () => []);
    const c = companies.find(x => x.id === companyId);
    if (!c) throw new Error("Company not found");
    if (!c.portalEnabled) throw new Error("Portal access is disabled for this company");
    const t = orderTotals(items.map(i => ({ unitPriceCents: i.unitPriceCents, qty: i.qty })));
    const rows = await loadCol<PortalOrder>("portalOrders.v1", () => []);
    const o: PortalOrder = {
      id: uid(), ref: `PO-${eventDate.replace(/-/g, "").slice(4)}-${100 + rows.length}`,
      companyId, companyName: c.name, requestedBy,
      eventDate, items: items.map(i => ({ id: uid(), ...i })),
      subtotalCents: t.subtotalCents, taxCents: t.taxCents, totalCents: t.totalCents,
      status: "pending_approval", adminNote: null, createdAt: nowIso(), updatedAt: nowIso(),
    };
    rows.push(o); await saveCol("portalOrders.v1", rows);
    await this.audit.log({ actor: requestedBy, action: "portal.request", entity: "portal_order", entityId: o.ref, before: null, after: { total: o.totalCents } });
    return o;
  }
}
