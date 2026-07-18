import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PortalOrderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

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

      <p className="mt-6 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-500">
        ℹ️ The client-facing portal (company login, ordering, order history) ships in the
        <span className="font-semibold text-zinc-300"> public-routes phase</span>. This tab controls which
        companies will have access when it goes live; approvals happen in the Approval Queue tab.
      </p>
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
