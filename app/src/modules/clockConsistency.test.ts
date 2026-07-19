/**
 * Guards against the demo-clock divergence class of bug: operational views
 * must derive "today" from the clock-aware currentTime() helper, never from
 * a raw new Date(), or they mismatch the DAL under the demo clock (observed
 * live as Expo KDS showing 0 tickets while the clock was set to Tuesday).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".tsx") ? [p] : [];
  });
}

describe("operational views use the clock-aware today, not raw new Date()", () => {
  it("no module view calls etParts(new Date()) or activeDropWeekend(new Date())", () => {
    const offenders: string[] = [];
    for (const f of walk(join(__dirname))) {
      if (f.includes(".test.")) continue;
      const s = readFileSync(f, "utf8");
      if (/etParts\(new Date\(\)\)/.test(s) || /activeDropWeekend\(new Date\(\)\)/.test(s)) {
        offenders.push(f.replace(__dirname, "src/modules"));
      }
    }
    expect(offenders, `Use currentTime() from lib/clock instead:\n${offenders.join("\n")}`).toEqual([]);
  });
});
