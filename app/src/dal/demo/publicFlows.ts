/**
 * Demo analogs of the server-side public flows. These enforce the SAME rules
 * the Supabase Edge Functions will: ET ordering windows, sold-out flags,
 * product caps, slot capacity, and server-computed totals. The client never
 * supplies prices.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { todayEt } from "./domains";
import { orderTotals } from "../../lib/money";
import { isOrderingOpen, etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import type {
  AuditRepository, Company, DiscountsRepository, ExpressCheckoutInput, ExpressCheckoutResult,
  MenuRepository, PortalAdminRepository, PortalOrder, PortalRepository,
  Preorder, PublicCheckoutInput, PublicCheckoutRepository, PublicCheckoutResult, SettingsRepository,
} from "../types";
import { DemoPreorders, DemoFireDrop } from "./retail";
import type { DemoOrders } from "./domains";
import {
  EXPRESS_DEFAULTS, EXPRESS_DELIVERY_FEE_CENTS, EXPRESS_DELIVERY_FEE_LABEL,
  EXPRESS_DELIVERY_MIN_CENTS, EXPRESS_MIN_NOTICE_HOURS, EXPRESS_PICKUP_MIN_CENTS,
  EXPRESS_SETTINGS_KEY, type ExpressCateringSettings,
} from "../../lib/expressMenu";

export class DemoPublicCheckout implements PublicCheckoutRepository {
  constructor(
    private audit: AuditRepository,
    private fireDrop: DemoFireDrop,
    private preorders: DemoPreorders,
    private menu: MenuRepository,
    private orders: DemoOrders,
    private settings: SettingsRepository,
    private discounts: DiscountsRepository,
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
    if (drop.soldOut) throw new Error("This week's Weekend Pre-Order is sold out.");
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
    // LIVE rule: "Orders open Sunday — close Thursday at 9am" (ET). Open on
    // Sunday and Mon–Wed all day, plus Thursday before 9:00 AM; closed from
    // Thursday 9:00 AM through Saturday night.
    const p = etParts(currentTime());
    const open = p.weekday === 0 || (p.weekday >= 1 && p.weekday <= 3) || (p.weekday === 4 && p.hour < 9);
    if (!open) {
      throw new Error("Cuban Thursday ordering is closed — orders open Sunday and close Thursday at 9:00 AM ET.");
    }
    // Pickup is the upcoming Thursday (today, when it's Thursday before 9 AM).
    const todayIso = todayEt();
    const thursday = (() => {
      const d = new Date(todayIso + "T12:00:00Z");
      d.setUTCDate(d.getUTCDate() + ((4 - p.weekday + 7) % 7));
      return d.toISOString().slice(0, 10);
    })();
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

  // ── Express Catering (Guests → Pickup/Delivery → Menu → Details & Payment) ──
  async expressCheckout(input: ExpressCheckoutInput): Promise<ExpressCheckoutResult> {
    if (!input.customer.name.trim()) throw new Error("Name is required");
    if (!input.customer.email.trim()) throw new Error("Email is required");
    if (!Number.isInteger(input.guests) || input.guests < 1) throw new Error("Guest count must be at least 1");
    if (!input.items.length) throw new Error("Cart is empty");
    for (const i of input.items) if (!Number.isInteger(i.qty) || i.qty < 1) throw new Error("Invalid quantity");

    // ≥24h notice, validated against the demo clock (live rule verbatim).
    const eventDate = new Date(input.eventAt);
    if (Number.isNaN(eventDate.getTime())) throw new Error("Choose a valid event date and time");
    if (eventDate.getTime() - currentTime().getTime() < EXPRESS_MIN_NOTICE_HOURS * 3600_000) {
      throw new Error("Orders require at least 24 hours notice.");
    }

    // Prices come from the "expressCatering" settings key ONLY.
    const menu = await this.settings.get<ExpressCateringSettings>(EXPRESS_SETTINGS_KEY, EXPRESS_DEFAULTS);
    const lines: Array<{ name: string; qty: number; unit: string; unitPriceCents: number }> = [];
    for (const it of input.items) {
      const pkg = menu.packages.find(x => x.id === it.id);
      if (pkg) { lines.push({ name: pkg.name, qty: it.qty, unit: "package", unitPriceCents: pkg.priceCents }); continue; }
      const alc = menu.alaCarte.find(x => x.id === it.id);
      if (!alc) throw new Error("Menu item not found — please refresh and try again.");
      lines.push({ name: alc.name, qty: it.qty, unit: alc.unit, unitPriceCents: alc.priceCents });
    }
    const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);

    // Discount (active codes only) applies to the subtotal before tax.
    let discountCents = 0;
    let appliedCode: string | null = null;
    if (input.discountCode && input.discountCode.trim()) {
      const code = input.discountCode.trim().toUpperCase();
      const d = (await this.discounts.list()).find(x => x.code === code && x.active);
      if (!d) throw new Error("Invalid or inactive discount code.");
      discountCents = d.kind === "percent"
        ? Math.floor((subtotalCents * Math.min(100, Math.max(1, d.value))) / 100)
        : d.value;
      discountCents = Math.min(subtotalCents, Math.max(0, discountCents));
      appliedCode = d.code;
    }
    const discountedSubtotal = subtotalCents - discountCents;

    // Minimums are enforced AFTER discount and BEFORE tax/fee.
    if (input.fulfillment === "pickup" && discountedSubtotal < EXPRESS_PICKUP_MIN_CENTS) {
      throw new Error("Pickup orders have a $250 minimum — add a little more to your order.");
    }
    if (input.fulfillment === "delivery" && discountedSubtotal < EXPRESS_DELIVERY_MIN_CENTS) {
      throw new Error("Delivery orders have a $500 minimum — add more, or switch to pickup ($250 minimum).");
    }

    const feeCents = input.fulfillment === "delivery" ? EXPRESS_DELIVERY_FEE_CENTS : 0;
    const taxableLines = [{ unitPriceCents: discountedSubtotal, qty: 1 }];
    if (feeCents > 0) taxableLines.push({ unitPriceCents: feeCents, qty: 1 });
    const totals = orderTotals(taxableLines);

    // Event date/time in ET drive the operational ticket.
    const ep = etParts(eventDate);
    const serviceDate = `${ep.year}-${String(ep.month).padStart(2, "0")}-${String(ep.day).padStart(2, "0")}`;
    const timeWindow = formatEventWindow(ep.hour);

    const receipts = await loadCol<Preorder>(EXPRESS_RECEIPTS, () => []);
    const orderRef = `EX-${serviceDate.replace(/-/g, "").slice(4)}-${1000 + receipts.length}`;

    const contact = [input.customer.email.trim(), input.customer.phone.trim()].filter(Boolean).join(" / ");
    const noteParts = [
      `[EXPRESS ${input.fulfillment.toUpperCase()}]`,
      `Guests: ${input.guests}`,
      `Contact: ${contact}`,
    ];
    if (appliedCode) noteParts.push(`Discount: ${appliedCode} (−${(discountCents / 100).toFixed(2)})`);
    if (input.notes && input.notes.trim()) noteParts.push(input.notes.trim());

    await this.orders.create({
      orderRef, channel: "catering", customer: input.customer.name.trim(),
      serviceDate, timeWindow, guests: input.guests,
      items: lines.map(l => ({ name: l.name, qty: l.qty, unit: l.unit })),
      notes: noteParts.join(" · "),
    }, "public-express");

    // Customer-facing receipt row (money lives here; OrderTicket carries none).
    const receiptItems: Preorder["items"] = lines.map(l => ({ id: uid(), name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents }));
    if (discountCents > 0 && appliedCode) receiptItems.push({ id: uid(), name: `Discount (${appliedCode})`, qty: 1, unitPriceCents: -discountCents });
    if (feeCents > 0) receiptItems.push({ id: uid(), name: EXPRESS_DELIVERY_FEE_LABEL, qty: 1, unitPriceCents: feeCents });
    const receipt: Preorder = {
      id: uid(), orderRef, channel: "catering",
      customer: input.customer.name.trim(), phone: input.customer.phone.trim(), email: input.customer.email.trim(),
      pickupDate: serviceDate, pickupWindow: timeWindow,
      items: receiptItems,
      subtotalCents: totals.subtotalCents, taxCents: totals.taxCents, totalCents: totals.totalCents,
      status: "paid", hidden: false,
      statusHistory: [{ from: null, to: "paid", at: nowIso(), actor: "demo-payment" }],
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    receipts.push(receipt);
    await saveCol(EXPRESS_RECEIPTS, receipts);
    await this.audit.log({
      actor: "public", action: "express.checkout", entity: "express_order", entityId: orderRef,
      before: null, after: { fulfillment: input.fulfillment, guests: input.guests, totalCents: totals.totalCents, discountCode: appliedCode },
    });
    return { orderRef, totalCents: totals.totalCents };
  }

  async trackByRef(ref: string): Promise<Preorder | null> {
    const needle = ref.trim().toLowerCase();
    const all = await this.preorders.list({ includeHidden: true });
    const hit = all.find(p => p.orderRef.toLowerCase() === needle);
    if (hit) return hit;
    const receipts = await loadCol<Preorder>(EXPRESS_RECEIPTS, () => []);
    return receipts.find(p => p.orderRef.toLowerCase() === needle) ?? null;
  }
}

const EXPRESS_RECEIPTS = "expressReceipts.v1";

/** "12–1PM" style one-hour window from a 24h start hour (matches live copy). */
export function formatEventWindow(startHour: number): string {
  const h12 = (h: number) => ((h % 24) + 11) % 12 + 1;
  const mer = (h: number) => (h % 24) < 12 ? "AM" : "PM";
  const end = startHour + 1;
  return mer(startHour) === mer(end)
    ? `${h12(startHour)}–${h12(end)}${mer(end)}`
    : `${h12(startHour)}${mer(startHour)}–${h12(end)}${mer(end)}`;
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
