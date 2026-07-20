import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CateringStage } from "../../dal/types";
import { formatCents } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import { fmtDate, isOpenQuote } from "./_data/util";

/**
 * Finance · Quotes — outstanding quotes (stage quoting / quote_sent / accepted)
 * with value, age in days, and conversion status. Summary shows pipeline value
 * and a win rate computed from historical outcomes (accepted+/lost). The Manus
 * source (pages/FinanceQuotes.tsx, 1523 lines) is an editor; here we extract the
 * finance-facing list + summary. Editing lives in the Catering Cockpit.
 */

const STAGE_META: Record<Extract<CateringStage, "quoting" | "quote_sent" | "accepted">, { label: string; cls: string }> = {
  quoting: { label: "Building", cls: "bg-sky-600/20 text-sky-300 border-sky-700/50" },
  quote_sent: { label: "Sent", cls: "bg-amber-600/20 text-amber-300 border-amber-700/50" },
  accepted: { label: "Accepted", cls: "bg-emerald-600/20 text-emerald-300 border-emerald-700/50" },
};

function ageDays(iso: string, now: Date): number {
  const then = new Date(iso).getTime();
  return Math.max(0, Math.floor((now.getTime() - then) / (24 * 60 * 60 * 1000)));
}

export function FinanceQuotes() {
  const dal = getDal();
  const now = currentTime();
  const [sort, setSort] = useState<"value" | "age">("value");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const openQuotes = useMemo(() => {
    const rows = orders.filter(isOpenQuote).map(o => ({
      order: o,
      age: ageDays(o.quoteSentAt ?? o.createdAt, now),
    }));
    rows.sort((a, b) => sort === "value" ? b.order.totalCents - a.order.totalCents : b.age - a.age);
    return rows;
  }, [orders, now, sort]);

  const summary = useMemo(() => {
    const pipelineCents = openQuotes.reduce((s, r) => s + r.order.totalCents, 0);
    // Win rate over decided quotes: won = ever reached accepted/invoiced/paid/...
    const wonStages: CateringStage[] = ["accepted", "invoiced", "paid", "in_kitchen", "ready", "completed"];
    const won = orders.filter(o => wonStages.includes(o.stage)).length;
    const lost = orders.filter(o => o.stage === "lost").length;
    const decided = won + lost;
    const winRatePct = decided > 0 ? Math.round((won / decided) * 100) : 0;
    return { pipelineCents, count: openQuotes.length, won, lost, winRatePct };
  }, [openQuotes, orders]);

  return (
    <div className="mx-auto max-w-6xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Quotes</h1>
          <p className="text-sm text-zinc-500">Outstanding quotes &amp; conversion — edit in the Cockpit.</p>
        </div>
        <a href="#/catering/cockpit" className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200">Open Cockpit →</a>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-fire/40 bg-fire/10 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Pipeline value</div>
          <div className="mt-1 text-2xl font-black text-fire-light">{formatCents(summary.pipelineCents)}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Open quotes</div>
          <div className="mt-1 text-2xl font-black text-zinc-100">{summary.count}</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Win rate</div>
          <div className="mt-1 text-2xl font-black text-emerald-400">{summary.winRatePct}%</div>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <div className="text-xs font-black uppercase tracking-wider text-zinc-500">Won / Lost</div>
          <div className="mt-1 text-2xl font-black text-zinc-100">{summary.won} / {summary.lost}</div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        <button onClick={() => setSort("value")}
          className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold ${sort === "value" ? "bg-fire text-white" : "text-zinc-400"}`}>By value</button>
        <button onClick={() => setSort("age")}
          className={`min-h-[44px] rounded-lg px-3 py-2 text-sm font-bold ${sort === "age" ? "bg-fire text-white" : "text-zinc-400"}`}>By age</button>
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading…</p>
      ) : openQuotes.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No outstanding quotes.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Event date</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Age</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {openQuotes.map(({ order: o, age }) => {
                const meta = STAGE_META[o.stage as "quoting" | "quote_sent" | "accepted"];
                return (
                  <tr key={o.id} className="border-b border-ink-800">
                    <td className="px-3 py-3 font-mono text-xs text-zinc-300">{o.ref}</td>
                    <td className="px-3 py-3 font-semibold text-zinc-100">
                      {o.customer}{o.companyName && <span className="block text-xs font-normal text-zinc-500">{o.companyName}</span>}
                    </td>
                    <td className="px-3 py-3 text-zinc-400">{fmtDate(o.event.eventDate)}</td>
                    <td className="px-3 py-3 text-right font-bold text-zinc-100">{formatCents(o.totalCents)}</td>
                    <td className={`px-3 py-3 text-right ${age >= 14 ? "text-red-400 font-bold" : "text-zinc-400"}`}>{age}d</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${meta.cls}`}>{meta.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
