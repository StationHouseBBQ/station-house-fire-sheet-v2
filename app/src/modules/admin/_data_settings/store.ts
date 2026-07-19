/**
 * Module-local demo state for admin settings features that have no dedicated
 * DAL repository yet: the staff schedule (StaffSchedule parity) and the
 * SaaS license/plan record (LicensingDashboard parity). Persisted via the
 * shared dal.settings key/value store so edits survive reloads and route
 * through the same audit path as every other setting.
 *
 * These are NOT authoritative — like all UI state, the Supabase layer / RLS
 * is the real boundary. No secrets are stored here; license keys are masked.
 */

// ── Staff schedule ────────────────────────────────────────────────────────
export type ShiftDept = "catering" | "kitchen" | "retail" | "driver";

export interface StaffShift {
  id: string;
  staffName: string;
  role: string;
  dept: ShiftDept;
  /** ISO date (yyyy-mm-dd) */
  shiftDate: string;
  startTime: string; // "09:00"
  endTime: string;   // "17:00"
  notes: string | null;
}

export const SCHEDULE_KEY = "admin.staffSchedule";

export const DEPT_META: Record<ShiftDept, { label: string; cls: string }> = {
  catering: { label: "Catering", cls: "bg-blue-600 text-white" },
  kitchen: { label: "Kitchen", cls: "bg-green-700 text-white" },
  retail: { label: "Retail", cls: "bg-amber-600 text-white" },
  driver: { label: "Driver", cls: "bg-fire text-white" },
};

export const DEFAULT_SCHEDULE: StaffShift[] = [
  { id: "sh-1", staffName: "Marcus T.", role: "Pitmaster", dept: "kitchen", shiftDate: isoOffset(0), startTime: "05:00", endTime: "14:00", notes: "Brisket + pork overnight hold" },
  { id: "sh-2", staffName: "Dana R.", role: "Catering Lead", dept: "catering", shiftDate: isoOffset(1), startTime: "08:00", endTime: "16:00", notes: "Johnson wedding load-out" },
  { id: "sh-3", staffName: "Kelly P.", role: "Counter", dept: "retail", shiftDate: isoOffset(1), startTime: "10:00", endTime: "18:00", notes: null },
  { id: "sh-4", staffName: "Luis G.", role: "Driver", dept: "driver", shiftDate: isoOffset(2), startTime: "10:30", endTime: "15:00", notes: "Corporate lunch — 50pp" },
];

function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ── License / plan ─────────────────────────────────────────────────────────
export type PlanTier = "starter" | "pro" | "enterprise";
export type LicenseStatus = "trial" | "active" | "suspended" | "cancelled";

export interface PlanFeature { key: string; label: string; enabled: boolean; }

export interface LicenseRecord {
  businessName: string;
  tier: PlanTier;
  status: LicenseStatus;
  /** Masked — real keys never live in the frontend. */
  maskedKey: string;
  seatsUsed: number;
  seatsTotal: number;
  monthlyFeeCents: number;
  renewalDate: string; // yyyy-mm-dd
  features: PlanFeature[];
}

export const LICENSE_KEY = "admin.license";

export const TIER_PRICE_CENTS: Record<PlanTier, number> = {
  starter: 9700, pro: 19700, enterprise: 39700,
};

export const TIER_META: Record<PlanTier, { label: string; cls: string }> = {
  starter: { label: "Starter", cls: "bg-ink-700 text-zinc-200" },
  pro: { label: "Pro", cls: "bg-blue-900/60 text-blue-300 border border-blue-700" },
  enterprise: { label: "Enterprise", cls: "bg-amber-900/60 text-amber-300 border border-amber-600" },
};

export const STATUS_META: Record<LicenseStatus, { label: string; cls: string }> = {
  trial: { label: "Trial", cls: "bg-amber-600 text-white" },
  active: { label: "Active", cls: "bg-green-600 text-white" },
  suspended: { label: "Suspended", cls: "bg-red-600 text-white" },
  cancelled: { label: "Cancelled", cls: "border border-ink-700 text-zinc-400" },
};

export const DEFAULT_LICENSE: LicenseRecord = {
  businessName: "Station House BBQ",
  tier: "enterprise",
  status: "active",
  maskedKey: "SHBBQ-••••-••••-7F3A",
  seatsUsed: 5,
  seatsTotal: 25,
  monthlyFeeCents: TIER_PRICE_CENTS.enterprise,
  renewalDate: isoOffset(210),
  features: [
    { key: "catering", label: "Catering", enabled: true },
    { key: "retail", label: "Retail / Pre-Order", enabled: true },
    { key: "kitchen", label: "Kitchen & Pit", enabled: true },
    { key: "packing", label: "Packing", enabled: true },
    { key: "finance", label: "Finance & Invoicing", enabled: true },
    { key: "crm", label: "CRM", enabled: true },
    { key: "marketing", label: "Marketing", enabled: true },
    { key: "analytics", label: "Analytics", enabled: true },
    { key: "aiImport", label: "AI Import", enabled: true },
    { key: "customDomain", label: "Custom Domain", enabled: false },
  ],
};

/** Feature availability by tier — drives what enterprise unlocks over starter. */
export const TIER_FEATURES: Record<PlanTier, string[]> = {
  starter: ["catering", "retail", "kitchen", "packing"],
  pro: ["catering", "retail", "kitchen", "packing", "finance", "crm", "marketing", "analytics"],
  enterprise: ["catering", "retail", "kitchen", "packing", "finance", "crm", "marketing", "analytics", "aiImport", "customDomain"],
};

export function slugId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
