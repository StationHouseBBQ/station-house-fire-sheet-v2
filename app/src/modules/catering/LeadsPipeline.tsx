import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead, LeadPriority, LeadStage } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { formatCents } from "../../lib/money";

/**
 * Catering · Leads Pipeline — V2 counterpart of the Manus
 * CateringLeadPipeline (parity row #30). Seven-stage kanban with per-column
 * count + budget totals; lead drawer with full details, attribution block,
 * activity timeline, activity logging, and stage/priority controls.
 */

const STAGES: LeadStage[] = ["new", "contacted", "needs_quote", "quote_sent", "booked", "follow_up", "lost"];

const STAGE_META: Record<LeadStage, { label: string; accent: string }> = {
  new: { label: "New", accent: "text-blue-400" },
  contacted: { label: "Contacted", accent: "text-cyan-400" },
  needs_quote: { label: "Needs Quote", accent: "text-amber-400" },
  quote_sent: { label: "Quote Sent", accent: "text-purple-400" },
  booked: { label: "Booked 🎉", accent: "text-green-400" },
  follow_up: { label: "Follow Up", accent: "text-orange-400" },
  lost: { label: "Lost", accent: "text-zinc-500" },
};

const PRIORITIES: LeadPriority[] = ["low", "normal", "high", "urgent"];
const PRIORITY_DOT: Record<LeadPriority, string> = {
  low: "bg-zinc-500", normal: "bg-blue-400", high: "bg-amber-400", urgent: "bg-red-500",
};

const ACTIVITY_KINDS = ["call", "email", "note"] as const;

type Sync = "idle" | "saving" | "saved" | "error";

function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}
function fmtAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
    new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function LeadsPipeline() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const undo = useUndo();
  const [sync, setSync] = useState<Sync>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads", "list"],
    queryFn: () => dal.leads.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["leads", "list"] });

  const stageMut = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: LeadStage }) => withSync(dal.leads.updateStage(id, stage, actor)),
    onSuccess: invalidate,
  });
  const priorityMut = useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: LeadPriority }) => withSync(dal.leads.updatePriority(id, priority, actor)),
    onSuccess: invalidate,
  });
  const activityMut = useMutation({
    mutationFn: ({ id, kind, body }: { id: string; kind: string; body: string }) => withSync(dal.leads.logActivity(id, kind, body, actor)),
    onSuccess: invalidate,
  });
  const convertMut = useMutation({
    mutationFn: (id: string) => withSync(dal.cateringLifecycle.convertLead(id, actor)),
    onSuccess: (order, id) => {
      qc.invalidateQueries({ queryKey: ["leads", "list"] });
      qc.invalidateQueries({ queryKey: ["cateringLifecycle"] });
      setSelectedId(null);
      undo.offer(`${order.customer} started in the Cockpit — lead moved to Booked`, async () => {
        await dal.leads.updateStage(id, "quote_sent", actor);
        qc.invalidateQueries({ queryKey: ["leads", "list"] });
      });
    },
  });

  const byStage = useMemo(() => {
    const m: Record<LeadStage, Lead[]> = { new: [], contacted: [], needs_quote: [], quote_sent: [], booked: [], follow_up: [], lost: [] };
    for (const l of leads) m[l.stage].push(l);
    return m;
  }, [leads]);

  const selected = selectedId ? leads.find(l => l.id === selectedId) ?? null : null;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading pipeline…</p>;

  return (
    <div className="pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Leads Pipeline</h1>
          <p className="text-sm text-zinc-500">{leads.length} leads across {STAGES.length} stages</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <div className="mt-4 overflow-x-auto pb-4">
        <div className="flex gap-3" style={{ minWidth: "70rem" }}>
          {STAGES.map(stage => {
            const col = byStage[stage];
            const budget = col.reduce((s, l) => s + (l.budgetCents ?? 0), 0);
            return (
              <div key={stage} className="w-64 shrink-0 rounded-2xl border border-ink-700 bg-ink-950/60 p-2">
                <div className="px-2 py-1.5">
                  <p className={`text-xs font-black uppercase tracking-wider ${STAGE_META[stage].accent}`}>
                    {STAGE_META[stage].label} <span className="text-zinc-500">· {col.length}</span>
                  </p>
                  <p className="text-[11px] text-zinc-500">{budget > 0 ? formatCents(budget) : "—"}</p>
                </div>
                <ul className="mt-1 space-y-2">
                  {col.map(l => (
                    <li key={l.id}>
                      <button onClick={() => setSelectedId(l.id)}
                        className="w-full rounded-xl border border-ink-700 bg-ink-900 p-3 text-left transition-colors hover:border-fire/50">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[l.priority]}`} aria-label={`Priority ${l.priority}`} />
                          <p className="min-w-0 flex-1 truncate font-semibold text-zinc-100">{l.name}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-zinc-400">{l.eventType} · {fmtDate(l.eventDate)}</p>
                        <p className="mt-0.5 text-xs text-zinc-500">
                          {l.guests !== null ? `${l.guests} guests` : "Guests TBD"}
                          {l.budgetCents !== null ? ` · ${formatCents(l.budgetCents)}` : ""}
                        </p>
                        <span className="mt-2 flex flex-wrap gap-1">
                          <span className="inline-block rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                            {l.source}
                          </span>
                          {l.serviceType && (
                            <span className="inline-block rounded-full border border-fire/40 bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-fire-light">
                              {l.serviceType.split(" (")[0]}
                            </span>
                          )}
                          {l.menuCategory && (
                            <span className="inline-block rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                              {l.menuCategory}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                  {col.length === 0 && <li className="px-2 py-4 text-center text-xs text-zinc-600">Empty</li>}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <LeadDrawer lead={selected} busy={activityMut.isPending} converting={convertMut.isPending}
          onClose={() => setSelectedId(null)}
          onStage={stage => stageMut.mutate({ id: selected.id, stage })}
          onPriority={priority => priorityMut.mutate({ id: selected.id, priority })}
          onConvert={() => convertMut.mutate(selected.id)}
          onLog={(kind, body) => activityMut.mutate({ id: selected.id, kind, body })} />
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

function LeadDrawer({ lead, busy, converting, onClose, onStage, onPriority, onConvert, onLog }: {
  lead: Lead; busy: boolean; converting: boolean; onClose: () => void;
  onStage: (s: LeadStage) => void; onPriority: (p: LeadPriority) => void;
  onConvert: () => void; onLog: (kind: string, body: string) => void;
}) {
  const [kind, setKind] = useState<string>("call");
  const [body, setBody] = useState("");
  const timeline = [...lead.activity].sort((a, b) => b.at.localeCompare(a.at));
  const attr = lead.utm;
  const attrRows: Array<[string, string | null]> = [
    ["UTM source", attr.source], ["UTM medium", attr.medium], ["UTM campaign", attr.campaign],
    ["gclid", attr.gclid], ["fbclid", attr.fbclid], ["Referrer", attr.referrer], ["Landing page", attr.landingPage],
  ];

  return (
    <div role="dialog" aria-modal="true" aria-label={`Lead: ${lead.name}`}
      className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-ink-700 bg-ink-900 p-5"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-zinc-100">{lead.name}</h2>
            {lead.company && <p className="text-sm text-zinc-400">{lead.company}</p>}
          </div>
          <button onClick={onClose} aria-label="Close"
            className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 font-bold text-zinc-300">✕</button>
        </div>

        {/* Stage + priority controls */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Stage
            <select value={lead.stage} onChange={e => onStage(e.target.value as LeadStage)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-sm text-zinc-100">
              {STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Priority
            <select value={lead.priority} onChange={e => onPriority(e.target.value as LeadPriority)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-sm text-zinc-100">
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>

        <button onClick={onConvert} disabled={converting}
          className="mt-3 w-full rounded-lg bg-fire px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {converting ? "Starting…" : "→ Start catering order"}
        </button>
        <p className="mt-1 text-center text-[11px] text-zinc-500">Creates a lifecycle order in the Cockpit and marks this lead Booked.</p>

        {/* Details */}
        <dl className="mt-4 space-y-1.5 rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-sm">
          <Row k="Event" v={lead.eventType} />
          <Row k="Date" v={fmtDate(lead.eventDate)} />
          <Row k="Guests" v={lead.guests !== null ? String(lead.guests) : "TBD"} />
          <Row k="Budget" v={lead.budgetCents !== null ? formatCents(lead.budgetCents) : "TBD"} />
          {lead.budgetRange && <Row k="Budget range" v={lead.budgetRange} />}
          {lead.serviceType && <Row k="Service" v={lead.serviceType} />}
          {lead.menuCategory && <Row k="Menu" v={lead.menuCategory} />}
          {lead.eventAddress && <Row k="Address" v={lead.eventAddress} />}
          <Row k="Email" v={lead.email} />
          <Row k="Phone" v={lead.phone} />
          <Row k="Source" v={lead.source} />
          {lead.heardAbout && <Row k="Heard about us" v={lead.heardAbout} />}
        </dl>
        {lead.notes && <p className="mt-3 rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-sm text-zinc-300">{lead.notes}</p>}

        {/* Attribution */}
        <section className="mt-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Attribution</h3>
          <dl className="mt-2 space-y-1 rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-xs">
            {attrRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-zinc-500">{k}</dt>
                <dd className={`truncate font-mono ${v ? "text-zinc-200" : "text-zinc-600"}`}>{v ?? "—"}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Log activity */}
        <form className="mt-4 rounded-xl border border-ink-700 bg-ink-800/60 p-3"
          onSubmit={e => { e.preventDefault(); if (body.trim()) { onLog(kind, body.trim()); setBody(""); } }}>
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Log activity</h3>
          <div className="mt-2 flex gap-2">
            <select value={kind} onChange={e => setKind(e.target.value)} aria-label="Activity kind"
              className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-sm text-zinc-100">
              {ACTIVITY_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <input value={body} onChange={e => setBody(e.target.value)} placeholder="What happened?"
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
          </div>
          <button type="submit" disabled={busy || !body.trim()}
            className="mt-2 w-full rounded-lg bg-fire px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Logging…" : "Log activity"}
          </button>
        </form>

        {/* Timeline */}
        <section className="mt-4">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-500">Activity timeline</h3>
          <ul className="mt-2 space-y-2">
            {timeline.map(a => (
              <li key={a.id} className="rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-ink-700 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-300">{a.kind}</span>
                  <span className="text-[11px] text-zinc-500">{fmtAt(a.at)}</span>
                </div>
                <p className="mt-1 text-sm text-zinc-200">{a.body}</p>
                <p className="mt-0.5 text-[11px] text-zinc-600">{a.actor}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-zinc-500">{k}</dt>
      <dd className="text-right font-semibold text-zinc-200">{v}</dd>
    </div>
  );
}
