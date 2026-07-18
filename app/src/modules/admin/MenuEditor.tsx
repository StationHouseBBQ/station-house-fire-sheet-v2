import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { MenuCategory, MenuItem } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Menu Editor — V2 counterpart of Manus AdminMenuEditor (parity row 52).
 * Categories sidebar with active toggles, items table per category, upsert
 * dialog. Menu truth: every item in the "Thursday Only" category is
 * thursdayOnly — the checkbox locks on and the DAL enforces it regardless.
 */

const THURSDAY_ONLY_CATEGORY = "Thursday Only";

type Sync = "idle" | "saving" | "saved" | "error";

/** Estimated-price convention: flagged items carry a "⚠ Estimated" description. */
function isEstimated(i: MenuItem): boolean {
  return (i.description ?? "").startsWith("⚠ Estimated");
}

function dollarsToCents(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function MenuEditor() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [itemDialog, setItemDialog] = useState<{ open: boolean; item: MenuItem | null }>({ open: false, item: null });
  const [reviewMode, setReviewMode] = useState(false);

  const { data: categories } = useQuery({ queryKey: ["menu", "categories"], queryFn: () => dal.menu.categories() });
  const { data: items } = useQuery({ queryKey: ["menu", "items"], queryFn: () => dal.menu.items() });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["menu"] });

  const upsertItemMut = useMutation({
    mutationFn: (i: Parameters<typeof dal.menu.upsertItem>[0]) => withSync(dal.menu.upsertItem(i, actor)),
    onSuccess: () => { setItemDialog({ open: false, item: null }); invalidate(); },
  });
  const toggleItemMut = useMutation({
    mutationFn: (id: string) => withSync(dal.menu.toggleItemActive(id, actor)),
    onSuccess: invalidate,
  });
  const upsertCatMut = useMutation({
    mutationFn: (c: MenuCategory) => withSync(dal.menu.upsertCategory(c, actor)),
    onSuccess: invalidate,
  });

  const activeCat = useMemo(() => {
    if (!categories?.length) return null;
    return categories.find(c => c.id === selectedCatId) ?? categories[0];
  }, [categories, selectedCatId]);

  const catItems = useMemo(
    () => (items ?? []).filter(i => i.categoryId === activeCat?.id),
    [items, activeCat],
  );

  // "Needs review" — flagged estimated-price items across ALL categories,
  // already in category walk order (sortOrder encodes category × 1000).
  const flagged = useMemo(() => (items ?? []).filter(isEstimated), [items]);
  const catNameById = useMemo(() => new Map((categories ?? []).map(c => [c.id, c.name])), [categories]);
  const tableRows = reviewMode ? flagged : catItems;

  /** Inline price save — full item upsert; description cleared when it was
   *  estimated (the DAL also auto-clears — belt and braces). */
  const savePrice = (i: MenuItem, priceCents: number) =>
    upsertItemMut.mutate({
      id: i.id, categoryId: i.categoryId, name: i.name,
      description: isEstimated(i) ? "" : i.description,
      priceCents, active: i.active, thursdayOnly: i.thursdayOnly, sortOrder: i.sortOrder,
    });

  if (!categories || !items) return <p className="py-20 text-center text-zinc-500">Loading menu…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Menu Editor</h1>
          <p className="text-sm text-zinc-500">{categories.length} categories · {items.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setItemDialog({ open: true, item: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add item</button>
        </div>
      </header>

      <div className="mt-6 grid gap-6 md:grid-cols-[240px_1fr]">
        {/* Categories sidebar */}
        <aside aria-label="Categories">
          <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">Categories</h2>
          <ul className="mt-2 space-y-1.5">
            {categories.map(c => (
              <li key={c.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                activeCat?.id === c.id ? "border-fire/60 bg-ink-800" : "border-ink-700 bg-ink-900"}`}>
                <button onClick={() => setSelectedCatId(c.id)}
                  className={`min-h-[36px] min-w-0 flex-1 truncate text-left text-sm font-semibold ${
                    c.active ? "text-zinc-100" : "text-zinc-500 line-through"}`}>
                  {c.name}
                  {c.name === THURSDAY_ONLY_CATEGORY && <span className="ml-1.5 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-black text-white">THU</span>}
                </button>
                <button role="switch" aria-checked={c.active} aria-label={`${c.name} active`}
                  onClick={() => upsertCatMut.mutate({ ...c, active: !c.active })}
                  className={`min-h-[36px] rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    c.active ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                  {c.active ? "ON" : "OFF"}
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* Items table */}
        <section aria-label="Menu items">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-zinc-400">
              {reviewMode ? `⚠ Needs review — all categories (${flagged.length})` : `${activeCat?.name ?? "Items"} (${catItems.length})`}
            </h2>
            {flagged.length > 0 ? (
              <button onClick={() => setReviewMode(r => !r)} aria-pressed={reviewMode}
                title="Show every item still on an estimated price, across all categories"
                className={`min-h-[36px] rounded-full border px-3 py-1 text-xs font-bold ${
                  reviewMode
                    ? "border-amber-500 bg-amber-600 text-white"
                    : "border-amber-700/60 bg-amber-950/40 text-amber-400 hover:bg-amber-950/70"}`}>
                ⚠ Needs review ({flagged.length})
              </button>
            ) : (
              <span className="text-xs font-semibold text-green-400">All prices confirmed ✓</span>
            )}
          </div>
          <div className="mt-2 overflow-x-auto rounded-xl border border-ink-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
                <tr>
                  <th className="px-3 py-2.5">Item</th>
                  {reviewMode && <th className="px-3 py-2.5">Category</th>}
                  <th className="px-3 py-2.5 text-right">Price</th>
                  <th className="px-3 py-2.5">Active</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-800 bg-ink-900">
                {tableRows.map(i => (
                  <tr key={i.id} className={i.active ? "" : "opacity-60"}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-zinc-100">
                        {i.name}
                        {i.thursdayOnly && <span className="ml-1.5 rounded bg-amber-600 px-1.5 py-0.5 text-[10px] font-black text-white">THURSDAY ONLY</span>}
                      </p>
                      {i.description && <p className={`text-xs ${isEstimated(i) ? "text-amber-500" : "text-zinc-500"}`}>{i.description}</p>}
                    </td>
                    {reviewMode && <td className="px-3 py-2.5 text-xs text-zinc-400">{catNameById.get(i.categoryId) ?? "—"}</td>}
                    <td className="px-3 py-2.5 text-right">
                      <PriceCell item={i} estimated={isEstimated(i)} onSave={cents => savePrice(i, cents)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <button role="switch" aria-checked={i.active} aria-label={`${i.name} active`}
                        onClick={() => toggleItemMut.mutate(i.id)}
                        className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                          i.active ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                        {i.active ? "Active" : "Off"}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => setItemDialog({ open: true, item: i })}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {tableRows.length === 0 && (
                  <tr><td colSpan={reviewMode ? 5 : 4} className="px-3 py-8 text-center text-zinc-500">
                    {reviewMode ? "All prices confirmed ✓" : "No items in this category."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {itemDialog.open && (
        <ItemDialog item={itemDialog.item} categories={categories}
          defaultCategoryId={activeCat?.id ?? categories[0]?.id ?? ""}
          busy={upsertItemMut.isPending} error={upsertItemMut.error?.message ?? null}
          onCancel={() => setItemDialog({ open: false, item: null })}
          onSubmit={i => upsertItemMut.mutate(i)} />
      )}
    </div>
  );
}

/** Tap-to-edit price — shows formatted price (amber when estimated); tap for
 *  an autofocused dollars input. Enter/blur saves, Escape cancels. */
function PriceCell({ item, estimated, onSave }: {
  item: MenuItem; estimated: boolean; onSave: (priceCents: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal((item.priceCents / 100).toFixed(2)); setEditing(true); }}
        title={estimated ? "Estimated price — tap to confirm" : "Tap to edit price"}
        aria-label={`Edit price for ${item.name}`}
        className={`min-h-[36px] rounded-lg border px-2.5 py-1 font-mono text-sm ${
          estimated
            ? "border-amber-700/60 bg-amber-950/30 text-amber-400"
            : "border-transparent text-zinc-200 hover:border-ink-700 hover:bg-ink-800"}`}>
        {formatCents(item.priceCents)}
      </button>
    );
  }
  const commit = () => {
    const n = parseFloat(val);
    if (Number.isFinite(n) && n >= 0) {
      const cents = Math.round(n * 100);
      // Saving an unchanged price still confirms an estimated one.
      if (cents !== item.priceCents || estimated) onSave(cents);
    }
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-24 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1 text-right font-mono text-sm text-zinc-100"
      aria-label={`Price in dollars for ${item.name}`} />
  );
}

function ItemDialog({ item, categories, defaultCategoryId, onSubmit, onCancel, busy, error }: {
  item: MenuItem | null;
  categories: MenuCategory[];
  defaultCategoryId: string;
  onSubmit: (i: { id: string; categoryId: string; name: string; description: string; priceCents: number; active: boolean; thursdayOnly: boolean; sortOrder: number }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(item?.name ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [price, setPrice] = useState(item ? (item.priceCents / 100).toFixed(2) : "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId);
  const [sortOrder, setSortOrder] = useState(String(item?.sortOrder ?? 0));
  const [active, setActive] = useState(item?.active ?? true);
  const [thursdayOnly, setThursdayOnly] = useState(item?.thursdayOnly ?? false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedCat = categories.find(c => c.id === categoryId);
  const thursdayLocked = selectedCat?.name === THURSDAY_ONLY_CATEGORY;
  const effectiveThursday = thursdayLocked ? true : thursdayOnly;

  const submit = () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    const cents = dollarsToCents(price);
    if (cents === null) return setFormError("Price must be a valid non-negative dollar amount.");
    const so = Number(sortOrder);
    onSubmit({
      id: item?.id ?? "", // empty id = create (DAL treats falsy id as insert)
      categoryId, name: name.trim(), description: description.trim(), priceCents: cents,
      active, thursdayOnly: effectiveThursday, sortOrder: Number.isFinite(so) ? so : 0,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={item ? "Edit menu item" : "Add menu item"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{item ? "Edit menu item" : "Add menu item"}</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Description
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Price ($)
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="col-span-2 block text-sm font-semibold text-zinc-400">Category
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 items-end gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Sort
            <input value={sortOrder} onChange={e => setSortOrder(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
            Active
          </label>
          <label className={`flex min-h-[44px] items-center gap-2 text-sm font-semibold ${thursdayLocked ? "text-amber-400" : "text-zinc-300"}`}
            title={thursdayLocked ? "Items in the Thursday Only category are always Thursday-only" : undefined}>
            <input type="checkbox" checked={effectiveThursday} disabled={thursdayLocked}
              onChange={e => setThursdayOnly(e.target.checked)} className="h-4 w-4" />
            Thursday only{thursdayLocked && " 🔒"}
          </label>
        </div>
        {thursdayLocked && (
          <p className="mt-2 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-400">
            Everything in the "{THURSDAY_ONLY_CATEGORY}" category is Thursday-only, no exceptions. This is enforced by the data layer.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : item ? "Save changes" : "Add item"}
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
