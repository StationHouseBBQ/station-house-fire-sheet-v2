/**
 * Shared helpers for the catering production tabs (Prep List, Order Guide,
 * Weekly Board). Pure functions over CateringOrder[] — no React, no DAL.
 * Business time comes from currentTime(); all money is integer cents.
 */
import type { CateringOrder } from "../../../dal/types";

/** Stages that mean the order is dead and should be excluded from production. */
const DEAD_STAGES = new Set(["lost", "cancelled"]);

/** ISO yyyy-mm-dd for a Date in local time (matches CateringEventDetails.eventDate). */
export function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Parse an ISO date string (yyyy-mm-dd) to a noon-local Date, or null. */
export function parseEventDate(iso: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso + "T12:00:00");
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Friendly date label, e.g. "Mon, Jul 20". Returns "Date TBD" for null. */
export function fmtEventDate(iso: string | null): string {
  const d = parseEventDate(iso);
  if (!d) return "Date TBD";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Monday (00:00 local) of the week containing `date`. */
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setHours(0, 0, 0, 0);
  d.setDate(diff);
  return d;
}

/**
 * Upcoming, live catering orders with a real event date on/after `from`.
 * Excludes lost/cancelled and any order missing an event date. Sorted by date.
 */
export function upcomingOrders(orders: CateringOrder[], from: Date): CateringOrder[] {
  const fromStr = localDateStr(from);
  return orders
    .filter(o => !DEAD_STAGES.has(o.stage))
    .filter(o => o.event.eventDate !== null && o.event.eventDate >= fromStr)
    .sort((a, b) => (a.event.eventDate ?? "").localeCompare(b.event.eventDate ?? ""));
}

/** Orders whose event date falls in [from, to] inclusive (both ISO-comparable). */
export function ordersInRange(orders: CateringOrder[], from: Date, to: Date): CateringOrder[] {
  const toStr = localDateStr(to);
  return upcomingOrders(orders, from).filter(o => (o.event.eventDate ?? "") <= toStr);
}

/**
 * Infer a kitchen category from a menu item name. Purely heuristic; used to
 * group both the prep list and the order guide by station.
 */
export type ProdCategory = "Meats" | "Sides" | "Desserts" | "Other";
export const CATEGORY_ORDER: ProdCategory[] = ["Meats", "Sides", "Desserts", "Other"];

const MEAT_WORDS = ["brisket", "pork", "rib", "chicken", "turkey", "sausage", "wing", "pulled", "burnt", "beef", "smoked", "meat", "bbq", "pit"];
const SIDE_WORDS = ["bean", "slaw", "mac", "cheese", "corn", "potato", "salad", "green", "collard", "bread", "roll", "fries", "okra", "side", "hush", "pickle"];
const DESSERT_WORDS = ["cobbler", "pie", "cake", "banana pudding", "pudding", "dessert", "brownie", "cookie", "sweet"];

export function categorize(name: string): ProdCategory {
  const n = name.toLowerCase();
  if (DESSERT_WORDS.some(w => n.includes(w))) return "Desserts";
  if (MEAT_WORDS.some(w => n.includes(w))) return "Meats";
  if (SIDE_WORDS.some(w => n.includes(w))) return "Sides";
  return "Other";
}

export const CATEGORY_META: Record<ProdCategory, { emoji: string; text: string; bg: string }> = {
  Meats: { emoji: "🥩", text: "text-red-300", bg: "bg-red-600/10 border-red-700/40" },
  Sides: { emoji: "🥗", text: "text-green-300", bg: "bg-green-600/10 border-green-700/40" },
  Desserts: { emoji: "🍮", text: "text-purple-300", bg: "bg-purple-600/10 border-purple-700/40" },
  Other: { emoji: "🍽️", text: "text-amber-300", bg: "bg-amber-600/10 border-amber-700/40" },
};

/** One event's contribution to an aggregated item line. */
export interface ItemContribution {
  orderId: string;
  ref: string;
  customer: string;
  eventDate: string | null;
  guests: number | null;
  qty: number;
}

/** An aggregated menu item across many events. */
export interface AggregatedItem {
  name: string;
  category: ProdCategory;
  totalQty: number;
  unitPriceCents: number;
  contributions: ItemContribution[];
}

/** Roll up every line item across the given orders, summed by item name. */
export function aggregateItems(orders: CateringOrder[]): AggregatedItem[] {
  const map = new Map<string, AggregatedItem>();
  for (const o of orders) {
    for (const line of o.lines) {
      const key = line.name.trim().toLowerCase();
      let agg = map.get(key);
      if (!agg) {
        agg = {
          name: line.name,
          category: categorize(line.name),
          totalQty: 0,
          unitPriceCents: line.unitPriceCents,
          contributions: [],
        };
        map.set(key, agg);
      }
      agg.totalQty += line.qty;
      agg.contributions.push({
        orderId: o.id,
        ref: o.ref,
        customer: o.customer,
        eventDate: o.event.eventDate,
        guests: o.event.guests,
        qty: line.qty,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/** Group aggregated items by inferred category, preserving CATEGORY_ORDER. */
export function groupByCategory(items: AggregatedItem[]): Array<{ category: ProdCategory; items: AggregatedItem[] }> {
  return CATEGORY_ORDER.map(category => ({
    category,
    items: items.filter(i => i.category === category),
  })).filter(g => g.items.length > 0);
}
