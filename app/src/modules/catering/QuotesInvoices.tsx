import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Quote, QuoteStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents, orderTotals } from "../../lib/money";

/**
 * Catering · Quotes & Invoices — V2 counterpart of the Manus
 * CateringQuoteBuilder / SalesQuotes. Quote|Invoice tabs, status flow
 * dropdowns (quote: draft→sent→accepted/declined; invoice: invoiced→paid),
 * convert-to-invoice on accepted quotes, and a New Quote dialog with dynamic
 * line rows and a live totals preview (display only — the DAL recomputes
 * authoritative totals with 7.5% tax).
 */

const STATUS_META: Record<QuoteStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-ink-700 text-zinc-300 border-ink-700" },
  sent: { label: "Sent", cls: "bg-blue-600/20 text-blue-400 border-blue-700/50" },
  accepted: { label: "Accepted", cls: "bg-green-600/20 text-green-400 border-green-700/50" },
  declined: { label: "Declined", cls: "bg-red-600/20 text-red-400 border-red-700/50" },
  invoiced: { label: "Invoiced", cls: "bg-amber-600/20 text-amber-400 border-amber-700/50" },
  paid: { label: "Paid", cls: "bg-green-600/20 text-green-400 border-green-700/50" },
};

/** Allowed next statuses per kind — mirrors the Manus quote lifecycle. */
function nextStatuses(q: Quote): QuoteStatus[] {
  if (q.kind === "quote") {
    if (q.status === "draft") return ["sent"];
    if (q.status === "sent") return ["accepted", "declined"];
    return [];
  }
  if (q.status === "invoiced") return ["paid"];
  return [];
}

function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

type Sync = "idle" | "saving" | "saved" | "error";
type Tab = "quote" | "invoice";

export function QuotesInvoices() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("quote");
  const [sync, setSync] = useState<Sync>("idle");
  const [newOpen, setNewOpen] = useState(false);

  const { data: quotes = [], isLoading } = useQuery({
    queryKey: ["quotes", "list"],
    queryFn: () => dal.quotes.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["quotes", "list"] });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: QuoteStatus }) => withSync(dal.quotes.updateStatus(id, status, actor)),
    onSuccess: invalidate,
  });
  const convertMut = useMutation({
    mutationFn: (id: string) => withSync(dal.quotes.convertToInvoice(id, actor)),
    onSuccess: () => { invalidate(); setTab("invoice"); },
  });
  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof dal.quotes.create>[0]) => withSync(dal.quotes.create(input, actor)),
    onSuccess: (q) => { invalidate(); setNewOpen(false); setTab(q.kind); },
  });

  const rows = quotes.filter(q => q.kind === tab);
  const counts = {
    quote: quotes.filter(q => q.kind === "quote").length,
    invoice: quotes.filter(q => q.kind === "invoice").length,
  };

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Quotes & Invoices</h1>
          <p className="text-sm text-zinc-500">Totals computed by the DAL — integer cents, 7.5% tax</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setNewOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Quote</button>
        </div>
      </header>

      <div className="mt-5 flex gap-1 rounded-xl border border-ink-700 bg-ink-900 p-1">
        {([["quote", `Quotes (${counts.quote})`], ["invoice", `Invoices (${counts.invoice})`]] as Array<[Tab, string]>).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-bold ${tab === t ? "bg-fire text-white" : "text-zinc-400"}`}>
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No {tab === "quote" ? "quotes" : "invoices"} yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[42rem] text-left text-sm">
            <thead>
              <tr className="border-b border-ink-700 text-xs font-black uppercase tracking-wider text-zinc-500">
                <th className="px-3 py-2">Ref</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Event date</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(q => {
                const nexts = nextStatuses(q);
                return (
                  <tr key={q.id} className="border-b border-ink-800">
                    <td className="px-3 py-3 font-mono text-xs text-zinc-300">{q.quoteRef}</td>
                    <td className="px-3 py-3 font-semibold text-zinc-100">{q.customer}</td>
                    <td className="px-3 py-3 text-zinc-400">{fmtDate(q.eventDate)}</td>
                    <td className="px-3 py-3 text-right font-bold text-zinc-100">{formatCents(q.totalCents)}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_META[q.status].cls}`}>
                        {STATUS_META[q.status].label}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {nexts.length > 0 && (
                          <select value="" aria-label={`Change status of ${q.quoteRef}`}
                            onChange={e => { if (e.target.value) statusMut.mutate({ id: q.id, status: e.target.value as QuoteStatus }); }}
                            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-xs font-semibold text-zinc-200">
                            <option value="">Move to…</option>
                            {nexts.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                          </select>
                        )}
                        {q.kind === "quote" && q.status === "accepted" && (
                          <button onClick={() => convertMut.mutate(q.id)} disabled={convertMut.isPending}
                            className="min-h-[44px] rounded-lg bg-fire px-3 py-2 text-xs font-bold text-white disabled:opacity-50">
                            Convert to invoice
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newOpen && (
        <NewQuoteDialog busy={createMut.isPending} error={createMut.error?.message ?? null}
          onCancel={() => setNewOpen(false)}
          onSubmit={i => createMut.mutate(i)} />
      )}
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

interface LineDraft { name: string; qty: string; price: string; }

function NewQuoteDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (input: { kind: "quote" | "invoice"; leadId: string | null; customer: string; eventDate: string | null; lines: Array<{ name: string; qty: number; unitPriceCents: number }> }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const dal = getDal();
  const [kind, setKind] = useState<"quote" | "invoice">("quote");
  const [customer, setCustomer] = useState("");
  const [leadId, setLeadId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ name: "", qty: "1", price: "" }]);

  const { data: leads = [] } = useQuery({
    queryKey: ["leads", "list"],
    queryFn: () => dal.leads.list(),
  });

  const parsed = useMemo(() =>
    lines
      .map(l => ({
        name: l.name.trim(),
        qty: Math.max(0, Math.round(Number(l.qty) || 0)),
        unitPriceCents: Math.max(0, Math.round((Number(l.price) || 0) * 100)),
      }))
      .filter(l => l.name !== ""),
    [lines]);

  const totals = useMemo(() => orderTotals(parsed.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty }))), [parsed]);

  const setLine = (i: number, patch: Partial<LineDraft>) =>
    setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const pickLead = (id: string) => {
    setLeadId(id);
    const lead = leads.find(l => l.id === id);
    if (lead && !customer.trim()) setCustomer(lead.company ? `${lead.name} — ${lead.company}` : lead.name);
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New quote"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ kind, leadId: leadId || null, customer: customer.trim(), eventDate: eventDate || null, lines: parsed }); }}>
        <h3 className="text-lg font-bold text-zinc-100">New {kind}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

        <div className="mt-3 flex gap-1 rounded-xl border border-ink-700 bg-ink-800 p-1">
          {(["quote", "invoice"] as const).map(k => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-bold capitalize ${kind === k ? "bg-fire text-white" : "text-zinc-400"}`}>
              {k}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-semibold text-zinc-400">Customer *
          <input value={customer} onChange={e => setCustomer(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Link to lead
            <select value={leadId} onChange={e => pickLead(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              <option value="">— none —</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.name}{l.company ? ` (${l.company})` : ""}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Event date
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>

        <p className="mt-4 text-sm font-semibold text-zinc-400">Line items</p>
        <div className="mt-1 space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="flex items-center gap-2">
              <input value={l.name} onChange={e => setLine(i, { name: e.target.value })} placeholder="Item"
                aria-label={`Line ${i + 1} name`}
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
              <input value={l.qty} onChange={e => setLine(i, { qty: e.target.value })} inputMode="numeric" placeholder="Qty"
                aria-label={`Line ${i + 1} quantity`}
                className="w-16 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-center text-sm text-zinc-100" />
              <input value={l.price} onChange={e => setLine(i, { price: e.target.value })} inputMode="decimal" placeholder="$ each"
                aria-label={`Line ${i + 1} unit price in dollars`}
                className="w-24 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-right text-sm text-zinc-100" />
              <button type="button" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))}
                disabled={lines.length === 1} aria-label={`Remove line ${i + 1}`}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 text-zinc-400 disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setLines(ls => [...ls, { name: "", qty: "1", price: "" }])}
          className="mt-2 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">
          + Add line
        </button>

        <dl className="mt-4 space-y-1 rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-sm">
          <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd className="font-semibold text-zinc-200">{formatCents(totals.subtotalCents)}</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Tax (7.5%)</dt><dd className="font-semibold text-zinc-200">{formatCents(totals.taxCents)}</dd></div>
          <div className="flex justify-between border-t border-ink-700 pt-1"><dt className="font-bold text-zinc-300">Total</dt><dd className="font-black text-fire-light">{formatCents(totals.totalCents)}</dd></div>
        </dl>
        <p className="mt-1 text-[11px] text-zinc-600">Preview only — final totals are computed by the data layer.</p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || parsed.length === 0 || !customer.trim()}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Creating…" : `Create ${kind}`}
          </button>
        </div>
      </form>
    </div>
  );
}
