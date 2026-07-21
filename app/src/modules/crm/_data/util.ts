/**
 * Shared CRM helpers: date formatting (UTC-noon to dodge TZ drift, matching the
 * rest of the app), lead labelling, and open-opportunity classification.
 */
import type { Lead, LeadStage } from "../../../dal/types";
import { currentTime } from "../../../lib/clock";

/** ISO date-only string for "today" in the business clock. */
export function todayIso(): string {
  return currentTime().toISOString().slice(0, 10);
}

/** Format an ISO date-only string ("2026-07-25") for display. Null-safe. */
export function fmtDate(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date((iso.length <= 10 ? iso + "T12:00:00Z" : iso));
  if (Number.isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

/** Format a full ISO datetime for a feed/thread row. */
export function fmtAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Whole days between two ISO strings (b - a), floored, never negative below 0. */
export function daysBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso.length <= 10 ? aIso + "T12:00:00Z" : aIso).getTime();
  const b = new Date(bIso.length <= 10 ? bIso + "T12:00:00Z" : bIso).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86_400_000);
}

/** A lead is an OPEN opportunity when it's neither won (booked) nor lost. */
export function isOpenOpportunity(lead: Lead): boolean {
  return lead.stage !== "booked" && lead.stage !== "lost";
}

/** Human label for a lead: "Name — Company" or just the name. */
export function leadLabel(lead: Lead): string {
  return lead.company ? `${lead.name} — ${lead.company}` : lead.name;
}

export const STAGE_LABELS: Record<LeadStage, string> = {
  new: "New",
  contacted: "Contacted",
  needs_quote: "Needs Quote",
  quote_sent: "Quote Sent",
  booked: "Booked",
  follow_up: "Follow Up",
  lost: "Lost",
};

/** Default win probability per stage (0–100) used for the weighted forecast. */
export const STAGE_PROBABILITY: Record<LeadStage, number> = {
  new: 10,
  contacted: 25,
  needs_quote: 40,
  quote_sent: 60,
  booked: 100,
  follow_up: 45,
  lost: 0,
};
