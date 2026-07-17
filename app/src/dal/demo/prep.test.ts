import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoDal } from "./adapter";

// reset the in-memory idb shim between tests
beforeEach(async () => {
  const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
  idb.__mem.clear();
});

describe("Demo prep repository (Kitchen vertical slice)", () => {
  it("seeds an active session for today's ET service date", async () => {
    const dal = createDemoDal();
    const s = await dal.prep.getActiveSession();
    expect(s).not.toBeNull();
    expect(s!.entries.length).toBeGreaterThan(10);
    expect(s!.serviceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Thursday-only items (Cubans, Smash Burgers) appear only on Thursdays", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-16T14:00:00-04:00")); // Thursday ET
      let s = await createDemoDal().prep.getActiveSession();
      expect(s!.entries.some(e => /Cuban/.test(e.name))).toBe(true);
      expect(s!.entries.some(e => /Smash Burger/.test(e.name))).toBe(true);

      const idb = await import("idb-keyval") as unknown as { __mem: Map<string, unknown> };
      idb.__mem.clear();
      vi.setSystemTime(new Date("2026-07-17T14:00:00-04:00")); // Friday ET
      s = await createDemoDal().prep.getActiveSession();
      expect(s!.entries.some(e => /Cuban|Smash Burger/.test(e.name))).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("advances status and writes an audit record with before/after", async () => {
    const dal = createDemoDal();
    const s = await dal.prep.getActiveSession();
    const e = s!.entries[0];
    const updated = await dal.prep.updateEntryStatus(e.id, "in_progress", "test:kitchen");
    expect(updated.status).toBe("in_progress");
    const audit = await dal.audit.recent(5);
    expect(audit[0]).toMatchObject({ action: "prep.status", entityId: e.id, actor: "test:kitchen" });
    expect((audit[0].before as { status: string }).status).toBe("not_started");
    expect((audit[0].after as { status: string }).status).toBe("in_progress");
  });

  it("persists quantity edits across adapter re-creation (refresh survival)", async () => {
    const dal = createDemoDal();
    const s = await dal.prep.getActiveSession();
    const e = s!.entries[2];
    await dal.prep.updateEntryQty(e.id, 7.5, "test:kitchen");
    const dal2 = createDemoDal(); // simulates page refresh
    const s2 = await dal2.prep.getActiveSession();
    expect(s2!.entries.find(x => x.id === e.id)!.prepQty).toBe(7.5);
  });

  it("rejects blank names and negative quantities", async () => {
    const dal = createDemoDal();
    await expect(dal.prep.addEntry({ name: "  ", category: "sides", unit: "lbs", parQty: 1 }, "t")).rejects.toThrow();
    const s = await dal.prep.getActiveSession();
    await expect(dal.prep.updateEntryQty(s!.entries[0].id, -1, "t")).rejects.toThrow();
  });

  it("addEntry appears in session and audit", async () => {
    const dal = createDemoDal();
    const added = await dal.prep.addEntry({ name: "Pickled Onions", category: "misc", unit: "quarts", parQty: 2 }, "test:kitchen");
    const s = await dal.prep.getActiveSession();
    expect(s!.entries.some(x => x.id === added.id)).toBe(true);
    const audit = await dal.audit.recent(1);
    expect(audit[0].action).toBe("prep.add");
  });
});
