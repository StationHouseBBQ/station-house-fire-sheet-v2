/**
 * DemoAdapter — deterministic seeded data persisted in IndexedDB so demo
 * state survives refreshes (autosave requirement). No network, no secrets.
 */
import { get, set } from "idb-keyval";
import type { AuditRecord, AuditRepository, Dal, PrepCategory, PrepEntry, PrepRepository, PrepSession, PrepStatus } from "../types";
import { seedPrepSession } from "./seed";
import { etParts } from "../../lib/time";

const PREP_KEY = "shbbq.demo.prep.v1";
const AUDIT_KEY = "shbbq.demo.audit.v1";

function todayServiceDate(): { date: string; isThursday: boolean } {
  const p = etParts(new Date());
  const date = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  return { date, isThursday: p.weekday === 4 };
}

async function loadSession(): Promise<PrepSession> {
  const { date, isThursday } = todayServiceDate();
  const stored = (await get(PREP_KEY)) as PrepSession | undefined;
  if (stored && stored.serviceDate === date) return stored;
  const fresh = seedPrepSession(date, isThursday);
  await set(PREP_KEY, fresh);
  return fresh;
}

async function saveSession(s: PrepSession): Promise<void> {
  await set(PREP_KEY, s);
}

class DemoAudit implements AuditRepository {
  async log(rec: Omit<AuditRecord, "id" | "at">): Promise<void> {
    const list = ((await get(AUDIT_KEY)) as AuditRecord[] | undefined) ?? [];
    list.unshift({ ...rec, id: crypto.randomUUID(), at: new Date().toISOString() });
    await set(AUDIT_KEY, list.slice(0, 500));
  }
  async recent(limit = 50): Promise<AuditRecord[]> {
    const list = ((await get(AUDIT_KEY)) as AuditRecord[] | undefined) ?? [];
    return list.slice(0, limit);
  }
}

class DemoPrep implements PrepRepository {
  constructor(private audit: AuditRepository) {}

  async getActiveSession(): Promise<PrepSession | null> {
    return loadSession();
  }

  private async mutateEntry(entryId: string, actor: string, fn: (e: PrepEntry) => void, action: string): Promise<PrepEntry> {
    const s = await loadSession();
    const e = s.entries.find(x => x.id === entryId);
    if (!e) throw new Error(`Prep entry not found: ${entryId}`);
    const before = { ...e };
    fn(e);
    e.updatedAt = new Date().toISOString();
    e.updatedBy = actor;
    await saveSession(s);
    await this.audit.log({ actor, action, entity: "prep_entry", entityId: entryId, before, after: { ...e } });
    return { ...e };
  }

  updateEntryStatus(entryId: string, status: PrepStatus, actor: string): Promise<PrepEntry> {
    return this.mutateEntry(entryId, actor, e => { e.status = status; }, "prep.status");
  }

  async updateEntryQty(entryId: string, prepQty: number, actor: string): Promise<PrepEntry> {
    if (!(prepQty >= 0)) throw new Error("prepQty must be ≥ 0");
    return this.mutateEntry(entryId, actor, e => { e.prepQty = prepQty; }, "prep.qty");
  }

  async addEntry(input: { name: string; category: PrepCategory; unit: string; parQty: number }, actor: string): Promise<PrepEntry> {
    const s = await loadSession();
    const now = new Date().toISOString();
    const entry: PrepEntry = {
      id: crypto.randomUUID(), sessionId: s.id,
      name: input.name.trim(), category: input.category, unit: input.unit,
      parQty: input.parQty, onHandQty: null, prepQty: input.parQty,
      status: "not_started", notes: null, updatedAt: now, updatedBy: actor,
    };
    if (!entry.name) throw new Error("Name is required");
    s.entries.push(entry);
    await saveSession(s);
    await this.audit.log({ actor, action: "prep.add", entity: "prep_entry", entityId: entry.id, before: null, after: entry });
    return entry;
  }
}

export function createDemoDal(): Dal {
  const audit = new DemoAudit();
  return { mode: "demo", prep: new DemoPrep(audit), audit };
}
