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
  orders: OrdersRepository;
  kds: KdsRepository;
  checklists: ChecklistRepository;
  proteins: ProteinRepository;
  prepRecipes: PrepRecipeRepository;
  calendar: CalendarRepository;
  smokerForecast: SmokerForecastRepository;
  smokedInventory: SmokedInventoryRepository;
  pitmaster: PitmasterRepository;
  meatCosts: MeatCostsRepository;
  pitChecklist: PitChecklistRepository;
  retailFireSheet: RetailFireSheetRepository;
  preorders: PreordersRepository;
  tempLog: TempLogRepository;
  fireDrop: FireDropRepository;
}

// ── Orders / tickets ──────────────────────────────────────────────────────
export type OrderStatus = "confirmed" | "in_prep" | "ready" | "picked_up" | "delivered" | "cancelled";
export type OrderChannel = "catering" | "fire_drop" | "cuban_thursday" | "retail" | "walk_in";

export interface OrderItem { id: string; name: string; qty: number; unit: string; notes?: string | null; }

export interface OrderTicket {
  id: string;
  orderRef: string;            // immutable
  channel: OrderChannel;
  customer: string;
  serviceDate: string;         // YYYY-MM-DD ET
  timeWindow: string;
  status: OrderStatus;
  guests: number | null;
  items: OrderItem[];
  notes: string | null;
  statusHistory: Array<{ from: OrderStatus | null; to: OrderStatus; at: string; actor: string }>;
  updatedAt: string;
}

export interface OrdersRepository {
  list(filter?: { date?: string; status?: OrderStatus | "all"; channel?: OrderChannel | "all" }): Promise<OrderTicket[]>;
  get(id: string): Promise<OrderTicket | null>;
  updateStatus(id: string, status: OrderStatus, actor: string): Promise<OrderTicket>;
  updateNotes(id: string, notes: string, actor: string): Promise<OrderTicket>;
  weekDates(): Promise<string[]>; // 7 service dates centered on current ET week (Mon–Sun)
}

// ── KDS ───────────────────────────────────────────────────────────────────
export type KdsStage = "kitchen" | "expo" | "ready" | "handed_off";

export interface KdsTicket {
  id: string;
  orderId: string;
  orderRef: string;
  customer: string;
  serviceDate: string;
  timeWindow: string;
  stage: KdsStage;
  items: Array<{ id: string; name: string; qty: number; unit: string; kitchenChecked: boolean; expoChecked: boolean }>;
  firedAt: string;
  updatedAt: string;
}

export interface KdsRepository {
  tickets(date: string): Promise<KdsTicket[]>;
  toggleItemCheck(ticketId: string, itemId: string, lane: "kitchen" | "expo", actor: string): Promise<KdsTicket>;
  advance(ticketId: string, to: KdsStage, actor: string): Promise<KdsTicket>;
  allDayTotals(date: string): Promise<Array<{ name: string; unit: string; total: number; checked: number }>>;
}

// ── Checklists (kitchen morning / FOH) ────────────────────────────────────
export interface ChecklistItem { id: string; label: string; section: string; done: boolean; doneBy: string | null; doneAt: string | null; }
export interface ChecklistRun {
  id: string; templateId: string; templateName: string; runDate: string;
  items: ChecklistItem[]; signedOffBy: string | null; signedOffAt: string | null;
}
export interface ChecklistRepository {
  getTodayRun(templateId: string): Promise<ChecklistRun>;
  toggleItem(runId: string, itemId: string, actor: string): Promise<ChecklistRun>;
  managerSignOff(runId: string, actor: string): Promise<ChecklistRun>;
}

// ── Protein conversions / meat calc ───────────────────────────────────────
export interface ProteinConversion { id: string; protein: string; rawUnit: string; cookedYieldLbsPerUnit: number; portionsPerCookedLb: number; notes: string | null; }
export interface ProteinRepository { list(): Promise<ProteinConversion[]>; }

// ── Prep recipes ──────────────────────────────────────────────────────────
export interface PrepRecipe {
  id: string; name: string; category: PrepCategory; yieldQty: number; yieldUnit: string;
  ingredients: Array<{ id: string; name: string; qty: number; unit: string }>;
  steps: string[]; updatedAt: string;
}
export interface PrepRecipeRepository {
  list(): Promise<PrepRecipe[]>;
  upsert(recipe: Omit<PrepRecipe, "updatedAt">, actor: string): Promise<PrepRecipe>;
  remove(id: string, actor: string): Promise<void>;
}

// ── Calendar ──────────────────────────────────────────────────────────────
export interface CalendarEvent { id: string; date: string; title: string; kind: "catering" | "fire_drop" | "cuban_thursday" | "retail" | "holiday"; orderId: string | null; }
export interface CalendarRepository { eventsForMonth(yearMonth: string): Promise<CalendarEvent[]>; }

// ── Pit: smoker forecast ──────────────────────────────────────────────────
export interface SmokerEntry { id: string; date: string; protein: string; rawLbs: number; smoker: string; loadTime: string; targetDone: string; locked: boolean; }
export interface SmokerForecastRepository {
  week(startDate: string): Promise<SmokerEntry[]>;
  upsert(entry: Omit<SmokerEntry, "id"> & { id?: string }, actor: string): Promise<SmokerEntry>;
  remove(id: string, actor: string): Promise<void>;
  autoFillFromDemand(startDate: string, actor: string): Promise<SmokerEntry[]>;
  lockDay(date: string, actor: string): Promise<void>;
}

// ── Pit: smoked inventory ─────────────────────────────────────────────────
export interface SmokeBatch { id: string; date: string; protein: string; rawLbs: number; cookedLbs: number; smoker: string; loggedBy: string; loggedAt: string; }
export interface SmokedInventoryRepository {
  summary(): Promise<Array<{ protein: string; cookedLbsOnHand: number; batches: number; lastBatchAt: string | null }>>;
  batches(): Promise<SmokeBatch[]>;
  logBatch(b: Omit<SmokeBatch, "id" | "loggedAt">): Promise<SmokeBatch>;
}

// ── Pit: pitmaster guide ──────────────────────────────────────────────────
export interface GuideStep { id: string; order: number; title: string; detail: string; tempF: number | null; durationMin: number | null; }
export interface PitmasterProtein { id: string; slug: string; name: string; targetInternalF: number; smokerTempF: number; estHoursPerLb: number; restMin: number; woods: string; steps: GuideStep[]; }
export interface PitmasterRepository {
  proteins(): Promise<PitmasterProtein[]>;
  upsertStep(proteinId: string, step: Omit<GuideStep, "id"> & { id?: string }, actor: string): Promise<PitmasterProtein>;
  removeStep(proteinId: string, stepId: string, actor: string): Promise<PitmasterProtein>;
}

// ── Pit: meat costs ───────────────────────────────────────────────────────
export interface MeatCost { id: string; protein: string; vendor: string; costPerLbCents: number; caseLbs: number; yieldPct: number; updatedAt: string; }
export interface MeatCostsRepository {
  list(): Promise<MeatCost[]>;
  upsert(mc: Omit<MeatCost, "updatedAt">, actor: string): Promise<MeatCost>;
  remove(id: string, actor: string): Promise<void>;
}

// ── Pit: daily checklist ──────────────────────────────────────────────────
export interface PitTask { id: string; label: string; protein: string | null; targetLbs: number | null; done: boolean; doneAt: string | null; }
export interface PitChecklistRepository {
  today(): Promise<{ id: string; date: string; tasks: PitTask[] }>;
  toggle(taskId: string, actor: string): Promise<void>;
  syncFromForecast(actor: string): Promise<void>;
  addTask(label: string, actor: string): Promise<void>;
}

// ── Retail daily fire sheet ───────────────────────────────────────────────
export type RetailItemStatus = "queued" | "firing" | "in_case" | "sold_out_86";
export interface RetailFireItem { id: string; name: string; unit: string; qty: number; status: RetailItemStatus; updatedAt: string; }
export interface RetailSession { id: string; serviceDate: string; submittedToKitchenAt: string | null; items: RetailFireItem[]; }
export interface RetailFireSheetRepository {
  getSession(): Promise<RetailSession>;
  addItem(input: { name: string; unit: string; qty: number }, actor: string): Promise<RetailFireItem>;
  updateItemStatus(itemId: string, status: RetailItemStatus, actor: string): Promise<RetailFireItem>;
  updateItemQty(itemId: string, qty: number, actor: string): Promise<RetailFireItem>;
  removeItem(itemId: string, actor: string): Promise<void>;
  submitToKitchen(actor: string): Promise<RetailSession>;
  syncFromPar(actor: string): Promise<RetailSession>;
}

// ── Retail preorders (Fire Drop + Cuban Thursday customer orders) ─────────
export type PreorderStatus = "pending" | "paid" | "ready" | "picked_up" | "cancelled" | "refunded";
export interface Preorder {
  id: string; orderRef: string; channel: "fire_drop" | "cuban_thursday";
  customer: string; phone: string; email: string;
  pickupDate: string; pickupWindow: string;
  items: Array<{ id: string; name: string; qty: number; unitPriceCents: number }>;
  subtotalCents: number; taxCents: number; totalCents: number;
  status: PreorderStatus; hidden: boolean;
  statusHistory: Array<{ from: PreorderStatus | null; to: PreorderStatus; at: string; actor: string }>;
  createdAt: string; updatedAt: string;
}
export interface PreordersRepository {
  list(filter?: { channel?: "fire_drop" | "cuban_thursday" | "all"; status?: PreorderStatus | "all"; includeHidden?: boolean }): Promise<Preorder[]>;
  updateStatus(id: string, status: PreorderStatus, actor: string): Promise<Preorder>;
  setHidden(id: string, hidden: boolean, actor: string): Promise<Preorder>;
  createManual(input: { channel: "fire_drop" | "cuban_thursday"; customer: string; phone: string; email: string; pickupDate: string; pickupWindow: string; items: Array<{ name: string; qty: number; unitPriceCents: number }> }, actor: string): Promise<Preorder>;
  stats(): Promise<{ activeCount: number; fridayCount: number; saturdayCount: number; activeRevenueCents: number }>;
}

// ── Temp log ──────────────────────────────────────────────────────────────
export interface TempCheck { id: string; station: string; tempF: number; withinRange: boolean; rangeNote: string; takenBy: string; takenAt: string; }
export interface TempLogRepository {
  stations(): Array<{ name: string; minF: number | null; maxF: number | null; note: string }>;
  todayChecks(): Promise<TempCheck[]>;
  submitCheck(station: string, tempF: number, actor: string): Promise<TempCheck>;
}

// ── Fire Drop admin ───────────────────────────────────────────────────────
export interface FireDropProduct { id: string; name: string; priceCents: number; capQty: number | null; soldQty: number; soldOut: boolean; sortOrder: number; }
export interface FireDropSlot { id: string; day: "friday" | "saturday"; window: string; capacity: number; booked: number; }
export interface FireDrop {
  id: string; title: string; fridayDate: string; saturdayDate: string; soldOut: boolean;
  products: FireDropProduct[]; slots: FireDropSlot[];
}
export interface FireDropRepository {
  currentDrop(): Promise<FireDrop>;
  updateDrop(patch: { title?: string; soldOut?: boolean }, actor: string): Promise<FireDrop>;
  upsertProduct(p: Omit<FireDropProduct, "soldQty"> & { id?: string }, actor: string): Promise<FireDrop>;
  removeProduct(productId: string, actor: string): Promise<FireDrop>;
  toggleProductSoldOut(productId: string, actor: string): Promise<FireDrop>;
  upsertSlot(s: Omit<FireDropSlot, "booked"> & { id?: string }, actor: string): Promise<FireDrop>;
  removeSlot(slotId: string, actor: string): Promise<FireDrop>;
  orderingStatus(): { friday: boolean; saturday: boolean };
}
