import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { formatCents } from "../../lib/money";
import {
  newId, receiptTotalCents,
  type InventoryItem, type ReceiptLine, type ReceiptRecord, type Vendor,
} from "./_data/inventoryData";
import {
  useInventoryItems, useVendors, useReceipts,
  useInventoryMutation, applyStockDeltas, saveReceipts,
} from "./_data/useInventory";

/**
 * Inventory · Receive Shipment — V2 of Manus ReceiveShipment.
 * Log an incoming delivery: pick a vendor, add received line items (qty +
 * unit cost, defaulted from the vendor's quoted price), then post to bump
 * on-hand and record a receipt in inventory.receipts. A history list of past
 * deliveries sits below the form.
 */

interface DraftLine {
  itemId: string;
  qty: string;
  costDollars: string;
}

export function ReceiveShipment() {
  const { actor } = useRole();
  const { data: items, isLoading } = useInventoryItems();
  const { data: vendors } = useVendors();
  const { data: receipts } = useReceipts();
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [posted, setPosted] = useState<string | null>(null);

  const postMut = useInventoryMutation(async (record: ReceiptRecord) => {
    await applyStockDeltas(record.lines.map(l => ({ itemId: l.itemId, delta: l.qty })), actor);
    const prior = receipts ?? [];
    await saveReceipts([record, ...prior], actor);
  });

  const itemList = items ?? [];
  const vendorList = vendors ?? [];
  const itemById = useMemo(() => new Map(itemList.map(i => [i.id, i])), [itemList]);
  const vendor = vendorList.find(v => v.id === vendorId) ?? null;

  const defaultCost = (item: InventoryItem, v: Vendor | null): number => {
    const quoted = v ? v.prices[item.id] : undefined;
    return typeof quoted === "number" ? quoted : item.unitCostCents;
  };

  const addLine = () => {
    const firstUnused = itemList.find(i => !draftLines.some(d => d.itemId === i.id));
    if (!firstUnused) return;
    setDraftLines(prev => [...prev, {
      itemId: firstUnused.id, qty: "",
      costDollars: (defaultCost(firstUnused, vendor) / 100).toFixed(2),
    }]);
  };
  const updateLine = (idx: number, patch: Partial<DraftLine>) => {
    setDraftLines(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };
  const removeLine = (idx: number) => setDraftLines(prev => prev.filter((_, i) => i !== idx));

  const validLines: ReceiptLine[] = draftLines
    .map(d => {
      const item = itemById.get(d.itemId);
      const qty = Number(d.qty);
      if (!item || !Number.isFinite(qty) || qty <= 0) return null;
      return {
        itemId: item.id, itemName: item.name, unit: item.unit, qty,
        unitCostCents: Math.round((Number(d.costDollars) || 0) * 100),
      } satisfies ReceiptLine;
    })
    .filter((l): l is ReceiptLine => l !== null);

  const previewTotalCents = receiptTotalCents({ lines: validLines });

  const post = () => {
    if (!vendor || validLines.length === 0) return;
    const record: ReceiptRecord = {
      id: newId("rcpt"), vendorId: vendor.id, vendorName: vendor.name, poId: null,
      lines: validLines, receivedAt: currentTime().toISOString(), actor, notes: notes.trim(),
    };
    postMut.mutate(record, {
      onSuccess: () => {
        setPosted(record.id);
        setDraftLines([]);
        setNotes("");
      },
    });
  };

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Receive Shipment</h1>
        <p className="text-sm text-zinc-500">Log a delivery · adds to on-hand and records a receipt</p>
      </header>

      {posted && (
        <div className="mt-4 rounded-xl border border-green-700/50 bg-green-950/30 px-4 py-3 text-sm text-green-300">
          Shipment posted. On-hand updated and receipt recorded below.
        </div>
      )}

      <section className="mt-4 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-zinc-400">Vendor
            <select value={vendorId} onChange={e => setVendorId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
              <option value="">— Select vendor —</option>
              {vendorList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Notes <span className="font-normal text-zinc-600">(optional)</span>
            <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Invoice #, driver, temps checked…"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
          </label>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-widest text-fire-light">Received items</span>
            <button onClick={addLine} disabled={draftLines.length >= itemList.length}
              className="min-h-[36px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-200 disabled:opacity-40">
              + Add line
            </button>
          </div>

          {draftLines.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink-700 py-6 text-center text-sm text-zinc-500">
              No lines yet. Click “Add line” to log received items.
            </p>
          ) : (
            <ul className="space-y-2">
              {draftLines.map((line, idx) => {
                const item = itemById.get(line.itemId);
                const lineTotal = Math.round((Number(line.qty) || 0) * (Number(line.costDollars) || 0) * 100);
                return (
                  <li key={idx} className="grid grid-cols-[2fr_1fr_1fr_auto] items-end gap-2 rounded-xl border border-ink-700 bg-ink-800 p-2">
                    <label className="block text-xs font-semibold text-zinc-500">Item
                      <select value={line.itemId} onChange={e => {
                        const it = itemById.get(e.target.value);
                        updateLine(idx, { itemId: e.target.value, costDollars: it ? (defaultCost(it, vendor) / 100).toFixed(2) : line.costDollars });
                      }}
                        className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-zinc-100">
                        {itemList.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </label>
                    <label className="block text-xs font-semibold text-zinc-500">Qty {item ? `(${item.unit})` : ""}
                      <input value={line.qty} onChange={e => updateLine(idx, { qty: e.target.value })} inputMode="decimal" placeholder="0"
                        className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-zinc-100" />
                    </label>
                    <label className="block text-xs font-semibold text-zinc-500">Unit cost ($)
                      <input value={line.costDollars} onChange={e => updateLine(idx, { costDollars: e.target.value })} inputMode="decimal"
                        className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-2 text-sm text-zinc-100" />
                    </label>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs font-bold text-fire-light">{formatCents(lineTotal)}</span>
                      <button onClick={() => removeLine(idx)} aria-label="Remove line"
                        className="h-9 w-9 rounded-lg border border-ink-700 bg-ink-900 text-zinc-400">×</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink-700 pt-4">
          <p className="text-sm text-zinc-400">Total: <span className="font-black text-fire-light">{formatCents(previewTotalCents)}</span> · {validLines.length} line{validLines.length === 1 ? "" : "s"}</p>
          <button onClick={post} disabled={postMut.isPending || !vendor || validLines.length === 0}
            className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
            {postMut.isPending ? "Posting…" : "Post shipment"}
          </button>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-zinc-400">Receiving history ({(receipts ?? []).length})</h2>
        {(receipts ?? []).length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink-700 py-6 text-center text-sm text-zinc-500">No deliveries logged yet.</p>
        ) : (
          <ul className="space-y-2">
            {(receipts ?? []).map(r => (
              <li key={r.id} className="rounded-xl border border-ink-700 bg-ink-900 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-100">{r.vendorName}{r.poId && <span className="ml-2 text-xs text-zinc-500">from PO</span>}</p>
                    <p className="text-xs text-zinc-500">
                      {new Date(r.receivedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · {r.actor}
                      {r.notes && ` · ${r.notes}`}
                    </p>
                  </div>
                  <span className="shrink-0 font-black text-fire-light">{formatCents(receiptTotalCents(r))}</span>
                </div>
                <ul className="mt-2 space-y-0.5 text-xs text-zinc-400">
                  {r.lines.map((l, i) => (
                    <li key={i} className="flex justify-between">
                      <span>{l.qty} {l.unit} · {l.itemName}</span>
                      <span>{formatCents(Math.round(l.qty * l.unitCostCents))}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
