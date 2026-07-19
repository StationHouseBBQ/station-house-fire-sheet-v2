/**
 * Demo marketing repository: landing pages, attribution (computed live from
 * the leads collection), content calendar, media library, local outreach,
 * social performance, ad campaigns and creative briefs.
 */
import { loadCol, saveCol, uid, nowIso } from "./store";
import { todayEt } from "./domains";
import type {
  AdCampaign, AuditRepository, ContentPost, CreativeBrief, LandingPage, LeadsRepository,
  MarketingRepository, MediaAsset, OutreachTarget, PerfRow,
} from "../types";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const PAGES = "landingPages.v1";
function seedPages(): LandingPage[] {
  const mk = (slug: string, title: string, kind: string, status: "live" | "draft", visits: number, conversions: number): LandingPage =>
    ({ id: uid(), slug, title, kind, status, visits, conversions });
  return [
    mk("/fire-drop", "Weekend Pre-Order — Weekend BBQ Preorder", "fire_drop", "live", 4180, 512),
    mk("/cuban-thursday", "Cuban Thursday", "event", "live", 2210, 296),
    mk("/catering-landing", "BBQ Catering in Tampa", "catering", "live", 1875, 84),
    mk("/july4", "July 4th Cookout Packs", "event", "draft", 1502, 173),
    mk("/fathers-day", "Father's Day Feast", "event", "draft", 968, 121),
    mk("/catering-request", "Catering Request Form", "catering", "live", 1240, 97),
    mk("/shop", "Retail Shop — Rubs & Sauces", "shop", "live", 820, 64),
    mk("/c/football-sunday", "Football Sunday Collection", "collection", "live", 640, 41),
  ];
}

const POSTS = "mkPosts.v1";
function seedPosts(): ContentPost[] {
  const t = todayEt();
  const mk = (date: string, platform: string, title: string, body: string, status: ContentPost["status"]): ContentPost =>
    ({ id: uid(), date, platform, title, body, status, updatedAt: nowIso() });
  return [
    mk(addDays(t, -2), "instagram", "Brisket pull reel", "Slow pull on the 14-hr packer — post oak only. Sound on.", "posted"),
    mk(addDays(t, 0), "facebook", "Cuban Thursday reminder", "Cubans & Brisket Smash Burgers, Thursday only. Preorder link in bio.", "scheduled"),
    mk(addDays(t, 1), "tiktok", "Weekend Pre-Order menu drop", "This weekend's Weekend Pre-Order menu reveal — oxtail is BACK.", "drafted"),
    mk(addDays(t, 3), "instagram", "Sampler tray carousel", "Walk-In Sampler: pulled pork, brisket, sausage, ribs, chicken quarters. $34.", "drafted"),
    mk(addDays(t, 5), "facebook", "Catering testimonial", "Photo set from the Bayfront Realty client dinner + review quote.", "idea"),
  ];
}

const MEDIA = "mkMedia.v1";
function seedMedia(): MediaAsset[] {
  const mk = (name: string, kind: MediaAsset["kind"], tags: string[]): MediaAsset =>
    ({ id: uid(), name, kind, tags, addedAt: nowIso() });
  return [
    mk("brisket-slice-hero.jpg", "photo", ["brisket", "hero", "menu"]),
    mk("cuban-thursday-stack.jpg", "photo", ["cuban", "thursday", "sandwich"]),
    mk("smash-burger-cheese-pull.mp4", "video", ["smash-burger", "thursday", "reel"]),
    mk("fire-drop-oxtail.jpg", "photo", ["fire-drop", "oxtail", "special"]),
    mk("sampler-tray-overhead.jpg", "photo", ["sampler", "retail", "case"]),
    mk("pit-sunrise-smoke.mp4", "video", ["pit", "bts", "smoker"]),
    mk("catering-buffet-armature.jpg", "photo", ["catering", "event", "armature-works"]),
    mk("cuban-thursday-story.png", "graphic", ["cuban", "thursday", "story-template"]),
    mk("fire-drop-countdown.png", "graphic", ["fire-drop", "story-template"]),
  ];
}

const OUTREACH = "mkOutreach.v1";
function seedOutreach(): OutreachTarget[] {
  const mk = (business: string, contact: string, email: string, stage: OutreachTarget["stage"], lastTouch: string | null, notes: string | null): OutreachTarget =>
    ({ id: uid(), business, contact, email, stage, lastTouch, notes });
  const t = todayEt();
  return [
    mk("Cigar City Brewing", "Sam Torres", "events@cigarcitybrewing.com", "meeting", addDays(t, -3), "Tap-room popup — proposing 2 Saturdays/month"),
    mk("Ybor Chamber of Commerce", "Dana Whitfield", "dana@yborchamber.org", "contacted", addDays(t, -6), "Mixer catering pitch sent"),
    mk("Hillsborough Brewing Co.", "Mike Ellis", "mike@hillsbrewing.com", "identified", null, "No food program on weekends"),
    mk("Tampa Bay Markets", "Priya Nair", "vendors@tampabaymarkets.com", "responded", addDays(t, -2), "Asked for COI + menu sheet"),
    mk("Seminole Heights Sunday Market", "Jo Kaplan", "jo@shsundaymarket.com", "won", addDays(t, -10), "Booth confirmed monthly, first Sunday"),
  ];
}

const PERF = "mkPerf.v1";
function seedPerf(): PerfRow[] {
  const rows: Array<[string, string, number]> = [
    ["instagram", "followers", 12480], ["instagram", "reach", 58200], ["instagram", "engagement", 4260],
    ["facebook", "followers", 8930], ["facebook", "reach", 31400], ["facebook", "engagement", 1875],
    ["tiktok", "followers", 21600], ["tiktok", "reach", 142000], ["tiktok", "engagement", 11350],
  ];
  return rows.map(([platform, metric, value]) => ({ id: uid(), platform, metric, value, period: "this_week" }));
}

const ADS = "mkAds.v1";
function seedAds(): AdCampaign[] {
  return [
    { id: uid(), platform: "meta", name: "Catering — Tampa 15mi", status: "active", spendCents: 84200, leads: 23, costPerLeadCents: 3661 },
    { id: uid(), platform: "google", name: "Search: bbq catering tampa", status: "active", spendCents: 121500, leads: 31, costPerLeadCents: 3919 },
    { id: uid(), platform: "tiktok", name: "Weekend Pre-Order awareness", status: "paused", spendCents: 30000, leads: 4, costPerLeadCents: 7500 },
  ];
}

const BRIEFS = "mkBriefs.v1";
function seedBriefs(): CreativeBrief[] {
  const mk = (kind: CreativeBrief["kind"], title: string, brief: string, status: CreativeBrief["status"]): CreativeBrief =>
    ({ id: uid(), kind, title, brief, status, createdAt: nowIso() });
  return [
    mk("content", "August content calendar", "30-day grid mixing Cuban Thursday, Weekend Pre-Order and catering proof.", "in_review"),
    mk("content", "Pitmaster Q&A series", "Weekly caption series answering top smoking questions.", "queued"),
    mk("design", "Weekend Pre-Order story template refresh", "New countdown template matching brand red/charcoal.", "approved"),
    mk("design", "Catering one-pager PDF", "Leave-behind sheet for venue partners with menus & minimums.", "queued"),
    mk("video", "Brisket trim-to-slice mini-doc", "90-second vertical: trim, smoke, wrap, slice.", "in_review"),
    mk("video", "Cuban Thursday hype loop", "15-second loop for stories every Wednesday night.", "done"),
    mk("ads", "Meta catering lead form v2", "New creative + form testing sampler tray hook.", "queued"),
    mk("ads", "Google RSA refresh", "Rewrite responsive search ads around \"tampa bbq catering\".", "approved"),
  ];
}

export class DemoMarketing implements MarketingRepository {
  constructor(private audit: AuditRepository, private leads: LeadsRepository, private preorders: import("../types").PreordersRepository) {}

  async analytics() {
    const leads = await this.leads.list();
    const pre = await this.preorders.list({ includeHidden: false });
    const money = (n: number) => n;
    // Channel revenue from operational order tickets (catering etc.) + preorders.
    const chMap = new Map<string, { channel: string; label: string; orders: number; revenueCents: number }>();
    const labels: Record<string, string> = { fire_drop: "Weekend Pre-Order", cuban_thursday: "Cuban Thursday", catering: "Catering", retail: "Retail", walk_in: "Walk-in" };
    for (const p of pre) {
      const key = p.channel;
      const e = chMap.get(key) ?? { channel: key, label: labels[key] ?? key, orders: 0, revenueCents: 0 };
      e.orders += 1; e.revenueCents += p.totalCents; chMap.set(key, e);
    }
    // Catering pipeline value (open catering lifecycle proxy via leads budget for booked)
    const cateringPipelineCents = leads.filter(l => !["lost"].includes(l.stage) && l.budgetCents).reduce((s, l) => s + (l.budgetCents ?? 0), 0);
    const channelRevenue = [...chMap.values()].sort((a, b) => b.revenueCents - a.revenueCents);
    const totalRevenueCents = channelRevenue.reduce((s, c) => s + c.revenueCents, 0);
    // Lead funnel
    const funnelOrder: Array<[string, string]> = [["new", "New"], ["contacted", "Contacted"], ["needs_quote", "Needs quote"], ["quote_sent", "Quote sent"], ["booked", "Booked"]];
    const leadFunnel = funnelOrder.map(([stage, label]) => ({ stage, label, count: leads.filter(l => l.stage === stage).length }));
    // Lead sources with conversion
    const srcMap = new Map<string, { source: string; leads: number; booked: number; bookedCents: number }>();
    for (const l of leads) {
      const e = srcMap.get(l.source) ?? { source: l.source, leads: 0, booked: 0, bookedCents: 0 };
      e.leads += 1;
      if (l.stage === "booked") { e.booked += 1; e.bookedCents += l.budgetCents ?? 0; }
      srcMap.set(l.source, e);
    }
    const leadSources = [...srcMap.values()].map(e => ({ ...e, conversionPct: e.leads ? Math.round((e.booked / e.leads) * 100) : 0 })).sort((a, b) => b.leads - a.leads);
    // Weekend preorders split
    const wp = pre.filter(p => p.channel === "fire_drop");
    const dayCount = (d: string) => wp.filter(p => { const dow = new Date(p.pickupDate + "T12:00:00Z").getUTCDay(); return d === "fri" ? dow === 5 : dow === 6; }).length;
    const weekendPreorders = { count: wp.length, revenueCents: wp.reduce((s, p) => s + p.totalCents, 0), friday: dayCount("fri"), saturday: dayCount("sat") };
    // Top days by revenue
    const dayMap = new Map<string, { date: string; orders: number; revenueCents: number }>();
    for (const p of pre) { const e = dayMap.get(p.pickupDate) ?? { date: p.pickupDate, orders: 0, revenueCents: 0 }; e.orders += 1; e.revenueCents += p.totalCents; dayMap.set(p.pickupDate, e); }
    const topDays = [...dayMap.values()].sort((a, b) => b.revenueCents - a.revenueCents).slice(0, 5);
    void money;
    return { channelRevenue, totalRevenueCents, leadFunnel, leadSources, weekendPreorders, cateringPipelineCents, topDays };
  }

  async landingPages(): Promise<LandingPage[]> {
    return (await loadCol(PAGES, seedPages)).sort((a, b) => b.visits - a.visits);
  }

  async attributionSummary(): Promise<Array<{ source: string; leads: number; bookedCents: number }>> {
    const leads = await this.leads.list();
    const m = new Map<string, { source: string; leads: number; bookedCents: number }>();
    for (const l of leads) {
      const e = m.get(l.source) ?? { source: l.source, leads: 0, bookedCents: 0 };
      e.leads++;
      if (l.stage === "booked") e.bookedCents += l.budgetCents ?? 0;
      m.set(l.source, e);
    }
    return [...m.values()].sort((a, b) => b.leads - a.leads);
  }

  async posts(): Promise<ContentPost[]> {
    return (await loadCol(POSTS, seedPosts)).sort((a, b) => a.date.localeCompare(b.date));
  }

  async upsertPost(p: Omit<ContentPost, "updatedAt"> & { id?: string }, actor: string): Promise<ContentPost> {
    if (!p.title.trim()) throw new Error("Title is required");
    const rows = await loadCol(POSTS, seedPosts);
    const existing = p.id ? rows.find(r => r.id === p.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, p, { updatedAt: nowIso() });
      await saveCol(POSTS, rows);
      await this.audit.log({ actor, action: "mk.post.update", entity: "content_post", entityId: existing.title, before, after: { ...existing } });
      return { ...existing };
    }
    const full: ContentPost = { ...p, id: uid(), updatedAt: nowIso() };
    rows.push(full);
    await saveCol(POSTS, rows);
    await this.audit.log({ actor, action: "mk.post.create", entity: "content_post", entityId: full.title, before: null, after: full });
    return full;
  }

  async removePost(id: string, actor: string): Promise<void> {
    const rows = await loadCol(POSTS, seedPosts);
    const p = rows.find(r => r.id === id);
    await saveCol(POSTS, rows.filter(r => r.id !== id));
    await this.audit.log({ actor, action: "mk.post.delete", entity: "content_post", entityId: p?.title ?? id, before: p ?? null, after: null });
  }

  async media(): Promise<MediaAsset[]> {
    return (await loadCol(MEDIA, seedMedia)).sort((a, b) => b.addedAt.localeCompare(a.addedAt));
  }

  async addMedia(m: Omit<MediaAsset, "id" | "addedAt">, actor: string): Promise<MediaAsset> {
    if (!m.name.trim()) throw new Error("Name is required");
    const rows = await loadCol(MEDIA, seedMedia);
    const full: MediaAsset = { ...m, id: uid(), name: m.name.trim(), addedAt: nowIso() };
    rows.push(full);
    await saveCol(MEDIA, rows);
    await this.audit.log({ actor, action: "mk.media.add", entity: "media_asset", entityId: full.name, before: null, after: full });
    return full;
  }

  async outreach(): Promise<OutreachTarget[]> {
    return (await loadCol(OUTREACH, seedOutreach)).sort((a, b) => a.business.localeCompare(b.business));
  }

  async upsertOutreach(t: Omit<OutreachTarget, "id"> & { id?: string }, actor: string): Promise<OutreachTarget> {
    if (!t.business.trim()) throw new Error("Business is required");
    const rows = await loadCol(OUTREACH, seedOutreach);
    const existing = t.id ? rows.find(r => r.id === t.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, t, { business: t.business.trim() });
      await saveCol(OUTREACH, rows);
      await this.audit.log({ actor, action: "mk.outreach.update", entity: "outreach_target", entityId: existing.business, before, after: { ...existing } });
      return { ...existing };
    }
    const full: OutreachTarget = { ...t, id: uid(), business: t.business.trim() };
    rows.push(full);
    await saveCol(OUTREACH, rows);
    await this.audit.log({ actor, action: "mk.outreach.create", entity: "outreach_target", entityId: full.business, before: null, after: full });
    return full;
  }

  async performance(): Promise<PerfRow[]> {
    return loadCol(PERF, seedPerf);
  }

  async adCampaigns(): Promise<AdCampaign[]> {
    return (await loadCol(ADS, seedAds)).sort((a, b) => b.spendCents - a.spendCents);
  }

  async updateCampaignStatus(id: string, status: AdCampaign["status"], actor: string): Promise<AdCampaign> {
    const rows = await loadCol(ADS, seedAds);
    const c = rows.find(r => r.id === id);
    if (!c) throw new Error("Campaign not found");
    const before = { ...c };
    c.status = status;
    await saveCol(ADS, rows);
    await this.audit.log({ actor, action: "mk.campaign.status", entity: "ad_campaign", entityId: c.name, before, after: { ...c } });
    return { ...c };
  }

  async briefs(kind: CreativeBrief["kind"]): Promise<CreativeBrief[]> {
    return (await loadCol(BRIEFS, seedBriefs)).filter(b => b.kind === kind).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async upsertBrief(b: Omit<CreativeBrief, "createdAt"> & { id?: string }, actor: string): Promise<CreativeBrief> {
    if (!b.title.trim()) throw new Error("Title is required");
    const rows = await loadCol(BRIEFS, seedBriefs);
    const existing = b.id ? rows.find(r => r.id === b.id) : undefined;
    if (existing) {
      const before = { ...existing };
      Object.assign(existing, b);
      await saveCol(BRIEFS, rows);
      await this.audit.log({ actor, action: "mk.brief.update", entity: "creative_brief", entityId: existing.title, before, after: { ...existing } });
      return { ...existing };
    }
    const full: CreativeBrief = { ...b, id: uid(), createdAt: nowIso() };
    rows.push(full);
    await saveCol(BRIEFS, rows);
    await this.audit.log({ actor, action: "mk.brief.create", entity: "creative_brief", entityId: full.title, before: null, after: full });
    return full;
  }
}
