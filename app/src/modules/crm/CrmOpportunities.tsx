import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead, LeadStage } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import type { CrmOppOverlay, CrmOppOverlayMap } from "./_data/types";
import { CRM_OPPS_KEY } from "./_data/keys";
import { fmtDate, leadLabel, isOpenOpportunity, STAGE_LABELS, STAGE_PROBABILITY } from "./_data/util";

/**
 * CRM · Opportunities — a deal tracker over dal.leads. Every open lead is an
 * opportunity; an editable overlay (persisted to dal.settings["crm.opportunities"])
 * lets the user set an estimated value, win probability and owner per deal.
 * Sortable / filterable, with pipeline value + weighted forecast.
 * Source: Manus CrmOpportunities.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type SortKey = "value" | "close" | "stage" | "name";

const STAGE_ACCENT: Record<LeadStage, string> = {
  new: "text-blue-400", contacted: "text-cyan-400", needs_quote: "text-amber-400",
  quote_sent: "text-purple-400", booked: "text-green-400", follow_up: "text-orange-400", lost: "text-zinc-500",
};

interface OppRow {
  lead: Lead;
  overlay: CrmOppOverlay | undefined;
  valueCents: number;
  probabilityPct: number;
  owner: string;
  weightedCents: number;
}

function buildRow(lead: Lead, overlay: CrmOppOverlay | undefined): OppRow {
  const valueCents = overlay?.estimatedValueCents ?? lead.budgetCents ?? 0;
  const probabilityPct = overlay?.probabilityPct ?? STAGE_PROBABILITY[lead.stage];
  const owner = overlay?.owner ?? "Unassigned";
  return { lead, overlay, valueCents, probabilityPct, owner, weightedCents: Math.round((valueCents * probabilityPct) / 100) };
}

export function CrmOpportunities() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [sortKey, setSortKey] = useState<SortKey>("value");
  const [stageFilter, setStageFilter] = useState<LeadStage | "open" | "all">("open");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data: leads = [], isLoading } = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });
  const { data: overlays = {} } = useQuery({
    queryKey: ["settings", CRM_OPPS_KEY],
    queryFn: () => dal.settings.get<CrmOppOverlayMap>(CRM_OPPS_KEY, {}),
  });

  const saveOverlay = useMutation({
    mutationFn: ({ leadId, overlay }: { leadId: string; overlay: CrmOppOverlay | null }) => {
      setSync("saving");
      const next: CrmOppOverlayMap = { ...overlays };
      if (overlay === null) delete next[leadId];
      else next[leadId] = overlay;
      return dal.settings.set(CRM_OPPS_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", CRM_OPPS_KEY] }),
  });

  const rows = useMemo(() => {
    const filtered = leads.filter(l => {
      if (stageFilter === "all") return true;
      if (stageFilter === "open") return isOpenOpportunity(l);
      return l.stage === stageFilter;
    });
    const built = filtered.map(l => buildRow(l, overlays[l.id]));
    built.sort((a, b) => {
      switch (sortKey) {
        case "value": return b.valueCents - a.valueCents;
        case "close": return (a.lead.eventDate ?? "9999").localeCompare(b.lead.eventDate ?? "9999");
        case "stage": return a.lead.stage.localeCompare(b.lead.stage);
        case "name": return a.lead.name.localeCompare(b.lead.name);
      }
    });
    return built;
  }, [leads, overlays, stageFilter, sortKey]);

  const totals = useMemo(() => {
    const openRows = leads.filter(isOpenOpportunity).map(l => buildRow(l, overlays[l.id]));
    return {
      count: openRows.length,
      pipelineCents: openRows.reduce((s, r) => s + r.valueCents, 0),
      weightedCents: openRows.reduce((s, r) => s + r.weightedCents, 0),
    };
  }, [leads, overlays]);

  const editing = editingId ? rows.find(r => r.lead.id === editingId) ?? null : null;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading opportunities…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Opportunities</h1>
          <p className="text-sm text-zinc-500">{totals.count} open deals</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Open pipeline" value={formatCents(totals.pipelineCents)} accent />
        <Kpi label="Weighted forecast" value={formatCents(totals.weightedCents)} />
        <Kpi label="Open opportunities" value={String(totals.count)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Stage
          <select value={stageFilter} onChange={e => setStageFilter(e.target.value as LeadStage | "open" | "all")}
            className="ml-2 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-zinc-100">
            <option value="open">Open only</option>
            <option value="all">All</option>
            {(Object.keys(STAGE_LABELS) as LeadStage[]).map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Sort
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}
            className="ml-2 rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-zinc-100">
            <option value="value">Value</option>
            <option value="close">Expected close</option>
            <option value="stage">Stage</option>
            <option value="name">Name</option>
          </select>
        </label>
      </div>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No opportunities match.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map(r => (
            <li key={r.lead.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-zinc-100">{leadLabel(r.lead)}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">
                    <span className={`font-semibold ${STAGE_ACCENT[r.lead.stage]}`}>{STAGE_LABELS[r.lead.stage]}</span>
                    {" · "}{r.lead.eventType}{" · closes "}{fmtDate(r.lead.eventDate)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Owner: {r.owner}{r.overlay ? " · estimate set" : " · using lead budget"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black text-emerald-400">{r.valueCents > 0 ? formatCents(r.valueCents) : "—"}</p>
                  <p className="text-xs text-zinc-500">{r.probabilityPct}% · {formatCents(r.weightedCents)} weighted</p>
                  <button onClick={() => setEditingId(r.lead.id)}
                    className="mt-2 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Edit estimate</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <OppDialog row={editing} busy={saveOverlay.isPending}
          onCancel={() => setEditingId(null)}
          onReset={() => { saveOverlay.mutate({ leadId: editing.lead.id, overlay: null }); setEditingId(null); }}
          onSubmit={overlay => { saveOverlay.mutate({ leadId: editing.lead.id, overlay }); setEditingId(null); }} />
      )}
    </div>
  );
}

function OppDialog({ row, busy, onCancel, onReset, onSubmit }: {
  row: OppRow; busy: boolean; onCancel: () => void; onReset: () => void;
  onSubmit: (overlay: CrmOppOverlay) => void;
}) {
  const [valueDollars, setValueDollars] = useState(String((row.valueCents / 100).toFixed(0)));
  const [probability, setProbability] = useState(String(row.probabilityPct));
  const [owner, setOwner] = useState(row.owner === "Unassigned" ? "" : row.owner);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const dollars = Number(valueDollars);
    const prob = Math.max(0, Math.min(100, Math.round(Number(probability) || 0)));
    onSubmit({
      estimatedValueCents: Number.isFinite(dollars) && dollars >= 0 ? Math.round(dollars * 100) : null,
      probabilityPct: prob,
      owner: owner.trim() || "Unassigned",
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={`Estimate for ${row.lead.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h2 className="text-xl font-black text-zinc-100">{leadLabel(row.lead)}</h2>
        <p className="mt-1 text-sm text-zinc-500">Set an estimated deal value, win probability and owner.</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Estimated value ($)
            <input type="number" min={0} value={valueDollars} onChange={e => setValueDollars(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500">Probability (%)
            <input type="number" min={0} max={100} value={probability} onChange={e => setProbability(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-xs font-semibold uppercase tracking-wider text-zinc-500">Owner
          <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Team member"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
        </label>
        <div className="mt-5 flex items-center justify-between gap-2">
          <button type="button" onClick={onReset} disabled={busy || !row.overlay}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-400 disabled:opacity-40">Reset to lead</button>
          <div className="flex gap-2">
            <button type="button" onClick={onCancel}
              className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
            <button type="submit" disabled={busy}
              className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {busy ? "Saving…" : "Save estimate"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${accent ? "border-fire/40 bg-ink-900" : "border-ink-700 bg-ink-900"}`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-fire-light" : "text-zinc-100"}`}>{value}</p>
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
