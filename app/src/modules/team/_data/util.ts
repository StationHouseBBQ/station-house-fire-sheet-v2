/**
 * Shared Team helpers: business-clock dates, week math (Mon–Sun), shift-hours
 * arithmetic, and role labels. All "now" reads go through currentTime() so the
 * demo clock override applies; never raw Date for business time.
 */
import { currentTime } from "../../../lib/clock";
import type { Shift, TeamRole, StaffMember } from "./types";

/** ISO date-only ("2026-07-20") for "today" on the business clock. */
export function todayIso(): string {
  return currentTime().toISOString().slice(0, 10);
}

/** Monday (YYYY-MM-DD) of the week containing `iso`, weeks starting Monday. */
export function mondayOf(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  const dow = d.getUTCDay();            // 0=Sun … 6=Sat
  const back = dow === 0 ? 6 : dow - 1; // days since Monday
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** The 7 ISO dates Mon–Sun for the week starting `monday`. */
export function weekDays(monday: string): string[] {
  const base = new Date(monday + "T12:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

/** Shift a Monday ISO by whole weeks (positive = forward). */
export function addWeeks(monday: string, weeks: number): string {
  const d = new Date(monday + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + weeks * 7);
  return mondayOf(d.toISOString().slice(0, 10));
}

/** "Mon Jul 20" style short label for an ISO date-only string. */
export function fmtDayShort(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

/** "Mon" weekday abbreviation. */
export function fmtWeekday(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short" });
}

/** Format an ISO datetime as a clock time ("2:05 PM"). Null-safe. */
export function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

/** Format a "HH:MM" 24h string as a friendly 12h clock ("2:05 PM"). */
export function fmt12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(n => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Decimal hours between two "HH:MM" strings; 0 if malformed or end ≤ start. */
export function shiftHours(start: string, end: string): number {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (s === null || e === null || e <= s) return 0;
  return (e - s) / 60;
}

function toMinutes(hhmm: string): number | null {
  const parts = hhmm.split(":");
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Decimal hours a punch has accrued so far (uses currentTime() while open). */
export function punchHours(inAt: string, outAt: string | null): number {
  const start = new Date(inAt).getTime();
  const end = outAt ? new Date(outAt).getTime() : currentTime().getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0;
  return (end - start) / 3_600_000;
}

/** "3h 42m" elapsed label for a punch. */
export function elapsedLabel(inAt: string, outAt: string | null): string {
  const h = punchHours(inAt, outAt);
  const whole = Math.floor(h);
  const mins = Math.round((h - whole) * 60);
  return `${whole}h ${mins}m`;
}

/** Weekly scheduled hours for one staff member across a set of shifts. */
export function scheduledHours(shifts: Shift[]): number {
  return shifts.reduce((sum, s) => sum + shiftHours(s.start, s.end), 0);
}

export function fmtHours(h: number): string {
  return h.toFixed(2);
}

export const ROLE_LABELS: Record<TeamRole, string> = {
  pitmaster: "Pitmaster",
  counter: "Counter / FOH",
  catering_lead: "Catering Lead",
  packer: "Packer",
  driver: "Driver",
  kitchen: "Kitchen",
};

export const ROLE_OPTIONS: TeamRole[] = [
  "pitmaster", "counter", "catering_lead", "packer", "driver", "kitchen",
];

/** Tailwind accent classes per role (ink/zinc/fire/amber/green/red palette). */
export const ROLE_ACCENT: Record<TeamRole, string> = {
  pitmaster: "text-fire-light border-fire/50 bg-fire/10",
  counter: "text-sky-300 border-sky-700/50 bg-sky-600/10",
  catering_lead: "text-amber-300 border-amber-700/50 bg-amber-600/10",
  packer: "text-green-300 border-green-700/50 bg-green-600/10",
  driver: "text-purple-300 border-purple-700/50 bg-purple-600/10",
  kitchen: "text-zinc-300 border-ink-700 bg-ink-800",
};

/** Look up a staff member by id (null-safe). */
export function staffById(staff: StaffMember[], id: string): StaffMember | null {
  return staff.find(s => s.id === id) ?? null;
}
