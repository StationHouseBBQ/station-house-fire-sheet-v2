/** Demo repositories: retail fire sheet, preorders, temp log, fire drop admin. */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { FIRE_DROP_PRODUCTS } from "./menuData";
import { todayEt, mondayOfWeek } from "./domains";
import { orderTotals } from "../../lib/money";
import { activeDropWeekend, isOrderingOpen } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import type {
  AuditRepository, FireDrop, FireDropProduct, FireDropRepository, FireDropSlot, Preorder,
  PreorderStatus, PreordersRepository, RetailFireItem, RetailFireSheetRepository,
  RetailItemStatus, RetailSession, TempCheck, TempLogRepository,
} from "../types";

// ── Retail fire sheet ─────────────────────────────────────────────────────
const PAR_ITEMS: Array<[string, string, number]> = [
  ["Pulled Pork", "pans", 3], ["Brisket (sliced)", "pans", 2], ["St. Louis Ribs", "racks", 8],
  ["Smoked Sausage", "each", 20], ["Chicken Quarters", "each", 12], ["Mac & Cheese", "pans", 2],
  ["Collard Greens", "pans", 1], ["Coleslaw", "quarts", 6], ["Banana Pudding", "each", 12],
];
export class DemoRetailFireSheet implements RetailFireSheetRepository {
  constructor(private audit: AuditRepository) {}
  private key() { return `retailSession.${todayEt()}`; }
  async getSession(): Promise<RetailSession> {
    const rows = await loadCol<RetailSession>(this.key(), () => [{
      id: uid(), serviceDate: todayEt(), submittedToKitchenAt: null,
      items: PAR_ITEMS.slice(0, 5).map(([name, unit, qty]) => ({ id: uid(), name, unit, qty, status: "queued" as RetailItemStatus, updatedAt: nowIso() })),
    }]);
    return rows[0];
  }
  private async mutate<T>(actor: string, action: string, fn: (s: RetailSession) => T): Promise<T> {
    const rows = await loadCol<RetailSession>(this.key(), () => []);
    const s = rows[0] ?? (await this.getSession());
    const r = fn(s);
    await saveCol(this.key(), [s]);
    await this.audit.log({ actor, action, entity: "retail_session", entityId: s.serviceDate, before: null, after: null });
    return r;
  }
  addItem(input: { name: string; unit: string; qty: number }, actor: string): Promise<RetailFireItem> {
    if (!input.name.trim()) throw new Error("Name required");
    return this.mutate(actor, "retail.add", s => {
      const it: RetailFireItem = { id: uid(), name: input.name.trim(), unit: input.unit, qty: input.qty, status: "queued", updatedAt: nowIso() };
      s.items.push(it); return it;
    });
  }
  updateItemStatus(itemId: string, status: RetailItemStatus, actor: string): Promise<RetailFireItem> {
    return this.mutate(actor, "retail.status", s => {
      const it = s.items.find(i => i.id === itemId); if (!it) throw new Error("Item not found");
      it.status = status; it.updatedAt = nowIso(); return { ...it };
    });
  }
  updateItemQty(itemId: string, qty: number, actor: string): Promise<RetailFireItem> {
    if (!(qty >= 0)) throw new Error("Quantity must be ≥ 0");
    return this.mutate(actor, "retail.qty", s => {
      const it = s.items.find(i => i.id === itemId); if (!it) throw new Error("Item not found");
      it.qty = qty; it.updatedAt = nowIso(); return { ...it };
    });
  }
  removeItem(itemId: string, actor: string): Promise<void> {
    return this.mutate(actor, "retail.remove", s => { s.items = s.items.filter(i => i.id !== itemId); });
  }
  submitToKitchen(actor: string): Promise<RetailSession> {
    return this.mutate(actor, "retail.submit", s => { s.submittedToKitchenAt = nowIso(); return { ...s }; });
  }
  syncFromPar(actor: string): Promise<RetailSession> {
    return this.mutate(actor, "retail.syncPar", s => {
      for (const [name, unit, qty] of PAR_ITEMS) {
        if (!s.items.some(i => i.name === name)) {
          s.items.push({ id: uid(), name, unit, qty, status: "queued", updatedAt: nowIso() });
        }
      }
      return { ...s };
    });
  }
}

// ── Preorders ─────────────────────────────────────────────────────────────
const PREORDERS = "preorders.v1";
function preorderSeed(): Preorder[] {
  const { friday, saturday } = activeDropWeekend(currentTime());
  const monday = mondayOfWeek(todayEt());
  const thursday = (() => { const d = new Date(monday + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 3); return d.toISOString().slice(0, 10); })();
  const mk = (channel: "fire_drop" | "cuban_thursday", customer: string, phone: string, email: string, pickupDate: string, window: string, items: Array<[string, number, number]>, status: PreorderStatus): Preorder => {
    const lines = items.map(([name, qty, unitPriceCents]) => ({ id: uid(), name, qty, unitPriceCents }));
    const t = orderTotals(lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
    return {
      id: uid(), orderRef: `FD-${pickupDate.replace(/-/g, "").slice(4)}-${1000 + Math.floor(Math.random() * 900)}`,
      channel, customer, phone, email, pickupDate, pickupWindow: window,
      items: lines, subtotalCents: t.subtotalCents, taxCents: t.taxCents, totalCents: t.totalCents,
      status, hidden: false,
      statusHistory: [{ from: null, to: status, at: nowIso(), actor: "demo-seed" }],
      createdAt: nowIso(), updatedAt: nowIso(),
    };
  };
  return [
    mk("fire_drop", "Maria Santos", "813-555-0184", "maria@example.com", friday, "11AM–12PM", [["Tampa Diamonds (lb)", 2, 2900], ["Mac & Cheese (pan)", 1, 1200]], "paid"),
    mk("fire_drop", "James Walker", "813-555-0119", "james@example.com", friday, "12–1PM", [["Party Sampler · Feeds 10", 1, 26900]], "paid"),
    mk("fire_drop", "Aisha Brooks", "813-555-0142", "aisha@example.com", saturday, "11AM–12PM", [["Tampa Diamonds (lb)", 3, 2900]], "pending"),
    mk("cuban_thursday", "Luis Ramirez", "813-555-0177", "luis@example.com", thursday, "12–1PM", [["Cuban Sandwich", 4, 1450], ["Brisket Smash Burger", 2, 1600]], "paid"),
    mk("cuban_thursday", "Ybor Social Club", "813-555-0163", "events@yborsocial.com", thursday, "11AM–12PM", [["Cuban Sandwich", 12, 1450]], "ready"),
  ];
}
export class DemoPreorders implements PreordersRepository {
  constructor(private audit: AuditRepository) {}
  async list(filter?: { channel?: "fire_drop" | "cuban_thursday" | "all"; status?: PreorderStatus | "all"; includeHidden?: boolean }) {
    let rows = await loadCol(PREORDERS, preorderSeed);
    if (!filter?.includeHidden) rows = rows.filter(r => !r.hidden);
    if (filter?.channel && filter.channel !== "all") rows = rows.filter(r => r.channel === filter.channel);
    if (filter?.status && filter.status !== "all") rows = rows.filter(r => r.status === filter.status);
    return rows.sort((a, b) => a.pickupDate.localeCompare(b.pickupDate) || a.pickupWindow.localeCompare(b.pickupWindow));
  }
  private async mutate(id: string, actor: string, fn: (p: Preorder) => void, action: string): Promise<Preorder> {
    const rows = await loadCol(PREORDERS, preorderSeed);
    const p = rows.find(r => r.id === id); if (!p) throw new Error("Preorder not found");
    const before = { status: p.status, hidden: p.hidden };
    fn(p); p.updatedAt = nowIso();
    await saveCol(PREORDERS, rows);
    await this.audit.log({ actor, action, entity: "preorder", entityId: p.orderRef, before, after: { status: p.status, hidden: p.hidden } });
    return { ...p };
  }
  updateStatus(id: string, status: PreorderStatus, actor: string) {
    return this.mutate(id, actor, p => {
      p.statusHistory.push({ from: p.status, to: status, at: nowIso(), actor });
      p.status = status;
    }, "preorder.status");
  }
  setHidden(id: string, hidden: boolean, actor: string) {
    return this.mutate(id, actor, p => { p.hidden = hidden; }, hidden ? "preorder.hide" : "preorder.unhide");
  }
  async createManual(input: { channel: "fire_drop" | "cuban_thursday"; customer: string; phone: string; email: string; pickupDate: string; pickupWindow: string; items: Array<{ name: string; qty: number; unitPriceCents: number }> }, actor: string): Promise<Preorder> {
    if (!input.customer.trim()) throw new Error("Customer required");
    if (!input.items.length) throw new Error("At least one item");
    const lines = input.items.map(i => ({ id: uid(), ...i }));
    const t = orderTotals(lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
    const p: Preorder = {
      id: uid(), orderRef: `FD-${input.pickupDate.replace(/-/g, "").slice(4)}-M${Date.now() % 1000}`,
      channel: input.channel, customer: input.customer.trim(), phone: input.phone, email: input.email,
      pickupDate: input.pickupDate, pickupWindow: input.pickupWindow,
      items: lines, subtotalCents: t.subtotalCents, taxCents: t.taxCents, totalCents: t.totalCents,
      status: "pending", hidden: false,
      statusHistory: [{ from: null, to: "pending", at: nowIso(), actor }],
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    const rows = await loadCol(PREORDERS, preorderSeed);
    rows.push(p); await saveCol(PREORDERS, rows);
    await this.audit.log({ actor, action: "preorder.manual", entity: "preorder", entityId: p.orderRef, before: null, after: { total: p.totalCents } });
    return p;
  }

  async updateItems(id: string, items: Array<{ name: string; qty: number; unitPriceCents: number }>, actor: string): Promise<Preorder> {
    if (!items.length) throw new Error("Order must keep at least one item");
    for (const i of items) {
      if (!i.name.trim()) throw new Error("Item name required");
      if (!Number.isInteger(i.qty) || i.qty < 1) throw new Error("Quantities must be whole numbers ≥ 1");
      if (!Number.isInteger(i.unitPriceCents) || i.unitPriceCents < 0) throw new Error("Prices must be non-negative");
    }
    const rows = await loadCol(PREORDERS, preorderSeed);
    const p = rows.find(r => r.id === id);
    if (!p) throw new Error("Preorder not found");
    const before = { items: p.items, totalCents: p.totalCents };
    const t = orderTotals(items.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
    p.items = items.map(i => ({ id: uid(), ...i }));
    p.subtotalCents = t.subtotalCents;
    p.taxCents = t.taxCents;
    p.totalCents = t.totalCents;
    p.updatedAt = nowIso();
    await saveCol(PREORDERS, rows);
    await this.audit.log({ actor, action: "preorder.items", entity: "preorder", entityId: p.orderRef, before, after: { items: p.items, totalCents: p.totalCents } });
    return { ...p };
  }
  async stats() {
    const rows = (await loadCol(PREORDERS, preorderSeed)).filter(r => !r.hidden && !["cancelled", "refunded", "picked_up"].includes(r.status));
    const { friday, saturday } = activeDropWeekend(currentTime());
    return {
      activeCount: rows.length,
      fridayCount: rows.filter(r => r.pickupDate === friday).length,
      saturdayCount: rows.filter(r => r.pickupDate === saturday).length,
      activeRevenueCents: rows.reduce((s, r) => s + r.totalCents, 0),
    };
  }
}

// ── Temp log ──────────────────────────────────────────────────────────────
const STATIONS = [
  { name: "Walk-in cooler", minF: null, maxF: 40, note: "≤ 40°F" },
  { name: "Freezer", minF: null, maxF: 0, note: "≤ 0°F" },
  { name: "Hot hold — case", minF: 135, maxF: null, note: "≥ 135°F" },
  { name: "Hot hold — sides", minF: 135, maxF: null, note: "≥ 135°F" },
  { name: "Cold well", minF: null, maxF: 41, note: "≤ 41°F" },
];
export class DemoTempLog implements TempLogRepository {
  constructor(private audit: AuditRepository) {}
  private key() { return `tempLog.${todayEt()}`; }
  stations() { return STATIONS; }
  async todayChecks() {
    return (await loadCol<TempCheck>(this.key(), () => [])).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  }
  async submitCheck(station: string, tempF: number, actor: string): Promise<TempCheck> {
    const st = STATIONS.find(s => s.name === station); if (!st) throw new Error("Unknown station");
    if (!Number.isFinite(tempF) || tempF < -40 || tempF > 250) throw new Error("Temperature out of sensible range");
    const withinRange = (st.minF === null || tempF >= st.minF) && (st.maxF === null || tempF <= st.maxF);
    const check: TempCheck = { id: uid(), station, tempF, withinRange, rangeNote: st.note, takenBy: actor, takenAt: nowIso() };
    const rows = await loadCol<TempCheck>(this.key(), () => []);
    rows.push(check); await saveCol(this.key(), rows);
    await this.audit.log({ actor, action: "temp.check", entity: "temp_check", entityId: station, before: null, after: { tempF, withinRange } });
    return check;
  }
}

// ── Fire Drop admin ───────────────────────────────────────────────────────
const DROPS = "fireDrops.v1";
function dropSeed(): FireDrop[] {
  const { friday, saturday } = activeDropWeekend(currentTime());
  const windows = ["11AM–12PM", "12–1PM", "1–2PM"];
  return [{
    id: uid(), title: "Tampa Diamonds", fridayDate: friday, saturdayDate: saturday, soldOut: false,
    // Real drop-1 catalog from the Manus DB snapshot (see menuData.ts).
    products: FIRE_DROP_PRODUCTS.filter(p => p.active)
      .map(p => ({ id: uid(), name: p.name, priceCents: p.priceCents, capQty: p.capQty, soldQty: 0, soldOut: false, sortOrder: p.sortOrder })),
    slots: windows.flatMap(w => ([
      { id: uid(), day: "friday" as const, window: w, capacity: 8, booked: w === "11AM–12PM" ? 1 : w === "12–1PM" ? 1 : 0 },
      { id: uid(), day: "saturday" as const, window: w, capacity: 8, booked: w === "11AM–12PM" ? 1 : 0 },
    ])),
  }];
}
export class DemoFireDrop implements FireDropRepository {
  constructor(private audit: AuditRepository) {}
  async currentDrop(): Promise<FireDrop> {
    const rows = await loadCol(DROPS, dropSeed);
    const { friday } = activeDropWeekend(currentTime());
    let drop = rows.find(d => d.fridayDate === friday);
    if (!drop) {
      // weekly auto-advance behavior (Monday reset): new week window, slots reset
      const prev = rows[rows.length - 1];
      const { friday: f, saturday: s } = activeDropWeekend(currentTime());
      drop = {
        ...prev, id: uid(), fridayDate: f, saturdayDate: s, soldOut: false,
        products: prev.products.map(p => ({ ...p, id: uid(), soldQty: 0, soldOut: false })),
        slots: prev.slots.map(sl => ({ ...sl, id: uid(), booked: 0 })),
      };
      rows.push(drop); await saveCol(DROPS, rows);
      await this.audit.log({ actor: "system", action: "drop.advance", entity: "fire_drop", entityId: f, before: null, after: { title: drop.title } });
    }
    return drop;
  }
  private async mutate(actor: string, action: string, fn: (d: FireDrop) => void): Promise<FireDrop> {
    const rows = await loadCol(DROPS, dropSeed);
    const { friday } = activeDropWeekend(currentTime());
    const d = rows.find(x => x.fridayDate === friday) ?? rows[rows.length - 1];
    fn(d); await saveCol(DROPS, rows);
    await this.audit.log({ actor, action, entity: "fire_drop", entityId: d.fridayDate, before: null, after: null });
    return { ...d };
  }
  updateDrop(patch: { title?: string; soldOut?: boolean }, actor: string) {
    return this.mutate(actor, "drop.update", d => Object.assign(d, patch));
  }
  upsertProduct(p: Omit<FireDropProduct, "soldQty"> & { id?: string }, actor: string) {
    if (!Number.isInteger(p.priceCents) || p.priceCents < 0) throw new Error("Price must be non-negative integer cents");
    return this.mutate(actor, "drop.product", d => {
      if (p.id) {
        const ex = d.products.find(x => x.id === p.id); if (!ex) throw new Error("Product not found");
        Object.assign(ex, p);
      } else {
        d.products.push({ ...p, id: uid(), soldQty: 0 });
      }
      d.products.sort((a, b) => a.sortOrder - b.sortOrder);
    });
  }
  removeProduct(productId: string, actor: string) {
    return this.mutate(actor, "drop.product.remove", d => { d.products = d.products.filter(p => p.id !== productId); });
  }
  toggleProductSoldOut(productId: string, actor: string) {
    return this.mutate(actor, "drop.product.86", d => {
      const p = d.products.find(x => x.id === productId); if (!p) throw new Error("Product not found");
      p.soldOut = !p.soldOut;
    });
  }
  upsertSlot(s: Omit<FireDropSlot, "booked"> & { id?: string }, actor: string) {
    if (s.capacity < 0) throw new Error("Capacity must be ≥ 0");
    return this.mutate(actor, "drop.slot", d => {
      if (s.id) {
        const ex = d.slots.find(x => x.id === s.id); if (!ex) throw new Error("Slot not found");
        Object.assign(ex, s);
      } else {
        d.slots.push({ ...s, id: uid(), booked: 0 });
      }
    });
  }
  removeSlot(slotId: string, actor: string) {
    return this.mutate(actor, "drop.slot.remove", d => { d.slots = d.slots.filter(s => s.id !== slotId); });
  }
  orderingStatus() {
    return { friday: isOrderingOpen("friday"), saturday: isOrderingOpen("saturday") };
  }
  /** Transactional consumption analog: bump soldQty + slot booking atomically. */
  async consume(items: Array<{ productId: string; qty: number }>, slotId: string): Promise<void> {
    await this.mutate("public", "drop.consume", d => {
      for (const it of items) {
        const p = d.products.find(x => x.id === it.productId);
        if (!p) throw new Error("Product not found");
        if (p.capQty !== null && p.soldQty + it.qty > p.capQty) throw new Error(`Only ${Math.max(0, p.capQty - p.soldQty)} left of ${p.name}.`);
        p.soldQty += it.qty;
      }
      const s = d.slots.find(x => x.id === slotId);
      if (!s) throw new Error("Slot not found");
      if (s.booked >= s.capacity) throw new Error("That pickup window is full — choose another.");
      s.booked += 1;
    });
  }
}
