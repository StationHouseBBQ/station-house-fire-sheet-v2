/**
 * Domain types + repository interfaces. UI imports these — never an adapter
 * directly and never a database client. Interfaces mirror the Manus tRPC
 * surface documented in docs/PARITY_MATRIX.md, translated to V2 naming.
 */
import type { Phase1Repos } from "./supabase/phase1-repos";
import type { ConnectionCheck } from "./supabase/client";

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
  /**
   * Phase 1 Supabase repos — present ONLY when mode === "supabase".
   * Optional so the demo Dal (and every existing demo test) is unaffected.
   * See src/dal/supabase/adapter.ts for the Phase-1 model.
   */
  phase1?: { repos: Phase1Repos; checkConnection: () => Promise<ConnectionCheck> };
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
  packing: PackingRepository;
  supplies: SuppliesRepository;
  deliveries: DeliveriesRepository;
  leads: LeadsRepository;
  quotes: QuotesRepository;
  contacts: ContactsRepository;
  venues: VenuesRepository;
  companies: CompaniesRepository;
  portalAdmin: PortalAdminRepository;
  equipment: EquipmentRepository;
  cockpit: CockpitRepository;
  marketing: MarketingRepository;
  menu: MenuRepository;
  users: UsersRepository;
  discounts: DiscountsRepository;
  events: EventsRepository;
  orderGuide: OrderGuideRepository;
  prepTemplates: PrepTemplatesRepository;
  samplers: SamplersRepository;
  settings: SettingsRepository;
  imports: ImportsRepository;
  publicCheckout: PublicCheckoutRepository;
  portal: PortalRepository;
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
  weekDates(offsetWeeks?: number): Promise<string[]>; // 7 ET service dates (Mon–Sun), offset in whole weeks
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
export interface ProteinRepository {
  list(): Promise<ProteinConversion[]>;
  upsert(pc: Omit<ProteinConversion, "id"> & { id?: string }, actor: string): Promise<ProteinConversion>;
  remove(id: string, actor: string): Promise<void>;
}

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
  /** Replaces the item lines; totals are recomputed server-side style. */
  updateItems(id: string, items: Array<{ name: string; qty: number; unitPriceCents: number }>, actor: string): Promise<Preorder>;
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

// ── Packing ───────────────────────────────────────────────────────────────
export interface PackItem { id: string; label: string; done: boolean; }
export interface PackJob {
  id: string; orderId: string; orderRef: string; customer: string; serviceDate: string;
  timeWindow: string; channel: OrderChannel; items: OrderItem[];
  checklist: PackItem[]; packedAt: string | null; packedBy: string | null;
}
export interface PackingRepository {
  queue(): Promise<PackJob[]>;                       // unpacked, today + upcoming
  packedToday(): Promise<PackJob[]>;
  toggleChecklistItem(jobId: string, itemId: string, actor: string): Promise<PackJob>;
  confirmPacked(jobId: string, actor: string): Promise<PackJob>;
  /** Reverses confirmPacked; requires a reason (audited operational event). */
  unpack(jobId: string, reason: string, actor: string): Promise<PackJob>;
}
export interface SupplyItem { id: string; name: string; unit: string; onHand: number; parLevel: number; perOrderUsage: number; }
export interface SuppliesRepository {
  list(): Promise<SupplyItem[]>;
  adjust(id: string, delta: number, actor: string): Promise<SupplyItem>;
  upsert(item: Omit<SupplyItem, "id"> & { id?: string }, actor: string): Promise<SupplyItem>;
  forecast(): Promise<Array<{ item: SupplyItem; weekNeed: number; gap: number }>>;
}
export type DeliveryStatus = "assigned" | "loaded" | "en_route" | "delivered";
export interface Delivery {
  id: string; orderId: string; orderRef: string; customer: string; address: string;
  serviceDate: string; window: string; driver: string | null; status: DeliveryStatus; notes: string | null;
}
export interface DeliveriesRepository {
  drivers(): string[];
  list(): Promise<Delivery[]>;
  assignDriver(id: string, driver: string, actor: string): Promise<Delivery>;
  advance(id: string, actor: string): Promise<Delivery>;
  setStatus(id: string, status: DeliveryStatus, actor: string): Promise<Delivery>;
  updateNotes(id: string, notes: string, actor: string): Promise<Delivery>;
}

// ── Catering / Sales ──────────────────────────────────────────────────────
export type LeadStage = "new" | "contacted" | "needs_quote" | "quote_sent" | "booked" | "follow_up" | "lost";
export type LeadPriority = "low" | "normal" | "high" | "urgent";
export interface Lead {
  id: string; name: string; company: string | null; email: string; phone: string;
  eventType: string; eventDate: string | null; guests: number | null; budgetCents: number | null;
  stage: LeadStage; priority: LeadPriority; source: string;
  utm: { source: string | null; medium: string | null; campaign: string | null; gclid: string | null; fbclid: string | null; referrer: string | null; landingPage: string | null };
  notes: string | null; createdAt: string; updatedAt: string;
  activity: Array<{ id: string; kind: string; body: string; actor: string; at: string }>;
}
export interface LeadsRepository {
  list(): Promise<Lead[]>;
  create(input: Omit<Lead, "id" | "stage" | "priority" | "createdAt" | "updatedAt" | "activity"> & { stage?: LeadStage }, actor: string): Promise<Lead>;
  updateStage(id: string, stage: LeadStage, actor: string): Promise<Lead>;
  updatePriority(id: string, priority: LeadPriority, actor: string): Promise<Lead>;
  logActivity(id: string, kind: string, body: string, actor: string): Promise<Lead>;
}
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "invoiced" | "paid";
export interface QuoteLine { id: string; name: string; qty: number; unitPriceCents: number; }
export interface Quote {
  id: string; quoteRef: string; publicToken: string; kind: "quote" | "invoice"; leadId: string | null; customer: string;
  eventDate: string | null; lines: QuoteLine[]; subtotalCents: number; taxCents: number; totalCents: number;
  status: QuoteStatus; createdAt: string; updatedAt: string;
}
export interface QuotesRepository {
  list(): Promise<Quote[]>;
  create(input: { kind: "quote" | "invoice"; leadId: string | null; customer: string; eventDate: string | null; lines: Array<Omit<QuoteLine, "id">> }, actor: string): Promise<Quote>;
  updateStatus(id: string, status: QuoteStatus, actor: string): Promise<Quote>;
  convertToInvoice(id: string, actor: string): Promise<Quote>;
  /** Public quote accept flow (token-addressed, no login). */
  byToken(token: string): Promise<Quote | null>;
  respondByToken(token: string, response: "accepted" | "declined"): Promise<Quote>;
}
export interface Contact { id: string; name: string; company: string | null; email: string; phone: string; tags: string[]; notes: string | null; updatedAt: string; }
export interface ContactsRepository {
  list(): Promise<Contact[]>;
  upsert(c: Omit<Contact, "updatedAt"> & { id?: string }, actor: string): Promise<Contact>;
  remove(id: string, actor: string): Promise<void>;
}
export interface Venue { id: string; name: string; address: string; contactName: string; phone: string; capacity: number | null; loadInNotes: string | null; updatedAt: string; }
export interface VenuesRepository {
  list(): Promise<Venue[]>;
  upsert(v: Omit<Venue, "updatedAt"> & { id?: string }, actor: string): Promise<Venue>;
  remove(id: string, actor: string): Promise<void>;
}
export interface Company { id: string; name: string; industry: string | null; contactIds: string[]; portalEnabled: boolean; notes: string | null; updatedAt: string; }
export interface CompaniesRepository {
  list(): Promise<Company[]>;
  upsert(c: Omit<Company, "updatedAt"> & { id?: string }, actor: string): Promise<Company>;
}
export type PortalOrderStatus = "pending_approval" | "approved" | "rejected" | "changes_requested" | "invoiced" | "paid";
export interface PortalOrder {
  id: string; ref: string; companyId: string; companyName: string; requestedBy: string;
  eventDate: string; items: Array<{ id: string; name: string; qty: number; unitPriceCents: number }>;
  subtotalCents: number; taxCents: number; totalCents: number;
  status: PortalOrderStatus; adminNote: string | null; createdAt: string; updatedAt: string;
}
export interface PortalAdminRepository {
  orders(filter?: { status?: PortalOrderStatus | "all" }): Promise<PortalOrder[]>;
  pendingCount(): Promise<number>;
  approve(id: string, actor: string): Promise<PortalOrder>;
  reject(id: string, note: string, actor: string): Promise<PortalOrder>;
  requestChanges(id: string, note: string, actor: string): Promise<PortalOrder>;
  markPaid(id: string, actor: string): Promise<PortalOrder>;
  toggleCompanyPortal(companyId: string, actor: string): Promise<Company>;
}
export interface EquipmentItem { id: string; name: string; category: string; qtyOwned: number; perGuestRatio: number | null; notes: string | null; }
export interface EquipmentRepository { list(): Promise<EquipmentItem[]>; upsert(e: Omit<EquipmentItem, "id"> & { id?: string }, actor: string): Promise<EquipmentItem>; }
export interface CockpitData {
  kpis: { pipelineValueCents: number; openLeads: number; bookedThisMonth: number; pendingApprovals: number; unpaidInvoicesCents: number };
  redZone: Array<{ leadOrQuoteId: string; label: string; eventDate: string; issues: string[] }>;
  upcoming: Array<{ id: string; customer: string; eventDate: string; guests: number | null; status: string }>;
  winsThisWeek: Array<{ id: string; label: string; at: string }>;
}
export interface CockpitRepository { data(): Promise<CockpitData>; }

// ── Marketing ─────────────────────────────────────────────────────────────
export interface LandingPage { id: string; slug: string; title: string; kind: string; status: "live" | "draft"; conversions: number; visits: number; }
export type PostStatus = "idea" | "drafted" | "scheduled" | "posted";
export interface ContentPost { id: string; date: string; platform: string; title: string; body: string; status: PostStatus; updatedAt: string; }
export interface MediaAsset { id: string; name: string; kind: "photo" | "video" | "graphic"; tags: string[]; addedAt: string; }
export interface OutreachTarget { id: string; business: string; contact: string; email: string; stage: "identified" | "contacted" | "responded" | "meeting" | "won" | "lost"; lastTouch: string | null; notes: string | null; }
export interface PerfRow { id: string; platform: string; metric: string; value: number; period: string; }
export interface AdCampaign { id: string; platform: string; name: string; status: "active" | "paused" | "ended"; spendCents: number; leads: number; costPerLeadCents: number; }
export interface CreativeBrief { id: string; kind: "content" | "design" | "video" | "ads"; title: string; brief: string; status: "queued" | "in_review" | "approved" | "done"; createdAt: string; }
export interface MarketingRepository {
  landingPages(): Promise<LandingPage[]>;
  attributionSummary(): Promise<Array<{ source: string; leads: number; bookedCents: number }>>;
  posts(): Promise<ContentPost[]>;
  upsertPost(p: Omit<ContentPost, "updatedAt"> & { id?: string }, actor: string): Promise<ContentPost>;
  removePost(id: string, actor: string): Promise<void>;
  media(): Promise<MediaAsset[]>;
  addMedia(m: Omit<MediaAsset, "id" | "addedAt">, actor: string): Promise<MediaAsset>;
  outreach(): Promise<OutreachTarget[]>;
  upsertOutreach(t: Omit<OutreachTarget, "id"> & { id?: string }, actor: string): Promise<OutreachTarget>;
  performance(): Promise<PerfRow[]>;
  adCampaigns(): Promise<AdCampaign[]>;
  updateCampaignStatus(id: string, status: AdCampaign["status"], actor: string): Promise<AdCampaign>;
  briefs(kind: CreativeBrief["kind"]): Promise<CreativeBrief[]>;
  upsertBrief(b: Omit<CreativeBrief, "createdAt"> & { id?: string }, actor: string): Promise<CreativeBrief>;
}

// ── Admin ─────────────────────────────────────────────────────────────────
export interface MenuCategory { id: string; name: string; sortOrder: number; active: boolean; }
export interface MenuItem {
  id: string; categoryId: string; name: string; description: string; priceCents: number;
  active: boolean; thursdayOnly: boolean; sortOrder: number; updatedAt: string;
}
export interface MenuRepository {
  categories(): Promise<MenuCategory[]>;
  items(): Promise<MenuItem[]>;
  upsertItem(i: Omit<MenuItem, "updatedAt"> & { id?: string }, actor: string): Promise<MenuItem>;
  toggleItemActive(id: string, actor: string): Promise<MenuItem>;
  upsertCategory(c: MenuCategory & { id?: string }, actor: string): Promise<MenuCategory>;
}
export interface AppUser { id: string; name: string; email: string; role: RoleIdLike; active: boolean; invitedAt: string; }
export type RoleIdLike = "owner_admin" | "catering_director" | "kitchen" | "counter_foh" | "packing";
export interface UsersRepository {
  list(): Promise<AppUser[]>;
  upsert(u: Omit<AppUser, "invitedAt"> & { id?: string }, actor: string): Promise<AppUser>;
  toggleActive(id: string, actor: string): Promise<AppUser>;
}
export interface DiscountCode { id: string; code: string; kind: "percent" | "fixed_cents"; value: number; active: boolean; usedCount: number; expiresAt: string | null; }
export interface DiscountsRepository {
  list(): Promise<DiscountCode[]>;
  upsert(d: Omit<DiscountCode, "usedCount"> & { id?: string }, actor: string): Promise<DiscountCode>;
  remove(id: string, actor: string): Promise<void>;
}
export interface SpecialEvent {
  id: string; slug: string; name: string; landingEnabled: boolean; orderingEnabled: boolean;
  eventDate: string | null; menuItemIds: string[]; notes: string | null; updatedAt: string;
}
export interface EventsRepository {
  list(): Promise<SpecialEvent[]>;
  upsert(e: Omit<SpecialEvent, "updatedAt"> & { id?: string }, actor: string): Promise<SpecialEvent>;
}
export interface OrderGuideRow { id: string; item: string; vendor: string; unit: string; parQty: number; onHand: number; orderQty: number; }
export interface OrderGuideRepository {
  rows(): Promise<OrderGuideRow[]>;
  upsert(r: Omit<OrderGuideRow, "id"> & { id?: string }, actor: string): Promise<OrderGuideRow>;
  setOnHand(id: string, onHand: number, actor: string): Promise<OrderGuideRow>;
  remove(id: string, actor: string): Promise<void>;
}
export interface PrepTemplateRow { id: string; name: string; category: PrepCategory; unit: string; parQty: number; thursdayOnly: boolean; active: boolean; }
export interface PrepTemplatesRepository {
  list(): Promise<PrepTemplateRow[]>;
  upsert(t: Omit<PrepTemplateRow, "id"> & { id?: string }, actor: string): Promise<PrepTemplateRow>;
  toggleActive(id: string, actor: string): Promise<PrepTemplateRow>;
}
export interface SamplerConfig { id: string; name: string; priceCents: number; proteins: string[]; active: boolean; }
export interface SamplersRepository {
  list(): Promise<SamplerConfig[]>;
  upsert(s: SamplerConfig & { id?: string }, actor: string): Promise<SamplerConfig>;
  allowedProteins(): string[];   // pulled pork, brisket, sausage, ribs, chicken quarters ONLY
}
export interface SettingsRepository {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T, actor: string): Promise<void>;
}
export interface ImportJob { id: string; source: string; kind: string; status: "queued" | "needs_review" | "imported" | "failed"; rows: number; createdAt: string; }
export interface ImportsRepository { list(): Promise<ImportJob[]>; }

// ── Public checkout (demo analog of the server-side checkout Edge Function) ──
export interface PublicCheckoutInput {
  channel: "fire_drop" | "cuban_thursday";
  day: "friday" | "saturday" | "thursday";
  slotId: string | null;                       // required for fire_drop
  items: Array<{ productId: string; qty: number }>;   // fire_drop: product ids; cuban: menu item ids
  customer: { name: string; phone: string; email: string };
  attribution: Record<string, string | null> | null;
}
export interface PublicCheckoutResult { orderRef: string; totalCents: number; pickupDate: string; pickupWindow: string; }
export interface PublicCheckoutRepository {
  /**
   * Demo analog of create-checkout: validates ordering windows (ET), product
   * caps / sold-out flags, slot capacity, and recomputes all prices/tax
   * server-side style. Client-provided prices are never accepted.
   */
  checkout(input: PublicCheckoutInput): Promise<PublicCheckoutResult>;
  trackByRef(ref: string): Promise<Preorder | null>;
}

// ── Client portal (company-facing) ───────────────────────────────────────
export interface PortalRepository {
  companies(): Promise<Company[]>;   // portal-enabled only
  ordersForCompany(companyId: string): Promise<PortalOrder[]>;
  createRequest(companyId: string, eventDate: string, items: Array<{ name: string; qty: number; unitPriceCents: number }>, requestedBy: string): Promise<PortalOrder>;
}
