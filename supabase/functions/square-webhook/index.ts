/**
 * square-webhook — Square webhook receiver (docs/ARCHITECTURE.md §6.4–§6.6).
 *
 * Order of operations is load-bearing:
 *   1. Read the RAW request body text BEFORE any JSON.parse — the HMAC is
 *      computed over the exact bytes Square sent.
 *   2. Verify x-square-hmacsha256-signature = base64(HMAC-SHA256(
 *      webhook signature key, notification_url + raw_body)). Missing or
 *      invalid signature → 401, nothing persisted.
 *   3. Idempotency: insert webhook_events keyed by event_id (on conflict do
 *      nothing). If the event was already processed (processed_at set),
 *      return 200 immediately.
 *   4. On payment completed: look up checkout_attempts by square_payment_id.
 *      If the payment succeeded but the browser died before finalize, recover
 *      the order EXACTLY ONCE via checkout_fire_drop(skip_window := true) —
 *      the function is idempotent per attempt (unique checkout_attempt_id).
 *   5. processed_at is set ONLY after the work commits. Any failure → 500 so
 *      Square retries.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SIGNATURE_KEY = Deno.env.get("SQUARE_WEBHOOK_SIGNATURE_KEY");
// Must exactly match the notification URL configured in the Square dashboard.
const NOTIFICATION_URL = Deno.env.get("SQUARE_NOTIFICATION_URL");

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const encoder = new TextEncoder();

async function hmacBase64(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Constant-time string comparison — no early exit on first mismatch. */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = encoder.encode(a);
  const bb = encoder.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  // 1) RAW body first. Never parse before verifying.
  const rawBody = await req.text();

  // 2) Signature verification.
  const signature = req.headers.get("x-square-hmacsha256-signature");
  if (!SIGNATURE_KEY || !NOTIFICATION_URL) {
    console.error("webhook not configured: SQUARE_WEBHOOK_SIGNATURE_KEY / SQUARE_NOTIFICATION_URL");
    return new Response("webhook not configured", { status: 503 });
  }
  if (!signature) return new Response("missing signature", { status: 401 });
  const expected = await hmacBase64(SIGNATURE_KEY, NOTIFICATION_URL + rawBody);
  if (!timingSafeEqual(signature, expected)) {
    console.error("invalid webhook signature");
    return new Response("invalid signature", { status: 401 });
  }

  // Safe to parse now.
  let event: {
    event_id?: string;
    type?: string;
    data?: { object?: { payment?: { id?: string; status?: string } } };
  };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("malformed body", { status: 400 });
  }
  const eventId = event.event_id;
  const kind = event.type ?? "unknown";
  if (!eventId) return new Response("missing event_id", { status: 400 });

  try {
    // 3) Idempotency: event_id is the primary key.
    const { error: insertErr } = await db
      .from("webhook_events")
      .upsert(
        { event_id: eventId, kind, raw_body: rawBody, signature_valid: true },
        { onConflict: "event_id", ignoreDuplicates: true },
      );
    if (insertErr) throw insertErr;

    const { data: existing, error: readErr } = await db
      .from("webhook_events")
      .select("processed_at")
      .eq("event_id", eventId)
      .single();
    if (readErr) throw readErr;
    if (existing.processed_at) return new Response("already processed", { status: 200 });

    // 4) Payment completed → recovery check.
    const payment = event.data?.object?.payment;
    const isPaymentCompleted =
      (kind === "payment.updated" || kind === "payment.created") && payment?.status === "COMPLETED";

    if (isPaymentCompleted && payment?.id) {
      const { data: attempt, error: attemptErr } = await db
        .from("checkout_attempts")
        .select("id, status")
        .eq("square_payment_id", payment.id)
        .maybeSingle();
      if (attemptErr) throw attemptErr;

      if (attempt) {
        // checkout_fire_drop is idempotent per attempt: if the order already
        // exists it returns it; otherwise this is the exactly-once recovery
        // (skip_window — the customer paid inside the window).
        const { data: result, error: rpcErr } = await db.rpc("checkout_fire_drop", {
          p_attempt_id: attempt.id,
          p_square_payment_id: payment.id,
          p_skip_window: true,
        });
        if (rpcErr) throw rpcErr;
        if (result && result.already_existed === false) {
          console.log("recovered order from attempt", attempt.id, result.order_ref);
        }
      } else {
        // Verified payment with no attempt: flag for a human, then ack.
        console.error("payment.completed with no checkout attempt", payment.id);
        const { error: outboxErr } = await db.from("notifications_outbox").insert({
          event: "payment.orphaned",
          payload: { square_payment_id: payment.id, event_id: eventId },
        });
        if (outboxErr) throw outboxErr;
      }
    }

    // 5) Mark processed ONLY after all work above committed.
    const { error: doneErr } = await db
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("event_id", eventId)
      .is("processed_at", null);
    if (doneErr) throw doneErr;

    return new Response("ok", { status: 200 });
  } catch (e) {
    // 500 → Square retries; idempotency above makes the retry safe.
    console.error("webhook processing failed", eventId, e);
    return new Response("processing failed", { status: 500 });
  }
});
