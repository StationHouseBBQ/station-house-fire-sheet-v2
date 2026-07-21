/**
 * Module-local cost overlay for the Order Guide.
 *
 * The `orderGuide` DAL repo tracks item / vendor / unit / PAR / on-hand /
 * order-qty but carries no cost fields. The owner requires vendor costs and
 * pack sizes to be editable everywhere, so this overlay stores a per-row
 * { casePriceCents, packSizeQty } record under a single `settings` key. That
 * keeps everything inside an existing DAL repo (no schema change) while the
 * proper columns are added server-side.
 *
 * When those columns land, migrate this into OrderGuideRow / OrderGuideRepository
 * and delete this file (noted in the builder report).
 */
import { getDal } from "../../../dal";

export interface OrderGuideCost {
  casePriceCents: number;   // price of one full pack/case, in cents
  packSizeQty: number;      // units per pack/case (used to derive per-unit cost)
}

export type OrderGuideCostMap = Record<string, OrderGuideCost>;

const KEY = "admin.orderGuide.costs.v1";

export function loadOrderGuideCosts(): Promise<OrderGuideCostMap> {
  return getDal().settings.get<OrderGuideCostMap>(KEY, {});
}

export function saveOrderGuideCost(rowId: string, cost: OrderGuideCost | null, actor: string): Promise<OrderGuideCostMap> {
  return loadOrderGuideCosts().then(map => {
    const next = { ...map };
    if (cost === null) delete next[rowId];
    else next[rowId] = cost;
    return getDal().settings.set(KEY, next, actor).then(() => next);
  });
}

/** Per-unit cost in cents from a case price + pack size (0 pack → 0). */
export function perUnitCents(cost: OrderGuideCost | undefined): number | null {
  if (!cost || cost.packSizeQty <= 0) return null;
  return Math.round(cost.casePriceCents / cost.packSizeQty);
}
