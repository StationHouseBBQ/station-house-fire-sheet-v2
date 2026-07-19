/**
 * Module-local demo state for Seminole FOH surfaces whose richness exceeds
 * the shared DAL. Persisted to localStorage (mirroring src/dal/demo's
 * idb-free demo pattern) and keyed by ET service date so the UI resets each
 * day. Nothing here leaves the seminole module. When these features graduate
 * to the DAL, swap the helpers for repos — the component contracts hold.
 */
import { currentTime } from "../../../lib/clock";
import { etParts } from "../../../lib/time";

export function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write<T>(key: string, value: T): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota — demo only */ }
}

// ── Food temp checks (item-level, period-based, HACCP-style) ───────────────
export type TempPeriod = "morning" | "midday" | "evening";
export type PassFail = "pass" | "fail";

export interface FoodItemDef {
  name: string;
  requiredMin: number | null;
  requiredMax: number | null;
  type: "hot" | "cold" | "ambient";
  icon: string;
}

/** Mirrors the Manus FoodTempLog food matrix (FL DOH hot/cold/ambient rules). */
export const FOOD_ITEMS: FoodItemDef[] = [
  { name: "Brisket", requiredMin: 135, requiredMax: null, type: "hot", icon: "🥩" },
  { name: "Pulled Pork", requiredMin: 135, requiredMax: null, type: "hot", icon: "🐷" },
  { name: "Chicken", requiredMin: 135, requiredMax: null, type: "hot", icon: "🍗" },
  { name: "Ribs", requiredMin: 135, requiredMax: null, type: "hot", icon: "🍖" },
  { name: "Sausage", requiredMin: 135, requiredMax: null, type: "hot", icon: "🌭" },
  { name: "Mac & Cheese", requiredMin: 135, requiredMax: null, type: "hot", icon: "🧀" },
  { name: "Baked Beans", requiredMin: 135, requiredMax: null, type: "hot", icon: "🫘" },
  { name: "Coleslaw", requiredMin: null, requiredMax: 41, type: "cold", icon: "🥗" },
  { name: "Potato Salad", requiredMin: null, requiredMax: 41, type: "cold", icon: "🥔" },
  { name: "Sauces (ambient)", requiredMin: 50, requiredMax: 70, type: "ambient", icon: "🫙" },
];

export const TEMP_STATIONS = ["Retail Counter", "Display Case", "Steam Table", "Reach-In", "Sauce Station"];

export function passFailFor(temp: number, item: FoodItemDef): PassFail {
  if (item.type === "hot") return temp >= (item.requiredMin ?? 135) ? "pass" : "fail";
  if (item.type === "cold") return temp <= (item.requiredMax ?? 41) ? "pass" : "fail";
  return temp >= (item.requiredMin ?? 50) && temp <= (item.requiredMax ?? 70) ? "pass" : "fail";
}

export function requiredLabel(item: FoodItemDef): string {
  if (item.type === "hot") return `≥${item.requiredMin}°F`;
  if (item.type === "cold") return `≤${item.requiredMax}°F`;
  return `${item.requiredMin}–${item.requiredMax}°F`;
}

export interface TempReadingRow {
  itemName: string;
  tempF: number;
  passFail: PassFail;
  correctiveAction: string | null;
}
export interface TempCheckSession {
  id: string;
  date: string;
  period: TempPeriod;
  station: string;
  employee: string;
  readings: TempReadingRow[];
  at: string;
}

const TEMP_KEY = "shbbq.seminole.tempChecks.v1";

export function loadTempSessions(): TempCheckSession[] {
  return read<TempCheckSession[]>(TEMP_KEY, []);
}
export function saveTempSession(s: TempCheckSession): TempCheckSession[] {
  const all = loadTempSessions();
  all.push(s);
  write(TEMP_KEY, all);
  return all;
}

// ── Food waste log ─────────────────────────────────────────────────────────
export const WASTE_REASONS = [
  "Overproduction", "Spoilage", "Dropped / contaminated", "Customer return",
  "Expired / out of date", "Trim / prep loss", "Quality below standard",
];
export const WASTE_UNITS = ["lbs", "each", "pans", "quarts", "portions"];

export interface WasteEntry {
  id: string;
  date: string;
  item: string;
  qty: number;
  unit: string;
  reason: string;
  estCostCents: number;
  loggedBy: string;
  at: string;
}

const WASTE_KEY = "shbbq.seminole.wasteLog.v1";

export function loadWaste(): WasteEntry[] {
  return read<WasteEntry[]>(WASTE_KEY, []);
}
export function addWaste(e: Omit<WasteEntry, "id" | "at">): WasteEntry[] {
  const all = loadWaste();
  all.push({ ...e, id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() });
  write(WASTE_KEY, all);
  return all;
}
export function removeWaste(id: string): WasteEntry[] {
  const all = loadWaste().filter(w => w.id !== id);
  write(WASTE_KEY, all);
  return all;
}
