/**
 * Row types for the Phase 1 schema — mirror
 * supabase/migrations/0001_phase1_foundation.sql exactly (snake_case columns).
 * Regenerate against the migration whenever the schema changes.
 */

// ── Enums (public.* Postgres enums) ───────────────────────────────────────
export type StaffRole = "owner" | "manager" | "counter" | "kitchen" | "catering" | "marketing";
export type Phase1OrderType = "fire_drop" | "seminole_preorder" | "catering" | "walk_in";
export type Phase1OrderStatus =
  | "draft" | "pending" | "confirmed" | "in_production" | "ready" | "picked_up" | "cancelled";
export type PaymentStatus =
  | "unpaid" | "pending" | "paid" | "partially_refunded" | "refunded" | "failed";
export type Phase1LeadStage =
  | "new_lead" | "contacted" | "quote_sent" | "follow_up" | "booked" | "lost";

// ── Rows ──────────────────────────────────────────────────────────────────
export interface ProfileRow {
  id: string;                    // uuid, references auth.users
  full_name: string | null;
  email: string | null;
  role: StaffRole;
  active: boolean;
  created_at: string;            // timestamptz ISO
  updated_at: string;
}

export interface CustomerRow {
  id: string;                    // uuid
  full_name: string;
  phone: string | null;
  email: string | null;          // CHECK: phone or email required
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  id: string;                    // uuid
  sku: string;                   // unique
  name: string;
  description: string | null;
  category: string;
  price_cents: number;           // integer cents, >= 0
  production_unit: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface OrderRow {
  id: string;                    // uuid
  order_number: string;          // unique; DB trigger fills when null on insert
  customer_id: string | null;
  order_type: Phase1OrderType;
  pickup_day: string | null;     // date (YYYY-MM-DD)
  pickup_window: string | null;
  status: Phase1OrderStatus;
  payment_status: PaymentStatus;
  subtotal_cents: number;
  tax_cents: number;
  tip_cents: number;
  total_cents: number;           // CHECK: = subtotal + tax + tip
  notes: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface OrderItemRow {
  id: string;                    // uuid
  order_id: string;
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_cents: number;      // integer cents, >= 0
  quantity: number;              // > 0
  line_total_cents: number;      // CHECK: = unit_price_cents * quantity
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** Order with its items joined (select('*, order_items(*)')). */
export interface OrderWithItemsRow extends OrderRow {
  order_items: OrderItemRow[];
}

export interface CateringLeadRow {
  id: string;                    // uuid
  customer_id: string | null;
  contact_name: string;
  company_name: string | null;
  event_description: string | null;
  estimated_value_cents: number | null;
  source: string;                // default 'direct'
  stage: Phase1LeadStage;        // default 'new_lead'
  event_date: string | null;     // date (YYYY-MM-DD)
  guest_count: number | null;    // > 0
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuditLogRow {
  id: number;                    // bigint identity
  actor_user_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  before_data: unknown | null;
  after_data: unknown | null;
  created_at: string;
}
