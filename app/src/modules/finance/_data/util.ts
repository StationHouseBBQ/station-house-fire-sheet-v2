/**
 * Shared Finance helpers. Kept tiny and dependency-free so every tab formats
 * dates and month buckets the same way.
 */
import type { CateringOrder } from "../../../dal/types";

/** Format an ISO date-only string ("2026-07-25") for display. Null-safe. */
export function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", day: "numeric", year: "numeric",
  });
}

/** Format a full ISO datetime for a ledger row. Null-safe. */
export function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "2026-07" bucket key from any ISO string, or null when unparseable. */
export function monthKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? iso + "T12:00:00Z" : iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a "2026-07" month key. */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    timeZone: "UTC", month: "short", year: "numeric",
  });
}

/** Balance owed on an order (never negative). */
export function balanceCents(o: CateringOrder): number {
  return Math.max(0, o.totalCents - o.paidCents);
}

/** True once an invoice has actually been issued. */
export function isInvoiced(o: CateringOrder): boolean {
  return o.invoicedAt !== null || o.stage === "invoiced" || o.stage === "paid" ||
    o.stage === "in_kitchen" || o.stage === "ready" || o.stage === "completed";
}

/** True while the order is still an open quote (not yet accepted/invoiced). */
export function isOpenQuote(o: CateringOrder): boolean {
  return o.stage === "quoting" || o.stage === "quote_sent" || o.stage === "accepted";
}
