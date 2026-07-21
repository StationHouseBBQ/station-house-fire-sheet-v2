import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CateringOrder, CateringStage } from "../../dal/types";
import { formatCents } from "../../lib/money";
import { CateringDocument, documentPlainText, openPrint, isInvoiceReal, type DocumentKind } from "./CateringDocuments";

/**
 * Catering · Quotes & Invoices — a READ-focused window onto the unified
 * catering lifecycle (dal.cateringLifecycle). Every quote and invoice is a
 * facet of one catering order, so this tab lists those orders with their ref,
 * customer, event date, stage, total, and paid/balance, plus one-click Quote
 * and Invoice documents (shared with the Cockpit) and a jump into the Cockpit
 * where all editing happens.
 */

const STAGE_META: Record<CateringStage, { label: string; cls: string }> = {
  inquiry: { label: "Inquiry", cls: "bg-ink-700 text-zinc-300 border-ink-700" },
  quoting: { label: "Building quote", cls: "bg-sky-600/20 text-sky-300 border-sky-700/50" },
  quote_sent: { label: "Quote sent", cls: "bg-amber-600/20 text-amber-300 border-amber-700/50" },
  accepted: { label: "Accepted", cls: "bg-emerald-600/20 text-emerald-300 border-emerald-700/50" },
  invoiced: { label: "Invoiced", cls: "bg-indigo-600/20 text-indigo-300 border-indigo-700/50" },
  paid: { label: "Paid", cls: "bg-green-600/20 text-green-300 border-green-700/50" },
  in_kitchen: { label: "In kitchen", cls: "bg-fire/20 text-fire-light border-fire/40" },
  ready: { label: "Ready", cls: "bg-teal-600/20 text-teal-300 border-teal-700/50" },
  completed: { label: "Completed", cls: "bg-zinc-600/30 text-zinc-300 border-zinc-600/50" },
  lost: { label: "Lost", cls: "bg-red-600/20 text-red-300 border-red-700/50" },
  cancelled: { label: "Cancelled", cls: "bg-zinc-800 text-zinc-400 border-ink-700" },
};

type FilterKey = "all" | "quote_sent" | "invoiced" | "paid";
const FILTERS: Array<{ key: FilterKey; label: string; match: (o: CateringOrder) => boolean }> = [
  { key: "all", label: "All orders", match: () => true },
  { key: "quote_sent", label: "Quote sent", match: o => o.stage === "quote_sent" },
  { key: "invoiced", label: "Invoiced", match: o => o.stage === "invoiced" },
  { key: "paid", label: "Paid", match: o => o.stage === "paid" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export function QuotesInvoices() {
  const dal = getDal();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [doc, setDoc] = useState<{ order: CateringOrder; kind: DocumentKind } | null>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const active = FILTERS.find(f => f.key === filter)!;
  const rows = useMemo(() => orders.filter(active.match), [orders, active]);

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Quotes &amp; Invoices</h1>
          <p className="text-sm text-zinc-500">Every quote &amp; invoice is one catering order — read here, edit in the Cockpit.</p>
        </div>
        <a href="#/catering/cockpit" className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200">Open Cockpit →</a>
      </header>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold ${filter === f.key ? "bg-fire text-white" : "text-zinc-400"}`}>
            {f.label} <span className="opacity-70">({orders.filter(f.match).length})</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No orders in this view.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[52rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Event date</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Paid / Balance</th>
                <th className="px-3 py-2">Documents</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(o => {
                const balance = Math.max(0, o.totalCents - o.paidCents);
                return (
                  <tr key={o.id} className="border-b border-ink-800">
                    <td className="px-3 py-3 font-mono text-xs text-zinc-300">{o.ref}</td>
                    <td className="px-3 py-3 font-semibold text-zinc-100">
                      {o.customer}{o.companyName && <span className="block text-xs font-normal text-zinc-500">{o.companyName}</span>}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">{fmtDate(o.event.eventDate)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${STAGE_META[o.stage].cls}`}>{STAGE_META[o.stage].label}</span>
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-zinc-100">{formatCents(o.totalCents)}</td>
                    <td className="px-3 py-3 text-right text-zinc-300">
                      <span className="text-green-400">{formatCents(o.paidCents)}</span>
                      <span className="block text-xs text-zinc-500">bal {formatCents(balance)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setDoc({ order: o, kind: "quote" })}
                          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-200">Quote</button>
                        <button onClick={() => setDoc({ order: o, kind: "invoice" })}
                          title={isInvoiceReal(o) ? "" : "Preview (DRAFT)"}
                          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-200">
                          Invoice{!isInvoiceReal(o) && <span className="ml-1 text-[10px] uppercase text-amber-400">draft</span>}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-500">
        Totals are computed by the data layer — integer cents, 7.5% tax, plus any delivery fee. Send quotes,
        issue invoices, and record payments from the <span className="font-semibold text-zinc-300">Director Cockpit</span>.
      </p>

      {doc && <DocumentModal order={doc.order} kind={doc.kind} onClose={() => setDoc(null)} />}
    </div>
  );
}

function DocumentModal({ order, kind, onClose }: { order: CateringOrder; kind: DocumentKind; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(documentPlainText(order, kind)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard unavailable */ }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`${kind} document`}
      className="fixed inset-0 z-[9000] overflow-y-auto bg-white">
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-300 bg-white px-4 py-3">
        <p className="text-sm font-bold uppercase tracking-wider text-gray-700">{kind} · {order.ref}</p>
        <div className="flex gap-2">
          <button onClick={openPrint} className="min-h-[40px] rounded-lg bg-black px-4 text-sm font-bold text-white">🖨 Print</button>
          <button onClick={copy} className="min-h-[40px] rounded-lg border border-gray-400 px-4 text-sm font-bold text-gray-800">{copied ? "✓ Copied" : "📋 Copy for email"}</button>
          <button onClick={onClose} className="min-h-[40px] rounded-lg border border-gray-400 px-4 text-sm font-bold text-gray-800">Close</button>
        </div>
      </div>
      <CateringDocument order={order} kind={kind} />
    </div>
  );
}
