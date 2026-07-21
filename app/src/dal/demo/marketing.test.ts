import { beforeEach, describe, expect, it } from "vitest";
import { createDemoDal } from "./adapter";

// reset the in-memory idb shim between tests
beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear();
});

describe("Demo marketing analytics (real-data rollup)", () => {
  it("returns channel revenue sorted desc with total equal to the sum", async () => {
    const dal = createDemoDal();
    const a = await dal.marketing.analytics();
    expect(a.channelRevenue.length).toBeGreaterThan(0);
    // sorted descending by revenueCents
    for (let i = 1; i < a.channelRevenue.length; i++) {
      expect(a.channelRevenue[i - 1].revenueCents).toBeGreaterThanOrEqual(a.channelRevenue[i].revenueCents);
    }
    const sum = a.channelRevenue.reduce((s, c) => s + c.revenueCents, 0);
    expect(a.totalRevenueCents).toBe(sum);
    // each channel row is internally consistent
    for (const c of a.channelRevenue) {
      expect(c.orders).toBeGreaterThan(0);
      expect(c.revenueCents).toBeGreaterThan(0);
      expect(typeof c.label).toBe("string");
    }
  });

  it("exposes a five-stage lead funnel matching seeded stage counts", async () => {
    const dal = createDemoDal();
    const a = await dal.marketing.analytics();
    expect(a.leadFunnel.map(f => f.stage)).toEqual(["new", "contacted", "needs_quote", "quote_sent", "booked"]);
    // seed has exactly one lead in each of these stages
    for (const f of a.leadFunnel) expect(f.count).toBe(1);
  });

  it("computes lead-source conversion% correctly for the seeded 'google' source", async () => {
    const dal = createDemoDal();
    const a = await dal.marketing.analytics();
    // Seed: google has 2 leads, 1 of them booked -> 50%. Booked google lead has null budget.
    const google = a.leadSources.find(s => s.source === "google");
    expect(google).toBeDefined();
    expect(google!.leads).toBe(2);
    expect(google!.booked).toBe(1);
    expect(google!.conversionPct).toBe(50);
    // conversionPct is always round(booked/leads*100) for every source
    for (const s of a.leadSources) {
      expect(s.conversionPct).toBe(s.leads ? Math.round((s.booked / s.leads) * 100) : 0);
    }
    // total attributed leads = 6 seeded leads
    expect(a.leadSources.reduce((s, r) => s + r.leads, 0)).toBe(6);
  });

  it("splits weekend pre-orders into Friday + Saturday consistent with the count", async () => {
    const dal = createDemoDal();
    const a = await dal.marketing.analytics();
    const wp = a.weekendPreorders;
    expect(wp.count).toBeGreaterThanOrEqual(0);
    // Fri + Sat pickups can never exceed the total weekend pre-order count.
    expect(wp.friday + wp.saturday).toBeLessThanOrEqual(wp.count);
    expect(wp.revenueCents).toBeGreaterThanOrEqual(0);
  });

  it("returns up to five top days sorted by revenue desc", async () => {
    const dal = createDemoDal();
    const a = await dal.marketing.analytics();
    expect(a.topDays.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < a.topDays.length; i++) {
      expect(a.topDays[i - 1].revenueCents).toBeGreaterThanOrEqual(a.topDays[i].revenueCents);
    }
  });

  it("upsertBrief round-trips a new brief into its kind queue", async () => {
    const dal = createDemoDal();
    const created = await dal.marketing.upsertBrief(
      { id: "", title: "Test video brief", brief: "15s loop", status: "queued", kind: "video" }, "demo-test");
    expect(created.id).toBeTruthy();
    expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    const list = await dal.marketing.briefs("video");
    expect(list.some(b => b.id === created.id && b.title === "Test video brief")).toBe(true);
  });
});
