/**
 * Demo repositories for orders/KDS/checklists/calendar/pit domains.
 * Seeds respect menu truths: Cubans & Smash Burgers Thursday-only;
 * Fri/Sat are BBQ preorder days; Walk-In Sampler = pulled pork, brisket,
 * sausage, ribs, chicken quarters only.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import type {
  AuditRepository, CalendarEvent, CalendarRepository, ChecklistRepository, ChecklistRun,
  KdsRepository, KdsStage, KdsTicket, MeatCost, MeatCostsRepository, OrderChannel, OrderStatus,
  OrderTicket, OrdersRepository, PitChecklistRepository, PitTask, PitmasterProtein,
  PitmasterRepository, GuideStep, PrepRecipe, PrepRecipeRepository, ProteinConversion,
  ProteinRepository, SmokeBatch, SmokedInventoryRepository, SmokerEntry, SmokerForecastRepository,
} from "../types";

// ── date helpers ──────────────────────────────────────────────────────────
export function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}
function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekdayOf(iso: string): number { return new Date(iso + "T12:00:00Z").getUTCDay(); } // 0=Sun
export function mondayOfWeek(iso: string): string {
  const dow = weekdayOf(iso); return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

// ── Orders seed ───────────────────────────────────────────────────────────
const CUSTOMERS = ["Maria Santos", "James Walker", "Aisha Brooks", "Tampa Tech Co.", "Bayfront Realty", "Derek Owens", "Luis Ramirez", "Megan Ford", "Seminole Little League", "Ybor Social Club"];
const BBQ_ITEMS: Array<[string, string]> = [["Pulled Pork", "lbs"], ["Brisket (sliced)", "lbs"], ["St. Louis Ribs", "racks"], ["Smoked Sausage", "each"], ["Chicken Quarters", "each"], ["Mac & Cheese", "pans"], ["Collard Greens", "pans"], ["Coleslaw", "quarts"], ["Banana Pudding", "each"]];
const THU_ITEMS: Array<[string, string]> = [["Cuban Sandwich", "each"], ["Brisket Smash Burger", "each"]];

function seedOrders(): OrderTicket[] {
  const monday = mondayOfWeek(todayEt());
  const out: OrderTicket[] = [];
  let refN = 1041;
  for (let d = 0; d < 7; d++) {
    const date = addDays(monday, d);
    const dow = weekdayOf(date); // 0=Sun
    const isThu = dow === 4;
    const perDay = dow === 5 || dow === 6 ? 4 : dow === 4 ? 3 : 2;
    for (let i = 0; i < perDay; i++) {
      const channel: OrderChannel = isThu && i === 0 ? "cuban_thursday" : (dow === 5 || dow === 6) && i < 2 ? "fire_drop" : i % 2 ? "retail" : "catering";
      const pool = channel === "cuban_thursday" ? THU_ITEMS : BBQ_ITEMS;
      const items = Array.from({ length: 2 + ((i + d) % 3) }, (_, k) => {
        const [name, unit] = pool[(i + k * 2 + d) % pool.length];
        return { id: uid(), name, qty: unit === "lbs" ? 3 + ((k + d) % 5) : 1 + ((k + i) % 8), unit, notes: null };
      });
      const status: OrderStatus = "confirmed";
      out.push({
        id: uid(), orderRef: `FS-${date.replace(/-/g, "").slice(4)}-${refN++}`, channel,
        customer: CUSTOMERS[(d * 3 + i) % CUSTOMERS.length], serviceDate: date,
        timeWindow: ["10AM–11AM", "11AM–12PM", "12–1PM", "3–4PM"][i % 4],
        status, guests: channel === "catering" ? 20 + ((d * 7 + i * 13) % 120) : null,
        items, notes: null,
        statusHistory: [{ from: null, to: status, at: nowIso(), actor: "demo-seed" }],
        updatedAt: nowIso(),
      });
    }
  }
  return out;
}
const ORDERS = "orders.v1";

export class DemoOrders implements OrdersRepository {
  constructor(private audit: AuditRepository) {}
  async list(filter?: { date?: string; status?: OrderStatus | "all"; channel?: OrderChannel | "all" }): Promise<OrderTicket[]> {
    let rows = await loadCol(ORDERS, seedOrders);
    if (filter?.date) rows = rows.filter(r => r.serviceDate === filter.date);
    if (filter?.status && filter.status !== "all") rows = rows.filter(r => r.status === filter.status);
    if (filter?.channel && filter.channel !== "all") rows = rows.filter(r => r.channel === filter.channel);
    return rows.sort((a, b) => a.serviceDate.localeCompare(b.serviceDate) || a.timeWindow.localeCompare(b.timeWindow));
  }
  async get(id: string) { return (await loadCol(ORDERS, seedOrders)).find(r => r.id === id) ?? null; }
  private async mutate(id: string, actor: string, fn: (o: OrderTicket) => void, action: string): Promise<OrderTicket> {
    const rows = await loadCol(ORDERS, seedOrders);
    const o = rows.find(r => r.id === id); if (!o) throw new Error("Order not found");
    const before = JSON.parse(JSON.stringify(o)); fn(o); o.updatedAt = nowIso();
    await saveCol(ORDERS, rows);
    await this.audit.log({ actor, action, entity: "order", entityId: o.orderRef, before, after: JSON.parse(JSON.stringify(o)) });
    return { ...o };
  }
  updateStatus(id: string, status: OrderStatus, actor: string) {
    return this.mutate(id, actor, o => {
      o.statusHistory.push({ from: o.status, to: status, at: nowIso(), actor });
      o.status = status;
    }, "order.status");
  }
  updateNotes(id: string, notes: string, actor: string) {
    return this.mutate(id, actor, o => { o.notes = notes; }, "order.notes");
  }
  async weekDates(offsetWeeks = 0): Promise<string[]> {
    const monday = addDays(mondayOfWeek(todayEt()), offsetWeeks * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }
}

// ── KDS ───────────────────────────────────────────────────────────────────
const KDS = "kds.v1";
async function kdsSeed(): Promise<KdsTicket[]> {
  const orders = await loadCol(ORDERS, seedOrders);
  const today = todayEt();
  return orders.filter(o => o.serviceDate === today && o.status !== "cancelled").map(o => ({
    id: uid(), orderId: o.id, orderRef: o.orderRef, customer: o.customer,
    serviceDate: o.serviceDate, timeWindow: o.timeWindow, stage: "kitchen" as KdsStage,
    items: o.items.map(i => ({ id: uid(), name: i.name, qty: i.qty, unit: i.unit, kitchenChecked: false, expoChecked: false })),
    firedAt: nowIso(), updatedAt: nowIso(),
  }));
}
export class DemoKds implements KdsRepository {
  constructor(private audit: AuditRepository) {}
  private async load(): Promise<KdsTicket[]> {
    const stored = await loadCol<KdsTicket>(KDS, () => []);
    if (stored.length && stored[0].serviceDate === todayEt()) return stored;
    const fresh = await kdsSeed(); await saveCol(KDS, fresh); return fresh;
  }
  async tickets(date: string) { return (await this.load()).filter(t => t.serviceDate === date); }
  private async mutate(ticketId: string, actor: string, fn: (t: KdsTicket) => void, action: string): Promise<KdsTicket> {
    const rows = await this.load();
    const t = rows.find(r => r.id === ticketId); if (!t) throw new Error("Ticket not found");
    fn(t); t.updatedAt = nowIso(); await saveCol(KDS, rows);
    await this.audit.log({ actor, action, entity: "kds_ticket", entityId: t.orderRef, before: null, after: { stage: t.stage } });
    return { ...t };
  }
  toggleItemCheck(ticketId: string, itemId: string, lane: "kitchen" | "expo", actor: string) {
    return this.mutate(ticketId, actor, t => {
      const it = t.items.find(i => i.id === itemId); if (!it) throw new Error("Item not found");
      if (lane === "kitchen") it.kitchenChecked = !it.kitchenChecked; else it.expoChecked = !it.expoChecked;
    }, "kds.check");
  }
  advance(ticketId: string, to: KdsStage, actor: string) {
    return this.mutate(ticketId, actor, t => { t.stage = to; }, "kds.advance");
  }
  async allDayTotals(date: string) {
    const rows = await this.tickets(date);
    const m = new Map<string, { name: string; unit: string; total: number; checked: number }>();
    for (const t of rows) for (const i of t.items) {
      const k = `${i.name}|${i.unit}`;
      const e = m.get(k) ?? { name: i.name, unit: i.unit, total: 0, checked: 0 };
      e.total += i.qty; if (i.kitchenChecked) e.checked += i.qty; m.set(k, e);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }
}

// ── Checklists ────────────────────────────────────────────────────────────
const CHECKLIST_TEMPLATES: Record<string, { name: string; sections: Array<[string, string[]]> }> = {
  "kitchen-morning": { name: "Kitchen Morning Checklist", sections: [
    ["Safety & Temps", ["Walk-in cooler ≤ 40°F", "Freezer ≤ 0°F", "Hot hold ≥ 135°F", "Sanitizer buckets mixed (200–400ppm)"]],
    ["Smokers", ["Fireboxes cleaned & ash removed", "Wood stocked (oak / hickory)", "Water pans filled", "Overnight cook temps logged"]],
    ["Prep", ["Prep list generated & posted", "Thaw pulls for tomorrow", "Sauces topped & dated", "FIFO check on walk-in"]],
    ["Station setup", ["Slicer sanitized", "Boards & knives staged", "Towels & gloves stocked", "Scales calibrated"]],
  ]},
  "foh-daily": { name: "FOH Daily Checklist", sections: [
    ["Opening", ["Registers counted & signed", "Menu boards updated (86s)", "Sampler case stocked", "Tea & lemonade brewed"]],
    ["Floor", ["Tables & rails wiped", "Restrooms checked (log)", "Trash & recycling out", "Patio set"]],
    ["Closing", ["Case emptied & wrapped", "Registers dropped", "Floors done", "Doors locked & alarm set"]],
  ]},
};
export class DemoChecklists implements ChecklistRepository {
  constructor(private audit: AuditRepository) {}
  private key(templateId: string) { return `checklist.${templateId}.${todayEt()}`; }
  async getTodayRun(templateId: string): Promise<ChecklistRun> {
    const tpl = CHECKLIST_TEMPLATES[templateId]; if (!tpl) throw new Error("Unknown checklist template");
    const runs = await loadCol<ChecklistRun>(this.key(templateId), () => [{
      id: uid(), templateId, templateName: tpl.name, runDate: todayEt(),
      items: tpl.sections.flatMap(([section, labels]) => labels.map(label => ({ id: uid(), label, section, done: false, doneBy: null, doneAt: null }))),
      signedOffBy: null, signedOffAt: null,
    }]);
    return runs[0];
  }
  async toggleItem(runId: string, itemId: string, actor: string): Promise<ChecklistRun> {
    for (const templateId of Object.keys(CHECKLIST_TEMPLATES)) {
      const runs = await loadCol<ChecklistRun>(this.key(templateId), () => []);
      const run = runs.find(r => r.id === runId);
      if (run) {
        const it = run.items.find(i => i.id === itemId); if (!it) throw new Error("Item not found");
        it.done = !it.done; it.doneBy = it.done ? actor : null; it.doneAt = it.done ? nowIso() : null;
        await saveCol(this.key(templateId), runs);
        await this.audit.log({ actor, action: "checklist.toggle", entity: "checklist_item", entityId: it.label, before: { done: !it.done }, after: { done: it.done } });
        return run;
      }
    }
    throw new Error("Run not found");
  }
  async managerSignOff(runId: string, actor: string): Promise<ChecklistRun> {
    for (const templateId of Object.keys(CHECKLIST_TEMPLATES)) {
      const runs = await loadCol<ChecklistRun>(this.key(templateId), () => []);
      const run = runs.find(r => r.id === runId);
      if (run) {
        run.signedOffBy = actor; run.signedOffAt = nowIso();
        await saveCol(this.key(templateId), runs);
        await this.audit.log({ actor, action: "checklist.signoff", entity: "checklist_run", entityId: run.templateName, before: null, after: { at: run.signedOffAt } });
        return run;
      }
    }
    throw new Error("Run not found");
  }
}

// ── Protein conversions ───────────────────────────────────────────────────
const PROTEINS: ProteinConversion[] = [
  { id: "pc1", protein: "Brisket (whole packer)", rawUnit: "lbs", cookedYieldLbsPerUnit: 0.5, portionsPerCookedLb: 3, notes: "≈50% yield after trim & cook" },
  { id: "pc2", protein: "Pork Butt", rawUnit: "lbs", cookedYieldLbsPerUnit: 0.55, portionsPerCookedLb: 3, notes: "Pulled" },
  { id: "pc3", protein: "St. Louis Ribs", rawUnit: "racks", cookedYieldLbsPerUnit: 1.6, portionsPerCookedLb: 1.5, notes: "≈2.5 lb rack → 1.6 lb cooked" },
  { id: "pc4", protein: "Smoked Sausage", rawUnit: "each", cookedYieldLbsPerUnit: 0.28, portionsPerCookedLb: 3.5, notes: "" },
  { id: "pc5", protein: "Chicken Quarters", rawUnit: "each", cookedYieldLbsPerUnit: 0.55, portionsPerCookedLb: 2, notes: "" },
  { id: "pc6", protein: "Turkey Breast", rawUnit: "lbs", cookedYieldLbsPerUnit: 0.65, portionsPerCookedLb: 3.5, notes: "" },
  { id: "pc7", protein: "Oxtail (Tampa Diamonds)", rawUnit: "lbs", cookedYieldLbsPerUnit: 0.45, portionsPerCookedLb: 2.5, notes: "Fire Drop special" },
];
const PROTEIN_COL = "proteinConversions.v1";
export class DemoProteins implements ProteinRepository {
  constructor(private audit: AuditRepository) {}
  async list() { return loadCol(PROTEIN_COL, () => PROTEINS.map(p => ({ ...p }))); }
  async upsert(pc: Omit<ProteinConversion, "id"> & { id?: string }, actor: string): Promise<ProteinConversion> {
    if (!pc.protein.trim()) throw new Error("Protein name required");
    if (!(pc.cookedYieldLbsPerUnit > 0)) throw new Error("Yield must be > 0");
    if (!(pc.portionsPerCookedLb > 0)) throw new Error("Portions per cooked lb must be > 0");
    const rows = await loadCol(PROTEIN_COL, () => PROTEINS.map(p => ({ ...p })));
    if (pc.id) {
      const ex = rows.find(r => r.id === pc.id);
      if (!ex) throw new Error("Conversion not found");
      const before = { ...ex };
      Object.assign(ex, pc);
      await saveCol(PROTEIN_COL, rows);
      await this.audit.log({ actor, action: "protein.update", entity: "protein_conversion", entityId: ex.protein, before, after: { ...ex } });
      return { ...ex };
    }
    const full: ProteinConversion = { ...pc, id: uid() };
    rows.push(full);
    await saveCol(PROTEIN_COL, rows);
    await this.audit.log({ actor, action: "protein.create", entity: "protein_conversion", entityId: full.protein, before: null, after: full });
    return full;
  }
  async remove(id: string, actor: string): Promise<void> {
    const rows = await loadCol(PROTEIN_COL, () => PROTEINS.map(p => ({ ...p })));
    const ex = rows.find(r => r.id === id);
    await saveCol(PROTEIN_COL, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "protein.remove", entity: "protein_conversion", entityId: ex?.protein ?? id, before: ex ?? null, after: null });
  }
}

// ── Prep recipes ──────────────────────────────────────────────────────────
const RECIPES = "prepRecipes.v1";
function seedRecipes(): PrepRecipe[] {
  return [
    { id: uid(), name: "House BBQ Sauce", category: "sauces", yieldQty: 8, yieldUnit: "quarts",
      ingredients: [
        { id: uid(), name: "Ketchup", qty: 4, unit: "quarts" }, { id: uid(), name: "Apple cider vinegar", qty: 1, unit: "quarts" },
        { id: uid(), name: "Brown sugar", qty: 3, unit: "cups" }, { id: uid(), name: "House rub", qty: 1, unit: "cups" },
      ],
      steps: ["Whisk all ingredients cold", "Simmer 25 min, low", "Blend smooth, cool, date & label"], updatedAt: nowIso() },
    { id: uid(), name: "Alabama White", category: "sauces", yieldQty: 3, yieldUnit: "quarts",
      ingredients: [
        { id: uid(), name: "Mayo", qty: 2, unit: "quarts" }, { id: uid(), name: "Apple cider vinegar", qty: 2, unit: "cups" },
        { id: uid(), name: "Horseradish", qty: 0.5, unit: "cups" }, { id: uid(), name: "Black pepper", qty: 0.25, unit: "cups" },
      ], steps: ["Whisk to combine", "Rest 1 hr before service"], updatedAt: nowIso() },
    { id: uid(), name: "Mac & Cheese", category: "sides", yieldQty: 5, yieldUnit: "pans",
      ingredients: [
        { id: uid(), name: "Elbow pasta", qty: 10, unit: "lbs" }, { id: uid(), name: "Cheese blend", qty: 12, unit: "lbs" },
        { id: uid(), name: "Heavy cream", qty: 2, unit: "gallons" },
      ], steps: ["Par-cook pasta", "Mornay with cheese blend", "Pan, top, bake 350°F 25 min"], updatedAt: nowIso() },
    { id: uid(), name: "Collard Greens", category: "sides", yieldQty: 3, yieldUnit: "pans",
      ingredients: [
        { id: uid(), name: "Collards (cleaned)", qty: 15, unit: "lbs" }, { id: uid(), name: "Smoked turkey stock", qty: 3, unit: "gallons" },
      ], steps: ["Braise low 3 hr with stock", "Season, hold ≥135°F"], updatedAt: nowIso() },
    { id: uid(), name: "Guava Glaze", category: "sauces", yieldQty: 4, yieldUnit: "pints",
      ingredients: [
        { id: uid(), name: "Guava paste", qty: 4, unit: "lbs" }, { id: uid(), name: "Cider vinegar", qty: 2, unit: "cups" },
      ], steps: ["Melt paste with vinegar", "Reduce to nappe"], updatedAt: nowIso() },
  ];
}
export class DemoPrepRecipes implements PrepRecipeRepository {
  constructor(private audit: AuditRepository) {}
  async list() { return loadCol(RECIPES, seedRecipes); }
  async upsert(recipe: Omit<PrepRecipe, "updatedAt">, actor: string): Promise<PrepRecipe> {
    const rows = await loadCol(RECIPES, seedRecipes);
    const idx = rows.findIndex(r => r.id === recipe.id);
    const full: PrepRecipe = { ...recipe, updatedAt: nowIso() };
    if (idx >= 0) rows[idx] = full; else rows.push(full);
    await saveCol(RECIPES, rows);
    await this.audit.log({ actor, action: idx >= 0 ? "recipe.update" : "recipe.create", entity: "prep_recipe", entityId: recipe.name, before: null, after: full });
    return full;
  }
  async remove(id: string, actor: string): Promise<void> {
    const rows = await loadCol(RECIPES, seedRecipes);
    const r = rows.find(x => x.id === id);
    await saveCol(RECIPES, rows.filter(x => x.id !== id));
    await this.audit.log({ actor, action: "recipe.delete", entity: "prep_recipe", entityId: r?.name ?? id, before: r ?? null, after: null });
  }
}

// ── Calendar ──────────────────────────────────────────────────────────────
export class DemoCalendar implements CalendarRepository {
  async eventsForMonth(yearMonth: string): Promise<CalendarEvent[]> {
    const orders = await loadCol(ORDERS, seedOrders);
    const evts: CalendarEvent[] = orders.filter(o => o.serviceDate.startsWith(yearMonth)).map(o => ({
      id: `evt-${o.id}`, date: o.serviceDate,
      title: `${o.customer} · ${o.items.length} items`,
      kind: o.channel === "catering" ? "catering" : o.channel === "fire_drop" ? "fire_drop" : o.channel === "cuban_thursday" ? "cuban_thursday" : "retail",
      orderId: o.id,
    }));
    // weekly rhythm markers
    const [y, m] = yearMonth.split("-").map(Number);
    const days = new Date(y, m, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const iso = `${yearMonth}-${String(d).padStart(2, "0")}`;
      const dow = weekdayOf(iso);
      if (dow === 4) evts.push({ id: `cu-${iso}`, date: iso, title: "Cuban Thursday (Cubans & Smash Burgers)", kind: "cuban_thursday", orderId: null });
      if (dow === 5) evts.push({ id: `fd-${iso}`, date: iso, title: "Fire Drop · Friday pickup", kind: "fire_drop", orderId: null });
      if (dow === 6) evts.push({ id: `fs-${iso}`, date: iso, title: "Fire Drop · Saturday pickup", kind: "fire_drop", orderId: null });
    }
    return evts.sort((a, b) => a.date.localeCompare(b.date));
  }
}

// ── Smoker forecast ───────────────────────────────────────────────────────
const SMOKER = "smokerForecast.v1";
const SMOKERS = ["Ol' Smokey (offset)", "Rotisserie 1", "Cabinet 2"];
function seedSmoker(): SmokerEntry[] {
  const monday = mondayOfWeek(todayEt());
  const plan: Array<[number, string, number, string, string]> = [
    [3, "Pork Butt", 120, "21:00", "07:00"],   // Thu load for Fri
    [3, "Brisket (whole packer)", 90, "22:00", "10:00"],
    [4, "St. Louis Ribs", 60, "06:00", "12:00"],
    [4, "Chicken Quarters", 45, "08:00", "11:30"],
    [4, "Oxtail (Tampa Diamonds)", 20, "05:00", "11:00"],
    [5, "Pork Butt", 100, "21:00", "07:00"],
    [5, "St. Louis Ribs", 50, "06:00", "12:00"],
  ];
  return plan.map(([dayIdx, protein, lbs, load, done], i) => ({
    id: uid(), date: addDays(monday, dayIdx), protein, rawLbs: lbs,
    smoker: SMOKERS[i % SMOKERS.length], loadTime: load, targetDone: done, locked: false,
  }));
}
export class DemoSmokerForecast implements SmokerForecastRepository {
  constructor(private audit: AuditRepository) {}
  async week(startDate: string) {
    const rows = await loadCol(SMOKER, seedSmoker);
    const end = addDays(startDate, 7);
    return rows.filter(r => r.date >= startDate && r.date < end).sort((a, b) => a.date.localeCompare(b.date) || a.loadTime.localeCompare(b.loadTime));
  }
  async upsert(entry: Omit<SmokerEntry, "id"> & { id?: string }, actor: string): Promise<SmokerEntry> {
    const rows = await loadCol(SMOKER, seedSmoker);
    if (entry.id) {
      const e = rows.find(r => r.id === entry.id); if (!e) throw new Error("Entry not found");
      if (e.locked) throw new Error("Day is locked");
      Object.assign(e, entry); await saveCol(SMOKER, rows);
      await this.audit.log({ actor, action: "smoker.update", entity: "smoker_entry", entityId: e.id, before: null, after: e });
      return { ...e };
    }
    const e: SmokerEntry = { ...entry, id: uid(), locked: false };
    rows.push(e); await saveCol(SMOKER, rows);
    await this.audit.log({ actor, action: "smoker.add", entity: "smoker_entry", entityId: e.id, before: null, after: e });
    return e;
  }
  async remove(id: string, actor: string) {
    const rows = await loadCol(SMOKER, seedSmoker);
    const e = rows.find(r => r.id === id);
    if (e?.locked) throw new Error("Day is locked");
    await saveCol(SMOKER, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "smoker.remove", entity: "smoker_entry", entityId: id, before: e ?? null, after: null });
  }
  async autoFillFromDemand(startDate: string, actor: string): Promise<SmokerEntry[]> {
    // Aggregate confirmed order demand for the week and add missing capacity.
    const orders = await loadCol(ORDERS, seedOrders);
    const end = addDays(startDate, 7);
    const demand = new Map<string, number>();
    const conv: Record<string, [string, number]> = {
      "Pulled Pork": ["Pork Butt", 1 / 0.55], "Brisket (sliced)": ["Brisket (whole packer)", 1 / 0.5],
      "St. Louis Ribs": ["St. Louis Ribs", 2.5], "Chicken Quarters": ["Chicken Quarters", 1],
    };
    for (const o of orders) if (o.serviceDate >= startDate && o.serviceDate < end && o.status !== "cancelled")
      for (const i of o.items) {
        const c = conv[i.name]; if (!c) continue;
        demand.set(c[0], (demand.get(c[0]) ?? 0) + Math.ceil(i.qty * c[1]));
      }
    const rows = await loadCol(SMOKER, seedSmoker);
    const have = new Map<string, number>();
    for (const r of rows) if (r.date >= startDate && r.date < end) have.set(r.protein, (have.get(r.protein) ?? 0) + r.rawLbs);
    let added = 0;
    for (const [protein, lbs] of demand) {
      const gap = lbs - (have.get(protein) ?? 0);
      if (gap > 5) {
        rows.push({ id: uid(), date: addDays(startDate, 4), protein, rawLbs: Math.ceil(gap), smoker: SMOKERS[added++ % SMOKERS.length], loadTime: "05:00", targetDone: "11:00", locked: false });
      }
    }
    await saveCol(SMOKER, rows);
    await this.audit.log({ actor, action: "smoker.autofill", entity: "smoker_week", entityId: startDate, before: null, after: { added } });
    return this.week(startDate);
  }
  async lockDay(date: string, actor: string) {
    const rows = await loadCol(SMOKER, seedSmoker);
    for (const r of rows) if (r.date === date) r.locked = true;
    await saveCol(SMOKER, rows);
    await this.audit.log({ actor, action: "smoker.lock", entity: "smoker_day", entityId: date, before: null, after: { locked: true } });
  }
}

// ── Smoked inventory ──────────────────────────────────────────────────────
const BATCHES = "smokeBatches.v1";
function seedBatches(): SmokeBatch[] {
  const t = todayEt();
  return [
    { id: uid(), date: addDays(t, -1), protein: "Pork Butt", rawLbs: 120, cookedLbs: 66, smoker: SMOKERS[0], loggedBy: "demo:kitchen", loggedAt: nowIso() },
    { id: uid(), date: addDays(t, -1), protein: "Brisket (whole packer)", rawLbs: 90, cookedLbs: 45, smoker: SMOKERS[1], loggedBy: "demo:kitchen", loggedAt: nowIso() },
    { id: uid(), date: t, protein: "St. Louis Ribs", rawLbs: 60, cookedLbs: 38, smoker: SMOKERS[2], loggedBy: "demo:kitchen", loggedAt: nowIso() },
  ];
}
export class DemoSmokedInventory implements SmokedInventoryRepository {
  constructor(private audit: AuditRepository) {}
  async batches() { return (await loadCol(BATCHES, seedBatches)).sort((a, b) => b.date.localeCompare(a.date)); }
  async summary() {
    const rows = await loadCol(BATCHES, seedBatches);
    const m = new Map<string, { protein: string; cookedLbsOnHand: number; batches: number; lastBatchAt: string | null }>();
    for (const b of rows) {
      const e = m.get(b.protein) ?? { protein: b.protein, cookedLbsOnHand: 0, batches: 0, lastBatchAt: null };
      e.cookedLbsOnHand += b.cookedLbs; e.batches++;
      if (!e.lastBatchAt || b.loggedAt > e.lastBatchAt) e.lastBatchAt = b.loggedAt;
      m.set(b.protein, e);
    }
    return [...m.values()].sort((a, b) => b.cookedLbsOnHand - a.cookedLbsOnHand);
  }
  async logBatch(b: Omit<SmokeBatch, "id" | "loggedAt">): Promise<SmokeBatch> {
    if (!(b.rawLbs > 0) || !(b.cookedLbs > 0)) throw new Error("Weights must be positive");
    if (b.cookedLbs > b.rawLbs) throw new Error("Cooked weight cannot exceed raw weight");
    const rows = await loadCol(BATCHES, seedBatches);
    const full: SmokeBatch = { ...b, id: uid(), loggedAt: nowIso() };
    rows.push(full); await saveCol(BATCHES, rows);
    await this.audit.log({ actor: b.loggedBy, action: "smoke.batch", entity: "smoke_batch", entityId: full.id, before: null, after: full });
    return full;
  }
}

// ── Pitmaster guide ───────────────────────────────────────────────────────
const GUIDES = "pitGuides.v1";
function step(order: number, title: string, detail: string, tempF: number | null = null, durationMin: number | null = null): GuideStep {
  return { id: uid(), order, title, detail, tempF, durationMin };
}
function seedGuides(): PitmasterProtein[] {
  return [
    { id: uid(), slug: "brisket", name: "Brisket", targetInternalF: 203, smokerTempF: 250, estHoursPerLb: 1.1, restMin: 60, woods: "Post oak",
      steps: [
        step(1, "Trim", "Trim fat cap to 1/4\", square edges, remove deckle fat."),
        step(2, "Season", "Salt & coarse pepper 50/50, light rub layer."),
        step(3, "Smoke", "Fat side up, 250°F until bark sets.", 250, 360),
        step(4, "Wrap", "Butcher paper at ~170°F internal.", 170),
        step(5, "Finish", "Pull at probe-tender ~203°F.", 203),
        step(6, "Rest", "Rest wrapped ≥1 hr before slicing.", null, 60),
      ]},
    { id: uid(), slug: "pork-butt", name: "Pork Butt", targetInternalF: 200, smokerTempF: 275, estHoursPerLb: 0.9, restMin: 45, woods: "Oak + hickory",
      steps: [
        step(1, "Season", "Mustard binder, house rub heavy."),
        step(2, "Smoke", "275°F to 165°F internal.", 275),
        step(3, "Wrap", "Foil boat with tallow.", 165),
        step(4, "Finish", "Pull at 200°F, bone wiggles clean.", 200),
        step(5, "Rest & pull", "Rest 45 min, pull, season with drippings.", null, 45),
      ]},
    { id: uid(), slug: "ribs", name: "St. Louis Ribs", targetInternalF: 198, smokerTempF: 265, estHoursPerLb: 0, restMin: 15, woods: "Cherry + oak",
      steps: [
        step(1, "Prep", "Remove membrane, trim flap."),
        step(2, "Smoke", "265°F, spritz hourly after hour 1.", 265, 180),
        step(3, "Glaze", "Guava glaze last 20 min.", null, 20),
        step(4, "Check", "Bend test — bark cracks, ~198°F.", 198),
      ]},
    { id: uid(), slug: "oxtail", name: "Oxtail (Tampa Diamonds)", targetInternalF: 205, smokerTempF: 250, estHoursPerLb: 1.4, restMin: 30, woods: "Oak",
      steps: [
        step(1, "Season", "Mojo marinade overnight, house rub."),
        step(2, "Smoke", "250°F, 3 hr uncovered.", 250, 180),
        step(3, "Braise", "Covered pan with stock + guava glaze until 205°F.", 205),
        step(4, "Glaze & rest", "Glaze heavy, rest 30 min.", null, 30),
      ]},
  ];
}
export class DemoPitmaster implements PitmasterRepository {
  constructor(private audit: AuditRepository) {}
  async proteins() { return loadCol(GUIDES, seedGuides); }
  async upsertStep(proteinId: string, s: Omit<GuideStep, "id"> & { id?: string }, actor: string): Promise<PitmasterProtein> {
    const rows = await loadCol(GUIDES, seedGuides);
    const p = rows.find(r => r.id === proteinId); if (!p) throw new Error("Protein not found");
    if (s.id) {
      const ex = p.steps.find(x => x.id === s.id); if (!ex) throw new Error("Step not found");
      Object.assign(ex, s);
    } else {
      p.steps.push({ ...s, id: uid() });
    }
    p.steps.sort((a, b) => a.order - b.order);
    await saveCol(GUIDES, rows);
    await this.audit.log({ actor, action: "guide.step", entity: "pit_guide", entityId: p.slug, before: null, after: s });
    return { ...p };
  }
  async removeStep(proteinId: string, stepId: string, actor: string): Promise<PitmasterProtein> {
    const rows = await loadCol(GUIDES, seedGuides);
    const p = rows.find(r => r.id === proteinId); if (!p) throw new Error("Protein not found");
    p.steps = p.steps.filter(s => s.id !== stepId);
    await saveCol(GUIDES, rows);
    await this.audit.log({ actor, action: "guide.step.remove", entity: "pit_guide", entityId: p.slug, before: { stepId }, after: null });
    return { ...p };
  }
}

// ── Meat costs ────────────────────────────────────────────────────────────
const COSTS = "meatCosts.v1";
function seedCosts(): MeatCost[] {
  return [
    { id: uid(), protein: "Brisket (whole packer)", vendor: "Cheney Brothers", costPerLbCents: 429, caseLbs: 60, yieldPct: 50, updatedAt: nowIso() },
    { id: uid(), protein: "Pork Butt", vendor: "Cheney Brothers", costPerLbCents: 189, caseLbs: 72, yieldPct: 55, updatedAt: nowIso() },
    { id: uid(), protein: "St. Louis Ribs", vendor: "Sysco", costPerLbCents: 312, caseLbs: 30, yieldPct: 64, updatedAt: nowIso() },
    { id: uid(), protein: "Chicken Quarters", vendor: "Sysco", costPerLbCents: 98, caseLbs: 40, yieldPct: 55, updatedAt: nowIso() },
    { id: uid(), protein: "Smoked Sausage", vendor: "Local (Ybor)", costPerLbCents: 345, caseLbs: 25, yieldPct: 92, updatedAt: nowIso() },
    { id: uid(), protein: "Oxtail", vendor: "Local (Ybor)", costPerLbCents: 799, caseLbs: 15, yieldPct: 45, updatedAt: nowIso() },
  ];
}
export class DemoMeatCosts implements MeatCostsRepository {
  constructor(private audit: AuditRepository) {}
  async list() { return loadCol(COSTS, seedCosts); }
  async upsert(mc: Omit<MeatCost, "updatedAt">, actor: string): Promise<MeatCost> {
    if (mc.costPerLbCents < 0 || !Number.isInteger(mc.costPerLbCents)) throw new Error("Cost must be non-negative integer cents");
    const rows = await loadCol(COSTS, seedCosts);
    const idx = rows.findIndex(r => r.id === mc.id);
    const full: MeatCost = { ...mc, updatedAt: nowIso() };
    if (idx >= 0) rows[idx] = full; else rows.push(full);
    await saveCol(COSTS, rows);
    await this.audit.log({ actor, action: "meatcost.upsert", entity: "meat_cost", entityId: mc.protein, before: null, after: full });
    return full;
  }
  async remove(id: string, actor: string) {
    const rows = await loadCol(COSTS, seedCosts);
    await saveCol(COSTS, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "meatcost.remove", entity: "meat_cost", entityId: id, before: null, after: null });
  }
}

// ── Pit checklist ─────────────────────────────────────────────────────────
export class DemoPitChecklist implements PitChecklistRepository {
  constructor(private audit: AuditRepository, private forecast: DemoSmokerForecast) {}
  private key() { return `pitChecklist.${todayEt()}`; }
  async today() {
    const runs = await loadCol<{ id: string; date: string; tasks: PitTask[] }>(this.key(), () => [{
      id: uid(), date: todayEt(),
      tasks: [
        { id: uid(), label: "Light smokers & stabilize temps", protein: null, targetLbs: null, done: false, doneAt: null },
        { id: uid(), label: "Log overnight cook temps", protein: null, targetLbs: null, done: false, doneAt: null },
      ],
    }]);
    return runs[0];
  }
  async toggle(taskId: string, actor: string) {
    const runs = await loadCol<{ id: string; date: string; tasks: PitTask[] }>(this.key(), () => []);
    const t = runs[0]?.tasks.find(x => x.id === taskId); if (!t) throw new Error("Task not found");
    t.done = !t.done; t.doneAt = t.done ? nowIso() : null;
    await saveCol(this.key(), runs);
    await this.audit.log({ actor, action: "pit.task", entity: "pit_task", entityId: t.label, before: { done: !t.done }, after: { done: t.done } });
  }
  async syncFromForecast(actor: string) {
    const runs = await loadCol<{ id: string; date: string; tasks: PitTask[] }>(this.key(), () => []);
    const run = runs[0] ?? (await this.today());
    const entries = await this.forecast.week(mondayOfWeek(todayEt()));
    const todays = entries.filter(e => e.date === todayEt());
    for (const e of todays) {
      const label = `Load ${e.protein} — ${e.rawLbs} lbs on ${e.smoker} @ ${e.loadTime}`;
      if (!run.tasks.some(t => t.label === label)) {
        run.tasks.push({ id: uid(), label, protein: e.protein, targetLbs: e.rawLbs, done: false, doneAt: null });
      }
    }
    await saveCol(this.key(), [run]);
    await this.audit.log({ actor, action: "pit.sync", entity: "pit_checklist", entityId: run.date, before: null, after: { tasks: run.tasks.length } });
  }
  async addTask(label: string, actor: string) {
    if (!label.trim()) throw new Error("Label required");
    const runs = await loadCol<{ id: string; date: string; tasks: PitTask[] }>(this.key(), () => []);
    const run = runs[0] ?? (await this.today());
    run.tasks.push({ id: uid(), label: label.trim(), protein: null, targetLbs: null, done: false, doneAt: null });
    await saveCol(this.key(), [run]);
    await this.audit.log({ actor, action: "pit.task.add", entity: "pit_checklist", entityId: label, before: null, after: null });
  }
}
