import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CateringOrder } from "../../dal/types";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import { balanceCents, fmtDate, isInvoiced } from "./_data/util";

/**
 * Finance · Invoices — every catering order that has been invoiced (invoicedAt
 * set, or stage at/after "invoiced"). Shows ref, customer, event date, total,
 * paid, balance and a payment status. Filters: all / unpaid / paid / overdue.
 * Read here, edit in the Catering Cockpit. Source: Manus FinanceInvoices.tsx.
 */

type InvStatus = "paid" | "partial" | "unpaid" | "overdue";

function statusOf(o: CateringOrder, now: Date): InvStatus {
  const bal = balanceCents(o);
  if (bal === 0) return "paid";
  const overdue = o.event.eventDate !== null &&
    new Date(o.event.eventDate + "T12:00:00Z").getTime() < now.getTime();
  if (overdue) return "overdue";
  return o.paidCents > 0 ? "partial" : "unpaid";
}

const STATUS_META: Record<InvStatus, { label: string; cls: string }> = {
  paid: { label: "Paid", cls: "bg-green-600/20 text-green-300 border-green-700/50" },
  partial: { label: "Partial", cls: "bg-sky-600/20 text-sky-300 border-sky-700/50" },
  unpaid: { label: "Unpaid", cls: "bg-amber-600/20 text-amber-300 border-amber-700/50" },
  overdue: { label: "Overdue", cls: "bg-red-600/20 text-red-300 border-red-700/50" },
};

type FilterKey = "all" | "unpaid" | "paid" | "overdue";
const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "unpaid", label: "Unpaid" },
  { key: "paid", label: "Paid" },
  { key: "overdue", label: "Overdue" },
];

export function FinanceInvoices() {
  const dal = getDal();
  const [filter, setFilter] = useState<FilterKey>("all");
  const now = currentTime();

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const invoices = useMemo(
    () => orders.filter(isInvoiced).map(o => ({ order: o, status: statusOf(o, now) })),
    [orders, now],
  );

  const counts = useMemo(() => {
    const c = { all: invoices.length, unpaid: 0, paid: 0, overdue: 0 };
    for (const i of invoices) {
      if (i.status === "paid") c.paid += 1;
      else c.unpaid += 1;
      if (i.status === "overdue") c.overdue += 1;
    }
    return c;
  }, [invoices]);

  const rows = useMemo(() => invoices.filter(i => {
    if (filter === "all") return true;
    if (filter === "paid") return i.status === "paid";
    if (filter === "overdue") return i.status === "overdue";
    return i.status !== "paid"; // unpaid = anything with a balance
  }), [invoices, filter]);

  const totals = useMemo(() => rows.reduce((acc, i) => ({
    total: acc.total + i.order.totalCents,
    paid: acc.paid + i.order.paidCents,
    balance: acc.balance + balanceCents(i.order),
  }), { total: 0, paid: 0, balance: 0 }), [rows]);

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Invoices</h1>
          <p className="text-sm text-zinc-500">Issued invoices across the catering lifecycle — read here, edit in the Cockpit.</p>
        </div>
        <a href="#/catering/cockpit" className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200">Open Cockpit →</a>
      </header>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold ${filter === f.key ? "bg-fire text-white" : "text-zinc-400"}`}>
            {f.label} <span className="opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No invoices in this view.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                  <th className="px-3 py-2">Ref</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Event date</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ order: o, status }) => (
                  <tr key={o.id} className="border-b border-ink-800">
                    <td className="px-3 py-3 font-mono text-xs text-zinc-300">{o.ref}</td>
                    <td className="px-3 py-3 font-semibold text-zinc-100">
                      {o.customer}{o.companyName && <span className="block text-xs font-normal text-zinc-500">{o.companyName}</span>}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">{fmtDate(o.event.eventDate)}</td>
                    <td className="px-3 py-3 text-right font-bold text-zinc-100">{formatCents(o.totalCents)}</td>
                    <td className="px-3 py-3 text-right text-green-400">{formatCents(o.paidCents)}</td>
                    <td className="px-3 py-3 text-right text-zinc-300">{formatCents(balanceCents(o))}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_META[status].cls}`}>{STATUS_META[status].label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-ink-700 text-sm font-black text-zinc-200">
                  <td className="px-3 py-3" colSpan={3}>Totals ({rows.length})</td>
                  <td className="px-3 py-3 text-right">{formatCents(totals.total)}</td>
                  <td className="px-3 py-3 text-right text-green-400">{formatCents(totals.paid)}</td>
                  <td className="px-3 py-3 text-right text-amber-300">{formatCents(totals.balance)}</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
