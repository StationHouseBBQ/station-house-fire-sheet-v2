import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { FireDrop, FireDropProduct, FireDropSlot, Preorder, PreorderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Preorder channel admin — generic per-channel preorder manager used
 * by the Weekend Pre-Orders (fire_drop) and Catering Pre-Orders / Cuban
 * Thursday admin surfaces (Manus FireDropAdmin / CateringDropAdmin /
 * OnlineOrdersAdmin). For the fire_drop channel it exposes the full FireDrop
 * config — Products, Pickup Windows (slots), and Meat Totals — alongside the
 * live order list. Every price / cap / capacity is editable.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const STATUSES: PreorderStatus[] = ["pending", "paid", "ready", "picked_up", "cancelled", "refunded"];

const STATUS_CLS: Record<PreorderStatus, string> = {
  pending: "bg-ink-700 text-zinc-300",
  paid: "bg-blue-600 text-white",
  ready: "bg-amber-600 text-white",
  picked_up: "bg-green-600 text-white",
  cancelled: "bg-red-700 text-white",
  refunded: "bg-red-900 text-red-200",
};

const PRODUCT_CATEGORIES = ["platters", "meats", "sides", "essentials", "desserts"];

type TabId = "orders" | "products" | "windows" | "meat";

function dollarsToCents(s: string): number | null {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function PreorderChannelAdmin({ channel, title }: { channel: "fire_drop" | "cuban_thursday"; title: string }) {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [tab, setTab] = useState<TabId>("orders");

  const isDrop = channel === "fire_drop";

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const { data: drop } = useQuery({
    queryKey: ["fireDrop", "currentDrop"],
    queryFn: () => dal.fireDrop.currentDrop(),
    enabled: isDrop,
    refetchInterval: 30_000,
  });

  const tabs: Array<{ id: TabId; label: string }> = isDrop
    ? [
        { id: "orders", label: "Orders" },
        { id: "products", label: `Products${drop ? ` (${drop.products.length})` : ""}` },
        { id: "windows", label: `Pickup Windows${drop ? ` (${drop.slots.length})` : ""}` },
        { id: "meat", label: "Meat Totals" },
      ]
    : [{ id: "orders", label: "Orders" }];

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500">
            {isDrop ? "Weekend pickup pre-orders — products, windows & fulfillment" : "Cuban Thursday pre-orders"}
          </p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {isDrop && drop && <DropHeader drop={drop} withSync={withSync} actor={actor} qc={qc} />}

      {/* Tab bar */}
      <div className="mt-5 flex flex-wrap gap-2 border-b border-ink-700">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px min-h-[40px] rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold ${
              tab === t.id ? "border-fire text-zinc-100" : "border-transparent text-zinc-500 hover:text-zinc-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "orders" && <OrdersTab channel={channel} withSync={withSync} actor={actor} qc={qc} />}
        {tab === "products" && drop && <ProductsTab drop={drop} withSync={withSync} actor={actor} qc={qc} />}
        {tab === "windows" && drop && <WindowsTab drop={drop} withSync={withSync} actor={actor} qc={qc} />}
        {tab === "meat" && drop && <MeatTotalsTab drop={drop} />}
      </div>
    </div>
  );
}

// ── Drop-level header (title + master sold-out) ─────────────────────────────
function DropHeader({ drop, withSync, actor, qc }: {
  drop: FireDrop; withSync: <T,>(p: Promise<T>) => Promise<T>; actor: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const dal = getDal();
  const [editTitle, setEditTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(drop.title);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fireDrop", "currentDrop"] });

  const updateMut = useMutation({
    mutationFn: (patch: { title?: string; soldOut?: boolean }) => withSync(dal.fireDrop.updateDrop(patch, actor)),
    onSuccess: () => { setEditTitle(false); invalidate(); },
  });

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
      <div className="min-w-0">
        {editTitle ? (
          <input autoFocus value={titleVal} onChange={e => setTitleVal(e.target.value)}
            onBlur={() => { if (titleVal.trim() && titleVal !== drop.title) updateMut.mutate({ title: titleVal.trim() }); else setEditTitle(false); }}
            onKeyDown={e => { if (e.key === "Enter") { if (titleVal.trim() && titleVal !== drop.title) updateMut.mutate({ title: titleVal.trim() }); else setEditTitle(false); } if (e.key === "Escape") { setTitleVal(drop.title); setEditTitle(false); } }}
            className="rounded-lg border border-fire/50 bg-ink-800 px-2 py-1 text-lg font-bold text-zinc-100" aria-label="Drop title" />
        ) : (
          <button onClick={() => { setTitleVal(drop.title); setEditTitle(true); }}
            className="text-lg font-bold text-zinc-100 hover:text-fire-light" title="Tap to edit drop title">{drop.title}</button>
        )}
        <p className="text-xs text-zinc-500">Fri {drop.fridayDate} · Sat {drop.saturdayDate}</p>
      </div>
      <button onClick={() => updateMut.mutate({ soldOut: !drop.soldOut })} role="switch" aria-checked={drop.soldOut}
        className={`min-h-[40px] rounded-lg px-4 py-2 text-sm font-bold ${
          drop.soldOut ? "bg-red-600 text-white" : "border border-ink-700 bg-ink-800 text-zinc-400 hover:text-red-400"}`}>
        {drop.soldOut ? "Drop SOLD OUT — tap to reopen" : "Mark whole drop sold out"}
      </button>
    </div>
  );
}

// ── Products tab ────────────────────────────────────────────────────────────
function ProductsTab({ drop, withSync, actor, qc }: {
  drop: FireDrop; withSync: <T,>(p: Promise<T>) => Promise<T>; actor: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const dal = getDal();
  const [dialog, setDialog] = useState<{ open: boolean; product: FireDropProduct | null }>({ open: false, product: null });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fireDrop", "currentDrop"] });

  const upsertMut = useMutation({
    mutationFn: (p: Omit<FireDropProduct, "soldQty" | "id"> & { id?: string }) => withSync(dal.fireDrop.upsertProduct(p, actor)),
    onSuccess: () => { setDialog({ open: false, product: null }); invalidate(); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.removeProduct(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });
  const toggle86Mut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.toggleProductSoldOut(id, actor)),
    onSuccess: invalidate,
  });

  const patch = (p: FireDropProduct, changes: Partial<Omit<FireDropProduct, "id" | "soldQty">>) =>
    upsertMut.mutate({ id: p.id, name: p.name, priceCents: p.priceCents, capQty: p.capQty, soldOut: p.soldOut,
      sortOrder: p.sortOrder, category: p.category, description: p.description, ...changes });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">Products on this drop</h2>
        <button onClick={() => setDialog({ open: true, product: null })}
          className="min-h-[40px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add product</button>
      </div>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5 text-right">Cap</th>
              <th className="px-3 py-2.5 text-right">Sold</th>
              <th className="px-3 py-2.5">86</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {drop.products.map(p => (
              <tr key={p.id} className={p.soldOut ? "opacity-60" : ""}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-zinc-100">{p.name}</p>
                  {p.description && <p className="text-xs text-zinc-500">{p.description}</p>}
                </td>
                <td className="px-3 py-2.5 text-xs capitalize text-zinc-400">{p.category ?? "—"}</td>
                <td className="px-3 py-2.5 text-right">
                  <InlinePrice value={p.priceCents} ariaLabel={`Price for ${p.name}`}
                    onSave={cents => patch(p, { priceCents: cents })} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <InlineCap value={p.capQty} ariaLabel={`Cap for ${p.name}`}
                    onSave={cap => patch(p, { capQty: cap })} />
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{p.soldQty}</td>
                <td className="px-3 py-2.5">
                  <button onClick={() => toggle86Mut.mutate(p.id)} role="switch" aria-checked={p.soldOut}
                    aria-label={`86 toggle for ${p.name}`}
                    className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                      p.soldOut ? "bg-red-600 text-white" : "border border-ink-700 text-zinc-500 hover:text-red-400"}`}>
                    {p.soldOut ? "86'd" : "86?"}
                  </button>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setDialog({ open: true, product: p })}
                      className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">Edit</button>
                    {confirmRemove === p.id ? (
                      <>
                        <button onClick={() => removeMut.mutate(p.id)} disabled={removeMut.isPending}
                          className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                        <button onClick={() => setConfirmRemove(null)}
                          className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmRemove(p.id)}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">Remove</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {drop.products.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No products yet — add your first item.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {upsertMut.error && <p className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{upsertMut.error.message}</p>}

      {dialog.open && (
        <ProductDialog product={dialog.product} nextSort={drop.products.length}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, product: null })}
          onSubmit={p => upsertMut.mutate(p)} />
      )}
    </div>
  );
}

function ProductDialog({ product, nextSort, onSubmit, onCancel, busy, error }: {
  product: FireDropProduct | null; nextSort: number;
  onSubmit: (p: Omit<FireDropProduct, "soldQty" | "id"> & { id?: string }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState(product?.category ?? "meats");
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : "");
  const [cap, setCap] = useState(product?.capQty != null ? String(product.capQty) : "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [sortOrder, setSortOrder] = useState(String(product?.sortOrder ?? nextSort));
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    const cents = dollarsToCents(price);
    if (cents === null) return setFormError("Price must be a valid non-negative dollar amount.");
    let capQty: number | null = null;
    if (cap.trim() !== "") {
      const n = Number(cap);
      if (!Number.isInteger(n) || n < 0) return setFormError("Cap must be a non-negative whole number (blank = unlimited).");
      capQty = n;
    }
    const so = Number(sortOrder);
    onSubmit({ id: product?.id, name: name.trim(), category, priceCents: cents, capQty,
      description: description.trim() || null, soldOut: product?.soldOut ?? false, sortOrder: Number.isFinite(so) ? so : nextSort });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={product ? "Edit product" : "Add product"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{product ? "Edit product" : "Add product"}</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Category
            <select value={category ?? "meats"} onChange={e => setCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 capitalize text-zinc-100">
              {PRODUCT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Price ($)
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Cap (blank = ∞)
            <input value={cap} onChange={e => setCap(e.target.value)} inputMode="numeric" placeholder="none"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Sort
            <input value={sortOrder} onChange={e => setSortOrder(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Description (optional)
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : product ? "Save changes" : "Add product"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Pickup windows (slots) tab ──────────────────────────────────────────────
function WindowsTab({ drop, withSync, actor, qc }: {
  drop: FireDrop; withSync: <T,>(p: Promise<T>) => Promise<T>; actor: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const dal = getDal();
  const [dialog, setDialog] = useState<{ open: boolean; slot: FireDropSlot | null }>({ open: false, slot: null });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fireDrop", "currentDrop"] });

  const upsertMut = useMutation({
    mutationFn: (s: Omit<FireDropSlot, "booked" | "id"> & { id?: string }) => withSync(dal.fireDrop.upsertSlot(s, actor)),
    onSuccess: () => { setDialog({ open: false, slot: null }); invalidate(); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.removeSlot(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });

  const generateDefaults = () => {
    const windows = ["11AM–12PM", "12PM–1PM", "1PM–2PM", "2PM–3PM"];
    const days: Array<"friday" | "saturday"> = ["friday", "saturday"];
    days.forEach(day => windows.forEach(w =>
      setTimeout(() => upsertMut.mutate({ day, window: w, capacity: 20 }), 0)));
  };

  const patchCap = (s: FireDropSlot, capacity: number) =>
    upsertMut.mutate({ id: s.id, day: s.day, window: s.window, capacity });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">Pickup windows & capacity</h2>
        <div className="flex gap-2">
          {drop.slots.length === 0 && (
            <button onClick={generateDefaults}
              className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Generate default slots</button>
          )}
          <button onClick={() => setDialog({ open: true, slot: null })}
            className="min-h-[40px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add window</button>
        </div>
      </div>

      {(["friday", "saturday"] as const).map(day => {
        const daySlots = drop.slots.filter(s => s.day === day);
        return (
          <section key={day} className="mt-4">
            <h3 className="text-sm font-bold capitalize text-zinc-300">{day} · {day === "friday" ? drop.fridayDate : drop.saturdayDate}</h3>
            <div className="mt-2 space-y-2">
              {daySlots.map(s => {
                const remaining = Math.max(0, s.capacity - s.booked);
                return (
                  <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5">
                    <span className="font-semibold text-zinc-100">{s.window}</span>
                    <span className="text-xs text-zinc-500">{s.booked}/{s.capacity} booked · {remaining} open</span>
                    <span className="ml-auto flex items-center gap-2 text-xs font-semibold text-zinc-400">
                      Cap
                      <InlineWholeNumber value={s.capacity} ariaLabel={`Capacity for ${day} ${s.window}`}
                        onSave={n => patchCap(s, n)} />
                    </span>
                    <button onClick={() => setDialog({ open: true, slot: s })}
                      className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">Edit</button>
                    {confirmRemove === s.id ? (
                      <span className="inline-flex gap-1">
                        <button onClick={() => removeMut.mutate(s.id)} disabled={removeMut.isPending}
                          className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                        <button onClick={() => setConfirmRemove(null)}
                          className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmRemove(s.id)}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">Remove</button>
                    )}
                  </div>
                );
              })}
              {daySlots.length === 0 && <p className="text-sm text-zinc-600">No windows for {day}.</p>}
            </div>
          </section>
        );
      })}
      {upsertMut.error && <p className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{upsertMut.error.message}</p>}

      {dialog.open && (
        <SlotDialog slot={dialog.slot} busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, slot: null })}
          onSubmit={s => upsertMut.mutate(s)} />
      )}
    </div>
  );
}

function SlotDialog({ slot, onSubmit, onCancel, busy, error }: {
  slot: FireDropSlot | null;
  onSubmit: (s: Omit<FireDropSlot, "booked" | "id"> & { id?: string }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [day, setDay] = useState<"friday" | "saturday">(slot?.day ?? "friday");
  const [windowLabel, setWindowLabel] = useState(slot?.window ?? "");
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? 20));
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!windowLabel.trim()) return setFormError("Window label is required (e.g. 11AM–12PM).");
    const cap = Number(capacity);
    if (!Number.isInteger(cap) || cap < 0) return setFormError("Capacity must be a non-negative whole number.");
    onSubmit({ id: slot?.id, day, window: windowLabel.trim(), capacity: cap });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={slot ? "Edit pickup window" : "Add pickup window"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{slot ? "Edit pickup window" : "Add pickup window"}</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Day
          <select value={day} onChange={e => setDay(e.target.value as "friday" | "saturday")}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 capitalize text-zinc-100">
            <option value="friday">Friday</option>
            <option value="saturday">Saturday</option>
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Window label
          <input value={windowLabel} onChange={e => setWindowLabel(e.target.value)} placeholder="11AM–12PM" required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Capacity (orders)
          <input value={capacity} onChange={e => setCapacity(e.target.value)} inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : slot ? "Save changes" : "Add window"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Meat totals tab ─────────────────────────────────────────────────────────
function MeatTotalsTab({ drop }: { drop: FireDrop }) {
  const dal = getDal();
  const { data: orders } = useQuery({
    queryKey: ["preorders", "fire_drop", "meat"],
    queryFn: () => dal.preorders.list({ channel: "fire_drop", status: "all", includeHidden: false }),
  });

  const totals = useMemo(() => {
    const active = (orders ?? []).filter(o => o.status !== "cancelled" && o.status !== "refunded");
    const byName = new Map<string, { name: string; qty: number; category: string | null }>();
    for (const o of active) {
      for (const it of o.items) {
        const prod = drop.products.find(p => p.name === it.name);
        const key = it.name;
        const ex = byName.get(key);
        if (ex) ex.qty += it.qty;
        else byName.set(key, { name: it.name, qty: it.qty, category: prod?.category ?? null });
      }
    }
    return [...byName.values()].sort((a, b) => b.qty - a.qty);
  }, [orders, drop.products]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">Meat totals from orders</h2>
          <p className="text-xs text-zinc-500">Aggregated from all non-cancelled pre-orders — use this to load the smokers.</p>
        </div>
      </div>
      {totals.length > 0 ? (
        <div className="mt-3 space-y-2">
          {totals.map(t => (
            <div key={t.name} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5">
              <span className="font-semibold text-zinc-100">
                {t.name}
                {t.category && <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-black capitalize text-zinc-400">{t.category}</span>}
              </span>
              <span className="font-mono text-lg font-black text-fire-light">{t.qty}</span>
            </div>
          ))}
          <p className="mt-3 rounded-lg border border-ink-700 bg-ink-800/40 px-3 py-2 text-xs text-zinc-500">
            💡 These quantities feed the Weekly PAR sheet for Fri {drop.fridayDate} and Sat {drop.saturdayDate}.
          </p>
        </div>
      ) : (
        <p className="py-8 text-center text-zinc-500">No pre-orders yet for this drop.</p>
      )}
    </div>
  );
}

// ── Orders tab (the original order-management view) ─────────────────────────
function OrdersTab({ channel, withSync, actor, qc }: {
  channel: "fire_drop" | "cuban_thursday"; withSync: <T,>(p: Promise<T>) => Promise<T>;
  actor: string; qc: ReturnType<typeof useQueryClient>;
}) {
  const dal = getDal();
  const [statusFilter, setStatusFilter] = useState<PreorderStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["preorders", channel, statusFilter, showHidden],
    queryFn: () => dal.preorders.list({ channel, status: statusFilter, includeHidden: showHidden }),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["preorders"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: PreorderStatus }) =>
      withSync(dal.preorders.updateStatus(id, status, actor)),
    onSuccess: invalidate,
  });
  const hideMut = useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) =>
      withSync(dal.preorders.setHidden(id, hidden, actor)),
    onSuccess: invalidate,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders ?? [];
    return (orders ?? []).filter(o =>
      [o.customer, o.orderRef, o.email, o.phone].some(f => f.toLowerCase().includes(q)));
  }, [orders, search]);

  const revenue = filtered
    .filter(o => o.status !== "cancelled" && o.status !== "refunded")
    .reduce((s, o) => s + o.totalCents, 0);

  if (isLoading || !orders) return <p className="py-20 text-center text-zinc-500">Loading preorders…</p>;

  return (
    <div>
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label="Orders shown" value={String(filtered.length)} />
        <Kpi label="Revenue" value={formatCents(revenue)} accent="fire" />
        <Kpi label="Avg order" value={formatCents(filtered.length ? Math.round(revenue / Math.max(1, filtered.filter(o => o.status !== "cancelled" && o.status !== "refunded").length)) : 0)} />
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["all", ...STATUSES] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`min-h-[36px] rounded-full px-3 py-1.5 text-xs font-bold capitalize ${
              statusFilter === s ? "bg-fire text-white" : "border border-ink-700 bg-ink-900 text-zinc-400"}`}>
            {s.replace("_", " ")}
          </button>
        ))}
        <label className="ml-auto flex min-h-[36px] items-center gap-2 text-xs font-semibold text-zinc-400">
          <input type="checkbox" checked={showHidden} onChange={e => setShowHidden(e.target.checked)} className="h-4 w-4" />
          Show hidden
        </label>
      </div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer, ref, email, phone…"
        aria-label="Search preorders"
        className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />

      <ul className="mt-4 space-y-3">
        {filtered.map(o => (
          <PreorderCard key={o.id} order={o}
            onStatus={status => statusMut.mutate({ id: o.id, status })}
            onHide={() => hideMut.mutate({ id: o.id, hidden: !o.hidden })} />
        ))}
        {filtered.length === 0 && <li className="py-10 text-center text-zinc-500">No preorders match.</li>}
      </ul>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: "fire" }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-xl font-black ${accent === "fire" ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function PreorderCard({ order: o, onStatus, onHide }: {
  order: Preorder;
  onStatus: (s: PreorderStatus) => void;
  onHide: () => void;
}) {
  return (
    <li className={`rounded-xl border border-ink-700 bg-ink-900 p-4 ${o.hidden ? "opacity-50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-zinc-100">
            {o.customer}
            <span className="ml-2 font-mono text-xs font-normal text-zinc-500">{o.orderRef}</span>
            {o.hidden && <span className="ml-2 rounded bg-ink-700 px-1.5 py-0.5 text-[10px] font-black text-zinc-400">HIDDEN</span>}
          </p>
          <p className="text-xs text-zinc-500">{o.phone} · {o.email}</p>
          <p className="mt-0.5 text-xs font-semibold text-zinc-400">Pickup {o.pickupDate} · {o.pickupWindow}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${STATUS_CLS[o.status]}`}>{o.status.replace("_", " ")}</span>
          <select value={o.status} onChange={e => onStatus(e.target.value as PreorderStatus)}
            aria-label={`Status for ${o.orderRef}`}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-xs font-semibold text-zinc-200">
            {STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
          </select>
          <button onClick={onHide}
            className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
            {o.hidden ? "Unhide" : "Hide"}
          </button>
        </div>
      </div>
      <ul className="mt-2 space-y-0.5 border-t border-ink-800 pt-2 text-sm text-zinc-300">
        {o.items.map(i => (
          <li key={i.id} className="flex justify-between">
            <span>{i.qty}× {i.name}</span>
            <span className="font-mono text-zinc-500">{formatCents(i.unitPriceCents * i.qty)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-right text-sm font-bold text-zinc-100">
        Total <span className="font-mono text-fire-light">{formatCents(o.totalCents)}</span>
        <span className="ml-2 text-xs font-normal text-zinc-600">(incl. tax {formatCents(o.taxCents)})</span>
      </p>
    </li>
  );
}

// ── Inline editors ──────────────────────────────────────────────────────────
function InlinePrice({ value, onSave, ariaLabel }: { value: number; onSave: (cents: number) => void; ariaLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal((value / 100).toFixed(2)); setEditing(true); }} aria-label={ariaLabel}
        className="min-h-[36px] rounded-lg border border-transparent px-2 py-1 font-mono text-sm text-zinc-200 hover:border-ink-700 hover:bg-ink-800">
        {formatCents(value)}
      </button>
    );
  }
  const commit = () => {
    const cents = dollarsToCents(val);
    if (cents !== null && cents !== value) onSave(cents);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-24 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1 text-right font-mono text-sm text-zinc-100" aria-label={ariaLabel} />
  );
}

function InlineCap({ value, onSave, ariaLabel }: { value: number | null; onSave: (cap: number | null) => void; ariaLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal(value != null ? String(value) : ""); setEditing(true); }} aria-label={ariaLabel}
        className="min-h-[36px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1 font-mono text-sm font-bold text-zinc-200">
        {value ?? "∞"}
      </button>
    );
  }
  const commit = () => {
    const t = val.trim();
    if (t === "") { onSave(null); setEditing(false); return; }
    const n = Number(t);
    if (Number.isInteger(n) && n >= 0) onSave(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="numeric" value={val} onChange={e => setVal(e.target.value)} placeholder="∞"
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-16 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1 text-right font-mono text-sm font-bold text-zinc-100" aria-label={ariaLabel} />
  );
}

function InlineWholeNumber({ value, onSave, ariaLabel }: { value: number; onSave: (n: number) => void; ariaLabel: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal(String(value)); setEditing(true); }} aria-label={ariaLabel}
        className="min-h-[32px] rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1 font-mono text-sm font-bold text-zinc-200">
        {value}
      </button>
    );
  }
  const commit = () => {
    const n = Number(val);
    if (Number.isInteger(n) && n >= 0 && n !== value) onSave(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="numeric" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-16 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1 text-right font-mono text-sm font-bold text-zinc-100" aria-label={ariaLabel} />
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
