/**
 * Demo repositories for the catering / sales vertical: leads, quotes &
 * invoices, contacts, venues, companies, B2B portal admin, equipment and
 * the sales cockpit. Money math always flows through orderTotals (integer
 * cents, 7.5% tax) — client-supplied totals are never trusted.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { todayEt } from "./domains";
import { orderTotals } from "../../lib/money";
import type {
  AuditRepository, CockpitData, CockpitRepository, CompaniesRepository, Company, Contact,
  ContactsRepository, EquipmentItem, EquipmentRepository, Lead, LeadPriority, LeadStage,
  LeadsRepository, PortalAdminRepository, PortalOrder, PortalOrderStatus, Quote, QuoteStatus,
  QuotesRepository, Venue, VenuesRepository,
} from "../types";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysAgoIso(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ── Leads ─────────────────────────────────────────────────────────────────
const LEADS = "leads.v1";
type Utm = Lead["utm"];
function utm(o: Partial<Utm> = {}): Utm {
  return { source: null, medium: null, campaign: null, gclid: null, fbclid: null, referrer: null, landingPage: null, ...o };
}

function seedLeads(): Lead[] {
  const t = todayEt();
  const mk = (over: Omit<Lead, "id" | "createdAt" | "updatedAt" | "activity"> & { createdDaysAgo: number; activity?: Lead["activity"] }): Lead => {
    const { createdDaysAgo, activity, ...rest } = over;
    const created = daysAgoIso(createdDaysAgo);
    return {
      id: uid(), ...rest, createdAt: created, updatedAt: created,
      activity: activity ?? [{ id: uid(), kind: "system", body: "Lead created", actor: "demo-seed", at: created }],
    };
  };
  return [
    mk({
      name: "Rachel Nguyen", company: null, email: "rachel.nguyen@gmail.com", phone: "(813) 555-0134",
      eventType: "Corporate lunch", eventDate: addDays(t, 21), guests: 45, budgetCents: 135000,
      stage: "new", priority: "normal", source: "google",
      utm: utm({ source: "google", medium: "cpc", campaign: "catering-tampa", gclid: "Cj0KCQdemo134", landingPage: "/catering-landing" }),
      notes: "Found us searching \"bbq catering tampa\". Wants brisket + pulled pork buffet.", createdDaysAgo: 1,
    }),
    mk({
      name: "Devon Price", company: "Tampa Tech Co.", email: "devon.price@tampatech.co", phone: "(813) 555-0177",
      eventType: "Office holiday party", eventDate: addDays(t, 45), guests: 120, budgetCents: 420000,
      stage: "contacted", priority: "high", source: "referral",
      utm: utm({ referrer: "bayfront-realty" }),
      notes: "Referred by Bayfront Realty. Prefers Thursday tasting.", createdDaysAgo: 4,
    }),
    mk({
      name: "Carmen Delgado", company: null, email: "carmen.delgado@yahoo.com", phone: "(813) 555-0155",
      eventType: "Quinceañera", eventDate: addDays(t, 30), guests: 85, budgetCents: 260000,
      stage: "needs_quote", priority: "normal", source: "facebook",
      utm: utm({ source: "facebook", medium: "paid_social", campaign: "summer-events", fbclid: "IwARdemo155", landingPage: "/catering-request" }),
      notes: "Wants ribs, chicken quarters, mac & cheese. Ybor venue.", createdDaysAgo: 6,
    }),
    mk({
      name: "Greg Halvorsen", company: "Bayfront Realty", email: "greg@bayfrontrealty.com", phone: "(813) 555-0119",
      eventType: "Client appreciation dinner", eventDate: addDays(t, 14), guests: 60, budgetCents: 210000,
      stage: "quote_sent", priority: "normal", source: "organic",
      utm: utm({ source: "google", medium: "organic", landingPage: "/catering-landing" }),
      notes: "Quote sent, awaiting signature. Curtis Hixon Park pavilion.", createdDaysAgo: 9,
    }),
    mk({
      name: "Alicia Fontaine", company: null, email: "alicia.fontaine@gmail.com", phone: "(813) 555-0188",
      eventType: "Wedding rehearsal dinner", eventDate: addDays(t, 4), guests: 40, budgetCents: null,
      stage: "booked", priority: "urgent", source: "google",
      utm: utm({ source: "google", medium: "cpc", campaign: "catering-tampa", gclid: "Cj0KCQdemo188", landingPage: "/catering-landing" }),
      notes: "Booked — Armature Works. Budget TBD with planner; confirm final count.", createdDaysAgo: 12,
      activity: [
        { id: uid(), kind: "system", body: "Lead created", actor: "demo-seed", at: daysAgoIso(12) },
        { id: uid(), kind: "stage", body: "Stage → quote_sent", actor: "demo-sales", at: daysAgoIso(8) },
        { id: uid(), kind: "stage", body: "Stage → booked", actor: "demo-sales", at: daysAgoIso(2) },
      ],
    }),
    mk({
      name: "Monique Baptiste", company: "Seminole Little League", email: "monique@seminolell.org", phone: "(813) 555-0142",
      eventType: "End-of-season banquet", eventDate: addDays(t, 60), guests: 150, budgetCents: 300000,
      stage: "follow_up", priority: "low", source: "direct",
      utm: utm({ landingPage: "/catering-request" }),
      notes: "Called in directly. Board votes on budget next month — follow up.", createdDaysAgo: 15,
    }),
  ];
}

export class DemoLeads implements LeadsRepository {
  constructor(private audit: AuditRepository) {}

  async list(): Promise<Lead[]> {
    return (await loadCol(LEADS, seedLeads)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async create(input: Omit<Lead, "id" | "stage" | "priority" | "createdAt" | "updatedAt" | "activity"> & { stage?: LeadStage }, actor: string): Promise<Lead> {
    if (!input.name.trim()) throw new Error("Name is required");
    const rows = await loadCol(LEADS, seedLeads);
    const now = nowIso();
    const lead: Lead = {
      ...input, id: uid(), name: input.name.trim(),
      stage: input.stage ?? "new", priority: "normal",
      createdAt: now, updatedAt: now,
      activity: [{ id: uid(), kind: "system", body: "Lead created", actor, at: now }],
    };
    rows.push(lead);
    await saveCol(LEADS, rows);
    await this.audit.log({ actor, action: "lead.create", entity: "lead", entityId: lead.name, before: null, after: lead });
    return lead;
  }

  private async mutate(id: string, actor: string, fn: (l: Lead) => void, action: string): Promise<Lead> {
    const rows = await loadCol(LEADS, seedLeads);
    const l = rows.find(r => r.id === id);
    if (!l) throw new Error("Lead not found");
    const before = JSON.parse(JSON.stringify(l));
    fn(l);
    l.updatedAt = nowIso();
    await saveCol(LEADS, rows);
    await this.audit.log({ actor, action, entity: "lead", entityId: l.name, before, after: JSON.parse(JSON.stringify(l)) });
    return { ...l };
  }

  updateStage(id: string, stage: LeadStage, actor: string): Promise<Lead> {
    return this.mutate(id, actor, l => {
      l.stage = stage;
      l.activity.push({ id: uid(), kind: "stage", body: `Stage → ${stage}`, actor, at: nowIso() });
    }, "lead.stage");
  }

  updatePriority(id: string, priority: LeadPriority, actor: string): Promise<Lead> {
    return this.mutate(id, actor, l => { l.priority = priority; }, "lead.priority");
  }

  logActivity(id: string, kind: string, body: string, actor: string): Promise<Lead> {
    return this.mutate(id, actor, l => {
      l.activity.push({ id: uid(), kind, body, actor, at: nowIso() });
    }, "lead.activity");
  }
}

// ── Quotes / invoices ─────────────────────────────────────────────────────
const QUOTES = "quotes.v1";

function quoteWith(kind: "quote" | "invoice", ref: string, customer: string, eventDate: string | null, status: QuoteStatus, lines: Array<[string, number, number]>, createdDaysAgo: number): Quote {
  const qLines = lines.map(([name, qty, unitPriceCents]) => ({ id: uid(), name, qty, unitPriceCents }));
  const t = orderTotals(qLines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
  const created = daysAgoIso(createdDaysAgo);
  return { id: uid(), quoteRef: ref, kind, leadId: null, customer, eventDate, lines: qLines, ...t, status, createdAt: created, updatedAt: created };
}

function seedQuotes(): Quote[] {
  const t = todayEt();
  return [
    quoteWith("quote", "Q-1021", "Carmen Delgado", addDays(t, 30), "draft", [
      ["St. Louis Ribs (full rack)", 20, 3200], ["Chicken Quarters", 40, 750], ["Mac & Cheese (1/2 pan)", 8, 3500], ["Coleslaw (quart)", 10, 900],
    ], 3),
    quoteWith("quote", "Q-1019", "Greg Halvorsen — Bayfront Realty", addDays(t, 14), "sent", [
      ["Pulled Pork (per lb)", 30, 1800], ["Brisket (per lb)", 25, 2600], ["Collard Greens (1/2 pan)", 6, 3200], ["Banana Pudding", 60, 500],
    ], 8),
    quoteWith("invoice", "INV-1017", "Tampa Tech Co.", addDays(t, -6), "invoiced", [
      ["Catering buffet — 80 guests", 80, 2450], ["Delivery & setup", 1, 15000],
    ], 20),
    quoteWith("invoice", "INV-1012", "Ybor Social Club", addDays(t, -18), "paid", [
      ["Catering buffet — 50 guests", 50, 2250], ["Sampler trays", 10, 3400],
    ], 32),
  ];
}

export class DemoQuotes implements QuotesRepository {
  constructor(private audit: AuditRepository) {}

  async list(): Promise<Quote[]> {
    return (await loadCol(QUOTES, seedQuotes)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  private nextRef(kind: "quote" | "invoice", rows: Quote[]): string {
    const prefix = kind === "quote" ? "Q" : "INV";
    const date = todayEt().replace(/-/g, "");
    const n = rows.filter(r => r.kind === kind).length + 1;
    return `${prefix}-${date}-${n}`;
  }

  async create(input: { kind: "quote" | "invoice"; leadId: string | null; customer: string; eventDate: string | null; lines: Array<{ name: string; qty: number; unitPriceCents: number }> }, actor: string): Promise<Quote> {
    if (!input.customer.trim()) throw new Error("Customer is required");
    if (!input.lines.length) throw new Error("At least one line is required");
    const rows = await loadCol(QUOTES, seedQuotes);
    const lines = input.lines.map(l => ({ id: uid(), name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents }));
    // Totals are always recomputed server-side; passed totals are never trusted.
    const totals = orderTotals(lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
    const now = nowIso();
    const q: Quote = {
      id: uid(), quoteRef: this.nextRef(input.kind, rows), kind: input.kind,
      leadId: input.leadId, customer: input.customer.trim(), eventDate: input.eventDate,
      lines, ...totals, status: input.kind === "invoice" ? "invoiced" : "draft",
      createdAt: now, updatedAt: now,
    };
    rows.push(q);
    await saveCol(QUOTES, rows);
    await this.audit.log({ actor, action: "quote.create", entity: "quote", entityId: q.quoteRef, before: null, after: q });
    return q;
  }

  async updateStatus(id: string, status: QuoteStatus, actor: string): Promise<Quote> {
    const rows = await loadCol(QUOTES, seedQuotes);
    const q = rows.find(r => r.id === id);
    if (!q) throw new Error("Quote not found");
    const before = { ...q };
    q.status = status;
    q.updatedAt = nowIso();
    await saveCol(QUOTES, rows);
    await this.audit.log({ actor, action: "quote.status", entity: "quote", entityId: q.quoteRef, before, after: { ...q } });
    return { ...q };
  }

  async convertToInvoice(id: string, actor: string): Promise<Quote> {
    const rows = await loadCol(QUOTES, seedQuotes);
    const q = rows.find(r => r.id === id);
    if (!q) throw new Error("Quote not found");
    if (q.kind !== "quote") throw new Error("Only quotes can be converted to invoices");
    const lines = q.lines.map(l => ({ ...l, id: uid() }));
    const totals = orderTotals(lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));
    const now = nowIso();
    const inv: Quote = {
      ...q, id: uid(), quoteRef: this.nextRef("invoice", rows), kind: "invoice",
      lines, ...totals, status: "invoiced", createdAt: now, updatedAt: now,
    };
    q.status = "accepted";
    q.updatedAt = now;
    rows.push(inv);
    await saveCol(QUOTES, rows);
    await this.audit.log({ actor, action: "quote.convert", entity: "quote", entityId: q.quoteRef, before: { status: "sent" }, after: { invoice: inv.quoteRef } });
    return inv;
  }
}

// ── Contacts ──────────────────────────────────────────────────────────────
const CONTACTS = "contacts.v1";
function seedContacts(): Contact[] {
  const mk = (name: string, company: string | null, email: string, phone: string, tags: string[], notes: string | null): Contact =>
    ({ id: uid(), name, company, email, phone, tags, notes, updatedAt: nowIso() });
  return [
    mk("Devon Price", "Tampa Tech Co.", "devon.price@tampatech.co", "(813) 555-0177", ["b2b", "portal"], "Main office contact"),
    mk("Greg Halvorsen", "Bayfront Realty", "greg@bayfrontrealty.com", "(813) 555-0119", ["b2b", "repeat"], null),
    mk("Monique Baptiste", "Seminole Little League", "monique@seminolell.org", "(813) 555-0142", ["nonprofit"], "Banquet coordinator"),
    mk("Alicia Fontaine", null, "alicia.fontaine@gmail.com", "(813) 555-0188", ["wedding"], "Planner: Ever After Events"),
    mk("Rosa Jimenez", "Armature Works", "rosa@armatureworks.com", "(813) 555-0163", ["venue"], "Events manager — load-in via north dock"),
  ];
}
export class DemoContacts implements ContactsRepository {
  constructor(private audit: AuditRepository) {}
  async list(): Promise<Contact[]> {
    return (await loadCol(CONTACTS, seedContacts)).sort((a, b) => a.name.localeCompare(b.name));
  }
  async upsert(c: Omit<Contact, "updatedAt"> & { id?: string }, actor: string): Promise<Contact> {
    if (!c.name.trim()) throw new Error("Name is required");
    const rows = await loadCol(CONTACTS, seedContacts);
    const existing = c.id ? rows.find(r => r.id === c.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, c, { name: c.name.trim(), updatedAt: nowIso() });
      await saveCol(CONTACTS, rows);
      await this.audit.log({ actor, action: "contact.update", entity: "contact", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: Contact = { ...c, id: uid(), name: c.name.trim(), updatedAt: nowIso() };
    rows.push(full);
    await saveCol(CONTACTS, rows);
    await this.audit.log({ actor, action: "contact.create", entity: "contact", entityId: full.name, before: null, after: full });
    return full;
  }
  async remove(id: string, actor: string): Promise<void> {
    const rows = await loadCol(CONTACTS, seedContacts);
    const c = rows.find(r => r.id === id);
    await saveCol(CONTACTS, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "contact.delete", entity: "contact", entityId: c?.name ?? id, before: c ?? null, after: null });
  }
}

// ── Venues ────────────────────────────────────────────────────────────────
const VENUES = "venues.v1";
function seedVenues(): Venue[] {
  const mk = (name: string, address: string, contactName: string, phone: string, capacity: number | null, loadInNotes: string | null): Venue =>
    ({ id: uid(), name, address, contactName, phone, capacity, loadInNotes, updatedAt: nowIso() });
  return [
    mk("Armature Works", "1910 N Ola Ave, Tampa, FL 33602", "Rosa Jimenez", "(813) 555-0163", 400, "North dock; freight elevator to Gathering hall"),
    mk("The Orlo", "305 S Hyde Park Ave, Tampa, FL 33606", "Peter Sands", "(813) 555-0129", 220, "Rear alley load-in only; no onsite smoker"),
    mk("Ybor City Museum Garden", "1818 E 9th Ave, Tampa, FL 33605", "Lena Cruz", "(813) 555-0151", 150, "Garden gate on 9th Ave; power limited to 2 outlets"),
    mk("Curtis Hixon Park", "600 N Ashley Dr, Tampa, FL 33602", "Parks Events Office", "(813) 555-0108", 1000, "City permit required; vehicle access before 9 AM"),
  ];
}
export class DemoVenues implements VenuesRepository {
  constructor(private audit: AuditRepository) {}
  async list(): Promise<Venue[]> {
    return (await loadCol(VENUES, seedVenues)).sort((a, b) => a.name.localeCompare(b.name));
  }
  async upsert(v: Omit<Venue, "updatedAt"> & { id?: string }, actor: string): Promise<Venue> {
    if (!v.name.trim()) throw new Error("Name is required");
    const rows = await loadCol(VENUES, seedVenues);
    const existing = v.id ? rows.find(r => r.id === v.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, v, { name: v.name.trim(), updatedAt: nowIso() });
      await saveCol(VENUES, rows);
      await this.audit.log({ actor, action: "venue.update", entity: "venue", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: Venue = { ...v, id: uid(), name: v.name.trim(), updatedAt: nowIso() };
    rows.push(full);
    await saveCol(VENUES, rows);
    await this.audit.log({ actor, action: "venue.create", entity: "venue", entityId: full.name, before: null, after: full });
    return full;
  }
  async remove(id: string, actor: string): Promise<void> {
    const rows = await loadCol(VENUES, seedVenues);
    const v = rows.find(r => r.id === id);
    await saveCol(VENUES, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "venue.delete", entity: "venue", entityId: v?.name ?? id, before: v ?? null, after: null });
  }
}

// ── Companies (collection shared with DemoPortalAdmin) ────────────────────
const COMPANIES = "companies.v1";
function seedCompanies(): Company[] {
  return [
    { id: "co-tampa-tech", name: "Tampa Tech Co.", industry: "Technology", contactIds: [], portalEnabled: true, notes: "Monthly office lunches via portal", updatedAt: nowIso() },
    { id: "co-bayfront", name: "Bayfront Realty", industry: "Real estate", contactIds: [], portalEnabled: true, notes: "Quarterly client events", updatedAt: nowIso() },
    { id: "co-seminole-ll", name: "Seminole Little League", industry: "Youth sports", contactIds: [], portalEnabled: false, notes: "Portal pending board approval", updatedAt: nowIso() },
  ];
}
export class DemoCompanies implements CompaniesRepository {
  constructor(private audit: AuditRepository) {}
  async list(): Promise<Company[]> {
    return (await loadCol(COMPANIES, seedCompanies)).sort((a, b) => a.name.localeCompare(b.name));
  }
  async upsert(c: Omit<Company, "updatedAt"> & { id?: string }, actor: string): Promise<Company> {
    if (!c.name.trim()) throw new Error("Name is required");
    const rows = await loadCol(COMPANIES, seedCompanies);
    const existing = c.id ? rows.find(r => r.id === c.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, c, { name: c.name.trim(), updatedAt: nowIso() });
      await saveCol(COMPANIES, rows);
      await this.audit.log({ actor, action: "company.update", entity: "company", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: Company = { ...c, id: c.id || uid(), name: c.name.trim(), updatedAt: nowIso() };
    rows.push(full);
    await saveCol(COMPANIES, rows);
    await this.audit.log({ actor, action: "company.create", entity: "company", entityId: full.name, before: null, after: full });
    return full;
  }
}

// ── Portal admin ──────────────────────────────────────────────────────────
const PORTAL_ORDERS = "portalOrders.v1";
function seedPortalOrders(): PortalOrder[] {
  const t = todayEt();
  const mk = (ref: string, companyId: string, companyName: string, requestedBy: string, eventDate: string, status: PortalOrderStatus, lines: Array<[string, number, number]>, createdDaysAgo: number): PortalOrder => {
    const items = lines.map(([name, qty, unitPriceCents]) => ({ id: uid(), name, qty, unitPriceCents }));
    const totals = orderTotals(items.map(i => ({ unitPriceCents: i.unitPriceCents, qty: i.qty })));
    const created = daysAgoIso(createdDaysAgo);
    return { id: uid(), ref, companyId, companyName, requestedBy, eventDate, items, ...totals, status, adminNote: null, createdAt: created, updatedAt: created };
  };
  return [
    mk("PO-2107", "co-tampa-tech", "Tampa Tech Co.", "Devon Price", addDays(t, 6), "pending_approval", [
      ["Team lunch buffet — 35 guests", 35, 1850], ["Sweet tea (gallon)", 4, 1200],
    ], 1),
    mk("PO-2106", "co-bayfront", "Bayfront Realty", "Greg Halvorsen", addDays(t, 9), "pending_approval", [
      ["Open house platter", 6, 6500], ["Sampler trays", 8, 3400],
    ], 2),
    mk("PO-2103", "co-tampa-tech", "Tampa Tech Co.", "Devon Price", addDays(t, 3), "approved", [
      ["Team lunch buffet — 28 guests", 28, 1850],
    ], 5),
  ];
}

export class DemoPortalAdmin implements PortalAdminRepository {
  constructor(private audit: AuditRepository) {}

  async orders(filter?: { status?: PortalOrderStatus | "all" }): Promise<PortalOrder[]> {
    let rows = await loadCol(PORTAL_ORDERS, seedPortalOrders);
    if (filter?.status && filter.status !== "all") rows = rows.filter(r => r.status === filter.status);
    return rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }

  async pendingCount(): Promise<number> {
    return (await loadCol(PORTAL_ORDERS, seedPortalOrders)).filter(r => r.status === "pending_approval").length;
  }

  private async transition(id: string, actor: string, allowed: PortalOrderStatus[], to: PortalOrderStatus, action: string, note?: string): Promise<PortalOrder> {
    const rows = await loadCol(PORTAL_ORDERS, seedPortalOrders);
    const o = rows.find(r => r.id === id);
    if (!o) throw new Error("Portal order not found");
    if (!allowed.includes(o.status)) throw new Error(`Cannot ${to.replace("_", " ")} a ${o.status} order`);
    const before = { ...o };
    o.status = to;
    if (note !== undefined) o.adminNote = note;
    o.updatedAt = nowIso();
    await saveCol(PORTAL_ORDERS, rows);
    await this.audit.log({ actor, action, entity: "portal_order", entityId: o.ref, before, after: { ...o } });
    return { ...o };
  }

  approve(id: string, actor: string): Promise<PortalOrder> {
    return this.transition(id, actor, ["pending_approval"], "approved", "portal.approve");
  }
  reject(id: string, note: string, actor: string): Promise<PortalOrder> {
    return this.transition(id, actor, ["pending_approval"], "rejected", "portal.reject", note);
  }
  requestChanges(id: string, note: string, actor: string): Promise<PortalOrder> {
    return this.transition(id, actor, ["pending_approval"], "changes_requested", "portal.request_changes", note);
  }
  markPaid(id: string, actor: string): Promise<PortalOrder> {
    return this.transition(id, actor, ["approved", "invoiced"], "paid", "portal.mark_paid");
  }

  async toggleCompanyPortal(companyId: string, actor: string): Promise<Company> {
    const rows = await loadCol(COMPANIES, seedCompanies);
    const c = rows.find(r => r.id === companyId);
    if (!c) throw new Error("Company not found");
    const before = { ...c };
    c.portalEnabled = !c.portalEnabled;
    c.updatedAt = nowIso();
    await saveCol(COMPANIES, rows);
    await this.audit.log({ actor, action: "portal.toggle_company", entity: "company", entityId: c.name, before, after: { ...c } });
    return { ...c };
  }
}

// ── Equipment ─────────────────────────────────────────────────────────────
const EQUIPMENT = "equipment.v1";
function seedEquipment(): EquipmentItem[] {
  const mk = (name: string, category: string, qtyOwned: number, perGuestRatio: number | null, notes: string | null): EquipmentItem =>
    ({ id: uid(), name, category, qtyOwned, perGuestRatio, notes });
  return [
    mk("Chafers (full size)", "service", 12, 0.05, "1 per ~20 guests per hot item"),
    mk("Sterno cans", "heat", 96, 0.15, "2 per chafer, 2-hr burn"),
    mk("Serving spoons", "utensils", 30, 0.04, null),
    mk("Tongs", "utensils", 24, 0.04, null),
    mk("6ft folding tables", "furniture", 8, 0.02, "Buffet + prep"),
    mk("Linens (black, 90x132)", "furniture", 16, 0.02, "Dry clean after each event"),
    mk("Drink dispensers (3 gal)", "service", 6, 0.02, "Tea / lemonade / water"),
    mk("Cambros (hot boxes)", "transport", 5, 0.01, "Hold ≥135°F in transit"),
  ];
}
export class DemoEquipment implements EquipmentRepository {
  constructor(private audit: AuditRepository) {}
  async list(): Promise<EquipmentItem[]> {
    return (await loadCol(EQUIPMENT, seedEquipment)).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }
  async upsert(e: Omit<EquipmentItem, "id"> & { id?: string }, actor: string): Promise<EquipmentItem> {
    if (!e.name.trim()) throw new Error("Name is required");
    if (!Number.isFinite(e.qtyOwned) || e.qtyOwned < 0) throw new Error("qtyOwned must be a non-negative number");
    const rows = await loadCol(EQUIPMENT, seedEquipment);
    const existing = e.id ? rows.find(r => r.id === e.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, e, { name: e.name.trim() });
      await saveCol(EQUIPMENT, rows);
      await this.audit.log({ actor, action: "equipment.update", entity: "equipment", entityId: existing.name, before, after: { ...existing } });
      return { ...existing };
    }
    const full: EquipmentItem = { ...e, id: uid(), name: e.name.trim() };
    rows.push(full);
    await saveCol(EQUIPMENT, rows);
    await this.audit.log({ actor, action: "equipment.create", entity: "equipment", entityId: full.name, before: null, after: full });
    return full;
  }
}

// ── Cockpit ───────────────────────────────────────────────────────────────
export class DemoCockpit implements CockpitRepository {
  constructor(private leads: DemoLeads, private quotes: DemoQuotes, private portal: DemoPortalAdmin) {}

  async data(): Promise<CockpitData> {
    const [leads, quotes, pendingApprovals] = await Promise.all([
      this.leads.list(), this.quotes.list(), this.portal.pendingCount(),
    ]);
    const today = todayEt();
    const month = today.slice(0, 7);
    const horizon = addDays(today, 7);

    const open = leads.filter(l => l.stage !== "booked" && l.stage !== "lost");
    const pipelineValueCents = open.reduce((s, l) => s + (l.budgetCents ?? 0), 0);
    const bookedThisMonth = leads.filter(l => l.stage === "booked" && l.eventDate !== null && l.eventDate.startsWith(month)).length;
    const unpaidInvoicesCents = quotes
      .filter(q => q.kind === "invoice" && q.status === "invoiced")
      .reduce((s, q) => s + q.totalCents, 0);

    const redZone = leads
      .filter(l => l.stage === "booked" && l.eventDate !== null && l.eventDate >= today && l.eventDate <= horizon)
      .map(l => {
        const issues: string[] = [];
        if (l.budgetCents === null) issues.push("No budget on file");
        if (l.priority === "urgent") issues.push("Marked urgent");
        return { leadOrQuoteId: l.id, label: `${l.name} — ${l.eventType}`, eventDate: l.eventDate as string, issues };
      })
      .filter(r => r.issues.length > 0);

    const upcoming = leads
      .filter(l => l.stage === "booked" && l.eventDate !== null && l.eventDate >= today)
      .sort((a, b) => (a.eventDate as string).localeCompare(b.eventDate as string))
      .slice(0, 5)
      .map(l => ({ id: l.id, customer: l.name, eventDate: l.eventDate as string, guests: l.guests, status: l.stage }));

    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const winsThisWeek = leads.flatMap(l =>
      l.activity
        .filter(a => a.kind === "stage" && a.body.includes("booked") && a.at >= weekAgo)
        .map(a => ({ id: l.id, label: `${l.name} booked — ${l.eventType}`, at: a.at }))
    );

    return {
      kpis: { pipelineValueCents, openLeads: open.length, bookedThisMonth, pendingApprovals, unpaidInvoicesCents },
      redZone, upcoming, winsThisWeek,
    };
  }
}
