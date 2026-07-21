import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { formatCents } from "../../lib/money";
import {
  newId, poTotalCents,
  type InventoryItem, type PoLine, type PoStatus, type PurchaseOrderRecord, type Vendor,
} from "./_data/inventoryData";
import {
  useInventoryItems, useVendors, usePurchaseOrders, useReceipts,
  useInventoryMutation, applyStockDeltas, savePos, saveReceipts,
} from "./_data/useInventory";

/**
 * Inventory · Purchase Orders — V2 of Manus PurchaseOrder.
 * Create and track POs (vendor, line items with qty + estimated unit cost,
 * running total, status draft→sent→received). Filter by status; "Send" moves
 * a draft to sent; "Receive" bumps on-hand, writes a receipt, and marks the
 * PO received. Persisted in inventory.pos.
 */

const STATUS_META: Record<PoStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-zinc-700 text-zinc-200" },
  sent: { label: "Sent", cls: "bg-amber-600 text-white" },
  received: { label: "Received", cls: "bg-green-600 text-white" },
};

interface DraftLine { itemId: string; qty: string; costDollars: string; }

export function PurchaseOrders() {
  const { actor } = useRole();
  const { data: items, isLoading } = useInventoryItems();
  const { data: vendors } = useVendors();
  const { data: pos } = usePurchaseOrders();
  const { data: receipts } = useReceipts();
  const [filter, setFilter] = useState<PoStatus | "all">("all");
  const [creating, setCreating] = useState(false);

  const itemList = items ?? [];
  const vendorList = vendors ?? [];
  const poList = pos ?? [];

  const saveMut = useInventoryMutation(async (next: PurchaseOrderRecord[]) => {
    await savePos(next, actor);
  });
  const receiveMut = useInventoryMutation(async (po: PurchaseOrderRecord) => {
    await applyStockDeltas(po.lines.map(l => ({ itemId: l.itemId, delta: l.qty })), actor);
    await saveReceipts([{
      id: newId("rcpt"), vendorId: po.vendorId, vendorName: po.vendorName, poId: po.id,
      lines: po.lines.map(l => ({ itemId: l.itemId, itemName: l.itemName, unit: l.unit, qty: l.qty, unitCostCents: l.estCostCents })),
      receivedAt: currentTime().toISOString(), actor, notes: `Received from PO ${po.id}`,
    }, ...(receipts ?? [])], actor);
    await savePos(poList.map(p => (p.id === po.id ? { ...p, status: "received" as const, receivedAt: currentTime().toISOString() } : p)), actor);
  });

  const setStatus = (po: PurchaseOrderRecord, status: PoStatus) => {
    saveMut.mutate(poList.map(p => (p.id === po.id ? { ...p, status } : p)));
  };
  const remove = (po: PurchaseOrderRecord) => {
    saveMut.mutate(poList.filter(p => p.id !== po.id));
  };
  const create = (po: PurchaseOrderRecord) => {
    saveMut.mutate([po, ...poList], { onSuccess: () => setCreating(false) });
  };

  const filtered = filter === "all" ? poList : poList.filter(p => p.status === filter);
  const openValueCents = poList.filter(p => p.status !== "received").reduce((s, p) => s + poTotalCents(p), 0);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading purchase orders…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Purchase Orders</h1>
          <p className="text-sm text-zinc-500">Create, send and receive vendor orders</p>
        </div>
        <button onClick={() => setCreating(true)} disabled={vendorList.length === 0 || itemList.length === 0}
          className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">+ New PO</button>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={String(poList.length)} label="Total POs" />
        <Stat value={String(poList.filter(p => p.status === "draft").length)} label="Drafts" />
        <Stat value={String(poList.filter(p => p.status === "sent").length)} label="Awaiting delivery" tone="amber" />
        <Stat value={formatCents(openValueCents)} label="Open value" tone="fire" />
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>All</Chip>
        {(["draft", "sent", "received"] as PoStatus[]).map(s => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)}>{STATUS_META[s].label}</Chip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-10 py-12 text-center text-sm text-zinc-500">No purchase orders {filter === "all" ? "yet" : `in “${STATUS_META[filter as PoStatus]?.label}”`}.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map(po => (
            <li key={po.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-100">{po.vendorName}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${STATUS_META[po.status].cls}`}>{STATUS_META[po.status].label}</span>
                  </div>
                  <p className="text-xs text-zinc-500">
                    Created {new Date(po.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {po.actor}
                    {po.receivedAt && ` · received ${new Date(po.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                    {po.notes && ` · ${po.notes}`}
                  </p>
                </div>
                <span className="text-lg font-black text-fire-light">{formatCents(poTotalCents(po))}</span>
              </div>
              <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
                {po.lines.map((l, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{l.qty} {l.unit} · {l.itemName} @ {formatCents(l.estCostCents)}</span>
                    <span>{formatCents(Math.round(l.qty * l.estCostCents))}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {po.status === "draft" && (
                  <button onClick={() => setStatus(po, "sent")} disabled={saveMut.isPending}
                    className="min-h-[40px] rounded-lg border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-xs font-bold text-amber-300 disabled:opacity-50">Mark sent</button>
                )}
                {po.status === "sent" && (
                  <button onClick={() => setStatus(po, "draft")} disabled={saveMut.isPending}
                    className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300 disabled:opacity-50">Back to draft</button>
                )}
                {po.status !== "received" && (
                  <button onClick={() => receiveMut.mutate(po)} disabled={receiveMut.isPending}
                    className="min-h-[40px] rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Receive → stock</button>
                )}
                {po.status !== "received" && (
                  <button onClick={() => remove(po)} disabled={saveMut.isPending}
                    className="min-h-[40px] rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-1.5 text-xs font-bold text-red-300 disabled:opacity-50">Delete</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <PoDialog vendors={vendorList} items={itemList} actor={actor} busy={saveMut.isPending}
          onCancel={() => setCreating(false)} onCreate={create} />
      )}
    </div>
  );
}

function PoDialog({ vendors, items, actor, busy, onCancel, onCreate }: {
  vendors: Vendor[]; items: InventoryItem[]; actor: string; busy: boolean;
  onCancel: () => void; onCreate: (po: PurchaseOrderRecord) => void;
}) {
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const itemById = useMemo(() => new Map(items.map(i => [i.id, i])), [items]);
  const vendor = vendors.find(v => v.id === vendorId) ?? null;

  const defaultCost = (item: InventoryItem): number => {
    const quoted = vendor ? vendor.prices[item.id] : undefined;
    return typeof quoted === "number" ? quoted : item.unitCostCents;
  };

  const addLine = () => {
    const unused = items.find(i => !lines.some(l => l.itemId === i.id));
    if (!unused) return;
    setLines(prev => [...prev, { itemId: unused.id, qty: "", costDollars: (defaultCost(unused) / 100).toFixed(2) }]);
  };
  const suggestBelowPar = () => {
    const suggestions = items.filter(i => i.onHand < i.parLevel).map(i => ({
      itemId: i.id, qty: String(Math.ceil(i.parLevel - i.onHand)), costDollars: (defaultCost(i) / 100).toFixed(2),
    }));
    setLines(suggestions);
  };
  const updateLine = (idx: number, patch: Partial<DraftLine>) => setLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const poLines: PoLine[] = lines.map(d => {
    const item = itemById.get(d.itemId);
    const qty = Number(d.qty);
    if (!item || !Number.isFinite(qty) || qty <= 0) return null;
    return { itemId: item.id, itemName: item.name, unit: item.unit, qty, estCostCents: Math.round((Number(d.costDollars) || 0) * 100) } satisfies PoLine;
  }).filter((l): l is PoLine => l !== null);

  const totalCents = poTotalCents({ lines: poLines });

  const submit = (status: PoStatus) => {
    if (!vendor || poLines.length === 0) return;
    onCreate({
      id: newId("po"), vendorId: vendor.id, vendorName: vendor.name, status,
      lines: poLines, createdAt: currentTime().toISOString(), receivedAt: null, actor, notes: notes.trim(),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New purchase order"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit("draft"); }}>
        <h3 className="text-lg font-bold text-zinc-100">New purchase order</h3>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Vendor
          <select value={vendorId} onChange={e => setVendorId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
            {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-fire-light">Line items</span>
          <div className="flex gap-2">
            <button type="button" onClick={suggestBelowPar} className="min-h-[36px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-200">Fill below-PAR</button>
            <button type="button" onClick={addLine} disabled={lines.length >= items.length} className="min-h-[36px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-200 disabled:opacity-40">+ Add</button>
          </div>
        </div>
        {lines.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-ink-700 py-5 text-center text-sm text-zinc-500">Add lines or auto-fill items below PAR.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {lines.map((line, idx) => {
              const item = itemById.get(line.itemId);
              return (
                <li key={idx} className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-2 rounded-xl border border-ink-700 bg-ink-800 p-2">
                  <label className="block text-xs font-semibold text-zinc-500">Item
                    <select value={line.itemId} onChange={e => {
                      const it = itemById.get(e.target.value);
                      updateLine(idx, { itemId: e.target.value, costDollars: it ? (defaultCost(it) / 100).toFixed(2) : line.costDollars });
                    }} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-zinc-100">
                      {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">Qty {item ? `(${item.unit})` : ""}
                    <input value={line.qty} onChange={e => updateLine(idx, { qty: e.target.value })} inputMode="decimal" placeholder="0"
                      className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-zinc-100" />
                  </label>
                  <label className="block text-xs font-semibold text-zinc-500">Est cost ($)
                    <input value={line.costDollars} onChange={e => updateLine(idx, { costDollars: e.target.value })} inputMode="decimal"
                      className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-zinc-100" />
                  </label>
                  <button type="button" onClick={() => removeLine(idx)} aria-label="Remove line"
                    className="h-9 w-9 rounded-lg border border-ink-700 bg-ink-900 text-zinc-400">×</button>
                </li>
              );
            })}
          </ul>
        )}
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes <span className="font-normal text-zinc-600">(optional)</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Delivery window, PO ref…"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
        </label>
        <p className="mt-3 text-sm text-zinc-400">Total: <span className="font-black text-fire-light">{formatCents(totalCents)}</span></p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || poLines.length === 0}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200 disabled:opacity-50">Save draft</button>
          <button type="button" onClick={() => submit("sent")} disabled={busy || poLines.length === 0}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Save & send</button>
        </div>
      </form>
    </div>
  );
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "amber" | "fire" }) {
  const valueCls = tone === "amber" ? "text-amber-400" : tone === "fire" ? "text-fire-light" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <p className={`text-3xl font-black ${valueCls}`}>{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${active ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
      {children}
    </button>
  );
}
