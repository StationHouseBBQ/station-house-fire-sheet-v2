import { describe, expect, it } from "vitest";
import { isOrderingOpen } from "./time";

/** Build a Date from an ET wall-clock time (EDT offset -4 used for July dates). */
const et = (iso: string) => new Date(iso + "-04:00");

describe("Weekend Pre-Order ordering windows (America/New_York)", () => {
  // Week of 2026-07-13 (Mon) … pickup Fri 2026-07-17 / Sat 2026-07-18
  it("Friday ordering is open before Thu 5:00 PM ET", () => {
    expect(isOrderingOpen("friday", et("2026-07-13T09:00:00"))).toBe(true);  // Mon
    expect(isOrderingOpen("friday", et("2026-07-16T16:59:00"))).toBe(true);  // Thu 4:59pm
  });
  it("Friday ordering closes exactly Thu 5:00 PM ET", () => {
    expect(isOrderingOpen("friday", et("2026-07-16T17:00:00"))).toBe(false);
    expect(isOrderingOpen("friday", et("2026-07-17T12:00:00"))).toBe(false); // Fri
  });
  it("Saturday ordering opens Thu 5:00 PM ET", () => {
    expect(isOrderingOpen("saturday", et("2026-07-16T16:59:00"))).toBe(false);
    expect(isOrderingOpen("saturday", et("2026-07-16T17:00:00"))).toBe(true);
  });
  it("Saturday ordering closes Fri 3:00 PM ET", () => {
    expect(isOrderingOpen("saturday", et("2026-07-17T14:59:00"))).toBe(true);
    expect(isOrderingOpen("saturday", et("2026-07-17T15:00:00"))).toBe(false);
    expect(isOrderingOpen("saturday", et("2026-07-18T10:00:00"))).toBe(false); // Sat itself
  });
  it("handles EST (winter) weeks identically on wall clock", () => {
    const est = (iso: string) => new Date(iso + "-05:00");
    expect(isOrderingOpen("friday", est("2026-01-15T16:59:00"))).toBe(true);   // Thu 4:59pm EST
    expect(isOrderingOpen("friday", est("2026-01-15T17:00:00"))).toBe(false);
  });
});

describe("activeDropWeekend advances only on Monday", () => {
  const et = (iso: string) => new Date(iso + "-04:00");
  it.each([
    ["2026-07-13T09:00:00", "2026-07-17"],  // Monday → this week
    ["2026-07-16T18:00:00", "2026-07-17"],  // Thursday
    ["2026-07-17T21:00:00", "2026-07-17"],  // Friday night — still this weekend
    ["2026-07-18T10:00:00", "2026-07-17"],  // Saturday morning — pickups today, no advance
    ["2026-07-19T10:00:00", "2026-07-17"],  // Sunday — advance waits for Monday
    ["2026-07-20T00:05:00", "2026-07-24"],  // Monday 00:05 — advanced
  ])("%s → weekend of %s", async (now, friday) => {
    const { activeDropWeekend } = await import("./time");
    expect(activeDropWeekend(et(now)).friday).toBe(friday);
  });
});
