/**
 * All business time is America/New_York. These helpers compute Fire Drop
 * ordering windows per the authoritative rules:
 *  - Friday pickup ordering closes Thursday 5:00 PM ET.
 *  - Saturday ordering opens Thursday 5:00 PM ET, closes Friday 3:00 PM ET.
 * Server-side SQL enforces the same windows; this module powers UI state.
 */
export const BUSINESS_TZ = "America/New_York";

export interface EtParts { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number; }

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function etParts(date: Date): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +parts.hour % 24, minute: +parts.minute, second: +parts.second,
    weekday: WEEKDAYS.indexOf(parts.weekday),
  };
}

/** Minutes since Monday 00:00 ET, for window comparisons within a week. */
function weekMinute(p: EtParts): number {
  const mondayIndexed = (p.weekday + 6) % 7; // Mon=0 … Sun=6
  return mondayIndexed * 1440 + p.hour * 60 + p.minute;
}

const THU_5PM = 3 * 1440 + 17 * 60;  // Thu 17:00
const FRI_3PM = 4 * 1440 + 15 * 60;  // Fri 15:00

export type PickupDay = "friday" | "saturday";

export function isOrderingOpen(day: PickupDay, now: Date = new Date()): boolean {
  const m = weekMinute(etParts(now));
  if (day === "friday") {
    // Open from weekly advance (Mon 00:00) until Thu 17:00.
    return m < THU_5PM;
  }
  // Saturday: opens Thu 17:00, closes Fri 15:00.
  return m >= THU_5PM && m < FRI_3PM;
}

/** Next Friday and Saturday dates (ET) for a given moment — the active drop window. */
export function activeDropWeekend(now: Date = new Date()): { friday: string; saturday: string } {
  const p = etParts(now);
  const base = new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
  const dow = p.weekday; // 0=Sun
  const daysUntilFriday = ((5 - dow) + 7) % 7 || (dow === 5 ? 0 : 7);
  const fri = new Date(base); fri.setUTCDate(base.getUTCDate() + (dow === 6 ? 6 : daysUntilFriday));
  const sat = new Date(fri); sat.setUTCDate(fri.getUTCDate() + 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { friday: iso(fri), saturday: iso(sat) };
}
