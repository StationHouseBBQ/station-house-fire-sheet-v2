import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import {
  newId, vendorPriceCents,
  type InventoryItem, type Vendor,
} from "./_data/inventoryData";
import {
  useInventoryItems, useVendors, useInventoryMutation, saveVendors,
} from "./_data/useInventory";

/**
 * Inventory · Vendors — V2 blending Manus VendorCosts + VendorPriceAgent.
 * A vendor directory (contact details, editable per-item price list) plus a
 * "price compare" panel that, for a chosen item, ranks every vendor by their
 * quoted price and flags the cheapest — no external calls, all local data.
 * Persisted in inventory.vendors.
 */

interface VendorDraft {
  id?: string;
  name: string;
  contactName: string;
  phone: string;
  email: string;
  notes: string;
}

export function Vendors() {
  const { actor } = useRole();
  const { data: items, isLoading } = useInventoryItems();
  const { data: vendors } = useVendors();
  const [draft, setDraft] = useState<VendorDraft | null>(null);
  const [priceVendor, setPriceVendor] = useState<Vendor | null>(null);
  const [compareItemId, setCompareItemId] = useState<string>("");

  const vendorList = vendors ?? [];
  const itemList = items ?? [];

  const saveMut = useInventoryMutation(async (next: Vendor[]) => {
    await saveVendors(next, actor);
  });

  const upsertVendor = (d: VendorDraft) => {
    const patch: Omit<Vendor, "prices"> & { prices?: Record<string, number> } = {
      id: d.id ?? newId("ven"),
      name: d.name.trim(), contactName: d.contactName.trim(), phone: d.phone.trim(),
      email: d.email.trim(), notes: d.notes.trim(),
    };
    const next = d.id
      ? vendorList.map(v => (v.id === d.id ? { ...v, ...patch, prices: v.prices } : v))
      : [...vendorList, { ...patch, prices: {} } as Vendor];
    saveMut.mutate(next, { onSuccess: () => setDraft(null) });
  };
  const removeVendor = (v: Vendor) => saveMut.mutate(vendorList.filter(x => x.id !== v.id));
  const savePrices = (vendorId: string, prices: Record<string, number>) => {
    saveMut.mutate(vendorList.map(v => (v.id === vendorId ? { ...v, prices } : v)), { onSuccess: () => setPriceVendor(null) });
  };

  const compareItem = itemList.find(i => i.id === compareItemId) ?? itemList[0] ?? null;
  const comparison = useMemo(() => {
    if (!compareItem) return [];
    return vendorList
      .map(v => ({ vendor: v, cents: vendorPriceCents(v, compareItem), quoted: typeof v.prices[compareItem.id] === "number" }))
      .sort((a, b) => a.cents - b.cents);
  }, [vendorList, compareItem]);
  const cheapestCents = comparison.length ? comparison[0].cents : 0;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading vendors…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Vendors</h1>
          <p className="text-sm text-zinc-500">Directory · per-item price lists · cross-vendor price compare</p>
        </div>
        <button onClick={() => setDraft({ name: "", contactName: "", phone: "", email: "", notes: "" })}
          className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add vendor</button>
      </header>

      {/* Price compare */}
      {itemList.length > 0 && (
        <section className="mt-4 rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-widest text-fire-light">Price compare</span>
            <select value={compareItem?.id ?? ""} onChange={e => setCompareItemId(e.target.value)}
              aria-label="Item to compare"
              className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100">
              {itemList.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </div>
          {comparison.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">No vendors to compare.</p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {comparison.map(({ vendor, cents, quoted }, idx) => {
                const deltaCents = cents - cheapestCents;
                return (
                  <li key={vendor.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${idx === 0 ? "border-green-700/50 bg-green-950/30" : "border-ink-700 bg-ink-800"}`}>
                    <span className="flex items-center gap-2 text-zinc-200">
                      {idx === 0 && <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Best</span>}
                      <span className="font-semibold">{vendor.name}</span>
                      {!quoted && <span className="text-xs text-zinc-500">(default cost)</span>}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-bold text-zinc-100">{formatCents(cents)}<span className="text-zinc-500">/{compareItem?.unit}</span></span>
                      {deltaCents > 0 && <span className="text-xs text-red-400">+{formatCents(deltaCents)}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Directory */}
      {vendorList.length === 0 ? (
        <p className="mt-10 py-12 text-center text-sm text-zinc-500">No vendors yet. Add one to get started.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {vendorList.map(v => {
            const priced = itemList.filter(i => typeof v.prices[i.id] === "number");
            return (
              <li key={v.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-zinc-100">{v.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {v.contactName && <span>{v.contactName} · </span>}
                      {v.phone && <span>{v.phone} · </span>}
                      {v.email && <span>{v.email}</span>}
                    </p>
                    {v.notes && <p className="mt-1 text-xs text-zinc-500">{v.notes}</p>}
                    <p className="mt-1 text-xs text-fire-light">{priced.length} priced item{priced.length === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button onClick={() => setPriceVendor(v)} className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">Price list</button>
                    <button onClick={() => setDraft({ id: v.id, name: v.name, contactName: v.contactName, phone: v.phone, email: v.email, notes: v.notes })}
                      className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">Edit</button>
                    <button onClick={() => removeVendor(v)} className="min-h-[40px] rounded-lg border border-red-700/50 bg-red-950/30 px-3 py-1.5 text-xs font-bold text-red-300">Delete</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <VendorDialog draft={draft} setDraft={setDraft} busy={saveMut.isPending}
          onCancel={() => setDraft(null)} onSubmit={() => upsertVendor(draft)} />
      )}
      {priceVendor && (
        <PriceListDialog vendor={priceVendor} items={itemList} busy={saveMut.isPending}
          onCancel={() => setPriceVendor(null)} onSave={prices => savePrices(priceVendor.id, prices)} />
      )}
    </div>
  );
}

function VendorDialog({ draft, setDraft, busy, onCancel, onSubmit }: {
  draft: VendorDraft; setDraft: (d: VendorDraft) => void; busy: boolean; onCancel: () => void; onSubmit: () => void;
}) {
  const up = (patch: Partial<VendorDraft>) => setDraft({ ...draft, ...patch });
  return (
    <div role="dialog" aria-modal="true" aria-label={draft.id ? "Edit vendor" : "Add vendor"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (draft.name.trim()) onSubmit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{draft.id ? "Edit vendor" : "Add vendor"}</h3>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Vendor name
          <input value={draft.name} onChange={e => up({ name: e.target.value })} required autoFocus placeholder="e.g. Sysco"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Contact
            <input value={draft.contactName} onChange={e => up({ contactName: e.target.value })} placeholder="Rep name"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Phone
            <input value={draft.phone} onChange={e => up({ phone: e.target.value })} placeholder="(813) 555-0100"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Email
          <input value={draft.email} onChange={e => up({ email: e.target.value })} type="email" placeholder="orders@vendor.com"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <input value={draft.notes} onChange={e => up({ notes: e.target.value })} placeholder="Delivery days, terms…"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !draft.name.trim()} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save vendor"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PriceListDialog({ vendor, items, busy, onCancel, onSave }: {
  vendor: Vendor; items: InventoryItem[]; busy: boolean; onCancel: () => void; onSave: (prices: Record<string, number>) => void;
}) {
  const [prices, setPrices] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const [id, cents] of Object.entries(vendor.prices)) init[id] = (cents / 100).toFixed(2);
    return init;
  });
  const submit = () => {
    const out: Record<string, number> = {};
    for (const [id, val] of Object.entries(prices)) {
      const n = Number(val);
      if (val.trim() !== "" && Number.isFinite(n) && n > 0) out[id] = Math.round(n * 100);
    }
    onSave(out);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Price list for ${vendor.name}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">Price list — {vendor.name}</h3>
        <p className="mt-1 text-sm text-zinc-500">Per-unit cost this vendor quotes. Leave blank if they don’t carry it.</p>
        <ul className="mt-4 space-y-2">
          {items.map(i => (
            <li key={i.id} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm text-zinc-200">{i.name} <span className="text-zinc-500">/{i.unit}</span></span>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-sm text-zinc-500">$</span>
                <input value={prices[i.id] ?? ""} onChange={e => setPrices(prev => ({ ...prev, [i.id]: e.target.value }))}
                  inputMode="decimal" placeholder={(i.unitCostCents / 100).toFixed(2)}
                  aria-label={`Price for ${i.name}`}
                  className="w-24 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-right text-sm text-zinc-100 placeholder:text-zinc-600" />
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save prices"}
          </button>
        </div>
      </form>
    </div>
  );
}
