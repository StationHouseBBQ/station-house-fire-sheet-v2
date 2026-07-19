import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Company } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import {
  getCompanyOverlay, setCompanyOverlay, companyStats,
  type CompanyOverlay, type CompanyOrderRow,
} from "./_data/overlay";
import { useOverlayVersion } from "./_data/useOverlayVersion";

/**
 * Catering - Companies: V2 counterpart of the Manus CompaniesTab. KPI header
 * (total / active / total orders / lifetime revenue), search + active/inactive
 * filter, a sortable-feeling table, and a detail drawer showing lifetime
 * revenue, order count, last order, CRM contact info and linked order history.
 * VIP flag, active flag, contact/title/phone/email/address and order history
 * ride a module-local overlay (noted in report) until the shared Company type
 * carries them; name/industry/notes/portal persist through the shared DAL.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type StatusFilter = "all" | "active" | "inactive";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export function CompaniesView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  useOverlayVersion();
  const [sync, setSync] = useState<Sync>("idle");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editing, setEditing] = useState<Company | "new" | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies", "list"],
    queryFn: () => dal.companies.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const upsertMut = useMutation({
    mutationFn: async ({ company, overlay }: { company: Omit<Company, "updatedAt">; overlay: CompanyOverlay }) => {
      const saved = await withSync(dal.companies.upsert(company, actor));
      setCompanyOverlay(saved.id, overlay);
      return saved;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies", "list"] }); setEditing(null); },
  });

  const kpis = useMemo(() => {
    let active = 0, totalOrders = 0, lifetime = 0;
    for (const c of companies) {
      const o = getCompanyOverlay(c.id);
      if (o.active) active++;
      const s = companyStats(o);
      totalOrders += s.orderCount;
      lifetime += s.lifetimeCents;
    }
    return { total: companies.length, active, totalOrders, lifetime };
  }, [companies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter(c => {
      const o = getCompanyOverlay(c.id);
      if (statusFilter === "active" && !o.active) return false;
      if (statusFilter === "inactive" && o.active) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) ||
        (c.industry ?? "").toLowerCase().includes(q) ||
        o.contactName.toLowerCase().includes(q);
    });
  }, [companies, search, statusFilter]);

  const detail = detailId ? companies.find(c => c.id === detailId) ?? null : null;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Companies</h1>
          <p className="text-sm text-zinc-500">{companies.length} B2B accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Company</button>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Companies" value={String(kpis.total)} />
        <Kpi label="Active" value={String(kpis.active)} />
        <Kpi label="Total orders" value={String(kpis.totalOrders)} />
        <Kpi label="Lifetime revenue" value={formatCents(kpis.lifetime)} accent />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search companies, industries, contacts..."
          className="min-w-[14rem] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-4 py-3 text-zinc-100" />
        <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
          {(["all", "active", "inactive"] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setStatusFilter(f)}
              className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold capitalize ${statusFilter === f ? "bg-fire text-white" : "text-zinc-400"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading companies...</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No companies match.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Primary contact</th>
                <th className="px-3 py-2 text-right">Orders</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2">Last order</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const o = getCompanyOverlay(c.id);
                const s = companyStats(o);
                return (
                  <tr key={c.id} className="border-b border-ink-800 hover:bg-ink-900/60">
                    <td className="px-3 py-3">
                      <p className="font-bold text-zinc-100">
                        {o.vip && <span title="VIP" className="mr-1 text-amber-400">★</span>}
                        {c.name}
                        {!o.active && <span className="ml-2 rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-500">Inactive</span>}
                      </p>
                      <p className="text-xs text-zinc-500">{c.industry ?? "Industry —"}{c.portalEnabled ? " · Portal" : ""}</p>
                    </td>
                    <td className="px-3 py-3 text-zinc-300">{o.contactName || "—"}</td>
                    <td className="px-3 py-3 text-right font-semibold text-sky-300">{s.orderCount}</td>
                    <td className="px-3 py-3 text-right font-semibold text-green-400">{formatCents(s.lifetimeCents)}</td>
                    <td className="px-3 py-3 text-zinc-400">{fmtDate(s.lastOrder)}</td>
                    <td className="px-3 py-3 text-right">
                      <button onClick={() => setDetailId(c.id)}
                        className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-200">View</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <CompanyDrawer company={detail}
          onClose={() => setDetailId(null)}
          onEdit={() => { setEditing(detail); setDetailId(null); }} />
      )}

      {editing && (
        <CompanyDialog company={editing === "new" ? null : editing}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setEditing(null)}
          onSubmit={(company, overlay) => upsertMut.mutate({ company, overlay })} />
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-black ${accent ? "text-green-400" : "text-zinc-100"}`}>{value}</p>
    </div>
  );
}

function CompanyDrawer({ company: c, onClose, onEdit }: { company: Company; onClose: () => void; onEdit: () => void }) {
  const o = getCompanyOverlay(c.id);
  const s = companyStats(o);
  return (
    <div role="dialog" aria-modal="true" aria-label="Company detail"
      className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="h-full w-full max-w-lg overflow-y-auto border-l border-ink-700 bg-ink-950 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-zinc-100">
              {o.vip && <span className="mr-1 text-amber-400">★</span>}{c.name}
              {!o.active && <span className="ml-2 rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-500">Inactive</span>}
            </h3>
            <p className="text-sm text-zinc-500">{c.industry ?? "Industry —"}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={onEdit} className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-bold text-zinc-200">Edit</button>
            <button onClick={onClose} aria-label="Close" className="min-h-[40px] min-w-[40px] rounded-lg border border-ink-700 bg-ink-800 font-bold text-zinc-300">✕</button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <Kpi label="Lifetime rev" value={formatCents(s.lifetimeCents)} accent />
          <Kpi label="Orders" value={String(s.orderCount)} />
          <Kpi label="Last order" value={s.lastOrder ? fmtDate(s.lastOrder) : "—"} />
        </div>

        <section className="mt-5 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">Contact</h4>
          <p className="mt-2 font-semibold text-zinc-100">{o.contactName || "—"}{o.contactTitle && <span className="font-normal text-zinc-400"> · {o.contactTitle}</span>}</p>
          {o.phone && <a href={`tel:${o.phone}`} className="mt-1 block text-sm text-sky-300">{o.phone}</a>}
          {o.email && <a href={`mailto:${o.email}`} className="mt-0.5 block text-sm text-sky-300">{o.email}</a>}
          {o.address && <p className="mt-1 text-sm text-zinc-400">{o.address}</p>}
          {c.notes && <p className="mt-2 border-l-2 border-fire/60 pl-3 text-sm italic text-zinc-400">{c.notes}</p>}
        </section>

        <section className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500">Order history</h4>
          {o.orders.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">No orders recorded yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {[...o.orders].sort((a, b) => b.date.localeCompare(a.date)).map(row => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-zinc-200">{row.eventName} <span className="font-mono text-xs text-zinc-500">{row.ref}</span></p>
                    <p className="text-xs text-zinc-500">{fmtDate(row.date)}{row.guests !== null ? ` · ${row.guests} guests` : ""}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-green-400">{formatCents(row.depositCents)}</p>
                    <span className={`text-[10px] font-black uppercase ${row.status === "completed" ? "text-green-400" : row.status === "cancelled" ? "text-red-400" : "text-amber-400"}`}>{row.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving...", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed - retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

function CompanyDialog({ company, onSubmit, onCancel, busy, error }: {
  company: Company | null;
  onSubmit: (c: Omit<Company, "updatedAt">, o: CompanyOverlay) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const initial = company ? getCompanyOverlay(company.id) : getCompanyOverlay("__new__");
  const [name, setName] = useState(company?.name ?? "");
  const [industry, setIndustry] = useState(company?.industry ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [portalEnabled, setPortalEnabled] = useState(company?.portalEnabled ?? false);
  const [vip, setVip] = useState(initial.vip);
  const [active, setActive] = useState(initial.active);
  const [contactName, setContactName] = useState(initial.contactName);
  const [contactTitle, setContactTitle] = useState(initial.contactTitle);
  const [phone, setPhone] = useState(initial.phone);
  const [email, setEmail] = useState(initial.email);
  const [address, setAddress] = useState(initial.address);
  const orders: CompanyOrderRow[] = initial.orders;

  return (
    <div role="dialog" aria-modal="true" aria-label={company ? "Edit company" : "New company"}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <form className="my-8 w-full max-w-lg rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit(
            {
              id: company?.id ?? "",
              name: name.trim(),
              industry: industry.trim() || null,
              notes: notes.trim() || null,
              portalEnabled,
              contactIds: company?.contactIds ?? [],
            },
            { vip, active, contactName: contactName.trim(), contactTitle: contactTitle.trim(), phone: phone.trim(), email: email.trim(), address: address.trim(), orders },
          );
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{company ? "Edit company" : "New company"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Company name *
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Contact name
            <input value={contactName} onChange={e => setContactName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Title
            <input value={contactTitle} onChange={e => setContactTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Phone
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Industry
            <input value={industry} onChange={e => setIndustry(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Address
            <input value={address} onChange={e => setAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <ToggleChip on={vip} onToggle={() => setVip(x => !x)} label="⭐ VIP" onCls="border-amber-700/60 bg-amber-600/15 text-amber-300" />
          <ToggleChip on={active} onToggle={() => setActive(x => !x)} label="Active" onCls="border-green-700/60 bg-green-600/15 text-green-300" />
          <ToggleChip on={portalEnabled} onToggle={() => setPortalEnabled(x => !x)} label="Portal enabled" onCls="border-sky-700/60 bg-sky-600/15 text-sky-300" />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving..." : company ? "Save changes" : "Create company"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ToggleChip({ on, onToggle, label, onCls }: { on: boolean; onToggle: () => void; label: string; onCls: string }) {
  return (
    <button type="button" onClick={onToggle}
      className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-bold ${on ? onCls : "border-ink-700 bg-ink-800 text-zinc-500"}`}>
      {label}{on ? " ✓" : ""}
    </button>
  );
}
