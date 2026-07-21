import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CateringOrder } from "../../dal/types";
import { formatCents } from "../../lib/money";
import { balanceCents, fmtDate, isInvoiced } from "./_data/util";

/**
 * Finance · Customers — customer financials rolled up from catering orders and
 * cross-referenced with the contacts/companies books. Each row: lifetime
 * revenue (paid), number of events, last event date, and outstanding balance.
 * Source: Manus pages/FinanceCustomers.tsx.
 */

interface CustomerRow {
  key: string;
  name: string;
  company: string | null;
  events: number;
  lifetimeCents: number;
  outstandingCents: number;
  lastEvent: string | null;
  known: boolean; // present in the contacts/companies book
}

function customerKey(o: CateringOrder): string {
  return (o.companyName ?? o.customer).trim().toLowerCase();
}

export function FinanceCustomers() {
  const dal = getDal();
  const [q, setQ] = useState("");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });
  const { data: contacts = [] } = useQuery({ queryKey: ["contacts", "list"], queryFn: () => dal.contacts.list() });
  const { data: companies = [] } = useQuery({ queryKey: ["companies", "list"], queryFn: () => dal.companies.list() });

  const rows = useMemo<CustomerRow[]>(() => {
    const known = new Set<string>();
    for (const c of contacts) known.add(c.name.trim().toLowerCase());
    for (const c of companies) known.add(c.name.trim().toLowerCase());

    const map = new Map<string, CustomerRow>();
    for (const o of orders) {
      const key = customerKey(o);
      const cur = map.get(key) ?? {
        key, name: o.customer, company: o.companyName,
        events: 0, lifetimeCents: 0, outstandingCents: 0, lastEvent: null,
        known: known.has(key),
      };
      if (o.stage !== "lost" && o.stage !== "cancelled") cur.events += 1;
      cur.lifetimeCents += o.paidCents;
      if (isInvoiced(o)) cur.outstandingCents += balanceCents(o);
      const ev = o.event.eventDate;
      if (ev && (cur.lastEvent === null || ev > cur.lastEvent)) cur.lastEvent = ev;
      map.set(key, cur);
    }

    const term = q.trim().toLowerCase();
    return Array.from(map.values())
      .filter(r => term === "" || r.name.toLowerCase().includes(term) || (r.company ?? "").toLowerCase().includes(term))
      .sort((a, b) => b.lifetimeCents - a.lifetimeCents);
  }, [orders, contacts, companies, q]);

  const totals = useMemo(() => rows.reduce((acc, r) => ({
    lifetime: acc.lifetime + r.lifetimeCents,
    outstanding: acc.outstanding + r.outstandingCents,
  }), { lifetime: 0, outstanding: 0 }), [rows]);

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Customers</h1>
        <p className="text-sm text-zinc-500">Lifetime revenue, events, and balances by customer.</p>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-fire/40 bg-fire/10 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Customers</div>
          <div className="mt-1 text-2xl font-black text-fire-light">{rows.length}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Lifetime revenue</div>
          <div className="mt-1 text-2xl font-black text-green-400">{formatCents(totals.lifetime)}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Outstanding</div>
          <div className="mt-1 text-2xl font-black text-amber-300">{formatCents(totals.outstanding)}</div>
        </div>
      </div>

      <div className="mt-5">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search customers…"
          className="min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-900 px-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-fire focus:outline-none" />
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No customers found.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2 text-right">Events</th>
                <th className="px-3 py-2">Last event</th>
                <th className="px-3 py-2 text-right">Lifetime</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-ink-800">
                  <td className="px-3 py-3 font-semibold text-zinc-100">
                    {r.company ?? r.name}
                    {!r.known && <span className="ml-2 rounded bg-ink-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">unlisted</span>}
                    {r.company && r.company !== r.name && <span className="block text-xs font-normal text-zinc-500">{r.name}</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-zinc-300">{r.events}</td>
                  <td className="px-3 py-3 text-zinc-400">{fmtDate(r.lastEvent)}</td>
                  <td className="px-3 py-3 text-right font-bold text-green-400">{formatCents(r.lifetimeCents)}</td>
                  <td className={`px-3 py-3 text-right ${r.outstandingCents > 0 ? "text-amber-300 font-bold" : "text-zinc-500"}`}>{formatCents(r.outstandingCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
