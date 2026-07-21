/**
 * Realistic Station House team seeds. Every persisted bucket has a seed so a
 * fresh demo shows a populated board on first paint. Punches / schedule dates
 * are generated relative to the business clock at read time so the demo always
 * looks "today". Hourly rates are integer cents.
 */
import type { StaffMember, TeamMessage } from "./types";

/** Roster: pitmaster, counter, catering lead, packer, driver (+ a second counter). */
export const TEAM_STAFF_SEED: StaffMember[] = [
  { id: "stf-marcus",  name: "Marcus Reyes",   role: "pitmaster",     hourlyRateCents: 2800, active: true },
  { id: "stf-dana",    name: "Dana Whitfield", role: "counter",       hourlyRateCents: 1650, active: true },
  { id: "stf-priya",   name: "Priya Nair",     role: "catering_lead", hourlyRateCents: 2400, active: true },
  { id: "stf-tyrell",  name: "Tyrell Banks",   role: "packer",        hourlyRateCents: 1550, active: true },
  { id: "stf-lena",    name: "Lena Ortiz",     role: "driver",        hourlyRateCents: 1900, active: true },
  { id: "stf-jamal",   name: "Jamal Foster",   role: "counter",       hourlyRateCents: 1600, active: true },
];

/**
 * Typical open/close times per role, used to auto-seed a week's schedule.
 * start/end are "HH:MM" 24h.
 */
export const SHIFT_TEMPLATE: Record<string, { start: string; end: string }> = {
  pitmaster:     { start: "04:00", end: "12:00" },
  counter:       { start: "10:00", end: "18:00" },
  catering_lead: { start: "08:00", end: "16:00" },
  packer:        { start: "09:00", end: "17:00" },
  driver:        { start: "10:00", end: "16:00" },
  kitchen:       { start: "07:00", end: "15:00" },
};

/** Message board announcements + starter briefing. */
export const TEAM_MESSAGES_SEED: TeamMessage[] = [
  { id: "msg-1", author: "staff:priya@stationhousebbq.com", body: "Reminder: the Alvarez wedding (180 guests) loads out Saturday 2pm. Catering crew, confirm your call times on the schedule.", at: relIso(-2, 9, 15), pinned: true },
  { id: "msg-2", author: "staff:marcus@stationhousebbq.com", body: "Smoker #2 is back online. Brisket capacity is normal again for the weekend push.", at: relIso(-1, 6, 40), pinned: false },
  { id: "msg-3", author: "staff:admin@stationhousebbq.com", body: "Great numbers last week — labor came in under 25%. Keep it up, team.", at: relIso(-1, 17, 5), pinned: false },
];

export const DEFAULT_BRIEFING =
  "Big catering day. Alvarez wedding is priority one — pitmaster starts brisket at 4am, packers stage chafers by 11am, drivers roll at 1pm. Counter, keep the retail case stocked between rushes. Let's have a clean, on-time day.";

/** ISO datetime `daysAgo` before the *real* now (seeds are static/deterministic). */
function relIso(daysAgo: number, hour: number, minute: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
