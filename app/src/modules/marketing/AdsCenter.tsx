import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { AdCampaign, CreativeBrief } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Ads Center — a real campaign manager.
 * Live campaign table with spend / leads / cost-per-lead, inline active↔paused
 * status (ended campaigns are immutable) and a totals row. Below sits the
 * ad-brief queue: "New campaign" upserts an "ads" brief into a queued/in
 * review/approved/done board. Live ad-account sync is a connector phase; the
 * planning + brief workflow is fully real today.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type BriefStatus = CreativeBrief["status"];

const CAMPAIGN_STATUS_CLS: Record<AdCampaign["status"], string> = {
  active: "bg-green-600 text-white",
  paused: "bg-amber-600 text-white",
  ended: "bg-ink-700 text-zinc-400",
};

const BRIEF_STATUSES: BriefStatus[] = ["queued", "in_review", "approved", "done"];
const BRIEF_META: Record<BriefStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  in_review: { label: "In review", cls: "bg-amber-600 text-white" },
  approved: { label: "Approved", cls: "bg-blue-600 text-white" },
  done: { label: "Done", cls: "bg-green-600 text-white" },
};

export function AdsCenterView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [addOpen, setAddOpen] = useState(false);

  const campaignsQ = useQuery({ queryKey: ["marketing", "adCampaigns"], queryFn: () => dal.marketing.adCampaigns() });
  const briefsQ = useQuery({ queryKey: ["marketing", "briefs", "ads"], queryFn: () => dal.marketing.briefs("ads") });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdCampaign["status"] }) =>
      withSync(dal.marketing.updateCampaignStatus(id, status, actor)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing", "adCampaigns"] }),
  });
  const briefMut = useMutation({
    mutationFn: (b: { id: string; title: string; brief: string; status: BriefStatus }) =>
      withSync(dal.marketing.upsertBrief({ ...b, kind: "ads" }, actor)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing", "briefs", "ads"] });
      setAddOpen(false);
    },
  });

  if (campaignsQ.isLoading || briefsQ.isLoading) {
    return <p className="py-20 text-center text-zinc-500">Loading ads center&hellip;</p>;
  }

  const campaigns = campaignsQ.data ?? [];
  const briefs = briefsQ.data ?? [];
  const totalSpend = campaigns.reduce((s, c) => s + c.spendCents, 0);
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Ads Center</h1>
          <p className="text-sm text-zinc-500">
            {formatCents(totalSpend)} spent · {totalLeads} leads
            {totalLeads > 0 && <> · {formatCents(Math.round(totalSpend / totalLeads))} blended cost/lead</>}
          </p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <p role="note" className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
        Live ad-account sync (Meta, Google, TikTok) arrives in a connector phase. The campaign board and brief workflow below are fully real today.
      </p>

      <section className="mt-4 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="pb-2 font-semibold">Platform</th>
              <th className="pb-2 font-semibold">Campaign</th>
              <th className="pb-2 font-semibold">Status</th>
              <th className="pb-2 text-right font-semibold">Spend</th>
              <th className="pb-2 text-right font-semibold">Leads</th>
              <th className="pb-2 text-right font-semibold">Cost/lead</th>
              <th className="pb-2 pl-4 font-semibold"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map(c => (
              <tr key={c.id} className="border-t border-ink-800">
                <td className="py-2.5 text-zinc-300">{c.platform}</td>
                <td className="py-2.5 font-semibold text-zinc-100">{c.name}</td>
                <td className="py-2.5">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${CAMPAIGN_STATUS_CLS[c.status]}`}>
                    {c.status}
                  </span>
                </td>
                <td className="py-2.5 text-right text-zinc-200">{formatCents(c.spendCents)}</td>
                <td className="py-2.5 text-right text-zinc-200">{c.leads}</td>
                <td className="py-2.5 text-right text-zinc-200">{formatCents(c.costPerLeadCents)}</td>
                <td className="py-2.5 pl-4 text-right">
                  {c.status === "ended" ? (
                    <span className="text-xs text-zinc-600" title="Ended campaigns are immutable">—</span>
                  ) : (
                    <button
                      onClick={() => statusMut.mutate({ id: c.id, status: c.status === "active" ? "paused" : "active" })}
                      className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-bold text-zinc-200"
                      aria-label={`${c.status === "active" ? "Pause" : "Resume"} ${c.name}`}>
                      {c.status === "active" ? "Pause" : "Resume"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-zinc-500">No campaigns yet.</td></tr>
            )}
          </tbody>
          {campaigns.length > 0 && (
            <tfoot>
              <tr className="border-t border-ink-700 font-bold text-zinc-100">
                <td className="pt-2.5" colSpan={3}>Total</td>
                <td className="pt-2.5 text-right">{formatCents(totalSpend)}</td>
                <td className="pt-2.5 text-right">{totalLeads}</td>
                <td className="pt-2.5 text-right">{totalLeads > 0 ? formatCents(Math.round(totalSpend / totalLeads)) : "—"}</td>
                <td className="pt-2.5" />
              </tr>
            </tfoot>
          )}
        </table>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Ad briefs</h2>
            <p className="text-sm text-zinc-500">Plan the next campaign — queued to done.</p>
          </div>
          <button onClick={() => setAddOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New campaign</button>
        </div>
        <ul className="mt-3 space-y-3">
          {briefs.map(b => (
            <li key={b.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-semibold text-zinc-100">{b.title}</p>
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${BRIEF_META[b.status].cls}`}>
                    {BRIEF_META[b.status].label}
                  </span>
                  <select value={b.status}
                    onChange={e => briefMut.mutate({ id: b.id, title: b.title, brief: b.brief, status: e.target.value as BriefStatus })}
                    className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-2 text-sm text-zinc-200"
                    aria-label={`Status for ${b.title}`}>
                    {BRIEF_STATUSES.map(s => <option key={s} value={s}>{BRIEF_META[s].label}</option>)}
                  </select>
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-400">{b.brief}</p>
              <p className="mt-2 text-xs text-zinc-600">Created {b.createdAt.slice(0, 10)}</p>
            </li>
          ))}
          {briefs.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-700 py-10 text-center text-sm text-zinc-500">
              No ad briefs yet — plan the first campaign.
            </li>
          )}
        </ul>
      </section>

      {addOpen && <BriefDialog busy={briefMut.isPending} error={briefMut.error?.message ?? null}
        onCancel={() => setAddOpen(false)}
        onSubmit={(title, brief) => briefMut.mutate({ id: "", title, brief, status: "queued" })} />}
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

function BriefDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (title: string, brief: string) => void; onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  return (
    <div role="dialog" aria-modal="true" aria-label="New campaign brief"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit(title, brief); }}>
        <h3 className="text-lg font-bold text-zinc-100">New campaign brief</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Campaign / title
          <input value={title} onChange={e => setTitle(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Brief
          <textarea value={brief} onChange={e => setBrief(e.target.value)} required rows={4}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Add brief"}
          </button>
        </div>
      </form>
    </div>
  );
}
