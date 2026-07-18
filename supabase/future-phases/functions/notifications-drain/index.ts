/**
 * notifications-drain — drains notifications_outbox (docs/ARCHITECTURE.md §8).
 *
 * Durable outbox semantics:
 *   - Each row is one owner notification (lead.created / order.created /
 *     drop.advanced / payment.orphaned …). The lead/order itself was already
 *     committed; a failed send never duplicates business data.
 *   - Idempotent per row id: sent_at is set with a `is null` guard, so a
 *     concurrent drain can't double-mark, and rows are only attempted when
 *     next_attempt_at has passed.
 *   - Exponential backoff: attempts++ and next_attempt_at = now + min(2^attempts, 60) min.
 *   - If RESEND_API_KEY is unset (pre-production), rows are logged and left
 *     unsent — nothing is lost, nothing emails real recipients (§8: live
 *     recipients activate only after owner-approved production testing).
 *
 * Invoke on a schedule (e.g. pg_cron + pg_net every minute, or an external
 * cron hitting this endpoint) or ad hoc after bulk operations.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_ADDRESS = Deno.env.get("NOTIFY_FROM") ?? "Station House BBQ <notifications@stationhousebbq.com>";
const RECIPIENTS = (Deno.env.get("NOTIFY_RECIPIENTS") ?? "catering@stationhousebbq.com,info@stationhousebbq.com")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const BATCH_SIZE = 25;
const MAX_BACKOFF_MIN = 60;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface OutboxRow {
  id: number;
  event: string;
  payload: Record<string, unknown>;
  attempts: number;
  next_attempt_at: string;
  sent_at: string | null;
}

function renderEmail(row: OutboxRow): { subject: string; text: string } {
  const p = row.payload ?? {};
  switch (row.event) {
    case "order.created":
      return {
        subject: `New ${p.channel ?? "pickup"} order ${p.order_ref ?? ""} — $${(((p.total_cents as number) ?? 0) / 100).toFixed(2)}`,
        text: `Customer: ${p.customer ?? "?"}\nPickup: ${p.pickup_date ?? "?"} ${p.pickup_window ?? ""}\nOrder ref: ${p.order_ref ?? "?"}`,
      };
    case "lead.created":
      return {
        subject: `New catering lead: ${p.name ?? p.customer ?? "unknown"}`,
        text: JSON.stringify(p, null, 2),
      };
    case "drop.advanced":
      return {
        subject: `Fire Drop advanced to ${p.friday ?? "?"} / ${p.saturday ?? "?"}`,
        text: `The weekly Fire Drop window advanced automatically.\n${JSON.stringify(p, null, 2)}`,
      };
    default:
      return { subject: `Station House event: ${row.event}`, text: JSON.stringify(p, null, 2) };
  }
}

async function sendViaResend(row: OutboxRow): Promise<void> {
  const { subject, text } = renderEmail(row);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: RECIPIENTS, subject, text }),
  });
  if (!res.ok) {
    throw new Error(`resend ${res.status}: ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await db
    .from("notifications_outbox")
    .select("id, event, payload, attempts, next_attempt_at, sent_at")
    .is("sent_at", null)
    .lte("next_attempt_at", nowIso)
    .order("id", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) {
    console.error("outbox read failed", error);
    return new Response("outbox read failed", { status: 500 });
  }

  let sent = 0;
  let deferred = 0;
  let skipped = 0;

  for (const row of (rows ?? []) as OutboxRow[]) {
    if (!RESEND_API_KEY) {
      // Pre-production: log and leave unsent. No attempts consumed — the row
      // sends untouched once the key is configured.
      console.log(`[dry-run] outbox #${row.id} ${row.event} →`, RECIPIENTS.join(", "), row.payload);
      skipped++;
      continue;
    }
    try {
      await sendViaResend(row);
      // sent_at only on success; `is null` guard keeps this idempotent per id.
      const { error: markErr } = await db
        .from("notifications_outbox")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("sent_at", null);
      if (markErr) throw markErr;
      sent++;
    } catch (e) {
      const attempts = row.attempts + 1;
      const backoffMin = Math.min(2 ** attempts, MAX_BACKOFF_MIN);
      const next = new Date(Date.now() + backoffMin * 60_000).toISOString();
      console.error(`outbox #${row.id} send failed (attempt ${attempts}, retry in ${backoffMin}m)`, e);
      await db
        .from("notifications_outbox")
        .update({ attempts, next_attempt_at: next })
        .eq("id", row.id)
        .is("sent_at", null);
      deferred++;
    }
  }

  return new Response(
    JSON.stringify({ picked: rows?.length ?? 0, sent, deferred, skipped, dryRun: !RESEND_API_KEY }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
