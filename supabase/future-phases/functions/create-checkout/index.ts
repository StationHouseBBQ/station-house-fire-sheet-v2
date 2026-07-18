/**
 * create-checkout — public checkout Edge Function (docs/ARCHITECTURE.md §6–§7).
 *
 * Mirrors app/src/dal/demo/publicFlows.ts exactly, with real money:
 *   1. Parse + basic-validate the cart. Client sends ids + qty ONLY — prices,
 *      tax, totals, and inventory effects are computed here (§6.1).
 *   2. Persist a checkout_attempts row FIRST (§6.2); its UUID is the Square
 *      idempotency key and reference_id.
 *   3. Enforce ET ordering windows (Fri closes Thu 17:00; Sat opens Thu 17:00,
 *      closes Fri 15:00; Cuban closes Thu 14:00) — computed via Intl in
 *      America/New_York, re-checked in SQL.
 *   4. Recompute prices from fire_drop_products / menu_items; 7.5% tax
 *      round-half-up; pre-check sold-out/caps/slot capacity.
 *   5. Create the Square payment (SANDBOX ONLY), verify status/amount/
 *      currency/location server-side (§6.3).
 *   6. Finalize via checkout_fire_drop() (0003_checkout_fn.sql), which locks
 *      product + slot rows and inserts the order transactionally (§7). If
 *      finalize loses a cap race, the payment is refunded.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SQUARE_ACCESS_TOKEN = Deno.env.get("SQUARE_ACCESS_TOKEN");
const SQUARE_LOCATION_ID = Deno.env.get("SQUARE_LOCATION_ID");
// Sandbox only until the owner approves production credentials (§6.8).
const SQUARE_BASE = "https://connect.squareupsandbox.com";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── ET time helpers (mirror app/src/lib/time.ts) ─────────────────────────
const BUSINESS_TZ = "America/New_York";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function etWeekMinute(now: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const weekday = WEEKDAYS.indexOf(parts.weekday);
  const mondayIndexed = (weekday + 6) % 7; // Mon=0 … Sun=6
  return mondayIndexed * 1440 + (Number(parts.hour) % 24) * 60 + Number(parts.minute);
}

const THU_5PM = 3 * 1440 + 17 * 60;
const THU_2PM = 3 * 1440 + 14 * 60;
const FRI_3PM = 4 * 1440 + 15 * 60;

function isOrderingOpen(channel: string, day: string, now = new Date()): string | null {
  const m = etWeekMinute(now);
  if (channel === "cuban_thursday") {
    return m < THU_2PM ? null : "Cuban Thursday ordering for this week has closed (Thu 2:00 PM ET).";
  }
  if (day === "saturday") {
    return m >= THU_5PM && m < FRI_3PM
      ? null
      : "Saturday ordering is open Thu 5:00 PM – Fri 3:00 PM ET only.";
  }
  return m < THU_5PM ? null : "Friday pickup ordering closed Thursday at 5:00 PM ET.";
}

// 7.5% tax, round half up (mirror app/src/lib/money.ts).
const SALES_TAX_RATE_BP = 750;
const taxCents = (subtotal: number) => Math.floor((subtotal * SALES_TAX_RATE_BP) / 10000 + 0.5);

// ── Types ────────────────────────────────────────────────────────────────
interface CheckoutBody {
  channel: "fire_drop" | "cuban_thursday";
  day: "friday" | "saturday" | "thursday";
  slot_id: string | number | null;
  items: Array<{ product_id: string | number; qty: number }>;
  customer: { name: string; phone: string; email: string };
  attribution: Record<string, string | null> | null;
  payment_token: string; // Square Web Payments SDK source id
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── Handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method not allowed" });

  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid JSON body" });
  }

  // Basic validation — identical rules to the demo checkout.
  if (body.channel !== "fire_drop" && body.channel !== "cuban_thursday") {
    return json(400, { error: "invalid channel" });
  }
  if (!body.customer?.name?.trim()) return json(400, { error: "Name is required" });
  if (!body.customer.phone?.trim() && !body.customer.email?.trim()) {
    return json(400, { error: "Phone or email is required" });
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return json(400, { error: "Cart is empty" });
  }
  for (const i of body.items) {
    if (!Number.isInteger(i.qty) || i.qty < 1) return json(400, { error: "Invalid quantity" });
  }
  if (!body.payment_token) return json(400, { error: "Missing payment token" });

  const day = body.channel === "cuban_thursday" ? "thursday" : body.day === "saturday" ? "saturday" : "friday";

  // 1) checkout_attempts row FIRST — before any pricing or payment work.
  const cart = {
    channel: body.channel,
    day,
    slot_id: body.slot_id === null || body.slot_id === undefined ? null : String(body.slot_id),
    items: body.items.map((i) => ({ product_id: String(i.product_id), qty: i.qty })),
    customer: body.customer,
  };
  const { data: attempt, error: attemptErr } = await db
    .from("checkout_attempts")
    .insert({
      cart,
      subtotal_cents: 0,
      tax_cents: 0,
      total_cents: 0,
      contact_snapshot: body.customer,
      attribution: body.attribution ?? null,
      status: "created",
    })
    .select("id")
    .single();
  if (attemptErr || !attempt) {
    console.error("attempt insert failed", attemptErr);
    return json(500, { error: "could not start checkout" });
  }
  const attemptId: string = attempt.id;

  // 2) ET ordering window (re-checked in SQL inside checkout_fire_drop).
  const windowError = isOrderingOpen(body.channel, day);
  if (windowError) return json(409, { error: windowError });

  // 3) Server-side pricing from the catalog (advisory pre-check; the
  //    authoritative cap/capacity enforcement is the locked SQL transaction).
  let subtotal = 0;
  try {
    if (body.channel === "fire_drop") {
      const { data: drop, error } = await db
        .from("fire_drops")
        .select("id, sold_out, friday_date, saturday_date")
        .order("friday_date", { ascending: false })
        .limit(1)
        .single();
      if (error || !drop) throw new Error("No active Fire Drop");
      if (drop.sold_out) throw new Error("This week's Fire Drop is sold out.");
      if (!cart.slot_id) throw new Error("Choose a pickup window");

      const { data: slot } = await db
        .from("fire_drop_slots")
        .select("id, day, capacity, booked")
        .eq("id", cart.slot_id)
        .eq("drop_id", drop.id)
        .eq("day", day)
        .maybeSingle();
      if (!slot) throw new Error("Pickup window not found for that day");
      if (slot.booked >= slot.capacity) throw new Error("That pickup window is full — choose another.");

      const ids = cart.items.map((i) => i.product_id);
      const { data: products } = await db
        .from("fire_drop_products")
        .select("id, name, price_cents, cap_qty, sold_qty, sold_out")
        .eq("drop_id", drop.id)
        .in("id", ids);
      for (const it of cart.items) {
        const p = (products ?? []).find((x) => String(x.id) === it.product_id);
        if (!p) throw new Error("Product not found");
        if (p.sold_out) throw new Error(`${p.name} is sold out (86'd).`);
        if (p.cap_qty !== null && p.sold_qty + it.qty > p.cap_qty) {
          throw new Error(`Only ${Math.max(0, p.cap_qty - p.sold_qty)} left of ${p.name}.`);
        }
        subtotal += p.price_cents * it.qty;
      }
    } else {
      const ids = cart.items.map((i) => i.product_id);
      const { data: items } = await db
        .from("menu_items")
        .select("id, name, price_cents, active, thursday_only")
        .in("id", ids);
      for (const it of cart.items) {
        const m = (items ?? []).find((x) => String(x.id) === it.product_id);
        if (!m) throw new Error("Menu item not found");
        if (!m.active) throw new Error(`${m.name} is not available.`);
        if (!m.thursday_only) throw new Error(`${m.name} is not part of Cuban Thursday.`);
        subtotal += m.price_cents * it.qty;
      }
    }
  } catch (e) {
    return json(409, { error: e instanceof Error ? e.message : "validation failed" });
  }

  const tax = taxCents(subtotal);
  const total = subtotal + tax;
  await db
    .from("checkout_attempts")
    .update({ subtotal_cents: subtotal, tax_cents: tax, total_cents: total, status: "payment_pending" })
    .eq("id", attemptId);

  // 4) Square payment — sandbox only. Unconfigured environments fail closed.
  if (!SQUARE_ACCESS_TOKEN || !SQUARE_LOCATION_ID) {
    return json(503, { error: "payments not configured" });
  }
  const payRes = await fetch(`${SQUARE_BASE}/v2/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": "2025-01-23",
    },
    body: JSON.stringify({
      idempotency_key: attemptId,
      source_id: body.payment_token,
      amount_money: { amount: total, currency: "USD" },
      location_id: SQUARE_LOCATION_ID,
      reference_id: attemptId, // the attempt UUID rides in Square metadata (§6.2)
      note: `Station House ${body.channel} pickup`,
    }),
  });
  const payJson = await payRes.json().catch(() => ({}));
  const payment = payJson?.payment;
  if (!payRes.ok || !payment?.id) {
    console.error("square payment failed", payJson);
    await db.from("checkout_attempts").update({ status: "abandoned" }).eq("id", attemptId);
    return json(402, { error: "Payment was declined. You were not charged." });
  }

  // Persist the payment id on the attempt immediately — this is what the
  // webhook recovery path keys on if we crash past this point.
  await db.from("checkout_attempts").update({ square_payment_id: payment.id }).eq("id", attemptId);

  // 5) Verify server-side: status, amount, currency, location (§6.3).
  if (
    payment.status !== "COMPLETED" ||
    payment.amount_money?.amount !== total ||
    payment.amount_money?.currency !== "USD" ||
    payment.location_id !== SQUARE_LOCATION_ID
  ) {
    console.error("square payment verification failed", {
      attemptId,
      status: payment.status,
      amount: payment.amount_money,
      location: payment.location_id,
    });
    return json(502, { error: "Payment could not be verified. Contact the shop with your card statement." });
  }

  // 6) Transactional finalize: locks + caps + insert, all-or-nothing.
  const { data: result, error: rpcErr } = await db.rpc("checkout_fire_drop", {
    p_attempt_id: attemptId,
    p_square_payment_id: payment.id,
    p_skip_window: false,
  });
  if (rpcErr) {
    // Lost a cap/capacity race after charging — refund and report.
    console.error("finalize failed, refunding", { attemptId, rpcErr });
    await fetch(`${SQUARE_BASE}/v2/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SQUARE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        "Square-Version": "2025-01-23",
      },
      body: JSON.stringify({
        idempotency_key: `${attemptId}-refund`,
        payment_id: payment.id,
        amount_money: { amount: total, currency: "USD" },
        reason: "checkout finalize failed (cap/capacity race)",
      }),
    }).catch((e) => console.error("refund call failed — manual refund required", attemptId, e));
    await db.from("checkout_attempts").update({ status: "abandoned" }).eq("id", attemptId);
    return json(409, {
      error: `${rpcErr.message ?? "Order could not be completed"} Your card was refunded.`,
    });
  }

  return json(200, {
    order_ref: result.order_ref,
    total_cents: result.total_cents,
    pickup_date: result.pickup_date,
    pickup_window: result.pickup_window,
  });
});
