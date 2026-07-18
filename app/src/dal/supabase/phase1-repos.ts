/**
 * Phase1Repos — the eight approved data methods against the REAL Phase 1
 * schema (supabase/migrations/0001_phase1_foundation.sql).
 *
 * Contract: every method either returns typed rows from the database or
 * throws a descriptive Error. There is NO silent fallback to demo data —
 * ever. If Supabase is unreachable or a query fails, callers see the error.
 */
import { getSupabase } from "./client";
import { orderTotals, lineTotalCents } from "../../lib/money";
import type {
  CateringLeadRow,
  CustomerRow,
  OrderItemRow,
  OrderRow,
  OrderWithItemsRow,
  Phase1LeadStage,
  Phase1OrderStatus,
  Phase1OrderType,
  ProductRow,
} from "./phase1-types";

export interface CreateOrderInput {
  customer: { fullName: string; phone: string; email: string };
  orderType: Phase1OrderType;
  pickupDay: string | null;      // ISO date (YYYY-MM-DD) or null
  pickupWindow: string;
  items: Array<{ productId: string; quantity: number }>;
  tipCents: number;
}

export interface CreateCateringLeadInput {
  contactName: string;
  companyName?: string | null;
  eventDescription?: string | null;
  estimatedValueCents?: number | null;
  source?: string;               // defaults to 'direct' in the DB
  stage?: Phase1LeadStage;       // defaults to 'new_lead' in the DB
  eventDate?: string | null;     // ISO date
  guestCount?: number | null;
  notes?: string | null;
  customerId?: string | null;
}

function fail(op: string, detail: string): never {
  throw new Error(`[supabase:${op}] ${detail}`);
}

/** Escape %,_ and PostgREST reserved chars for use inside an .or() ilike pattern. */
function ilikeTerm(search: string): string {
  return search.replace(/[%_,()]/g, " ").trim();
}

export class Phase1Repos {
  private get sb() {
    return getSupabase();
  }

  /** 1. Active products, ordered by category then sort_order. */
  async getProducts(): Promise<ProductRow[]> {
    const { data, error } = await this.sb
      .from("products")
      .select("*")
      .eq("active", true)
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) fail("getProducts", error.message);
    return (data ?? []) as ProductRow[];
  }

  /** 2. Orders (newest first) with order_items joined; optional filters. */
  async getOrders(filter?: {
    status?: Phase1OrderStatus;
    orderType?: Phase1OrderType;
    pickupDay?: string;          // ISO date
  }): Promise<OrderWithItemsRow[]> {
    let q = this.sb.from("orders").select("*, order_items(*)");
    if (filter?.status) q = q.eq("status", filter.status);
    if (filter?.orderType) q = q.eq("order_type", filter.orderType);
    if (filter?.pickupDay) q = q.eq("pickup_day", filter.pickupDay);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) fail("getOrders", error.message);
    return (data ?? []) as OrderWithItemsRow[];
  }

  /**
   * 3. Create an order end-to-end:
   *    upsert/find customer → fetch real prices from the DB (client-supplied
   *    prices are never trusted) → compute integer-cent totals via the shared
   *    money functions (7.5% tax + tip) → insert order (order_number omitted
   *    so the DB trigger next_order_number() fills it) → insert order_items
   *    with name/price snapshots → return the full order with items.
   *
   * STAGING CONVENIENCE — NOT the final shape. These are separate PostgREST
   * calls, so a mid-flight failure can leave a partial order (we best-effort
   * delete the order row if item insert fails). Phase 2 moves order creation
   * into a single transactional RPC (security definer function) so the whole
   * flow commits or rolls back atomically.
   */
  async createOrder(input: CreateOrderInput): Promise<OrderWithItemsRow> {
    if (!Number.isInteger(input.tipCents) || input.tipCents < 0) {
      fail("createOrder", `tipCents must be a non-negative integer, got ${input.tipCents}`);
    }
    if (input.items.length === 0) fail("createOrder", "order must contain at least one item");

    const customer = await this.findOrCreateCustomer(input.customer);

    // Real prices from the DB — never from the client.
    const productIds = [...new Set(input.items.map(i => i.productId))];
    const { data: products, error: prodErr } = await this.sb
      .from("products")
      .select("*")
      .in("id", productIds);
    if (prodErr) fail("createOrder", `failed to fetch product prices: ${prodErr.message}`);
    const byId = new Map((products ?? []).map(p => [(p as ProductRow).id, p as ProductRow]));
    for (const item of input.items) {
      const p = byId.get(item.productId);
      if (!p) fail("createOrder", `product ${item.productId} not found`);
      if (!p.active) fail("createOrder", `product "${p.name}" (${p.sku}) is inactive`);
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        fail("createOrder", `quantity for "${p.name}" must be a positive integer`);
      }
    }

    const lines = input.items.map(i => ({
      unitPriceCents: byId.get(i.productId)!.price_cents,
      qty: i.quantity,
    }));
    const totals = orderTotals(lines, input.tipCents); // shared fns: 7.5% half-up + tip

    // order_number intentionally omitted → BEFORE INSERT trigger fills it
    // via public.next_order_number(order_type).
    const { data: orderRow, error: orderErr } = await this.sb
      .from("orders")
      .insert({
        customer_id: customer.id,
        order_type: input.orderType,
        pickup_day: input.pickupDay,
        pickup_window: input.pickupWindow,
        status: "confirmed" satisfies Phase1OrderStatus,
        payment_status: "unpaid",
        subtotal_cents: totals.subtotalCents,
        tax_cents: totals.taxCents,
        tip_cents: totals.tipCents,
        total_cents: totals.totalCents,
      })
      .select("*")
      .single();
    if (orderErr || !orderRow) fail("createOrder", `order insert failed: ${orderErr?.message ?? "no row returned"}`);
    const order = orderRow as OrderRow;

    const itemRows = input.items.map(i => {
      const p = byId.get(i.productId)!;
      return {
        order_id: order.id,
        product_id: p.id,
        product_name_snapshot: p.name,
        unit_price_cents: p.price_cents,
        quantity: i.quantity,
        line_total_cents: lineTotalCents(p.price_cents, i.quantity),
      };
    });
    const { data: insertedItems, error: itemsErr } = await this.sb
      .from("order_items")
      .insert(itemRows)
      .select("*");
    if (itemsErr) {
      // Best-effort cleanup of the orphan order (see Phase-2 RPC note above).
      await this.sb.from("orders").delete().eq("id", order.id);
      fail("createOrder", `order_items insert failed (order rolled back best-effort): ${itemsErr.message}`);
    }

    return { ...order, order_items: (insertedItems ?? []) as OrderItemRow[] };
  }

  /**
   * 4. Update order status. Sets completed_at when the order is picked up.
   *    Writes an audit_log row (best-effort — audit failure never blocks the
   *    operational update, but it is logged to the console).
   */
  async updateOrderStatus(
    orderId: string,
    status: Phase1OrderStatus,
    opts?: { actorUserId?: string | null },
  ): Promise<OrderRow> {
    const { data: beforeRow, error: beforeErr } = await this.sb
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();
    if (beforeErr || !beforeRow) fail("updateOrderStatus", `order ${orderId} not found: ${beforeErr?.message ?? ""}`);
    const before = beforeRow as OrderRow;

    const patch: Partial<OrderRow> = { status };
    if (status === "picked_up") patch.completed_at = new Date().toISOString();

    const { data: afterRow, error: updErr } = await this.sb
      .from("orders")
      .update(patch)
      .eq("id", orderId)
      .select("*")
      .single();
    if (updErr || !afterRow) fail("updateOrderStatus", `update failed: ${updErr?.message ?? "no row returned"}`);
    const after = afterRow as OrderRow;

    await this.writeAudit({
      entity_type: "order",
      entity_id: orderId,
      action: `status:${before.status}->${status}`,
      before_data: { status: before.status, completed_at: before.completed_at },
      after_data: { status: after.status, completed_at: after.completed_at },
      actor_user_id: opts?.actorUserId ?? null,
    });

    return after;
  }

  /** 5. Customers, optionally filtered by ilike on full_name/phone/email. */
  async getCustomers(search?: string): Promise<CustomerRow[]> {
    let q = this.sb.from("customers").select("*");
    const term = search ? ilikeTerm(search) : "";
    if (term) {
      q = q.or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    }
    const { data, error } = await q.order("full_name", { ascending: true });
    if (error) fail("getCustomers", error.message);
    return (data ?? []) as CustomerRow[];
  }

  /** 6. Catering leads, optionally by stage, newest first. */
  async getCateringLeads(stage?: Phase1LeadStage): Promise<CateringLeadRow[]> {
    let q = this.sb.from("catering_leads").select("*");
    if (stage) q = q.eq("stage", stage);
    const { data, error } = await q.order("created_at", { ascending: false });
    if (error) fail("getCateringLeads", error.message);
    return (data ?? []) as CateringLeadRow[];
  }

  /** 7. Create a catering lead. */
  async createCateringLead(input: CreateCateringLeadInput): Promise<CateringLeadRow> {
    if (
      input.estimatedValueCents != null &&
      (!Number.isInteger(input.estimatedValueCents) || input.estimatedValueCents < 0)
    ) {
      fail("createCateringLead", "estimatedValueCents must be a non-negative integer (cents)");
    }
    const { data, error } = await this.sb
      .from("catering_leads")
      .insert({
        contact_name: input.contactName,
        company_name: input.companyName ?? null,
        event_description: input.eventDescription ?? null,
        estimated_value_cents: input.estimatedValueCents ?? null,
        ...(input.source ? { source: input.source } : {}),
        ...(input.stage ? { stage: input.stage } : {}),
        event_date: input.eventDate ?? null,
        guest_count: input.guestCount ?? null,
        notes: input.notes ?? null,
        customer_id: input.customerId ?? null,
      })
      .select("*")
      .single();
    if (error || !data) fail("createCateringLead", error?.message ?? "no row returned");
    return data as CateringLeadRow;
  }

  /** 8. Move a catering lead to a new stage + audit row (best-effort). */
  async updateCateringLeadStage(
    id: string,
    stage: Phase1LeadStage,
    opts?: { actorUserId?: string | null },
  ): Promise<CateringLeadRow> {
    const { data: beforeRow, error: beforeErr } = await this.sb
      .from("catering_leads")
      .select("*")
      .eq("id", id)
      .single();
    if (beforeErr || !beforeRow) fail("updateCateringLeadStage", `lead ${id} not found: ${beforeErr?.message ?? ""}`);
    const before = beforeRow as CateringLeadRow;

    const { data: afterRow, error: updErr } = await this.sb
      .from("catering_leads")
      .update({ stage })
      .eq("id", id)
      .select("*")
      .single();
    if (updErr || !afterRow) fail("updateCateringLeadStage", `update failed: ${updErr?.message ?? "no row returned"}`);
    const after = afterRow as CateringLeadRow;

    await this.writeAudit({
      entity_type: "catering_lead",
      entity_id: id,
      action: `stage:${before.stage}->${stage}`,
      before_data: { stage: before.stage },
      after_data: { stage: after.stage },
      actor_user_id: opts?.actorUserId ?? null,
    });

    return after;
  }

  // ── internals ───────────────────────────────────────────────────────────

  /**
   * Find a customer by email (case-insensitive) or phone; insert otherwise.
   * Not a true DB upsert — Phase 2's transactional RPC owns dedup properly.
   */
  private async findOrCreateCustomer(c: { fullName: string; phone: string; email: string }): Promise<CustomerRow> {
    const email = c.email.trim();
    const phone = c.phone.trim();
    if (!email && !phone) fail("createOrder", "customer needs a phone or an email (DB constraint)");

    if (email) {
      const { data, error } = await this.sb
        .from("customers")
        .select("*")
        .ilike("email", email)
        .limit(1);
      if (error) fail("createOrder", `customer lookup by email failed: ${error.message}`);
      if (data && data.length > 0) return data[0] as CustomerRow;
    }
    if (phone) {
      const { data, error } = await this.sb
        .from("customers")
        .select("*")
        .eq("phone", phone)
        .limit(1);
      if (error) fail("createOrder", `customer lookup by phone failed: ${error.message}`);
      if (data && data.length > 0) return data[0] as CustomerRow;
    }

    const { data, error } = await this.sb
      .from("customers")
      .insert({ full_name: c.fullName.trim(), phone: phone || null, email: email || null })
      .select("*")
      .single();
    if (error || !data) fail("createOrder", `customer insert failed: ${error?.message ?? "no row returned"}`);
    return data as CustomerRow;
  }

  /** Append an audit_log row; failures are logged, never thrown. */
  private async writeAudit(row: {
    entity_type: string;
    entity_id: string;
    action: string;
    before_data: unknown;
    after_data: unknown;
    actor_user_id: string | null;
  }): Promise<void> {
    try {
      const { error } = await this.sb.from("audit_log").insert(row);
      if (error) console.warn(`[supabase:audit] insert failed (non-blocking): ${error.message}`);
    } catch (e) {
      console.warn("[supabase:audit] insert threw (non-blocking):", e);
    }
  }
}
