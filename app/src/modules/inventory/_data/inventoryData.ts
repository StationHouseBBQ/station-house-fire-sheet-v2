/**
 * Inventory workspace data layer (Inventory module only).
 *
 * This module owns its own domain model persisted through the shared
 * `dal.settings` key/value store — the coordinator owns the DAL types, so
 * rather than widen them we keep the whole inventory/purchasing model here,
 * mirroring the Manus InventoryBoard / InventoryCount / ReceiveShipment /
 * PurchaseOrder / VendorCosts / VendorPriceAgent pages.
 *
 * Money is integer cents everywhere (see lib/money). Quantities are plain
 * numbers (lbs, ea, cases…) since fractional stock counts are common in a
 * kitchen (e.g. 12.5 lbs of brisket).
 *
 * Settings keys (persisted via dal.settings):
 *   inventory.items    → InventoryItem[]
 *   inventory.vendors  → Vendor[]
 *   inventory.pos      → PurchaseOrderRecord[]
 *   inventory.receipts → ReceiptRecord[]
 */

// ── Settings keys ────────────────────────────────────────────────────────
export const KEY_ITEMS = "inventory.items";
export const KEY_VENDORS = "inventory.vendors";
export const KEY_POS = "inventory.pos";
export const KEY_RECEIPTS = "inventory.receipts";

// ── Categories ─────────────────────────────────────────────────────────--
export type InventoryCategory =
  | "proteins"
  | "buns_bread"
  | "sauces_rubs"
  | "sides"
  | "packaging"
  | "beverages"
  | "cleaning"
  | "propane_fuel"
  | "smallwares";

export const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  proteins: "Proteins (Raw)",
  buns_bread: "Buns & Bread",
  sauces_rubs: "Sauces & Rubs",
  sides: "Sides",
  packaging: "Packaging",
  beverages: "Beverages",
  cleaning: "Cleaning & Gloves",
  propane_fuel: "Propane & Fuel",
  smallwares: "Smallwares",
};

export const CATEGORY_ORDER: InventoryCategory[] = [
  "proteins",
  "buns_bread",
  "sauces_rubs",
  "sides",
  "packaging",
  "beverages",
  "cleaning",
  "propane_fuel",
  "smallwares",
];

// ── Domain types ───────────────────────────────────────────────────────--
export interface InventoryItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;               // lbs, ea, case, gal, sleeve…
  onHand: number;
  parLevel: number;
  unitCostCents: number;      // default/expected cost per unit
  preferredVendorId: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  notes: string;
  /** Per-item quoted price. Keyed by InventoryItem.id → cents/unit. */
  prices: Record<string, number>;
}

export type PoStatus = "draft" | "sent" | "received";

export interface PoLine {
  itemId: string;
  itemName: string;
  unit: string;
  qty: number;
  estCostCents: number;       // per-unit estimated cost
}

export interface PurchaseOrderRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  status: PoStatus;
  lines: PoLine[];
  createdAt: string;
  receivedAt: string | null;
  actor: string;
  notes: string;
}

export interface ReceiptLine {
  itemId: string;
  itemName: string;
  unit: string;
  qty: number;
  unitCostCents: number;
}

export interface ReceiptRecord {
  id: string;
  vendorId: string;
  vendorName: string;
  poId: string | null;        // set when a PO was received into stock
  lines: ReceiptLine[];
  receivedAt: string;
  actor: string;
  notes: string;
}

export interface CountLine {
  itemId: string;
  itemName: string;
  category: InventoryCategory;
  unit: string;
  expected: number;
  counted: number;
  unitCostCents: number;
}

// ── Derived helpers ──────────────────────────────────────────────────────
export type StockLevel = "critical" | "low" | "ok";

export function stockLevel(item: Pick<InventoryItem, "onHand" | "parLevel">): StockLevel {
  if (item.parLevel <= 0) return "ok";
  if (item.onHand <= item.parLevel * 0.5) return "critical";
  if (item.onHand < item.parLevel) return "low";
  return "ok";
}

export function itemValueCents(item: Pick<InventoryItem, "onHand" | "unitCostCents">): number {
  return Math.round(item.onHand * item.unitCostCents);
}

export function poLineTotalCents(line: Pick<PoLine, "qty" | "estCostCents">): number {
  return Math.round(line.qty * line.estCostCents);
}

export function poTotalCents(po: Pick<PurchaseOrderRecord, "lines">): number {
  return po.lines.reduce((s, l) => s + poLineTotalCents(l), 0);
}

export function receiptTotalCents(r: Pick<ReceiptRecord, "lines">): number {
  return r.lines.reduce((s, l) => s + Math.round(l.qty * l.unitCostCents), 0);
}

/** Effective cost of an item at a vendor: quoted price if present, else the item default. */
export function vendorPriceCents(vendor: Vendor, item: InventoryItem): number {
  const quoted = vendor.prices[item.id];
  return typeof quoted === "number" ? quoted : item.unitCostCents;
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Seeds (realistic BBQ-shop demo data) ─────────────────────────────────-
export const SEED_VENDORS: Vendor[] = [
  {
    id: "ven_rdepot",
    name: "Restaurant Depot",
    contactName: "Marcus Bell",
    phone: "(813) 555-0142",
    email: "orders@restaurantdepot-tampa.com",
    notes: "Cash & carry. Best on proteins & bulk packaging. Members only.",
    prices: {
      itm_brisket: 429, itm_pork_butt: 219, itm_st_louis_ribs: 389, itm_chicken: 149,
      itm_burger_bun: 22, itm_texas_toast: 34, itm_baked_beans: 189, itm_mac: 245,
      itm_foam_clam: 28, itm_pint_cup: 11, itm_nitrile_gloves: 899, itm_propane: 2199,
    },
  },
  {
    id: "ven_sysco",
    name: "Sysco",
    contactName: "Dana Ortiz",
    phone: "(813) 555-0177",
    email: "dana.ortiz@sysco.com",
    notes: "Delivered Tue/Fri. Strong on sides, sauces, paper goods. Net-15 terms.",
    prices: {
      itm_brisket: 449, itm_pork_butt: 229, itm_st_louis_ribs: 399, itm_chicken: 155,
      itm_burger_bun: 24, itm_texas_toast: 31, itm_baked_beans: 175, itm_mac: 239,
      itm_slaw_mix: 129, itm_bbq_sauce: 649, itm_rub: 799, itm_foam_clam: 26,
      itm_pint_cup: 12, itm_nitrile_gloves: 949, itm_sweet_tea: 349,
    },
  },
  {
    id: "ven_usfoods",
    name: "US Foods",
    contactName: "Priya Nair",
    phone: "(813) 555-0199",
    email: "priya.nair@usfoods.com",
    notes: "Delivered Mon/Thu. Competitive on beverages & cleaning. Net-30 terms.",
    prices: {
      itm_brisket: 439, itm_pork_butt: 224, itm_chicken: 152,
      itm_baked_beans: 182, itm_mac: 249, itm_slaw_mix: 119, itm_bbq_sauce: 619,
      itm_rub: 769, itm_pint_cup: 10, itm_nitrile_gloves: 869, itm_sanitizer: 1299,
      itm_sweet_tea: 329, itm_lemonade: 339, itm_propane: 2299,
    },
  },
];

interface SeedItem {
  id: string;
  name: string;
  category: InventoryCategory;
  unit: string;
  onHand: number;
  parLevel: number;
  unitCostCents: number;
  preferredVendorId: string | null;
}

export const SEED_ITEMS: SeedItem[] = [
  // Proteins (raw lbs)
  { id: "itm_brisket", name: "Beef Brisket (Packer)", category: "proteins", unit: "lbs", onHand: 84, parLevel: 120, unitCostCents: 429, preferredVendorId: "ven_rdepot" },
  { id: "itm_pork_butt", name: "Pork Butt (Boston)", category: "proteins", unit: "lbs", onHand: 60, parLevel: 90, unitCostCents: 219, preferredVendorId: "ven_rdepot" },
  { id: "itm_st_louis_ribs", name: "St. Louis Ribs", category: "proteins", unit: "lbs", onHand: 22, parLevel: 60, unitCostCents: 389, preferredVendorId: "ven_rdepot" },
  { id: "itm_chicken", name: "Whole Chicken", category: "proteins", unit: "lbs", onHand: 40, parLevel: 45, unitCostCents: 149, preferredVendorId: "ven_usfoods" },
  // Buns & Bread
  { id: "itm_burger_bun", name: "Brioche Burger Buns", category: "buns_bread", unit: "ea", onHand: 96, parLevel: 240, unitCostCents: 22, preferredVendorId: "ven_rdepot" },
  { id: "itm_texas_toast", name: "Texas Toast", category: "buns_bread", unit: "slice", onHand: 180, parLevel: 200, unitCostCents: 31, preferredVendorId: "ven_sysco" },
  // Sauces & Rubs
  { id: "itm_bbq_sauce", name: "House BBQ Sauce (gal)", category: "sauces_rubs", unit: "gal", onHand: 6, parLevel: 8, unitCostCents: 619, preferredVendorId: "ven_usfoods" },
  { id: "itm_rub", name: "Station House Rub (5 lb)", category: "sauces_rubs", unit: "tub", onHand: 3, parLevel: 6, unitCostCents: 769, preferredVendorId: "ven_usfoods" },
  // Sides
  { id: "itm_baked_beans", name: "Baked Beans (#10 can)", category: "sides", unit: "can", onHand: 14, parLevel: 18, unitCostCents: 175, preferredVendorId: "ven_sysco" },
  { id: "itm_mac", name: "Elbow Macaroni (box)", category: "sides", unit: "box", onHand: 8, parLevel: 12, unitCostCents: 239, preferredVendorId: "ven_sysco" },
  { id: "itm_slaw_mix", name: "Coleslaw Mix (bag)", category: "sides", unit: "bag", onHand: 5, parLevel: 15, unitCostCents: 119, preferredVendorId: "ven_usfoods" },
  // Packaging
  { id: "itm_foam_clam", name: "Foam Clamshells", category: "packaging", unit: "case", onHand: 3, parLevel: 6, unitCostCents: 2600, preferredVendorId: "ven_sysco" },
  { id: "itm_pint_cup", name: "Pint Deli Cups", category: "packaging", unit: "sleeve", onHand: 22, parLevel: 30, unitCostCents: 1000, preferredVendorId: "ven_usfoods" },
  // Beverages
  { id: "itm_sweet_tea", name: "Sweet Tea Concentrate", category: "beverages", unit: "gal", onHand: 4, parLevel: 6, unitCostCents: 329, preferredVendorId: "ven_usfoods" },
  { id: "itm_lemonade", name: "Lemonade Concentrate", category: "beverages", unit: "gal", onHand: 3, parLevel: 5, unitCostCents: 339, preferredVendorId: "ven_usfoods" },
  // Cleaning & Gloves
  { id: "itm_nitrile_gloves", name: "Nitrile Gloves (case)", category: "cleaning", unit: "case", onHand: 2, parLevel: 5, unitCostCents: 869, preferredVendorId: "ven_usfoods" },
  { id: "itm_sanitizer", name: "Sanitizer Concentrate", category: "cleaning", unit: "jug", onHand: 3, parLevel: 4, unitCostCents: 1299, preferredVendorId: "ven_usfoods" },
  // Propane & Fuel
  { id: "itm_propane", name: "Propane Tank (20 lb)", category: "propane_fuel", unit: "tank", onHand: 4, parLevel: 8, unitCostCents: 2199, preferredVendorId: "ven_rdepot" },
  // Smallwares
  { id: "itm_butcher_paper", name: "Pink Butcher Paper (roll)", category: "smallwares", unit: "roll", onHand: 2, parLevel: 4, unitCostCents: 4499, preferredVendorId: "ven_rdepot" },
];

export function seedItems(): InventoryItem[] {
  return SEED_ITEMS.map(i => ({ ...i }));
}

export function seedVendors(): Vendor[] {
  return SEED_VENDORS.map(v => ({ ...v, prices: { ...v.prices } }));
}
