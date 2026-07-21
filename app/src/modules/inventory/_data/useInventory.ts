/**
 * TanStack Query hooks over the inventory settings store. Each collection is
 * lazily seeded on first read so a fresh demo environment shows realistic
 * data immediately.
 */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getDal } from "../../../dal";
import {
  KEY_ITEMS, KEY_VENDORS, KEY_POS, KEY_RECEIPTS,
  seedItems, seedVendors,
  type InventoryItem, type Vendor, type PurchaseOrderRecord, type ReceiptRecord,
} from "./inventoryData";

const QK = {
  items: ["inventory", "items"] as const,
  vendors: ["inventory", "vendors"] as const,
  pos: ["inventory", "pos"] as const,
  receipts: ["inventory", "receipts"] as const,
};

async function loadItems(): Promise<InventoryItem[]> {
  const dal = getDal();
  const stored = await dal.settings.get<InventoryItem[] | null>(KEY_ITEMS, null);
  if (stored && stored.length) return stored;
  const seeded = seedItems();
  await dal.settings.set(KEY_ITEMS, seeded, "system:seed");
  return seeded;
}

async function loadVendors(): Promise<Vendor[]> {
  const dal = getDal();
  const stored = await dal.settings.get<Vendor[] | null>(KEY_VENDORS, null);
  if (stored && stored.length) return stored;
  const seeded = seedVendors();
  await dal.settings.set(KEY_VENDORS, seeded, "system:seed");
  return seeded;
}

async function loadPos(): Promise<PurchaseOrderRecord[]> {
  return getDal().settings.get<PurchaseOrderRecord[]>(KEY_POS, []);
}

async function loadReceipts(): Promise<ReceiptRecord[]> {
  return getDal().settings.get<ReceiptRecord[]>(KEY_RECEIPTS, []);
}

export function useInventoryItems() {
  return useQuery({ queryKey: QK.items, queryFn: loadItems });
}
export function useVendors() {
  return useQuery({ queryKey: QK.vendors, queryFn: loadVendors });
}
export function usePurchaseOrders() {
  return useQuery({ queryKey: QK.pos, queryFn: loadPos });
}
export function useReceipts() {
  return useQuery({ queryKey: QK.receipts, queryFn: loadReceipts });
}

// ── Persistence helpers (read-modify-write against settings) ──────────────
export async function saveItems(items: InventoryItem[], actor: string): Promise<void> {
  await getDal().settings.set(KEY_ITEMS, items, actor);
}
export async function saveVendors(vendors: Vendor[], actor: string): Promise<void> {
  await getDal().settings.set(KEY_VENDORS, vendors, actor);
}
export async function savePos(pos: PurchaseOrderRecord[], actor: string): Promise<void> {
  await getDal().settings.set(KEY_POS, pos, actor);
}
export async function saveReceipts(receipts: ReceiptRecord[], actor: string): Promise<void> {
  await getDal().settings.set(KEY_RECEIPTS, receipts, actor);
}

/**
 * Apply per-item quantity deltas and persist. Missing item ids are ignored.
 * Returns the updated array so callers can optimistically update caches.
 */
export async function applyStockDeltas(
  deltas: Array<{ itemId: string; delta: number }>,
  actor: string,
): Promise<InventoryItem[]> {
  const items = await loadItems();
  const byId = new Map(deltas.map(d => [d.itemId, d.delta]));
  const next = items.map(it => {
    const delta = byId.get(it.id);
    if (delta === undefined) return it;
    return { ...it, onHand: Math.max(0, Math.round((it.onHand + delta) * 100) / 100) };
  });
  await saveItems(next, actor);
  return next;
}

/** Overwrite on-hand for specific items (used by physical count submit). */
export async function setOnHand(
  updates: Array<{ itemId: string; onHand: number }>,
  actor: string,
): Promise<InventoryItem[]> {
  const items = await loadItems();
  const byId = new Map(updates.map(u => [u.itemId, u.onHand]));
  const next = items.map(it => {
    const oh = byId.get(it.id);
    if (oh === undefined) return it;
    return { ...it, onHand: Math.max(0, Math.round(oh * 100) / 100) };
  });
  await saveItems(next, actor);
  return next;
}

export function invalidateAll(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["inventory"] });
}

export function useInvalidate() {
  const qc = useQueryClient();
  return () => invalidateAll(qc);
}

/** Small mutation factory for TanStack, wired to invalidate all inventory queries. */
export function useInventoryMutation<TVars>(fn: (vars: TVars) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => invalidateAll(qc),
  });
}
