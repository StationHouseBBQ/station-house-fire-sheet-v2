import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { FireDropProduct, FireDropSlot, Preorder, PreorderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import { downloadCsv } from "../../lib/csv";
import { preorderCsv } from "./PreordersView";

/**
 * Seminole · Fire Drop Admin — V2 counterpart of the Manus FireDropAdmin.
 * Manages the current weekend drop: title, drop-level sold-out kill switch,
 * ordering-window badges, product catalog (price/cap/86/sort), and pickup
 * slots with capacity fill. Note: upsert payloads pass id: "" to create —
 * the DAL treats a falsy id as an insert.
 */

type Sync = "idle" | "saving" | "saved" | "error";

function dollarsToCents(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function FireDropAdminView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmSoldOut, setConfirmSoldOut] = useState(false);
  const [productDialog, setProductDialog] = useState<{ open: boolean; product: FireDropProduct | null }>({ open: false, product: null });
  const [slotDialog, setSlotDialog] = useState<{ open: boolean; slot: FireDropSlot | null }>({ open: false, slot: null });
  const [confirmRemove, setConfirmRemove] = useState<{ kind: "product" | "slot"; id: string } | null>(null);

  const { data: drop, isLoading } = useQuery({
    queryKey: ["fireDrop", "currentDrop"],
    queryFn: () => dal.fireDrop.currentDrop(),
    refetchInterval: 30_000,
  });
  const ordering = dal.fireDrop.orderingStatus();

  // Read-only pickups summary — bumping happens in Preorders / the FOH board.
  const { data: dropPreorders = [] } = useQuery({
    queryKey: ["preorders", "list", "fire_drop", "admin-summary"],
    queryFn: () => dal.preorders.list({ channel: "fire_drop" }),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fireDrop", "currentDrop"] });

  const updateDropMut = useMutation({
    mutationFn: (patch: { title?: string; soldOut?: boolean }) => withSync(dal.fireDrop.updateDrop(patch, actor)),
    onSuccess: () => { setEditingTitle(false); setConfirmSoldOut(false); invalidate(); },
  });
  const upsertProductMut = useMutation({
    mutationFn: (p: Parameters<typeof dal.fireDrop.upsertProduct>[0]) => withSync(dal.fireDrop.upsertProduct(p, actor)),
    onSuccess: () => { setProductDialog({ open: false, product: null }); invalidate(); },
  });
  const removeProductMut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.removeProduct(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });
  const toggle86Mut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.toggleProductSoldOut(id, actor)),
    onSuccess: invalidate,
  });
  const upsertSlotMut = useMutation({
    mutationFn: (s: Parameters<typeof dal.fireDrop.upsertSlot>[0]) => withSync(dal.fireDrop.upsertSlot(s, actor)),
    onSuccess: () => { setSlotDialog({ open: false, slot: null }); invalidate(); },
  });
  const removeSlotMut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.removeSlot(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });

  if (isLoading || !drop) return <p className="py-20 text-center text-zinc-500">Loading drop…</p>;

  const activePickups = dropPreorders.filter(
    o => o.status === "pending" || o.status === "paid" || o.status === "ready");
  const fridayPickups = activePickups.filter(o => o.pickupDate === drop.fridayDate);
  const saturdayPickups = activePickups.filter(o => o.pickupDate === drop.saturdayDate);

  const commitTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== drop.title) updateDropMut.mutate({ title: t });
    else setEditingTitle(false);
  };

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editingTitle ? (
            <input autoFocus value={titleDraft} onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") setEditingTitle(false); }}
              className="w-full rounded-lg border border-fire/50 bg-ink-800 px-3 py-2 text-xl font-black text-zinc-100"
              aria-label="Drop title" />
          ) : (
            <button onClick={() => { setTitleDraft(drop.title); setEditingTitle(true); }}
              className="text-left text-2xl font-black uppercase text-zinc-100 hover:text-fire-light"
              title="Tap to edit title">
              🔥 {drop.title} <span className="text-sm font-normal text-zinc-600">✏️</span>
            </button>
          )}
          <p className="mt-1 text-sm text-zinc-500">Friday {drop.fridayDate} · Saturday {drop.saturdayDate}</p>
          <p className="mt-1 text-xs text-zinc-600">Dates auto-advance every Monday; slot bookings reset (owner notified).</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          {confirmSoldOut ? (
            <div className="flex items-center gap-1">
              <button onClick={() => updateDropMut.mutate({ soldOut: !drop.soldOut })} disabled={updateDropMut.isPending}
                className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                {drop.soldOut ? "Confirm reopen" : "Confirm sold out"}
              </button>
              <button onClick={() => setConfirmSoldOut(false)}
                className="min-h-[44px] rounded-lg border border-ink-700 px-2 py-2 text-xs font-semibold text-zinc-400">✕</button>
            </div>
          ) : (
            <button onClick={() => setConfirmSoldOut(true)}
              className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-bold ${
                drop.soldOut ? "bg-red-600 text-white" : "border border-red-700/60 text-red-400"}`}>
              {drop.soldOut ? "DROP SOLD OUT — tap to reopen" : "Mark drop Sold Out"}
            </button>
          )}
        </div>
      </header>
      {confirmSoldOut && !drop.soldOut && (
        <p className="mt-2 rounded-lg border border-red-700/50 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-400">
          ⚠️ Sold Out blocks all checkout server-side for this drop. Tap Confirm to proceed.
        </p>
      )}

      {/* Ordering windows */}
      <div className="mt-4 flex flex-wrap gap-2">
        <WindowBadge label="Friday ordering" open={ordering.friday} />
        <WindowBadge label="Saturday ordering" open={ordering.saturday} />
      </div>

      {/* Pickups by day (read-only summary) */}
      <section className="mt-6" aria-label="Pickups by day">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Pickups by day</h2>
          <div className="flex items-center gap-2">
            <p className="text-xs text-zinc-500">Bump pickups from the Preorders tab or FOH board.</p>
            <button onClick={() => downloadCsv(`fire-drop-orders-${drop.fridayDate}.csv`, preorderCsv(dropPreorders))}
              disabled={dropPreorders.length === 0}
              title={dropPreorders.length === 0 ? "No Fire Drop orders yet" : `Export ${dropPreorders.length} Fire Drop orders`}
              className="no-print min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-bold text-zinc-200 disabled:opacity-40">
              ⬇ Export orders CSV
            </button>
          </div>
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          <PickupDayColumn label="Friday" date={drop.fridayDate} orders={fridayPickups} />
          <PickupDayColumn label="Saturday" date={drop.saturdayDate} orders={saturdayPickups} />
        </div>
      </section>

      {/* Products */}
      <section className="mt-6" aria-label="Products">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Products ({drop.products.length})</h2>
          <button onClick={() => setProductDialog({ open: true, product: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add product</button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
              <tr>
                <th className="px-3 py-2.5">Product</th>
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
                  <td className="px-3 py-2.5 font-semibold text-zinc-100">
                    {p.name} {p.soldOut && <span className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">86'D</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{formatCents(p.priceCents)}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">{p.capQty ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-zinc-400">{p.soldQty}</td>
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
                      <button onClick={() => setProductDialog({ open: true, product: p })}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                        Edit
                      </button>
                      {confirmRemove?.kind === "product" && confirmRemove.id === p.id ? (
                        <>
                          <button onClick={() => removeProductMut.mutate(p.id)} disabled={removeProductMut.isPending}
                            className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                          <button onClick={() => setConfirmRemove(null)}
                            className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                        </>
                      ) : (
                        <button onClick={() => setConfirmRemove({ kind: "product", id: p.id })}
                          className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {drop.products.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">No products yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Slots */}
      <section className="mt-6" aria-label="Pickup slots">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Pickup slots ({drop.slots.length})</h2>
          <button onClick={() => setSlotDialog({ open: true, slot: null })}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200">+ Add slot</button>
        </div>
        <div className="mt-2 grid gap-4 sm:grid-cols-2">
          {(["friday", "saturday"] as const).map(day => (
            <div key={day} className="rounded-xl border border-ink-700 bg-ink-900 p-3">
              <h3 className="text-xs font-black uppercase tracking-widest text-fire-light">
                {day === "friday" ? `Friday · ${drop.fridayDate}` : `Saturday · ${drop.saturdayDate}`}
              </h3>
              <ul className="mt-2 space-y-2">
                {drop.slots.filter(s => s.day === day).map(s => {
                  const fill = s.capacity > 0 ? Math.min(100, Math.round((s.booked / s.capacity) * 100)) : 0;
                  return (
                    <li key={s.id} className="rounded-lg border border-ink-700 bg-ink-800 p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-bold text-zinc-100">⏰ {s.window}</span>
                        <span className={`text-xs font-bold ${s.booked >= s.capacity ? "text-red-400" : "text-zinc-400"}`}>
                          {s.booked}/{s.capacity} booked
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-700">
                        <div className={`h-full ${fill >= 100 ? "bg-red-500" : "bg-fire"}`} style={{ width: `${fill}%` }} />
                      </div>
                      <div className="mt-2 flex justify-end gap-1">
                        <button onClick={() => setSlotDialog({ open: true, slot: s })}
                          className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                          Edit
                        </button>
                        {confirmRemove?.kind === "slot" && confirmRemove.id === s.id ? (
                          <>
                            <button onClick={() => removeSlotMut.mutate(s.id)} disabled={removeSlotMut.isPending}
                              className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                            <button onClick={() => setConfirmRemove(null)}
                              className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmRemove({ kind: "slot", id: s.id })}
                            className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
                            Remove
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
                {drop.slots.filter(s => s.day === day).length === 0 && (
                  <li className="py-4 text-center text-sm text-zinc-600">No slots.</li>
                )}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {productDialog.open && (
        <ProductDialog product={productDialog.product} busy={upsertProductMut.isPending}
          error={upsertProductMut.error?.message ?? null}
          onCancel={() => setProductDialog({ open: false, product: null })}
          onSubmit={p => upsertProductMut.mutate(p)} />
      )}
      {slotDialog.open && (
        <SlotDialog slot={slotDialog.slot} busy={upsertSlotMut.isPending}
          error={upsertSlotMut.error?.message ?? null}
          onCancel={() => setSlotDialog({ open: false, slot: null })}
          onSubmit={s => upsertSlotMut.mutate(s)} />
      )}
    </div>
  );
}

const PICKUP_DOT: Partial<Record<PreorderStatus, string>> = {
  pending: "bg-amber-400",
  paid: "bg-blue-400",
  ready: "bg-green-400",
};

function PickupDayColumn({ label, date, orders }: { label: string; date: string; orders: Preorder[] }) {
  const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
  const windows = new Map<string, Preorder[]>();
  for (const o of orders) {
    const list = windows.get(o.pickupWindow) ?? [];
    list.push(o);
    windows.set(o.pickupWindow, list);
  }
  const grouped = [...windows.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-black uppercase tracking-widest text-fire-light">{label} · {date}</h3>
        <span className="text-xs font-bold text-zinc-400">
          {orders.length} {orders.length === 1 ? "order" : "orders"} · <span className="text-fire-light">{formatCents(totalCents)}</span>
        </span>
      </div>
      {orders.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-600">No active pickups.</p>
      ) : (
        grouped.map(([window, list]) => (
          <div key={window} className="mt-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">⏰ {window} ({list.length})</p>
            <ul className="mt-1 space-y-1">
              {list.map(o => (
                <li key={o.id} className="flex items-center gap-2 rounded-lg bg-ink-800/70 px-2.5 py-1.5 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${PICKUP_DOT[o.status] ?? "bg-zinc-600"}`}
                    title={o.status} aria-label={`Status ${o.status}`} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{o.customer}</span>
                  <span className="shrink-0 font-mono text-xs text-zinc-400">{formatCents(o.totalCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}

function WindowBadge({ label, open }: { label: string; open: boolean }) {
  return (
    <span className={`rounded-full border px-3 py-1.5 text-xs font-bold ${
      open ? "border-green-700/50 bg-green-950/40 text-green-400" : "border-red-700/50 bg-red-950/40 text-red-400"}`}>
      {label}: {open ? "OPEN" : "CLOSED"}
    </span>
  );
}

function ProductDialog({ product, onSubmit, onCancel, busy, error }: {
  product: FireDropProduct | null;
  onSubmit: (p: { id: string; name: string; priceCents: number; capQty: number | null; soldOut: boolean; sortOrder: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : "");
  const [cap, setCap] = useState(product?.capQty != null ? String(product.capQty) : "");
  const [sortOrder, setSortOrder] = useState(String(product?.sortOrder ?? 0));
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    const cents = dollarsToCents(price);
    if (cents === null) return setFormError("Price must be a valid non-negative dollar amount.");
    let capQty: number | null = null;
    if (cap.trim() !== "") {
      const c = Number(cap);
      if (!Number.isInteger(c) || c < 0) return setFormError("Cap must be a non-negative whole number (or blank for no cap).");
      capQty = c;
    }
    const so = Number(sortOrder);
    onSubmit({
      id: product?.id ?? "", // empty id = create (DAL treats falsy id as insert)
      name: name.trim(), priceCents: cents, capQty,
      soldOut: product?.soldOut ?? false,
      sortOrder: Number.isFinite(so) ? so : 0,
    });
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
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Price ($)
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Cap
            <input value={cap} onChange={e => setCap(e.target.value)} inputMode="numeric" placeholder="none"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Sort
            <input value={sortOrder} onChange={e => setSortOrder(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
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

function SlotDialog({ slot, onSubmit, onCancel, busy, error }: {
  slot: FireDropSlot | null;
  onSubmit: (s: { id: string; day: "friday" | "saturday"; window: string; capacity: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [day, setDay] = useState<"friday" | "saturday">(slot?.day ?? "friday");
  const [window, setWindow] = useState(slot?.window ?? "");
  const [capacity, setCapacity] = useState(String(slot?.capacity ?? 10));
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!window.trim()) return setFormError("Window is required (e.g. 11AM–12PM).");
    const c = Number(capacity);
    if (!Number.isInteger(c) || c < 0) return setFormError("Capacity must be a non-negative whole number.");
    onSubmit({ id: slot?.id ?? "", day, window: window.trim(), capacity: c }); // empty id = create
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={slot ? "Edit slot" : "Add slot"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{slot ? "Edit slot" : "Add slot"}</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Day
            <select value={day} onChange={e => setDay(e.target.value as "friday" | "saturday")}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              <option value="friday">Friday</option>
              <option value="saturday">Saturday</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Window
            <input value={window} onChange={e => setWindow(e.target.value)} placeholder="11AM–12PM" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Capacity
            <input value={capacity} onChange={e => setCapacity(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : slot ? "Save changes" : "Add slot"}
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
