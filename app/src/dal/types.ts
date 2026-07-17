/**
 * Domain types + repository interfaces. UI imports these — never an adapter
 * directly and never a database client. Interfaces mirror the Manus tRPC
 * surface documented in docs/PARITY_MATRIX.md, translated to V2 naming.
 */

// ── Prep (Kitchen vertical slice) ─────────────────────────────────────────
export type PrepStatus = "not_started" | "in_progress" | "complete";
export type PrepCategory = "meats" | "sauces" | "sides" | "retail_prep" | "misc" | "desserts";

export interface PrepEntry {
  id: string;
  sessionId: string;
  name: string;
  category: PrepCategory;
  unit: string;
  parQty: number;
  onHandQty: number | null;
  prepQty: number;
  status: PrepStatus;
  notes: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface PrepSession {
  id: string;
  serviceDate: string; // YYYY-MM-DD (ET)
  generatedAt: string;
  generatedBy: string;
  entries: PrepEntry[];
}

export interface PrepRepository {
  getActiveSession(): Promise<PrepSession | null>;
  updateEntryStatus(entryId: string, status: PrepStatus, actor: string): Promise<PrepEntry>;
  updateEntryQty(entryId: string, prepQty: number, actor: string): Promise<PrepEntry>;
  addEntry(input: { name: string; category: PrepCategory; unit: string; parQty: number }, actor: string): Promise<PrepEntry>;
}

// ── Audit ─────────────────────────────────────────────────────────────────
export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  before: unknown;
  after: unknown;
  at: string;
}

export interface AuditRepository {
  log(rec: Omit<AuditRecord, "id" | "at">): Promise<void>;
  recent(limit?: number): Promise<AuditRecord[]>;
}

// ── Root DAL ──────────────────────────────────────────────────────────────
export interface Dal {
  mode: "demo" | "supabase";
  prep: PrepRepository;
  audit: AuditRepository;
}
