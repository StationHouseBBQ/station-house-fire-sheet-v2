/**
 * Module-local overlay store for catering/sales augmentation fields that the
 * shared DAL types don't carry yet (venue logistics/type, company CRM stats,
 * equipment PAR levels, red-zone recovery state). Persisted in localStorage
 * keyed by entity id so these enrichments survive reloads without requiring a
 * schema/DAL change. If/when the DAL grows these fields, swap the read/write
 * calls here for the repo methods and delete this file.
 *
 * All reads fall back to sensible defaults, so a missing overlay never breaks
 * a screen. Writes dispatch a change event so open views re-read immediately.
 */

const CHANGE_EVENT = "shbbq-catering-overlay-change";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* storage unavailable - overlay is best-effort */
  }
}

export function onOverlayChange(handler: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

// -- Venue logistics / type overlay ------------------------------------------
export type VenueKind =
  | "ballroom" | "outdoor" | "church" | "corporate"
  | "backyard" | "rooftop" | "festival" | "other";

export interface VenueOverlay {
  kind: VenueKind;
  indoorOutdoor: "indoor" | "outdoor" | "both";
  kitchenAccess: boolean;
  trailerParking: boolean;
  powerAccess: boolean;
  deliveryFeeCents: number | null;
}

const VENUE_KEY = "shbbq.catering.overlay.venues.v1";
const VENUE_DEFAULT: VenueOverlay = {
  kind: "other", indoorOutdoor: "both",
  kitchenAccess: false, trailerParking: false, powerAccess: false,
  deliveryFeeCents: null,
};

export function getVenueOverlay(id: string): VenueOverlay {
  const all = read<Record<string, VenueOverlay>>(VENUE_KEY, {});
  return { ...VENUE_DEFAULT, ...all[id] };
}
export function setVenueOverlay(id: string, o: VenueOverlay): void {
  const all = read<Record<string, VenueOverlay>>(VENUE_KEY, {});
  all[id] = o;
  write(VENUE_KEY, all);
}

// -- Company CRM overlay (VIP, active, primary contact, revenue history) ------
export interface CompanyOrderRow {
  id: string; eventName: string; ref: string; date: string;
  guests: number | null; depositCents: number; status: "completed" | "cancelled" | "pending";
}
export interface CompanyOverlay {
  vip: boolean;
  active: boolean;
  contactName: string;
  contactTitle: string;
  phone: string;
  email: string;
  address: string;
  orders: CompanyOrderRow[];
}

const COMPANY_KEY = "shbbq.catering.overlay.companies.v1";
const COMPANY_DEFAULT: CompanyOverlay = {
  vip: false, active: true, contactName: "", contactTitle: "",
  phone: "", email: "", address: "", orders: [],
};

export function getCompanyOverlay(id: string): CompanyOverlay {
  const all = read<Record<string, CompanyOverlay>>(COMPANY_KEY, {});
  return { ...COMPANY_DEFAULT, ...all[id] };
}
export function setCompanyOverlay(id: string, o: CompanyOverlay): void {
  const all = read<Record<string, CompanyOverlay>>(COMPANY_KEY, {});
  all[id] = o;
  write(COMPANY_KEY, all);
}
export function companyStats(o: CompanyOverlay): { orderCount: number; lifetimeCents: number; lastOrder: string | null } {
  const orderCount = o.orders.length;
  const lifetimeCents = o.orders.reduce((s, r) => s + r.depositCents, 0);
  const lastOrder = o.orders.length
    ? o.orders.map(r => r.date).sort().slice(-1)[0]
    : null;
  return { orderCount, lifetimeCents, lastOrder };
}

// -- Equipment PAR overlay (on-hand + PAR level per item) ---------------------
export interface EquipmentOverlay {
  onHand: number;
  par: number;
}
const EQUIP_KEY = "shbbq.catering.overlay.equipment.v1";

export function getEquipmentOverlay(id: string, fallbackOnHand: number): EquipmentOverlay {
  const all = read<Record<string, EquipmentOverlay>>(EQUIP_KEY, {});
  return all[id] ?? { onHand: fallbackOnHand, par: 0 };
}
export function setEquipmentOverlay(id: string, o: EquipmentOverlay): void {
  const all = read<Record<string, EquipmentOverlay>>(EQUIP_KEY, {});
  all[id] = o;
  write(EQUIP_KEY, all);
}

// -- Red-zone recovery overlay (resolved flag + recovery note per issue row) --
export interface RedZoneRecovery {
  resolved: boolean;
  note: string;
  resolvedAt: string | null;
}
const REDZONE_KEY = "shbbq.catering.overlay.redzone.v1";

export function getRecovery(rowId: string): RedZoneRecovery {
  const all = read<Record<string, RedZoneRecovery>>(REDZONE_KEY, {});
  return all[rowId] ?? { resolved: false, note: "", resolvedAt: null };
}
export function setRecovery(rowId: string, r: RedZoneRecovery): void {
  const all = read<Record<string, RedZoneRecovery>>(REDZONE_KEY, {});
  all[rowId] = r;
  write(REDZONE_KEY, all);
}
export function allRecoveries(): Record<string, RedZoneRecovery> {
  return read<Record<string, RedZoneRecovery>>(REDZONE_KEY, {});
}
