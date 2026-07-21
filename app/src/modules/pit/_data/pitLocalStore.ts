/**
 * Module-local demo state for pit features the shared DAL doesn't cover:
 *   • live smoke temp-log sessions + readings (PitmasterGuide temp logging)
 *   • cooked-inventory waste + pull events (SmokedInventory hold/waste)
 * Persisted to IndexedDB via idb-keyval, mirroring src/dal/demo/store.ts.
 * Kept inside the pit module per isolation rules — no shared-file edits.
 */
import { get, set } from "idb-keyval";

const PREFIX = "shbbq.pit.local.v1.";

async function load<T>(key: string, seed: () => T[]): Promise<T[]> {
  const stored = (await get(PREFIX + key)) as T[] | undefined;
  if (stored) return stored;
  const fresh = seed();
  await set(PREFIX + key, fresh);
  return fresh;
}
async function save<T>(key: string, rows: T[]): Promise<void> {
  await set(PREFIX + key, rows);
}
function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Temp-log sessions ──────────────────────────────────────────────────────
export interface TempReading { id: string; at: string; pitTempF: number; internalTempF: number | null; note: string; }
export interface SmokeSession {
  id: string; proteinSlug: string; proteinName: string;
  status: "active" | "completed" | "abandoned";
  targetPitF: number; targetInternalF: number; woodChoice: string; rawLbs: number | null;
  notes: string; startedAt: string; endedAt: string | null; readings: TempReading[];
}

const SESSIONS = "tempSessions";
function seedSessions(): SmokeSession[] {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600_000).toISOString();
  return [
    {
      id: uid(), proteinSlug: "brisket", proteinName: "Brisket", status: "active",
      targetPitF: 250, targetInternalF: 203, woodChoice: "Post oak", rawLbs: 42,
      notes: "Overnight cook for Friday catering", startedAt: ago(6), endedAt: null,
      readings: [
        { id: uid(), at: ago(6), pitTempF: 248, internalTempF: 78, note: "On the smoker" },
        { id: uid(), at: ago(4), pitTempF: 252, internalTempF: 142, note: "" },
        { id: uid(), at: ago(2), pitTempF: 249, internalTempF: 161, note: "Approaching stall" },
        { id: uid(), at: ago(1), pitTempF: 251, internalTempF: 164, note: "Wrapped in butcher paper" },
      ],
    },
  ];
}
export async function listSessions(): Promise<SmokeSession[]> {
  return (await load(SESSIONS, seedSessions)).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
export async function startSession(input: {
  proteinSlug: string; proteinName: string; targetPitF: number; targetInternalF: number;
  woodChoice: string; rawLbs: number | null; notes: string;
}): Promise<SmokeSession> {
  const rows = await load(SESSIONS, seedSessions);
  if (rows.some(s => s.proteinSlug === input.proteinSlug && s.status === "active"))
    throw new Error("A live session already exists for this protein");
  const s: SmokeSession = { ...input, id: uid(), status: "active", startedAt: new Date().toISOString(), endedAt: null, readings: [] };
  rows.push(s); await save(SESSIONS, rows); return s;
}
export async function addReading(sessionId: string, r: { pitTempF: number; internalTempF: number | null; note: string }): Promise<SmokeSession> {
  const rows = await load(SESSIONS, seedSessions);
  const s = rows.find(x => x.id === sessionId); if (!s) throw new Error("Session not found");
  if (!Number.isFinite(r.pitTempF)) throw new Error("Pit temp is required");
  s.readings.push({ id: uid(), at: new Date().toISOString(), ...r });
  await save(SESSIONS, rows); return { ...s };
}
export async function deleteReading(sessionId: string, readingId: string): Promise<SmokeSession> {
  const rows = await load(SESSIONS, seedSessions);
  const s = rows.find(x => x.id === sessionId); if (!s) throw new Error("Session not found");
  s.readings = s.readings.filter(x => x.id !== readingId);
  await save(SESSIONS, rows); return { ...s };
}
export async function endSession(sessionId: string, status: "completed" | "abandoned"): Promise<SmokeSession> {
  const rows = await load(SESSIONS, seedSessions);
  const s = rows.find(x => x.id === sessionId); if (!s) throw new Error("Session not found");
  s.status = status; s.endedAt = new Date().toISOString();
  await save(SESSIONS, rows); return { ...s };
}

// ── Inventory pull / waste events ──────────────────────────────────────────
export interface InvEvent { id: string; protein: string; kind: "pull" | "waste"; lbs: number; reason: string; at: string; actor: string; }
const EVENTS = "invEvents";
function seedEvents(): InvEvent[] {
  const now = Date.now();
  return [
    { id: uid(), protein: "Pork Butt", kind: "pull", lbs: 22, reason: "Lunch line", at: new Date(now - 5 * 3600_000).toISOString(), actor: "demo:kitchen" },
    { id: uid(), protein: "St. Louis Ribs", kind: "waste", lbs: 3, reason: "Over hold time", at: new Date(now - 26 * 3600_000).toISOString(), actor: "demo:kitchen" },
  ];
}
export async function listEvents(): Promise<InvEvent[]> {
  return (await load(EVENTS, seedEvents)).sort((a, b) => b.at.localeCompare(a.at));
}
export async function recordEvent(e: { protein: string; kind: "pull" | "waste"; lbs: number; reason: string; actor: string }): Promise<InvEvent> {
  if (!(e.lbs > 0)) throw new Error("Lbs must be positive");
  const rows = await load(EVENTS, seedEvents);
  const full: InvEvent = { ...e, id: uid(), at: new Date().toISOString() };
  rows.push(full); await save(EVENTS, rows); return full;
}
export async function removeEvent(id: string): Promise<void> {
  const rows = await load(EVENTS, seedEvents);
  await save(EVENTS, rows.filter(r => r.id !== id));
}

// ── Portion economics overlay (Meat Cost Guide) ────────────────────────────
// The shared MeatCost repo has no portion-oz / menu-price fields, so per-
// protein plate economics live here as an editable overlay keyed by protein.
export interface PortionEcon { protein: string; portionOz: number; menuPriceCents: number; wasteLbsPerWeek: number; }
const PORTIONS = "portionEcon";
function seedPortions(): PortionEcon[] {
  return [
    { protein: "Brisket (whole packer)", portionOz: 5, menuPriceCents: 1600, wasteLbsPerWeek: 4 },
    { protein: "Pork Butt", portionOz: 5, menuPriceCents: 1100, wasteLbsPerWeek: 3 },
    { protein: "St. Louis Ribs", portionOz: 8, menuPriceCents: 1800, wasteLbsPerWeek: 2 },
    { protein: "Chicken Quarters", portionOz: 10, menuPriceCents: 900, wasteLbsPerWeek: 2 },
    { protein: "Smoked Sausage", portionOz: 4, menuPriceCents: 800, wasteLbsPerWeek: 1 },
    { protein: "Oxtail", portionOz: 8, menuPriceCents: 2400, wasteLbsPerWeek: 1 },
  ];
}
export async function listPortions(): Promise<PortionEcon[]> {
  return load(PORTIONS, seedPortions);
}
export async function upsertPortion(p: PortionEcon): Promise<PortionEcon> {
  if (!(p.portionOz > 0)) throw new Error("Portion oz must be positive");
  if (!Number.isInteger(p.menuPriceCents) || p.menuPriceCents < 0) throw new Error("Menu price must be non-negative cents");
  const rows = await load(PORTIONS, seedPortions);
  const idx = rows.findIndex(r => r.protein === p.protein);
  if (idx >= 0) rows[idx] = p; else rows.push(p);
  await save(PORTIONS, rows);
  return p;
}
