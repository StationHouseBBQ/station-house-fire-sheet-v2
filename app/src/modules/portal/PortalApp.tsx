import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Company, PortalOrder, PortalOrderStatus } from "../../dal/types";
import { formatCents, orderTotals } from "../../lib/money";
import { PORTAL_MENU_DEFAULTS, PORTAL_MENU_KEY, type PortalMenuItem } from "../../lib/portalMenu";
import { PublicLayout, DemoPaymentNotice } from "../public/PublicLayout";

/**
 * Client portal — lightweight company-facing ordering. "Sign in" is a company
 * pick + requester name (no credentials in the demo phase); requests land in
 * pending_approval for the catering team to review in Portal Admin.
 */

// Menu + pricing come from settings ("portalMenu"), editable in Portal Admin;
// the shared defaults keep the original six items until the owner edits them.

const STATUS_META: Record<PortalOrderStatus, { label: string; cls: string }> = {
  pending_approval: { label: "Pending approval", cls: "bg-amber-600 text-white" },
  approved: { label: "Approved", cls: "bg-green-600 text-white" },
  rejected: { label: "Rejected", cls: "bg-red-600 text-white" },
  changes_requested: { label: "Changes requested", cls: "bg-blue-600 text-white" },
  invoiced: { label: "Invoiced", cls: "bg-purple-600 text-white" },
  paid: { label: "Paid", cls: "bg-green-600 text-white" },
};

interface Session { company: Company; requesterName: string }

export function PortalApp() {
  const [session, setSession] = useState<Session | null>(null);

  return (
    <PublicLayout>
      {session ? (
        <Dashboard session={session} signOut={() => setSession(null)} />
      ) : (
        <SignIn onSignIn={setSession} />
      )}
    </PublicLayout>
  );
}

function SignIn({ onSignIn }: { onSignIn: (s: Session) => void }) {
  const dal = getDal();
  const { data: companies, isLoading } = useQuery({
    queryKey: ["portal", "companies"],
    queryFn: () => dal.portal.companies(),
  });
  const [companyId, setCompanyId] = useState("");
  const [requesterName, setRequesterName] = useState("");

  const company = (companies ?? []).find(c => c.id === companyId) ?? null;
  const ready = !!company && requesterName.trim().length > 0;

  return (
    <section className="mx-auto max-w-md pt-16">
      <h1 className="text-center text-3xl font-black uppercase text-zinc-100">Client Portal</h1>
      <p className="mt-2 text-center text-sm text-zinc-400">
        Place catering requests and track approvals for your company account.
      </p>
      <div className="mt-8 rounded-2xl border border-ink-700 bg-ink-900 p-6">
        {isLoading ? (
          <p className="py-8 text-center text-sm text-zinc-500">Loading companies…</p>
        ) : (companies ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-zinc-500">
            No portal accounts are enabled yet. Ask your Station House contact to switch yours on.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (company && ready) onSignIn({ company, requesterName: requesterName.trim() }); }}>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Company
              <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100">
                <option value="">Select your company…</option>
                {(companies ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
              Your name
              <input value={requesterName} onChange={e => setRequesterName(e.target.value)} placeholder="Sam Ortiz"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
            </label>
            <button type="submit" disabled={!ready}
              className="min-h-[48px] w-full rounded-xl bg-gradient-to-r from-fire to-fire-light text-sm font-black uppercase tracking-wider text-white disabled:opacity-50">
              Enter portal
            </button>
          </form>
        )}
      </div>
    </section>
  );
}

function Dashboard({ session, signOut }: { session: Session; signOut: () => void }) {
  const [tab, setTab] = useState<"new" | "orders">("new");
  return (
    <section className="mx-auto max-w-3xl pt-8">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{session.company.name}</h1>
          <p className="text-sm text-zinc-500">Signed in as {session.requesterName}</p>
        </div>
        <button onClick={signOut}
          className="min-h-[44px] rounded-lg border border-ink-700 px-4 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:bg-ink-800">
          Sign out
        </button>
      </header>

      <div className="mt-5 flex gap-2" role="tablist" aria-label="Portal sections">
        {([["new", "New Request"], ["orders", "My Orders"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`min-h-[44px] rounded-lg px-4 text-sm font-black uppercase tracking-wider ${
              tab === id ? "bg-fire text-white" : "border border-ink-700 text-zinc-400 hover:bg-ink-800"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "new" ? <NewRequest session={session} onSubmitted={() => setTab("orders")} /> : <MyOrders companyId={session.company.id} />}
    </section>
  );
}

function NewRequest({ session, onSubmitted }: { session: Session; onSubmitted: () => void }) {
  const dal = getDal();
  const qc = useQueryClient();
  const [eventDate, setEventDate] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PortalOrder | null>(null);

  // Current portal menu & pricing — owner-editable in Portal Admin.
  const { data: menu = PORTAL_MENU_DEFAULTS } = useQuery({
    queryKey: ["settings", PORTAL_MENU_KEY],
    queryFn: () => dal.settings.get<PortalMenuItem[]>(PORTAL_MENU_KEY, PORTAL_MENU_DEFAULTS),
    refetchInterval: 30_000,
  });

  const lines = menu.filter(m => (qty[m.id] ?? 0) > 0)
    .map(m => ({ name: m.name, qty: qty[m.id] ?? 0, unitPriceCents: m.priceCents }));
  const totals = orderTotals(lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty })));

  const submitMut = useMutation({
    mutationFn: () => dal.portal.createRequest(session.company.id, eventDate, lines, session.requesterName),
    onSuccess: o => {
      setPlaced(o); setQty({}); setEventDate("");
      qc.invalidateQueries({ queryKey: ["portal", "orders", session.company.id] });
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Could not submit the request."),
  });

  if (placed) {
    return (
      <div className="mt-6 rounded-2xl border border-green-700/50 bg-green-950/30 p-8 text-center">
        <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-600 text-2xl font-black text-white">✓</span>
        <h2 className="mt-3 text-xl font-black uppercase text-zinc-100">Request submitted</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Ref <span className="font-black text-green-400">{placed.ref}</span> · {formatCents(placed.totalCents)} · pending approval from the Station House team.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <button onClick={onSubmitted}
            className="min-h-[44px] rounded-lg bg-fire px-4 text-xs font-black uppercase tracking-wider text-white">View my orders</button>
          <button onClick={() => setPlaced(null)}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 text-xs font-bold uppercase tracking-wider text-zinc-400">New request</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6">
      <label className="block max-w-xs text-xs font-bold uppercase tracking-wider text-zinc-400">
        Event date
        <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
          className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100" />
      </label>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {menu.map(m => {
          const n = qty[m.id] ?? 0;
          return (
            <article key={m.id} className="flex items-center justify-between rounded-2xl border border-ink-700 bg-ink-900 p-4">
              <div>
                <h3 className="text-sm font-black uppercase text-zinc-100">{m.name}</h3>
                <p className="text-xs text-zinc-500">{formatCents(m.priceCents)} each</p>
              </div>
              <div className="flex items-center gap-2">
                <button aria-label={`Remove one ${m.name}`} onClick={() => setQty(q => ({ ...q, [m.id]: Math.max(0, n - 1) }))} disabled={n === 0}
                  className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-black text-zinc-200 disabled:opacity-40">−</button>
                <span className="w-7 text-center text-lg font-black tabular-nums text-zinc-100">{n}</span>
                <button aria-label={`Add one ${m.name}`} onClick={() => setQty(q => ({ ...q, [m.id]: n + 1 }))}
                  className="h-11 w-11 rounded-lg bg-fire text-lg font-black text-white">+</button>
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-ink-700 bg-ink-900 p-5">
        {lines.length === 0 ? (
          <p className="text-sm text-zinc-500">Add items above to build your request.</p>
        ) : (
          <div className="space-y-0.5 text-sm">
            {lines.map(l => (
              <p key={l.name} className="flex justify-between text-zinc-300">
                <span>{l.qty}× {l.name}</span><span className="tabular-nums">{formatCents(l.unitPriceCents * l.qty)}</span>
              </p>
            ))}
            <p className="flex justify-between border-t border-ink-700 pt-2 text-zinc-400"><span>Subtotal</span><span className="tabular-nums">{formatCents(totals.subtotalCents)}</span></p>
            <p className="flex justify-between text-zinc-400"><span>Tax (7.5%)</span><span className="tabular-nums">{formatCents(totals.taxCents)}</span></p>
            <p className="flex justify-between text-base font-black text-zinc-100"><span>Total</span><span className="tabular-nums">{formatCents(totals.totalCents)}</span></p>
            <p className="text-[11px] text-zinc-600">Display estimate — final totals are confirmed on approval.</p>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-400">{error}</p>
        )}

        <div className="mt-3 space-y-2">
          <DemoPaymentNotice />
          <button onClick={() => { setError(null); submitMut.mutate(); }} disabled={submitMut.isPending || lines.length === 0}
            className="min-h-[48px] w-full rounded-xl bg-gradient-to-r from-fire to-fire-light text-sm font-black uppercase tracking-wider text-white disabled:opacity-50">
            {submitMut.isPending ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MyOrders({ companyId }: { companyId: string }) {
  const dal = getDal();
  const { data: orders, isLoading } = useQuery({
    queryKey: ["portal", "orders", companyId],
    queryFn: () => dal.portal.ordersForCompany(companyId),
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="mt-10 text-center text-sm text-zinc-500">Loading your orders…</p>;
  const rows = orders ?? [];
  if (rows.length === 0) return <p className="mt-10 text-center text-sm text-zinc-500">No requests yet — your submitted orders will show up here.</p>;

  return (
    <div className="mt-6 overflow-x-auto rounded-2xl border border-ink-700">
      <table className="w-full text-left text-sm">
        <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
          <tr>
            <th className="px-3 py-2.5">Ref</th>
            <th className="px-3 py-2.5">Event date</th>
            <th className="px-3 py-2.5 text-right">Total</th>
            <th className="px-3 py-2.5">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-800 bg-ink-900">
          {rows.map(o => {
            const meta = STATUS_META[o.status];
            return (
              <tr key={o.id}>
                <td className="px-3 py-3 font-black text-zinc-100">{o.ref}</td>
                <td className="px-3 py-3 text-zinc-300">{o.eventDate}</td>
                <td className="px-3 py-3 text-right tabular-nums text-zinc-300">{formatCents(o.totalCents)}</td>
                <td className="px-3 py-3">
                  <span className={`rounded px-2 py-1 text-[10px] font-black uppercase ${meta.cls}`}>{meta.label}</span>
                  {o.adminNote && <p className="mt-1 max-w-xs text-xs text-zinc-500">"{o.adminNote}"</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
