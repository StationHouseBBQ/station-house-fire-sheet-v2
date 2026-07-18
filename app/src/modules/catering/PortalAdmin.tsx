import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PortalOrderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import { PORTAL_MENU_DEFAULTS, PORTAL_MENU_KEY, type PortalMenuItem } from "../../lib/portalMenu";

/**
 * Catering · Client Portal Admin — V2 counterpart of the Manus
 * ClientPortalAdmin (admin surface only). Companies table with per-company
 * portal enable toggle plus a portal order summary by status. The
 * client-facing portal routes ship in the public-routes phase.
 */

const STATUS_LABELS: Record<PortalOrderStatus, string> = {
  pending_approval: "Pending",
  approved: "Approved",
  changes_requested: "Changes Requested",
  rejected: "Rejected",
  invoiced: "Invoiced",
  paid: "Paid",
};

type Sync = "idle" | "saving" | "saved" | "error";

export function PortalAdminView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies", "list"],
    queryFn: () => dal.companies.list(),
    refetchInterval: 30_000,
  });
  const { data: orders = [] } = useQuery({
    queryKey: ["portal", "orders", "all"],
    queryFn: () => dal.portalAdmin.orders({ status: "all" }),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const toggleMut = useMutation({
    mutationFn: (companyId: string) => withSync(dal.portalAdmin.toggleCompanyPortal(companyId, actor)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["companies", "list"] }),
  });

  // Portal menu & pricing — what companies see in the client portal.
  const { data: portalMenu = PORTAL_MENU_DEFAULTS } = useQuery({
    queryKey: ["settings", PORTAL_MENU_KEY],
    queryFn: () => dal.settings.get<PortalMenuItem[]>(PORTAL_MENU_KEY, PORTAL_MENU_DEFAULTS),
  });
  const saveMenuMut = useMutation({
    mutationFn: (items: PortalMenuItem[]) => withSync(dal.settings.set(PORTAL_MENU_KEY, items, actor)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", PORTAL_MENU_KEY] }),
  });

  const summary = useMemo(() => {
    const counts = new Map<PortalOrderStatus, number>();
    for (const o of orders) counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    return counts;
  }, [orders]);

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Client Portal Admin</h1>
          <p className="text-sm text-zinc-500">Who can order through the B2B portal</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Orders summary */}
      <section className="mt-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Portal orders — {orders.length} total</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(STATUS_LABELS) as PortalOrderStatus[]).map(s => (
            <span key={s} className="rounded-full border border-ink-700 bg-ink-900 px-3 py-1.5 text-xs font-semibold text-zinc-300">
              {STATUS_LABELS[s]}: <span className="font-black text-zinc-100">{summary.get(s) ?? 0}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Companies */}
      <section className="mt-6">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Companies</h2>
        {isLoading ? (
          <p className="py-16 text-center text-zinc-500">Loading companies…</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {companies.map(c => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
                <div className="min-w-0">
                  <p className="font-bold text-zinc-100">{c.name}</p>
                  <p className="text-sm text-zinc-500">{c.industry ?? "—"}{c.notes ? ` · ${c.notes}` : ""}</p>
                </div>
                <button onClick={() => toggleMut.mutate(c.id)} disabled={toggleMut.isPending}
                  role="switch" aria-checked={c.portalEnabled} aria-label={`Portal access for ${c.name}`}
                  className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-bold disabled:opacity-50 ${
                    c.portalEnabled
                      ? "border-green-700/60 bg-green-600/20 text-green-400"
                      : "border-ink-700 bg-ink-800 text-zinc-500"
                  }`}>
                  {c.portalEnabled ? "Portal ON" : "Portal OFF"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Portal menu & pricing */}
      <section className="mt-6" aria-label="Portal menu and pricing">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-400">Portal menu &amp; pricing</h2>
        <p className="mt-1 text-xs text-zinc-500">
          What companies can order in the client portal. Tap a name or price to edit — changes go live immediately.
        </p>
        <PortalMenuEditor items={portalMenu} busy={saveMenuMut.isPending} onSave={items => saveMenuMut.mutate(items)} />
      </section>

      <p className="mt-6 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-500">
        ℹ️ The client-facing portal (company login, ordering, order history) ships in the
        <span className="font-semibold text-zinc-300"> public-routes phase</span>. This tab controls which
        companies will have access when it goes live; approvals happen in the Approval Queue tab.
      </p>
    </div>
  );
}

function PortalMenuEditor({ items, busy, onSave }: {
  items: PortalMenuItem[]; busy: boolean; onSave: (items: PortalMenuItem[]) => void;
}) {
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const update = (id: string, patch: Partial<Omit<PortalMenuItem, "id">>) =>
    onSave(items.map(i => (i.id === id ? { ...i, ...patch } : i)));

  const add = () => {
    setAddError(null);
    if (!newName.trim()) return setAddError("Item name is required.");
    const n = parseFloat(newPrice);
    if (!Number.isFinite(n) || n < 0) return setAddError("Price must be a valid non-negative dollar amount.");
    onSave([...items, { id: crypto.randomUUID(), name: newName.trim(), priceCents: Math.round(n * 100) }]);
    setNewName(""); setNewPrice("");
  };

  return (
    <div className="mt-2 rounded-xl border border-ink-700 bg-ink-900">
      <ul className="divide-y divide-ink-800">
        {items.map(i => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <MenuNameCell item={i} onSave={name => update(i.id, { name })} />
            <div className="flex items-center gap-1.5">
              <MenuPriceCell item={i} onSave={priceCents => update(i.id, { priceCents })} />
              {confirmRemove === i.id ? (
                <>
                  <button onClick={() => { onSave(items.filter(x => x.id !== i.id)); setConfirmRemove(null); }} disabled={busy}
                    className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                  <button onClick={() => setConfirmRemove(null)}
                    className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                </>
              ) : (
                <button onClick={() => setConfirmRemove(i.id)}
                  className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-zinc-500">No portal menu items — add one below.</li>}
      </ul>
      <form className="border-t border-ink-700 p-3" onSubmit={e => { e.preventDefault(); add(); }} aria-label="Add portal menu item">
        {addError && <p className="mb-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{addError}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New item name"
            aria-label="New item name"
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
          <input value={newPrice} onChange={e => setNewPrice(e.target.value)} inputMode="decimal" placeholder="0.00"
            aria-label="New item price in dollars"
            className="min-h-[44px] w-24 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-right font-mono text-sm text-zinc-100 placeholder:text-zinc-600" />
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">+ Add item</button>
        </div>
      </form>
    </div>
  );
}

function MenuNameCell({ item, onSave }: { item: PortalMenuItem; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal(item.name); setEditing(true); }} title="Tap to edit name"
        aria-label={`Edit name for ${item.name}`}
        className="min-h-[36px] rounded-lg border border-transparent px-2 py-1 text-left text-sm font-semibold text-zinc-100 hover:border-ink-700 hover:bg-ink-800">
        {item.name}
      </button>
    );
  }
  const commit = () => {
    const v = val.trim();
    if (v && v !== item.name) onSave(v);
    setEditing(false);
  };
  return (
    <input autoFocus value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="min-w-0 flex-1 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100"
      aria-label={`Name for ${item.name}`} />
  );
}

function MenuPriceCell({ item, onSave }: { item: PortalMenuItem; onSave: (priceCents: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button onClick={() => { setVal((item.priceCents / 100).toFixed(2)); setEditing(true); }}
        title="Tap to edit price" aria-label={`Edit price for ${item.name}`}
        className="min-h-[36px] rounded-lg border border-transparent px-2.5 py-1 font-mono text-sm text-zinc-200 hover:border-ink-700 hover:bg-ink-800">
        {formatCents(item.priceCents)}
      </button>
    );
  }
  const commit = () => {
    const n = parseFloat(val);
    if (Number.isFinite(n) && n >= 0) {
      const cents = Math.round(n * 100);
      if (cents !== item.priceCents) onSave(cents);
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

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}
