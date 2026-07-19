import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CreativeBrief } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Marketing · Reusable Creative Brief Queue.
 * Shared board used by Content Agent, Design Agent and Video Studio. Briefs
 * are grouped into status columns (Queued -> In review -> Approved -> Done)
 * with add/edit and one-tap status advance. Every brief is real DAL data via
 * dal.marketing.briefs(kind) / upsertBrief -- nothing is machine-generated.
 * AI generation attaches in a later connector phase (called out honestly).
 */

type Sync = "idle" | "saving" | "saved" | "error";
type BriefKind = CreativeBrief["kind"];
type BriefStatus = CreativeBrief["status"];

const BRIEF_STATUSES: BriefStatus[] = ["queued", "in_review", "approved", "done"];
const BRIEF_META: Record<BriefStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  in_review: { label: "In review", cls: "bg-amber-600 text-white" },
  approved: { label: "Approved", cls: "bg-blue-600 text-white" },
  done: { label: "Done", cls: "bg-green-600 text-white" },
};
const NEXT_STATUS: Record<BriefStatus, BriefStatus> = {
  queued: "in_review",
  in_review: "approved",
  approved: "done",
  done: "queued",
};

export function BriefQueue({ kind, title, accent }: { kind: BriefKind; title: string; accent: string }) {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ brief: CreativeBrief | null } | null>(null);

  const { data: briefs, isLoading } = useQuery({
    queryKey: ["marketing", "briefs", kind],
    queryFn: () => dal.marketing.briefs(kind),
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketing", "briefs", kind] });

  const saveMut = useMutation({
    mutationFn: (b: { id: string; title: string; brief: string; status: BriefStatus }) =>
      withSync(dal.marketing.upsertBrief({ ...b, kind }, actor)),
    onSuccess: () => { invalidate(); setDialog(null); },
  });
  const advanceMut = useMutation({
    mutationFn: (b: CreativeBrief) =>
      withSync(dal.marketing.upsertBrief({ id: b.id, kind, title: b.title, brief: b.brief, status: NEXT_STATUS[b.status] }, actor)),
    onSuccess: invalidate,
  });

  const list = briefs ?? [];
  const byStatus = useMemo(() => {
    const g = new Map<BriefStatus, CreativeBrief[]>(BRIEF_STATUSES.map(s => [s, []]));
    for (const b of list) g.get(b.status)?.push(b);
    return g;
  }, [list]);

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500">
            {BRIEF_STATUSES.map(s => `${byStatus.get(s)?.length ?? 0} ${BRIEF_META[s].label.toLowerCase()}`).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ brief: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New brief</button>
        </div>
      </header>

      <p role="note" className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
        AI generation attaches in a later connector phase &mdash; this is a working brief board today: plan, review and ship real creative work.
      </p>

      {isLoading ? <p className="py-16 text-center text-zinc-500">Loading briefs&hellip;</p> : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BRIEF_STATUSES.map(status => {
            const cards = byStatus.get(status) ?? [];
            return (
              <section key={status} className="rounded-xl border border-ink-700 bg-ink-900 p-2.5">
                <h2 className="flex items-center justify-between px-1 pb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {BRIEF_META[status].label}
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-zinc-300">{cards.length}</span>
                </h2>
                <ul className="space-y-2">
                  {cards.map(b => (
                    <li key={b.id} className="rounded-lg border border-ink-700 bg-ink-800 p-3">
                      <button onClick={() => setDialog({ brief: b })}
                        className="w-full text-left" aria-label={`Edit ${b.title}`}>
                        <p className="font-semibold text-zinc-100">{b.title}</p>
                        <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-400">{b.brief}</p>
                      </button>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-zinc-600">{b.createdAt.slice(0, 10)}</span>
                        <button onClick={() => advanceMut.mutate(b)}
                          className="min-h-[36px] rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1 text-xs font-bold"
                          style={{ color: accent }}
                          aria-label={`Advance ${b.title} to ${BRIEF_META[NEXT_STATUS[b.status]].label}`}>
                          {b.status === "done" ? "↺ Reopen" : `→ ${BRIEF_META[NEXT_STATUS[b.status]].label}`}
                        </button>
                      </div>
                    </li>
                  ))}
                  {cards.length === 0 && (
                    <li className="rounded-lg border border-dashed border-ink-700 py-6 text-center text-xs text-zinc-600">Empty</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {dialog && <BriefDialog brief={dialog.brief} title={title}
        busy={saveMut.isPending} error={saveMut.error?.message ?? null}
        onCancel={() => setDialog(null)}
        onSubmit={b => saveMut.mutate(b)} />}
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

function BriefDialog({ brief, title, onSubmit, onCancel, busy, error }: {
  brief: CreativeBrief | null; title: string;
  onSubmit: (b: { id: string; title: string; brief: string; status: BriefStatus }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [t, setT] = useState(brief?.title ?? "");
  const [body, setBody] = useState(brief?.brief ?? "");
  const [status, setStatus] = useState<BriefStatus>(brief?.status ?? "queued");
  return (
    <div role="dialog" aria-modal="true" aria-label={brief ? "Edit brief" : `New ${title} brief`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ id: brief?.id ?? "", title: t, brief: body, status }); }}>
        <h3 className="text-lg font-bold text-zinc-100">{brief ? "Edit brief" : `New ${title.toLowerCase()} brief`}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Title
          <input value={t} onChange={e => setT(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Brief
          <textarea value={body} onChange={e => setBody(e.target.value)} required rows={4}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Status
          <select value={status} onChange={e => setStatus(e.target.value as BriefStatus)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {BRIEF_STATUSES.map(s => <option key={s} value={s}>{BRIEF_META[s].label}</option>)}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : brief ? "Save brief" : "Add brief"}
          </button>
        </div>
      </form>
    </div>
  );
}
