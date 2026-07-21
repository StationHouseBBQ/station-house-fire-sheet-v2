import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { RetailFireItem, RetailItemStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Seminole · Retail Fire Sheet — V2 counterpart of the Manus RetailFireSheet
 * (+ RetailWeeklyPAR / RetailWeeklyBoard). Case-flow board for today's
 * session: tap-to-cycle item status (queued → firing → in_case → 86'd →
 * queued), a live status summary bar, category-grouped sections (Meats /
 * Sandwiches / Sides / Desserts), one-tap quick-add from the retail menu
 * presets, inline qty edits, PAR sync, and a one-way Submit-to-Kitchen
 * handoff. Category is inferred from the item name (the shared DAL fire item
 * carries no category), matching the Manus retail menu taxonomy.
 */

const STATUS_FLOW: Record<RetailItemStatus, RetailItemStatus> = {
  queued: "firing",
  firing: "in_case",
  in_case: "sold_out_86",
  sold_out_86: "queued",
};

const STATUS_META: Record<RetailItemStatus, { label: string; cls: string; summaryCls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300", summaryCls: "border-ink-700 bg-ink-800 text-zinc-300" },
  firing: { label: "Firing", cls: "bg-amber-600 text-white", summaryCls: "border-amber-700/50 bg-amber-950/30 text-amber-300" },
  in_case: { label: "In Case", cls: "bg-green-600 text-white", summaryCls: "border-green-700/50 bg-green-950/30 text-green-300" },
  sold_out_86: { label: "86'd", cls: "bg-red-600 text-white", summaryCls: "border-red-700/50 bg-red-950/30 text-red-300" },
};

const STATUS_ORDER: RetailItemStatus[] = ["queued", "firing", "in_case", "sold_out_86"];
const UNITS = ["pans", "half pans", "racks", "each", "pcs", "lbs", "quarts", "portions", "sandwiches"];

// ── Category taxonomy (mirrors the Manus retail menu) ──────────────────────
type Cat = "meat" | "sandwich" | "side" | "dessert";
const CAT_CONFIG: Array<{ key: Cat; label: string; emoji: string; cls: string }> = [
  { key: "meat", label: "Meats", emoji: "🥩", cls: "text-amber-400" },
  { key: "sandwich", label: "Sandwiches", emoji: "🥪", cls: "text-cyan-400" },
  { key: "side", label: "Sides", emoji: "🫕", cls: "text-yellow-400" },
  { key: "dessert", label: "Desserts", emoji: "🍮", cls: "text-pink-400" },
];

interface Preset { name: string; cat: Cat; unit: string; }
const RETAIL_MENU: Preset[] = [
  { name: "Brisket", cat: "meat", unit: "lbs" },
  { name: "Pork", cat: "meat", unit: "lbs" },
  { name: "Sausage", cat: "meat", unit: "lbs" },
  { name: "Ribs", cat: "meat", unit: "racks" },
  { name: "Chicken Quarter", cat: "meat", unit: "pcs" },
  { name: "Pork Belly Burnt Ends", cat: "meat", unit: "lbs" },
  { name: "Cuban Sandwich", cat: "sandwich", unit: "sandwiches" },
  { name: "Burger", cat: "sandwich", unit: "sandwiches" },
  { name: "Mac & Cheese", cat: "side", unit: "pans" },
  { name: "Baked Beans", cat: "side", unit: "pans" },
  { name: "Fried Rice", cat: "side", unit: "half pans" },
  { name: "Cobbler", cat: "dessert", unit: "half pans" },
  { name: "Banana Pudding", cat: "dessert", unit: "portions" },
  { name: "Cookies", cat: "dessert", unit: "pcs" },
];

function inferCat(name: string): Cat {
  const n = name.toLowerCase();
  const hit = RETAIL_MENU.find(p => n.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(n));
  if (hit) return hit.cat;
  if (/(sandwich|burger|cuban|slider|wrap)/.test(n)) return "sandwich";
  if (/(cobbler|pudding|cookie|cake|pie|dessert|brownie)/.test(n)) return "dessert";
  if (/(mac|beans|rice|slaw|potato|greens|corn|side|salad)/.test(n)) return "side";
  return "meat";
}

type Sync = "idle" | "saving" | "saved" | "error";

export function RetailFireSheetView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [addOpen, setAddOpen] = useState(false);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);

  const { data: session, isLoading } = useQuery({
    queryKey: ["retailFireSheet", "session"],
    queryFn: () => dal.retailFireSheet.getSession(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["retailFireSheet", "session"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: RetailItemStatus }) =>
      withSync(dal.retailFireSheet.updateItemStatus(id, status, actor)),
    onSuccess: invalidate,
  });
  const qtyMut = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      withSync(dal.retailFireSheet.updateItemQty(id, qty, actor)),
    onSuccess: invalidate,
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.retailFireSheet.removeItem(id, actor)),
    onSuccess: () => { setConfirmingRemoveId(null); invalidate(); },
  });
  const addMut = useMutation({
    mutationFn: (input: { name: string; unit: string; qty: number }) =>
      withSync(dal.retailFireSheet.addItem(input, actor)),
    onSuccess: () => { setAddOpen(false); invalidate(); },
  });
  const syncParMut = useMutation({
    mutationFn: () => withSync(dal.retailFireSheet.syncFromPar(actor)),
    onSuccess: invalidate,
  });
  const submitMut = useMutation({
    mutationFn: () => withSync(dal.retailFireSheet.submitToKitchen(actor)),
    onSuccess: invalidate,
  });

  const items = session?.items ?? [];

  const counts = useMemo(() => {
    const c: Record<RetailItemStatus, number> = { queued: 0, firing: 0, in_case: 0, sold_out_86: 0 };
    for (const it of items) c[it.status]++;
    return c;
  }, [items]);

  const grouped = useMemo(() =>
    CAT_CONFIG.map(cat => ({ ...cat, items: items.filter(it => inferCat(it.name) === cat.key) })),
  [items]);

  const presentNames = useMemo(() => new Set(items.map(i => i.name.toLowerCase())), [items]);

  if (isLoading || !session) return <p className="py-20 text-center text-zinc-500">Loading fire sheet…</p>;

  const submitted = !!session.submittedToKitchenAt;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-28">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🔥 Retail Fire Sheet</h1>
          <p className="text-sm text-zinc-500">{session.serviceDate} · {items.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => syncParMut.mutate()} disabled={syncParMut.isPending}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300 disabled:opacity-50">
            {syncParMut.isPending ? "Syncing…" : "Sync from PAR"}
          </button>
          <button onClick={() => setAddOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      </header>

      {/* Status summary bar */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {STATUS_ORDER.map(s => (
          <div key={s} className={`rounded-xl border px-3 py-2 text-center ${STATUS_META[s].summaryCls}`}>
            <p className="text-2xl font-black">{counts[s]}</p>
            <p className="text-[11px] font-bold uppercase tracking-wide">{STATUS_META[s].label}</p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>Tap status to advance:</span>
        {STATUS_ORDER.map((s, i) => (
          <span key={s} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>→</span>}
            <span className={`rounded px-1.5 py-0.5 font-bold ${STATUS_META[s].cls}`}>{STATUS_META[s].label}</span>
          </span>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="mt-10 py-16 text-center">
          <p className="text-base font-semibold text-zinc-300">No items on today's sheet</p>
          <p className="mt-1 text-sm text-zinc-500">Sync from PAR, quick-add a preset, or add items by hand.</p>
          <button onClick={() => setAddOpen(true)}
            className="mt-4 rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      ) : (
        <div className="mt-4 space-y-5">
          {grouped.filter(g => g.items.length > 0).map(g => (
            <section key={g.key}>
              <h2 className={`flex items-center gap-2 text-sm font-black uppercase tracking-widest ${g.cls}`}>
                <span aria-hidden>{g.emoji}</span> {g.label}
                <span className="text-xs font-bold text-zinc-600">({g.items.length})</span>
              </h2>
              <ul className="mt-2 space-y-2">
                {g.items.map(item => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
                    <button
                      onClick={() => statusMut.mutate({ id: item.id, status: STATUS_FLOW[item.status] })}
                      className={`min-h-[44px] min-w-[6.5rem] rounded-lg px-3 py-2 text-xs font-bold uppercase ${STATUS_META[item.status].cls} ${item.status === "firing" ? "animate-pulse" : ""}`}
                      aria-label={`${item.name}: ${STATUS_META[item.status].label}. Tap to advance.`}>
                      {STATUS_META[item.status].label}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-semibold ${item.status === "sold_out_86" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>
                        {item.name}
                      </p>
                    </div>
                    <QtyEditor item={item} onChange={qty => qtyMut.mutate({ id: item.id, qty })} />
                    {confirmingRemoveId === item.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => removeMut.mutate(item.id)} disabled={removeMut.isPending}
                          className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                        <button onClick={() => setConfirmingRemoveId(null)}
                          className="min-h-[44px] rounded-lg border border-ink-700 px-2 py-2 text-xs font-semibold text-zinc-400">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmingRemoveId(item.id)}
                        className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-zinc-500 hover:text-red-400"
                        aria-label={`Remove ${item.name}`}>Remove</button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Submit to kitchen footer */}
      <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-700 bg-ink-950/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <button onClick={() => submitMut.mutate()} disabled={submitted || submitMut.isPending || items.length === 0}
            className="min-h-[52px] w-full rounded-xl bg-fire px-4 py-3 text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
            {submitted
              ? `✓ Submitted to kitchen · ${new Date(session.submittedToKitchenAt!).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
              : submitMut.isPending ? "Submitting…" : "🔥 Submit to Kitchen"}
          </button>
        </div>
      </footer>

      {addOpen && (
        <AddItemDialog busy={addMut.isPending} error={addMut.error?.message ?? null}
          presentNames={presentNames}
          onCancel={() => setAddOpen(false)} onSubmit={i => addMut.mutate(i)} />
      )}
    </div>
  );
}

function QtyEditor({ item, onChange }: { item: RetailFireItem; onChange: (qty: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(item.qty));
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(item.qty)); setEditing(true); }}
        className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200"
        aria-label={`Edit quantity for ${item.name}`}>
        {item.qty} <span className="text-xs font-normal text-zinc-500">{item.unit}</span>
      </button>
    );
  }
  const commit = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n >= 0) onChange(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 rounded-lg border border-fire/50 bg-ink-800 px-2 py-2 text-center text-sm font-bold text-zinc-100"
      aria-label={`Quantity for ${item.name}`} />
  );
}

function AddItemDialog({ onSubmit, onCancel, busy, error, presentNames }: {
  onSubmit: (i: { name: string; unit: string; qty: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null; presentNames: Set<string>;
}) {
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("pans");
  const [qty, setQty] = useState("1");

  return (
    <div role="dialog" aria-modal="true" aria-label="Add fire sheet item"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ name, unit, qty: Number(qty) || 0 }); }}>
        <h3 className="text-lg font-bold text-zinc-100">Add item</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

        {/* Quick-add presets, grouped by category */}
        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Quick add from menu</p>
          {CAT_CONFIG.map(cat => {
            const presets = RETAIL_MENU.filter(p => p.cat === cat.key);
            return (
              <div key={cat.key}>
                <p className={`text-[11px] font-bold uppercase tracking-wide ${cat.cls}`}>{cat.emoji} {cat.label}</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {presets.map(p => {
                    const already = presentNames.has(p.name.toLowerCase());
                    return (
                      <button key={p.name} type="button" disabled={already || busy}
                        onClick={() => onSubmit({ name: p.name, unit: p.unit, qty: 1 })}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                          already
                            ? "cursor-not-allowed border-ink-800 bg-ink-800/50 text-zinc-600"
                            : "border-ink-700 bg-ink-800 text-zinc-200 hover:border-fire/50 hover:text-fire-light"}`}
                        title={already ? "Already on the sheet" : `Add ${p.name}`}>
                        {p.name}{already && " ✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom item */}
        <div className="mt-5 border-t border-ink-800 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Or add custom</p>
          <label className="mt-2 block text-sm font-semibold text-zinc-400">Name
            <input value={name} onChange={e => setName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block text-sm font-semibold text-zinc-400">Unit
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-zinc-400">Qty
              <input value={qty} onChange={e => setQty(e.target.value)} inputMode="decimal"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
            </label>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Close</button>
          <button type="submit" disabled={busy || name.trim() === ""} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add custom item"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}
