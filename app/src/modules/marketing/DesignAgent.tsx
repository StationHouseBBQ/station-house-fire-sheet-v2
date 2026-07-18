import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CreativeBrief } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Marketing · Design Agent — V2 take on the Manus DesignAgent page.
 * The Manus version calls external AI services (image generation and creative variations via
 * tRPC). V2 demo mode never fakes AI output: this screen implements the
 * real brief workflow (queue with CRUD + status transitions) and says
 * plainly that AI generation connects in the integrations phase.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type BriefStatus = CreativeBrief["status"];

const BRIEF_STATUSES: BriefStatus[] = ["queued", "in_review", "approved", "done"];
const BRIEF_META: Record<BriefStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  in_review: { label: "In Review", cls: "bg-amber-600 text-white" },
  approved: { label: "Approved", cls: "bg-blue-600 text-white" },
  done: { label: "Done", cls: "bg-green-600 text-white" },
};

export function DesignAgentView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [addOpen, setAddOpen] = useState(false);

  const { data: briefs, isLoading } = useQuery({
    queryKey: ["marketing", "briefs", "design"],
    queryFn: () => dal.marketing.briefs("design"),
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketing", "briefs", "design"] });

  const saveMut = useMutation({
    mutationFn: (b: { id: string; title: string; brief: string; status: BriefStatus }) =>
      withSync(dal.marketing.upsertBrief({ ...b, kind: "design" }, actor)),
    onSuccess: () => { invalidate(); setAddOpen(false); },
  });

  const list = briefs ?? [];

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Design Agent</h1>
          <p className="text-sm text-zinc-500">
            {BRIEF_STATUSES.map(s => `${list.filter(b => b.status === s).length} ${BRIEF_META[s].label.toLowerCase()}`).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setAddOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New brief</button>
        </div>
      </header>

      <p role="note" className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
        AI generation connects in the integrations phase (owner approval required). Until then this
        queue tracks the real design brief workflow — nothing here is machine-generated.
      </p>

      {isLoading ? <p className="py-16 text-center text-zinc-500">Loading briefs…</p> : (
        <ul className="mt-4 space-y-3">
          {list.map(b => (
            <li key={b.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 flex-1 truncate font-semibold text-zinc-100">{b.title}</p>
                <div className="flex items-center gap-2">
                  <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${BRIEF_META[b.status].cls}`}>
                    {BRIEF_META[b.status].label}
                  </span>
                  <select value={b.status}
                    onChange={e => saveMut.mutate({ id: b.id, title: b.title, brief: b.brief, status: e.target.value as BriefStatus })}
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
          {list.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">
              No design briefs yet — add the first one.
            </li>
          )}
        </ul>
      )}

      {addOpen && <BriefDialog busy={saveMut.isPending} error={saveMut.error?.message ?? null}
        onCancel={() => setAddOpen(false)}
        onSubmit={(title, brief) => saveMut.mutate({ id: "", title, brief, status: "queued" })} />}
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
    <div role="dialog" aria-modal="true" aria-label="New brief"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit(title, brief); }}>
        <h3 className="text-lg font-bold text-zinc-100">New design brief</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Title
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
