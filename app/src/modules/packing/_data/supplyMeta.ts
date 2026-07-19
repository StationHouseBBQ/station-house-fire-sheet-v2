/**
 * Module-local supply metadata (Packing workspace only).
 *
 * The shared DAL `SupplyItem` carries name/unit/onHand/parLevel/perOrderUsage.
 * The Manus PackingInventory & SupplyForecast screens additionally group by
 * category, track a reorder quantity and a cost-per-unit, and offer adjustment
 * reasons. Rather than widen the shared type (owned by the coordinator), we keep
 * that presentation-layer metadata here, keyed by the supply item id, persisted
 * with the same idb-keyval store the demo DAL uses.
 *
 * NOTE for coordinator: to make this first-class, add to `SupplyItem`:
 *   category: SupplyCategory; reorderQty: number; costPerUnitCents: number;
 * and to `SuppliesRepository.forecast(weeks)` a weeks arg + orders count.
 */
import { get, set } from "idb-keyval";

export type SupplyCategory = "packaging" | "serving" | "equipment" | "condiment" | "cleaning" | "other";

export const CATEGORY_LABELS: Record<SupplyCategory, string> = {
  packaging: "Packaging",
  serving: "Serving Ware",
  equipment: "Equipment",
  condiment: "Condiments",
  cleaning: "Cleaning",
  other: "Other",
};

export const CATEGORY_ORDER: SupplyCategory[] = ["packaging", "serving", "equipment", "condiment", "cleaning", "other"];

export const ADJUST_REASONS = [
  { key: "receive", label: "Receive Stock (+)", sign: 1 },
  { key: "use", label: "Used / Consumed (−)", sign: -1 },
  { key: "waste", label: "Waste / Damaged (−)", sign: -1 },
  { key: "adjustment", label: "Manual Adjustment", sign: 1 },
] as const;
export type AdjustReason = (typeof ADJUST_REASONS)[number]["key"];

export interface SupplyMeta {
  category: SupplyCategory;
  reorderQty: number;
  costPerUnitCents: number;
}

/** A single adjustment ledger entry, for the movement history panel. */
export interface AdjustLogEntry {
  id: string;
  itemId: string;
  itemName: string;
  reason: AdjustReason;
  delta: number;
  at: string;
  by: string;
}

const META_KEY = "packing.supplyMeta.v1";
const LOG_KEY = "packing.supplyLog.v1";

/** Best-effort category inference from the seeded supply names. */
function inferCategory(name: string): SupplyMeta {
  const n = name.toLowerCase();
  const mk = (category: SupplyCategory, reorderQty: number, costPerUnitCents: number): SupplyMeta =>
    ({ category, reorderQty, costPerUnitCents });
  if (n.includes("paper") || n.includes("bag") || n.includes("pan") || n.includes("cup") || n.includes("box") || n.includes("label") || n.includes("container")) return mk("packaging", 100, 45);
  if (n.includes("tray") || n.includes("plate") || n.includes("utensil") || n.includes("napkin") || n.includes("fork") || n.includes("serving")) return mk("serving", 200, 18);
  if (n.includes("sauce") || n.includes("rub") || n.includes("condiment") || n.includes("cup")) return mk("condiment", 50, 60);
  if (n.includes("glove") || n.includes("sanitiz") || n.includes("towel") || n.includes("clean")) return mk("cleaning", 24, 120);
  if (n.includes("sterno") || n.includes("chafer") || n.includes("rack") || n.includes("equip")) return mk("equipment", 12, 350);
  return mk("packaging", 50, 40);
}

export async function loadMeta(itemIds: Array<{ id: string; name: string }>): Promise<Record<string, SupplyMeta>> {
  const stored = (await get<Record<string, SupplyMeta>>(META_KEY)) ?? {};
  let dirty = false;
  for (const { id, name } of itemIds) {
    if (!stored[id]) { stored[id] = inferCategory(name); dirty = true; }
  }
  if (dirty) await set(META_KEY, stored);
  return stored;
}

export async function saveMeta(itemId: string, meta: SupplyMeta): Promise<void> {
  const stored = (await get<Record<string, SupplyMeta>>(META_KEY)) ?? {};
  stored[itemId] = meta;
  await set(META_KEY, stored);
}

export async function loadLog(): Promise<AdjustLogEntry[]> {
  return (await get<AdjustLogEntry[]>(LOG_KEY)) ?? [];
}

export async function appendLog(entry: Omit<AdjustLogEntry, "id" | "at">): Promise<void> {
  const rows = (await get<AdjustLogEntry[]>(LOG_KEY)) ?? [];
  rows.unshift({ ...entry, id: `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() });
  await set(LOG_KEY, rows.slice(0, 100));
}
