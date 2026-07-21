/**
 * Costing workspace — small shared UI + math helpers. Kept module-local so the
 * three tabs stay consistent (food-cost color thresholds, the save-status
 * badge, plain-number ↔ cents parsing) without touching shared files.
 */
import { formatCents } from "../../../lib/money";

export type Sync = "idle" | "saving" | "saved" | "error";

/** Food-cost % color band: green ≤30, amber ≤38, else red. */
export function foodCostTone(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "text-zinc-500";
  if (pct <= 30) return "text-green-400";
  if (pct <= 38) return "text-amber-300";
  return "text-red-400";
}

/** Bar fill color, same thresholds as foodCostTone. */
export function foodCostBar(pct: number): string {
  if (!Number.isFinite(pct) || pct <= 0) return "bg-zinc-700";
  if (pct <= 30) return "bg-emerald-500";
  if (pct <= 38) return "bg-amber-500";
  return "bg-red-500";
}

/** Parse a user-typed dollar string → integer cents (safe, non-negative). */
export function dollarsToCents(v: string): number {
  const n = Number.parseFloat(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Cents → plain dollar string for an editable input (no currency symbol). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export { formatCents };

export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
