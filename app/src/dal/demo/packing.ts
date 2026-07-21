/**
 * Demo repositories: packing queue, packing supplies, deliveries.
 * PackJobs and Deliveries are derived from the orders collection (via the
 * OrdersRepository instance) on first sight, then persisted so checklist
 * state survives refreshes. Every mutation is audit-logged.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { todayEt, mondayOfWeek } from "./domains";
import { etParts } from "../../lib/time";
import type {
  AuditRepository, DeliveriesRepository, Delivery, DeliveryStatus, OrdersRepository,
  PackItem, PackJob, PackingRepository, SuppliesRepository, SupplyItem,
} from "../types";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function etDateOf(isoTimestamp: string): string {
  const p = etParts(new Date(isoTimestamp));
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// ── Packing ───────────────────────────────────────────────────────────────
const PACK_JOBS = "packJobs.v1";
const PACKABLE = new Set(["confirmed", "in_prep", "ready"]);

export class DemoPacking implements PackingRepository {
  constructor(private audit: AuditRepository, private orders: OrdersRepository) {}

  /** Create a PackJob the first time an eligible order is seen; persist state. */
  private async sync(): Promise<PackJob[]> {
    const jobs = await loadCol<PackJob>(PACK_JOBS, () => []);
    const today = todayEt();
    const orders = await this.orders.list();
    let dirty = false;
    for (const o of orders) {
      if (o.serviceDate < today || !PACKABLE.has(o.status)) continue;
      if (jobs.some(j => j.orderId === o.id)) continue;
      const checklist: PackItem[] = [
        ...o.items.map(i => ({ id: uid(), label: `Pack ${i.qty} ${i.unit} ${i.name}`, done: false })),
        { id: uid(), label: "Sauces & utensils", done: false },
        { id: uid(), label: "Napkins & wetnaps", done: false },
        { id: uid(), label: "Label with name & window", done: false },
      ];
      jobs.push({
        id: uid(), orderId: o.id, orderRef: o.orderRef, customer: o.customer,
        serviceDate: o.serviceDate, timeWindow: o.timeWindow, channel: o.channel,
        items: o.items.map(i => ({ ...i })), checklist, packedAt: null, packedBy: null,
      });
      dirty = true;
    }
    if (dirty) await saveCol(PACK_JOBS, jobs);
    return jobs;
  }

  async queue(): Promise<PackJob[]> {
    const jobs = await this.sync();
    const today = todayEt();
    return jobs
      .filter(j => !j.packedAt && j.serviceDate >= today)
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.timeWindow.localeCompare(b.timeWindow));
  }

  async packedToday(): Promise<PackJob[]> {
    const jobs = await this.sync();
    const today = todayEt();
    return jobs.filter(j => j.packedAt !== null && etDateOf(j.packedAt) === today);
  }

  private async mutate(jobId: string, actor: string, fn: (j: PackJob) => void, action: string): Promise<PackJob> {
    const jobs = await this.sync();
    const j = jobs.find(x => x.id === jobId);
    if (!j) throw new Error("Pack job not found");
    const before = JSON.parse(JSON.stringify(j));
    fn(j);
    await saveCol(PACK_JOBS, jobs);
    await this.audit.log({ actor, action, entity: "pack_job", entityId: j.orderRef, before, after: JSON.parse(JSON.stringify(j)) });
    return { ...j };
  }

  toggleChecklistItem(jobId: string, itemId: string, actor: string): Promise<PackJob> {
    return this.mutate(jobId, actor, j => {
      const it = j.checklist.find(c => c.id === itemId);
      if (!it) throw new Error("Checklist item not found");
      it.done = !it.done;
    }, "pack.check");
  }

  confirmPacked(jobId: string, actor: string): Promise<PackJob> {
    return this.mutate(jobId, actor, j => {
      if (j.checklist.some(c => !c.done)) throw new Error("All checklist items must be done before confirming pack");
      j.packedAt = nowIso();
      j.packedBy = actor;
    }, "pack.confirm");
  }

  async unpack(jobId: string, reason: string, actor: string): Promise<PackJob> {
    if (!reason.trim()) throw new Error("A reason is required to unpack an order");
    const jobs = await loadCol<PackJob>(PACK_JOBS, () => []);
    const j = jobs.find(x => x.id === jobId);
    if (!j) throw new Error("Pack job not found");
    if (!j.packedAt) throw new Error("Order is not packed");
    const before = { packedAt: j.packedAt, packedBy: j.packedBy };
    j.packedAt = null;
    j.packedBy = null;
    await saveCol(PACK_JOBS, jobs);
    await this.audit.log({ actor, action: "pack.unpack", entity: "pack_job", entityId: j.orderRef, before, after: { reason: reason.trim() } });
    return { ...j };
  }
}

// ── Supplies ──────────────────────────────────────────────────────────────
const SUPPLIES = "supplies.v1";
function seedSupplies(): SupplyItem[] {
  const mk = (name: string, unit: string, onHand: number, parLevel: number, perOrderUsage: number): SupplyItem =>
    ({ id: uid(), name, unit, onHand, parLevel, perOrderUsage });
  return [
    mk("Butcher paper rolls", "rolls", 4, 6, 0.05),
    mk("1/2 pans w/ lids", "each", 60, 100, 2),
    mk("Quart cups", "each", 140, 200, 1.5),
    mk("Pint cups", "each", 90, 150, 1),
    mk("Sampler trays", "each", 45, 80, 0.5),
    mk("Bags (large handle)", "each", 110, 150, 1),
    mk("Napkin packs", "packs", 30, 40, 0.5),
    mk("Utensil kits", "each", 160, 250, 3),
  ];
}

export class DemoSupplies implements SuppliesRepository {
  constructor(private audit: AuditRepository, private orders: OrdersRepository) {}

  async list(): Promise<SupplyItem[]> { return loadCol(SUPPLIES, seedSupplies); }

  async adjust(id: string, delta: number, actor: string): Promise<SupplyItem> {
    if (!Number.isFinite(delta)) throw new Error("Adjustment must be a number");
    const rows = await loadCol(SUPPLIES, seedSupplies);
    const it = rows.find(r => r.id === id);
    if (!it) throw new Error("Supply item not found");
    const before = { ...it };
    it.onHand = Math.max(0, it.onHand + delta);
    await saveCol(SUPPLIES, rows);
    await this.audit.log({ actor, action: "supplies.adjust", entity: "supply_item", entityId: it.name, before, after: { ...it } });
    return { ...it };
  }

  async upsert(item: Omit<SupplyItem, "id"> & { id?: string }, actor: string): Promise<SupplyItem> {
    if (!item.name.trim()) throw new Error("Name is required");
    for (const [label, v] of [["onHand", item.onHand], ["parLevel", item.parLevel], ["perOrderUsage", item.perOrderUsage]] as const) {
      if (!Number.isFinite(v) || v < 0) throw new Error(`${label} must be a non-negative number`);
    }
    const rows = await loadCol(SUPPLIES, seedSupplies);
    const existing = item.id ? rows.find(r => r.id === item.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, item, { name: item.name.trim() });
      await saveCol(SUPPLIES, rows);
      await this.audit.log({ actor, action: "supplies.update", entity: "supply_item", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: SupplyItem = { ...item, id: uid(), name: item.name.trim() };
    rows.push(full);
    await saveCol(SUPPLIES, rows);
    await this.audit.log({ actor, action: "supplies.create", entity: "supply_item", entityId: full.name, before: null, after: full });
    return full;
  }

  async forecast(): Promise<Array<{ item: SupplyItem; weekNeed: number; gap: number }>> {
    const items = await this.list();
    const monday = mondayOfWeek(todayEt());
    const end = addDays(monday, 7);
    const orders = await this.orders.list();
    const weekOrders = orders.filter(o => o.serviceDate >= monday && o.serviceDate < end && o.status !== "cancelled").length;
    return items.map(item => {
      const weekNeed = Math.ceil(item.perOrderUsage * weekOrders);
      return { item, weekNeed, gap: Math.max(0, weekNeed - item.onHand) };
    });
  }
}

// ── Deliveries ────────────────────────────────────────────────────────────
const DELIVERIES = "deliveries.v1";
const DRIVERS = ["Marcus", "Tanya", "D'Angelo"];
const STATUS_FLOW: DeliveryStatus[] = ["assigned", "loaded", "en_route", "delivered"];
const DEMO_ADDRESSES = [
  "1910 N Ola Ave, Tampa, FL 33602",
  "600 N Ashley Dr, Tampa, FL 33602",
  "1600 E 8th Ave, Ybor City, Tampa, FL 33605",
];

export class DemoDeliveries implements DeliveriesRepository {
  constructor(private audit: AuditRepository, private orders: OrdersRepository) {}

  drivers(): string[] { return [...DRIVERS]; }

  /** Derive once from catering-channel orders, then persist. */
  private async load(): Promise<Delivery[]> {
    const stored = await loadCol<Delivery>(DELIVERIES, () => []);
    if (stored.length) return stored;
    const catering = await this.orders.list({ channel: "catering" });
    const fresh: Delivery[] = catering.slice(0, 3).map((o, i) => ({
      id: uid(), orderId: o.id, orderRef: o.orderRef, customer: o.customer,
      address: DEMO_ADDRESSES[i % DEMO_ADDRESSES.length],
      serviceDate: o.serviceDate, window: o.timeWindow,
      driver: i === 0 ? DRIVERS[0] : null, status: "assigned", notes: null,
    }));
    await saveCol(DELIVERIES, fresh);
    return fresh;
  }

  async list(): Promise<Delivery[]> {
    return (await this.load()).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.window.localeCompare(b.window));
  }

  private async mutate(id: string, actor: string, fn: (d: Delivery) => void, action: string): Promise<Delivery> {
    const rows = await this.load();
    const d = rows.find(r => r.id === id);
    if (!d) throw new Error("Delivery not found");
    const before = { ...d };
    fn(d);
    await saveCol(DELIVERIES, rows);
    await this.audit.log({ actor, action, entity: "delivery", entityId: d.orderRef, before, after: { ...d } });
    return { ...d };
  }

  assignDriver(id: string, driver: string, actor: string): Promise<Delivery> {
    if (!DRIVERS.includes(driver)) throw new Error(`Unknown driver: ${driver}`);
    return this.mutate(id, actor, d => { d.driver = driver; }, "delivery.assign");
  }

  advance(id: string, actor: string): Promise<Delivery> {
    return this.mutate(id, actor, d => {
      const idx = STATUS_FLOW.indexOf(d.status);
      if (idx >= STATUS_FLOW.length - 1) throw new Error("Delivery already delivered");
      d.status = STATUS_FLOW[idx + 1];
    }, "delivery.advance");
  }

  setStatus(id: string, status: DeliveryStatus, actor: string): Promise<Delivery> {
    return this.mutate(id, actor, d => {
      if (!STATUS_FLOW.includes(status)) throw new Error(`Unknown delivery status: ${status}`);
      d.status = status;
    }, "delivery.setStatus");
  }

  updateNotes(id: string, notes: string, actor: string): Promise<Delivery> {
    return this.mutate(id, actor, d => { d.notes = notes; }, "delivery.notes");
  }
}
