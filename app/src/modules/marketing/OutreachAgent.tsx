import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { OutreachTarget } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Marketing · Outreach Agent — V2 take on the Manus OutreachAgent.
 * Real B2B outreach pipeline (stage columns + editable target cards).
 * The Manus version drafts sequences with external AI; V2 states plainly
 * that AI generation connects in the integrations phase instead of faking it.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type Stage = OutreachTarget["stage"];

const STAGES: Stage[] = ["identified", "contacted", "responded", "meeting", "won", "lost"];
const STAGE_META: Record<Stage, { label: string; cls: string }> = {
  identified: { label: "Identified", cls: "bg-ink-700 text-zinc-300" },
  contacted: { label: "Contacted", cls: "bg-amber-600 text-white" },
  responded: { label: "Responded", cls: "bg-blue-600 text-white" },
  meeting: { label: "Meeting", cls: "bg-purple-600 text-white" },
  won: { label: "Won", cls: "bg-green-600 text-white" },
  lost: { label: "Lost", cls: "bg-red-900 text-red-200" },
};

// Forward pipeline advance (won/lost are terminal outcomes -> no auto-advance).
const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  identified: "contacted",
  contacted: "responded",
  responded: "meeting",
  meeting: "won",
};

export function OutreachAgentView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ target: OutreachTarget | null } | null>(null);

  const { data: targets, isLoading } = useQuery({
    queryKey: ["marketing", "outreach"],
    queryFn: () => dal.marketing.outreach(),
  });

  const saveMut = useMutation({
    mutationFn: (t: Omit<OutreachTarget, "id"> & { id: string }) => {
      setSync("saving");
      return dal.marketing.upsertOutreach(t, actor).then(
        r => { setSync("saved"); return r; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing", "outreach"] });
      setDialog(null);
    },
  });

  const advanceMut = useMutation({
    mutationFn: (t: OutreachTarget) => {
      const next = NEXT_STAGE[t.stage];
      if (!next) return Promise.resolve(t);
      setSync("saving");
      const today = new Date().toISOString().slice(0, 10);
      return dal.marketing.upsertOutreach({ ...t, stage: next, lastTouch: today }, actor).then(
        r => { setSync("saved"); return r; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing", "outreach"] }),
  });

  const byStage = useMemo(() => {
    const g = new Map<Stage, OutreachTarget[]>(STAGES.map(s => [s, []]));
    for (const t of targets ?? []) g.get(t.stage)?.push(t);
    return g;
  }, [targets]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading outreach pipeline…</p>;

  return (
    <div className="mx-auto max-w-7xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Outreach Agent</h1>
          <p className="text-sm text-zinc-500">{(targets ?? []).length} businesses in the pipeline</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ target: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New target</button>
        </div>
      </header>

      <p role="note" className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
        AI sequence drafting — AI generation connects in the integrations phase (owner approval required).
        Until then, track real touches manually on each card.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map(stage => {
          const cards = byStage.get(stage) ?? [];
          return (
            <section key={stage} className="rounded-xl border border-ink-700 bg-ink-900 p-2">
              <h2 className="flex items-center justify-between px-1 py-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
                {STAGE_META[stage].label}
                <span className="rounded-full bg-ink-800 px-2 py-0.5 text-zinc-300">{cards.length}</span>
              </h2>
              <ul className="mt-1 space-y-2">
                {cards.map(t => (
                  <li key={t.id}>
                    <button onClick={() => setDialog({ target: t })}
                      className="min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-800 p-2.5 text-left hover:border-fire/50"
                      aria-label={`Edit ${t.business}`}>
                      <p className="truncate text-sm font-semibold text-zinc-100">{t.business}</p>
                      <p className="truncate text-xs text-zinc-500">{t.contact}</p>
                      <p className="mt-1 text-[11px] text-zinc-600">
                        {t.lastTouch ? `Last touch ${t.lastTouch}` : "No touches yet"}
                      </p>
                    </button>
                    {NEXT_STAGE[t.stage] && (
                      <button onClick={() => advanceMut.mutate(t)}
                        className="mt-1.5 min-h-[36px] w-full rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-xs font-bold text-fire-light"
                        aria-label={`Advance ${t.business} to ${STAGE_META[NEXT_STAGE[t.stage]!].label}`}>
                        → {STAGE_META[NEXT_STAGE[t.stage]!].label}
                      </button>
                    )}
                  </li>
                ))}
                {cards.length === 0 && (
                  <li className="rounded-lg border border-dashed border-ink-700 py-4 text-center text-xs text-zinc-600">Empty</li>
                )}
              </ul>
            </section>
          );
        })}
      </div>

      {dialog && <TargetDialog target={dialog.target}
        busy={saveMut.isPending} error={saveMut.error?.message ?? null}
        onCancel={() => setDialog(null)}
        onSubmit={t => saveMut.mutate(t)} />}
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

function TargetDialog({ target, onSubmit, onCancel, busy, error }: {
  target: OutreachTarget | null;
  onSubmit: (t: Omit<OutreachTarget, "id"> & { id: string }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [business, setBusiness] = useState(target?.business ?? "");
  const [contact, setContact] = useState(target?.contact ?? "");
  const [email, setEmail] = useState(target?.email ?? "");
  const [stage, setStage] = useState<Stage>(target?.stage ?? "identified");
  const [lastTouch, setLastTouch] = useState(target?.lastTouch ?? "");
  const [notes, setNotes] = useState(target?.notes ?? "");
  return (
    <div role="dialog" aria-modal="true" aria-label={target ? "Edit outreach target" : "New outreach target"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit({
            id: target?.id ?? "",
            business, contact, email, stage,
            lastTouch: lastTouch || null,
            notes: notes.trim() ? notes : null,
          });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{target ? "Edit target" : "New target"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Business
          <input value={business} onChange={e => setBusiness(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Contact
            <input value={contact} onChange={e => setContact(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Email
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Stage
            <select value={stage} onChange={e => setStage(e.target.value as Stage)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {STAGES.map(s => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Last touch
            <input type="date" value={lastTouch} onChange={e => setLastTouch(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save target"}
          </button>
        </div>
      </form>
    </div>
  );
}
