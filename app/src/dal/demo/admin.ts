/**
 * Demo admin repositories: menu, users, discounts, special events, order
 * guide, prep templates, samplers, settings and imports. Menu truths are
 * enforced here: Cuban Sandwich & Brisket Smash Burger are Thursday-only,
 * and the Walk-In Sampler may only contain the five approved proteins.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { MENU_CATEGORIES as CATALOG_CATEGORIES, MENU_ITEMS as CATALOG_ITEMS } from "./menuData";
import type {
  AppUser, AuditRepository, DiscountCode, DiscountsRepository, EventsRepository, ImportJob,
  ImportsRepository, MenuCategory, MenuItem, MenuRepository, OrderGuideRepository, OrderGuideRow,
  PrepCategory, PrepTemplateRow, PrepTemplatesRepository, SamplerConfig, SamplersRepository,
  SettingsRepository, SpecialEvent, UsersRepository,
} from "../types";

// ── Menu ──────────────────────────────────────────────────────────────────
const MENU_CATS = "menuCategories.v1";
const MENU_ITEMS = "menuItems.v1";
const THURSDAY_ONLY_CATEGORY = "Thursday Only";

function catId(sourceId: string): string {
  return "mc-" + sourceId.replace(/_/g, "-");
}
// Categories/items come verbatim from the Manus DB snapshot (see menuData.ts).
function seedMenuCategories(): MenuCategory[] {
  return CATALOG_CATEGORIES.map(c => ({ id: catId(c.id), name: c.name, sortOrder: c.sortOrder, active: c.active }));
}
/**
 * Demo pricing estimates for items whose price is absent from the Manus DB
 * snapshot. Category-typical numbers so the demo reads real; every one is
 * flagged "Estimated" in the item description and listed in
 * docs/PRICES_TO_CONFIRM.md for owner confirmation before go-live.
 */
function estimateCents(categoryId: string, name: string): number {
  const n = name.toLowerCase();
  if (/dozen/.test(n)) return 2400;
  if (/6 ?oz|6oz/.test(n)) return 400;
  if (/half pan/.test(n)) return 4500;
  if (/full pan/.test(n)) return 8500;
  if (/per lb|\blb\b/.test(n)) return 1899;
  if (/rack/.test(n)) return 2999;
  switch (categoryId) {
    case "appetizer": return 995;
    case "fs_side": return 4500;      // catering pan default
    case "retail_side": return 4500;
    case "fs_dessert": return 4800;
    case "retail_dessert": return 1400;
    case "fs_meat": return 1899;
    case "retail_meat": return 1899;
    case "salad_misc": return 1200;
    default: return 1000;
  }
}

function seedMenuItems(): MenuItem[] {
  const catSort = new Map(CATALOG_CATEGORIES.map(c => [c.id, c.sortOrder]));
  return CATALOG_ITEMS.map(r => {
    const needsPrice = r.priceCents == null;
    return {
      id: uid(),
      categoryId: catId(r.categoryId),
      name: r.name,
      // Estimated-price convention: absent snapshot prices seed with a
      // category-typical estimate, clearly flagged for owner confirmation.
      description: needsPrice ? "⚠ Estimated price — owner to confirm" : (r.unit ? `Sold by ${r.unit}.` : ""),
      priceCents: r.priceCents ?? estimateCents(r.categoryId, r.name),
      active: r.active,
      // Menu truth: Cubans & Smash Burgers are Thursday-only, no exceptions.
      thursdayOnly: r.thursdayOnly || /cuban|smash burger/i.test(r.name),
      sortOrder: (catSort.get(r.categoryId) ?? 0) * 1000 + r.sortOrder,
      updatedAt: nowIso(),
    };
  });
}

export class DemoMenu implements MenuRepository {
  constructor(private audit: AuditRepository) {}

  async categories(): Promise<MenuCategory[]> {
    return (await loadCol(MENU_CATS, seedMenuCategories)).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async items(): Promise<MenuItem[]> {
    return (await loadCol(MENU_ITEMS, seedMenuItems)).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async upsertItem(i: Omit<MenuItem, "updatedAt"> & { id?: string }, actor: string): Promise<MenuItem> {
    if (!i.name.trim()) throw new Error("Name is required");
    if (!Number.isInteger(i.priceCents) || i.priceCents < 0) throw new Error("priceCents must be a non-negative integer");
    const cats = await loadCol(MENU_CATS, seedMenuCategories);
    const cat = cats.find(c => c.id === i.categoryId);
    if (!cat) throw new Error("Unknown category");
    // Menu truth: everything in "Thursday Only" is Thursday-only, no exceptions.
    const thursdayOnly = cat.name === THURSDAY_ONLY_CATEGORY ? true : i.thursdayOnly;
    const rows = await loadCol(MENU_ITEMS, seedMenuItems);
    const existing = i.id ? rows.find(r => r.id === i.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, i, { name: i.name.trim(), thursdayOnly, updatedAt: nowIso() });
      await saveCol(MENU_ITEMS, rows);
      await this.audit.log({ actor, action: "menu.item.update", entity: "menu_item", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: MenuItem = { ...i, id: uid(), name: i.name.trim(), thursdayOnly, updatedAt: nowIso() };
    rows.push(full);
    await saveCol(MENU_ITEMS, rows);
    await this.audit.log({ actor, action: "menu.item.create", entity: "menu_item", entityId: full.name, before: null, after: full });
    return full;
  }

  async toggleItemActive(id: string, actor: string): Promise<MenuItem> {
    const rows = await loadCol(MENU_ITEMS, seedMenuItems);
    const it = rows.find(r => r.id === id);
    if (!it) throw new Error("Menu item not found");
    const before = { ...it };
    it.active = !it.active;
    it.updatedAt = nowIso();
    await saveCol(MENU_ITEMS, rows);
    await this.audit.log({ actor, action: "menu.item.toggle", entity: "menu_item", entityId: it.name, before, after: { ...it } });
    return { ...it };
  }

  async upsertCategory(c: MenuCategory & { id?: string }, actor: string): Promise<MenuCategory> {
    if (!c.name.trim()) throw new Error("Name is required");
    const rows = await loadCol(MENU_CATS, seedMenuCategories);
    const existing = c.id ? rows.find(r => r.id === c.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, c, { name: c.name.trim() });
      await saveCol(MENU_CATS, rows);
      await this.audit.log({ actor, action: "menu.category.update", entity: "menu_category", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: MenuCategory = { ...c, id: c.id || uid(), name: c.name.trim() };
    rows.push(full);
    await saveCol(MENU_CATS, rows);
    await this.audit.log({ actor, action: "menu.category.create", entity: "menu_category", entityId: full.name, before: null, after: full });
    return full;
  }
}

// ── Users ─────────────────────────────────────────────────────────────────
const USERS = "users.v1";
function seedUsers(): AppUser[] {
  const mk = (name: string, email: string, role: AppUser["role"]): AppUser =>
    ({ id: uid(), name, email, role, active: true, invitedAt: nowIso() });
  return [
    mk("Charles Dempsey", "admin@stationhousebbq.com", "owner_admin"),
    mk("Denise Carter", "denise@stationhousebbq.com", "catering_director"),
    mk("Marcus Hill", "marcus@stationhousebbq.com", "kitchen"),
    mk("Luis Ramirez", "luis@stationhousebbq.com", "kitchen"),
    mk("Jenna Ortiz", "jenna@stationhousebbq.com", "counter_foh"),
    mk("Tanya Reed", "tanya@stationhousebbq.com", "packing"),
  ];
}

export class DemoUsers implements UsersRepository {
  constructor(private audit: AuditRepository) {}

  async list(): Promise<AppUser[]> {
    return (await loadCol(USERS, seedUsers)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsert(u: Omit<AppUser, "invitedAt"> & { id?: string }, actor: string): Promise<AppUser> {
    if (!u.name.trim()) throw new Error("Name is required");
    const email = u.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
    const rows = await loadCol(USERS, seedUsers);
    const existing = u.id ? rows.find(r => r.id === u.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, u, { name: u.name.trim(), email });
      await saveCol(USERS, rows);
      await this.audit.log({ actor, action: "user.update", entity: "app_user", entityId: email, before, after: { ...existing } });
      return { ...existing };
    }
    const full: AppUser = { ...u, id: u.id || uid(), name: u.name.trim(), email, invitedAt: nowIso() };
    rows.push(full);
    await saveCol(USERS, rows);
    await this.audit.log({ actor, action: "user.invite", entity: "app_user", entityId: email, before: null, after: full });
    return full;
  }

  async toggleActive(id: string, actor: string): Promise<AppUser> {
    const rows = await loadCol(USERS, seedUsers);
    const u = rows.find(r => r.id === id);
    if (!u) throw new Error("User not found");
    if (u.active && u.role === "owner_admin") {
      const activeOwners = rows.filter(r => r.role === "owner_admin" && r.active).length;
      if (activeOwners <= 1) throw new Error("Cannot deactivate the last active owner admin");
    }
    const before = { ...u };
    u.active = !u.active;
    await saveCol(USERS, rows);
    await this.audit.log({ actor, action: "user.toggle", entity: "app_user", entityId: u.email, before, after: { ...u } });
    return { ...u };
  }
}

// ── Discounts ─────────────────────────────────────────────────────────────
const DISCOUNTS = "discounts.v1";
function seedDiscounts(): DiscountCode[] {
  // Real-looking codes only — no test/free codes in seeds, ever.
  return [
    { id: uid(), code: "WELCOME10", kind: "percent", value: 10, active: true, usedCount: 38, expiresAt: null },
    { id: uid(), code: "PICKUP5", kind: "fixed_cents", value: 500, active: true, usedCount: 112, expiresAt: null },
  ];
}

export class DemoDiscounts implements DiscountsRepository {
  constructor(private audit: AuditRepository) {}

  async list(): Promise<DiscountCode[]> {
    return (await loadCol(DISCOUNTS, seedDiscounts)).sort((a, b) => a.code.localeCompare(b.code));
  }

  async upsert(d: Omit<DiscountCode, "usedCount"> & { id?: string }, actor: string): Promise<DiscountCode> {
    const code = d.code.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(code)) throw new Error("Code must be uppercase letters and numbers only");
    if (d.kind === "percent") {
      if (!Number.isFinite(d.value) || d.value < 1 || d.value > 100) throw new Error("Percent must be between 1 and 100");
    } else {
      if (!Number.isInteger(d.value) || d.value <= 0) throw new Error("Fixed discount must be a positive integer in cents");
    }
    const rows = await loadCol(DISCOUNTS, seedDiscounts);
    const existing = d.id ? rows.find(r => r.id === d.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, d, { code });
      await saveCol(DISCOUNTS, rows);
      await this.audit.log({ actor, action: "discount.update", entity: "discount_code", entityId: code, before, after: { ...existing } });
      return { ...existing };
    }
    const full: DiscountCode = { ...d, id: d.id || uid(), code, usedCount: 0 };
    rows.push(full);
    await saveCol(DISCOUNTS, rows);
    await this.audit.log({ actor, action: "discount.create", entity: "discount_code", entityId: code, before: null, after: full });
    return full;
  }

  async remove(id: string, actor: string): Promise<void> {
    const rows = await loadCol(DISCOUNTS, seedDiscounts);
    const d = rows.find(r => r.id === id);
    await saveCol(DISCOUNTS, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "discount.delete", entity: "discount_code", entityId: d?.code ?? id, before: d ?? null, after: null });
  }
}

// ── Special events ────────────────────────────────────────────────────────
const EVENTS = "specialEvents.v1";
function seedEvents(): SpecialEvent[] {
  const mk = (slug: string, name: string, landingEnabled: boolean, orderingEnabled: boolean, eventDate: string | null, notes: string | null): SpecialEvent =>
    ({ id: uid(), slug, name, landingEnabled, orderingEnabled, eventDate, menuItemIds: [], notes, updatedAt: nowIso() });
  return [
    mk("fathers-day", "Father's Day Feast", false, false, "2026-06-21", "Past event — archive copy for next year"),
    mk("cuban-thursday", "Cuban Thursday", true, true, null, "Weekly — every Thursday. Cubans & Brisket Smash Burgers only."),
    mk("july4", "July 4th Cookout Packs", false, false, "2026-07-04", "Past event — sold out both pack tiers"),
    mk("football-sunday", "Football Sunday", true, false, null, "Landing live for fall; ordering opens with season"),
  ];
}

export class DemoEvents implements EventsRepository {
  constructor(private audit: AuditRepository) {}

  async list(): Promise<SpecialEvent[]> {
    return (await loadCol(EVENTS, seedEvents)).sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsert(e: Omit<SpecialEvent, "updatedAt"> & { id?: string }, actor: string): Promise<SpecialEvent> {
    if (!e.name.trim()) throw new Error("Name is required");
    if (!e.slug.trim()) throw new Error("Slug is required");
    const rows = await loadCol(EVENTS, seedEvents);
    const existing = e.id ? rows.find(r => r.id === e.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, e, { name: e.name.trim(), updatedAt: nowIso() });
      await saveCol(EVENTS, rows);
      await this.audit.log({ actor, action: "event.update", entity: "special_event", entityId: existing.slug, before, after: { ...existing } });
      return { ...existing };
    }
    const full: SpecialEvent = { ...e, id: uid(), name: e.name.trim(), updatedAt: nowIso() };
    rows.push(full);
    await saveCol(EVENTS, rows);
    await this.audit.log({ actor, action: "event.create", entity: "special_event", entityId: full.slug, before: null, after: full });
    return full;
  }
}

// ── Order guide ───────────────────────────────────────────────────────────
const ORDER_GUIDE = "orderGuide.v1";
function seedOrderGuide(): OrderGuideRow[] {
  const mk = (item: string, vendor: string, unit: string, parQty: number, onHand: number): OrderGuideRow =>
    ({ id: uid(), item, vendor, unit, parQty, onHand, orderQty: Math.max(0, parQty - onHand) });
  return [
    mk("Brisket (whole packer)", "Cheney Brothers", "cases", 4, 2),
    mk("Pork Butt", "Cheney Brothers", "cases", 3, 1),
    mk("St. Louis Ribs", "Sysco", "cases", 5, 3),
    mk("Chicken Quarters", "Sysco", "cases", 3, 2),
    mk("Smoked Sausage", "Cheney Brothers", "cases", 2, 2),
    mk("Elbow pasta", "Sysco", "cases", 2, 1),
    mk("Cheese blend", "Sysco", "cases", 3, 1),
    mk("Ketchup (catering)", "Cheney Brothers", "cases", 2, 2),
    mk("Brown sugar", "Sysco", "bags", 6, 2),
    mk("Apple cider vinegar", "Cheney Brothers", "cases", 2, 1),
  ];
}

export class DemoOrderGuide implements OrderGuideRepository {
  constructor(private audit: AuditRepository) {}

  async rows(): Promise<OrderGuideRow[]> {
    return (await loadCol(ORDER_GUIDE, seedOrderGuide)).sort((a, b) => a.vendor.localeCompare(b.vendor) || a.item.localeCompare(b.item));
  }

  async upsert(r: Omit<OrderGuideRow, "id"> & { id?: string }, actor: string): Promise<OrderGuideRow> {
    if (!r.item.trim()) throw new Error("Item is required");
    if (!Number.isFinite(r.parQty) || r.parQty < 0) throw new Error("parQty must be a non-negative number");
    if (!Number.isFinite(r.onHand) || r.onHand < 0) throw new Error("onHand must be a non-negative number");
    const rows = await loadCol(ORDER_GUIDE, seedOrderGuide);
    const orderQty = Math.max(0, r.parQty - r.onHand);
    const existing = r.id ? rows.find(x => x.id === r.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, r, { item: r.item.trim(), orderQty });
      await saveCol(ORDER_GUIDE, rows);
      await this.audit.log({ actor, action: "orderguide.update", entity: "order_guide_row", entityId: existing.item, before, after: { ...existing } });
      return { ...existing };
    }
    const full: OrderGuideRow = { ...r, id: uid(), item: r.item.trim(), orderQty };
    rows.push(full);
    await saveCol(ORDER_GUIDE, rows);
    await this.audit.log({ actor, action: "orderguide.create", entity: "order_guide_row", entityId: full.item, before: null, after: full });
    return full;
  }

  async setOnHand(id: string, onHand: number, actor: string): Promise<OrderGuideRow> {
    if (!Number.isFinite(onHand) || onHand < 0) throw new Error("onHand must be a non-negative number");
    const rows = await loadCol(ORDER_GUIDE, seedOrderGuide);
    const r = rows.find(x => x.id === id);
    if (!r) throw new Error("Row not found");
    const before = { ...r };
    r.onHand = onHand;
    r.orderQty = Math.max(0, r.parQty - onHand);
    await saveCol(ORDER_GUIDE, rows);
    await this.audit.log({ actor, action: "orderguide.onhand", entity: "order_guide_row", entityId: r.item, before, after: { ...r } });
    return { ...r };
  }

  async remove(id: string, actor: string): Promise<void> {
    const rows = await loadCol(ORDER_GUIDE, seedOrderGuide);
    const r = rows.find(x => x.id === id);
    await saveCol(ORDER_GUIDE, rows.filter(x => x.id !== id));
    await this.audit.log({ actor, action: "orderguide.delete", entity: "order_guide_row", entityId: r?.item ?? id, before: r ?? null, after: null });
  }
}

// ── Prep templates ────────────────────────────────────────────────────────
const PREP_TEMPLATES = "prepTemplates.v1";
function seedPrepTemplates(): PrepTemplateRow[] {
  // Mirrors seedPrepSession in seed.ts: 14 base rows + 3 Thursday-only rows.
  const base: Array<[string, PrepCategory, string, number]> = [
    ["Pulled Pork", "meats", "pans", 6],
    ["Brisket (sliced)", "meats", "pans", 4],
    ["Smoked Sausage", "meats", "each", 40],
    ["St. Louis Ribs", "meats", "racks", 12],
    ["Chicken Quarters", "meats", "each", 24],
    ["House BBQ Sauce", "sauces", "quarts", 8],
    ["Alabama White", "sauces", "quarts", 3],
    ["Guava Glaze", "sauces", "pints", 4],
    ["Mac & Cheese", "sides", "pans", 5],
    ["Collard Greens", "sides", "pans", 3],
    ["Smoked Corn Casserole", "sides", "pans", 2],
    ["Coleslaw", "sides", "quarts", 10],
    ["Banana Pudding", "desserts", "each", 24],
    ["Retail Rub Jars", "retail_prep", "each", 12],
  ];
  const thursdayOnly: Array<[string, PrepCategory, string, number]> = [
    ["Cuban Roast Pork (mojo)", "meats", "pans", 3],
    ["Cuban Bread Order", "misc", "loaves", 30],
    ["Smash Burger Patties", "meats", "each", 60],
  ];
  return [
    ...base.map(([name, category, unit, parQty]) => ({ id: uid(), name, category, unit, parQty, thursdayOnly: false, active: true })),
    ...thursdayOnly.map(([name, category, unit, parQty]) => ({ id: uid(), name, category, unit, parQty, thursdayOnly: true, active: true })),
  ];
}

export class DemoPrepTemplates implements PrepTemplatesRepository {
  constructor(private audit: AuditRepository) {}

  async list(): Promise<PrepTemplateRow[]> {
    return loadCol(PREP_TEMPLATES, seedPrepTemplates);
  }

  async upsert(t: Omit<PrepTemplateRow, "id"> & { id?: string }, actor: string): Promise<PrepTemplateRow> {
    if (!t.name.trim()) throw new Error("Name is required");
    if (!Number.isFinite(t.parQty) || t.parQty < 0) throw new Error("parQty must be a non-negative number");
    const rows = await loadCol(PREP_TEMPLATES, seedPrepTemplates);
    const existing = t.id ? rows.find(r => r.id === t.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, t, { name: t.name.trim() });
      await saveCol(PREP_TEMPLATES, rows);
      await this.audit.log({ actor, action: "preptemplate.update", entity: "prep_template", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: PrepTemplateRow = { ...t, id: uid(), name: t.name.trim() };
    rows.push(full);
    await saveCol(PREP_TEMPLATES, rows);
    await this.audit.log({ actor, action: "preptemplate.create", entity: "prep_template", entityId: full.name, before: null, after: full });
    return full;
  }

  async toggleActive(id: string, actor: string): Promise<PrepTemplateRow> {
    const rows = await loadCol(PREP_TEMPLATES, seedPrepTemplates);
    const t = rows.find(r => r.id === id);
    if (!t) throw new Error("Template row not found");
    const before = { ...t };
    t.active = !t.active;
    await saveCol(PREP_TEMPLATES, rows);
    await this.audit.log({ actor, action: "preptemplate.toggle", entity: "prep_template", entityId: t.name, before, after: { ...t } });
    return { ...t };
  }
}

// ── Samplers ──────────────────────────────────────────────────────────────
const SAMPLERS = "samplers.v1";
const ALLOWED_SAMPLER_PROTEINS = ["Pulled Pork", "Brisket", "Smoked Sausage", "St. Louis Ribs", "Chicken Quarters"];

function seedSamplers(): SamplerConfig[] {
  return [
    { id: uid(), name: "Walk-In Sampler", priceCents: 3400, proteins: [...ALLOWED_SAMPLER_PROTEINS], active: true },
  ];
}

export class DemoSamplers implements SamplersRepository {
  constructor(private audit: AuditRepository) {}

  allowedProteins(): string[] { return [...ALLOWED_SAMPLER_PROTEINS]; }

  async list(): Promise<SamplerConfig[]> {
    return loadCol(SAMPLERS, seedSamplers);
  }

  async upsert(s: SamplerConfig & { id?: string }, actor: string): Promise<SamplerConfig> {
    if (!s.name.trim()) throw new Error("Name is required");
    if (!Number.isInteger(s.priceCents) || s.priceCents < 0) throw new Error("priceCents must be a non-negative integer");
    for (const p of s.proteins) {
      if (!ALLOWED_SAMPLER_PROTEINS.includes(p)) {
        throw new Error("Walk-In Sampler may only contain pulled pork, brisket, sausage, ribs, chicken quarters");
      }
    }
    const rows = await loadCol(SAMPLERS, seedSamplers);
    const existing = s.id ? rows.find(r => r.id === s.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, s, { name: s.name.trim() });
      await saveCol(SAMPLERS, rows);
      await this.audit.log({ actor, action: "sampler.update", entity: "sampler", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: SamplerConfig = { ...s, id: s.id || uid(), name: s.name.trim() };
    rows.push(full);
    await saveCol(SAMPLERS, rows);
    await this.audit.log({ actor, action: "sampler.create", entity: "sampler", entityId: full.name, before: null, after: full });
    return full;
  }
}

// ── Settings ──────────────────────────────────────────────────────────────
const SETTINGS = "settings.v1";
interface SettingRow { key: string; value: unknown; }

export class DemoSettings implements SettingsRepository {
  constructor(private audit: AuditRepository) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const rows = await loadCol<SettingRow>(SETTINGS, () => []);
    const r = rows.find(x => x.key === key);
    return r ? (r.value as T) : fallback;
  }

  async set<T>(key: string, value: T, actor: string): Promise<void> {
    const rows = await loadCol<SettingRow>(SETTINGS, () => []);
    const r = rows.find(x => x.key === key);
    const before = r ? r.value : null;
    if (r) r.value = value; else rows.push({ key, value });
    await saveCol(SETTINGS, rows);
    await this.audit.log({ actor, action: "settings.set", entity: "setting", entityId: key, before, after: value });
  }
}

// ── Imports ───────────────────────────────────────────────────────────────
const IMPORTS = "imports.v1";
function seedImports(): ImportJob[] {
  return [
    { id: uid(), source: "square-orders", kind: "orders", status: "imported", rows: 412, createdAt: nowIso() },
    { id: uid(), source: "ghl-contacts", kind: "contacts", status: "needs_review", rows: 87, createdAt: nowIso() },
    { id: uid(), source: "csv-menu", kind: "menu", status: "failed", rows: 0, createdAt: nowIso() },
  ];
}

export class DemoImports implements ImportsRepository {
  async list(): Promise<ImportJob[]> {
    return (await loadCol(IMPORTS, seedImports)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
}
