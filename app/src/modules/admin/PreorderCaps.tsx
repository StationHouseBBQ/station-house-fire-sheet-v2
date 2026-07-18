import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { FireDropProduct } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Preorder Inventory Caps — V2 counterpart of Manus
 * PreorderInventoryDashboard (parity row 60). Per-product caps on the current
 * Fire Drop with inline cap editing and 86 toggles. Caps are enforced
 * server-side at checkout; this screen only sets the numbers.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function PreorderCaps() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data: drop, isLoading } = useQuery({
    queryKey: ["fireDrop", "currentDrop"],
    queryFn: () => dal.fireDrop.currentDrop(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["fireDrop", "currentDrop"] });

  const capMut = useMutation({
    // id-preserving upsert: pass the product back with only capQty changed.
    mutationFn: ({ product, capQty }: { product: FireDropProduct; capQty: number | null }) =>
      withSync(dal.fireDrop.upsertProduct({
        id: product.id, name: product.name, priceCents: product.priceCents,
        capQty, soldOut: product.soldOut, sortOrder: product.sortOrder,
      }, actor)),
    onSuccess: invalidate,
  });
  const toggle86Mut = useMutation({
    mutationFn: (id: string) => withSync(dal.fireDrop.toggleProductSoldOut(id, actor)),
    onSuccess: invalidate,
  });

  if (isLoading || !drop) return <p className="py-20 text-center text-zinc-500">Loading caps…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Preorder Inventory Caps</h1>
          <p className="text-sm text-zinc-500">{drop.title} · Fri {drop.fridayDate} / Sat {drop.saturdayDate}</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        Caps are enforced server-side at checkout — when sold reaches the cap, the product stops selling automatically.
        Leave a cap blank for unlimited. 86 kills a product immediately regardless of cap.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Product</th>
              <th className="px-3 py-2.5 text-right">Price</th>
              <th className="px-3 py-2.5 text-right">Cap</th>
              <th className="px-3 py-2.5 text-right">Sold</th>
              <th className="px-3 py-2.5 text-right">Remaining</th>
              <th className="px-3 py-2.5">86</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {drop.products.map(p => {
              const remaining = p.capQty != null ? Math.max(0, p.capQty - p.soldQty) : null;
              return (
                <tr key={p.id} className={p.soldOut ? "opacity-60" : ""}>
                  <td className="px-3 py-2.5 font-semibold text-zinc-100">
                    {p.name} {p.soldOut && <span className="ml-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-black text-white">86'D</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-zinc-200">{formatCents(p.priceCents)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <CapEditor product={p} onCommit={capQty => capMut.mutate({ product: p, capQty })} />
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{p.soldQty}</td>
                  <td className={`px-3 py-2.5 text-right font-mono font-bold ${
                    remaining === null ? "text-zinc-600" : remaining === 0 ? "text-red-400" : remaining <= 5 ? "text-amber-400" : "text-green-400"}`}>
                    {remaining === null ? "∞" : remaining}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => toggle86Mut.mutate(p.id)} role="switch" aria-checked={p.soldOut}
                      aria-label={`86 toggle for ${p.name}`}
                      className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                        p.soldOut ? "bg-red-600 text-white" : "border border-ink-700 text-zinc-500 hover:text-red-400"}`}>
                      {p.soldOut ? "86'd" : "86?"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {drop.products.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-zinc-500">No products on the current drop.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {capMut.error && <p className="mt-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{capMut.error.message}</p>}
    </div>
  );
}

function CapEditor({ product, onCommit }: { product: FireDropProduct; onCommit: (cap: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(product.capQty != null ? String(product.capQty) : "");
  if (!editing) {
    return (
      <button onClick={() => { setVal(product.capQty != null ? String(product.capQty) : ""); setEditing(true); }}
        className="min-h-[36px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-1 font-mono text-sm font-bold text-zinc-200"
        aria-label={`Edit cap for ${product.name}`}>
        {product.capQty ?? "—"}
      </button>
    );
  }
  const commit = () => {
    const t = val.trim();
    if (t === "") { onCommit(null); setEditing(false); return; }
    const n = Number(t);
    if (Number.isInteger(n) && n >= 0) onCommit(n);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="numeric" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      placeholder="none"
      className="w-20 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1.5 text-right font-mono text-sm font-bold text-zinc-100"
      aria-label={`Cap for ${product.name}`} />
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
