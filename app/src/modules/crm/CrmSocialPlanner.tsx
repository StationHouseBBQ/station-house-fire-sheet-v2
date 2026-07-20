import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import type { CrmSocialPost, SocialPlatform, SocialStatus } from "./_data/types";
import { CRM_SOCIAL_KEY } from "./_data/keys";
import { CRM_SOCIAL_SEED } from "./_data/seeds";
import { fmtDate, todayIso } from "./_data/util";

/**
 * CRM · Social Planner — schedule social/content posts across platforms.
 * Persisted to dal.settings["crm.social"]. Complements the Marketing content
 * calendar; this is the CRM-side lightweight scheduler. Source: Manus
 * CrmSocialPlanner.tsx. (Planning only — nothing is actually published.)
 */

type Sync = "idle" | "saving" | "saved" | "error";

const PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "tiktok", "x", "email"];
const PLATFORM_META: Record<SocialPlatform, { label: string; icon: string; cls: string }> = {
  instagram: { label: "Instagram", icon: "📸", cls: "text-pink-300 border-pink-700/50" },
  facebook: { label: "Facebook", icon: "👍", cls: "text-sky-300 border-sky-700/50" },
  tiktok: { label: "TikTok", icon: "🎵", cls: "text-zinc-200 border-ink-600" },
  x: { label: "X", icon: "𝕏", cls: "text-zinc-300 border-ink-600" },
  email: { label: "Email", icon: "✉️", cls: "text-amber-300 border-amber-700/50" },
};
const STATUS_META: Record<SocialStatus, { label: string; cls: string }> = {
  idea: { label: "Idea", cls: "bg-ink-700 text-zinc-300" },
  scheduled: { label: "Scheduled", cls: "bg-amber-600/20 text-amber-300 border border-amber-700/50" },
  posted: { label: "Posted", cls: "bg-green-600/20 text-green-300 border border-green-700/50" },
};

export function CrmSocialPlanner() {
  const dal = getDal();
  const { actor } = useRole();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform | "all">("all");
  const [editing, setEditing] = useState<CrmSocialPost | "new" | null>(null);

  const { data: posts = [], isLoading } = useQuery({ queryKey: ["settings", CRM_SOCIAL_KEY], queryFn: () => dal.settings.get<CrmSocialPost[]>(CRM_SOCIAL_KEY, CRM_SOCIAL_SEED) });

  const save = useMutation({
    mutationFn: (next: CrmSocialPost[]) => { setSync("saving"); return dal.settings.set(CRM_SOCIAL_KEY, next, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", CRM_SOCIAL_KEY] }),
  });

  const rows = useMemo(() => {
    const sorted = [...posts].sort((a, b) => a.date.localeCompare(b.date));
    return platformFilter === "all" ? sorted : sorted.filter(p => p.platform === platformFilter);
  }, [posts, platformFilter]);

  const counts = useMemo(() => ({
    idea: posts.filter(p => p.status === "idea").length,
    scheduled: posts.filter(p => p.status === "scheduled").length,
    posted: posts.filter(p => p.status === "posted").length,
  }), [posts]);

  const upsert = (input: Omit<CrmSocialPost, "createdAt" | "updatedAt" | "id"> & { id?: string }) => {
    const now = new Date().toISOString();
    if (input.id) save.mutate(posts.map(p => p.id === input.id ? { ...p, ...input, id: p.id, updatedAt: now } : p));
    else save.mutate([...posts, { ...input, id: `soc-${Date.now()}`, createdAt: now, updatedAt: now }]);
    setEditing(null);
  };
  const cycleStatus = (id: string) => save.mutate(posts.map(p => {
    if (p.id !== id) return p;
    const next: SocialStatus = p.status === "idea" ? "scheduled" : p.status === "scheduled" ? "posted" : "idea";
    return { ...p, status: next, updatedAt: new Date().toISOString() };
  }));
  const remove = (id: string) => save.mutate(posts.filter(p => p.id !== id));

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading planner…</p>;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Social Planner</h1>
          <p className="text-sm text-zinc-500">Plan posts across channels · {counts.idea} ideas · {counts.scheduled} scheduled · {counts.posted} posted</p>
        </div>
        <div className="flex items-center gap-2">
          {sync === "saved" && <span className="text-xs font-semibold text-green-400">Saved ✓</span>}
          <button onClick={() => setEditing("new")} className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white">+ New post</button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-1">
        <button onClick={() => setPlatformFilter("all")} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${platformFilter === "all" ? "bg-fire text-white" : "bg-ink-800 text-zinc-400"}`}>All</button>
        {PLATFORMS.map(p => (
          <button key={p} onClick={() => setPlatformFilter(p)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${platformFilter === p ? "bg-fire text-white" : "bg-ink-800 text-zinc-400"}`}>{PLATFORM_META[p].icon} {PLATFORM_META[p].label}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">No posts planned.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {rows.map(p => {
            const pm = PLATFORM_META[p.platform];
            return (
              <li key={p.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${pm.cls}`}>{pm.icon} {pm.label}</span>
                    <span className="ml-2 text-xs text-zinc-500">{fmtDate(p.date)}</span>
                  </div>
                  <button onClick={() => cycleStatus(p.id)} title="Click to advance status"
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${STATUS_META[p.status].cls}`}>{STATUS_META[p.status].label}</button>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-200">{p.caption}</p>
                {p.notes && <p className="mt-1 text-xs text-zinc-500">{p.notes}</p>}
                <div className="mt-3 flex gap-2">
                  <button onClick={() => setEditing(p)} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">Edit</button>
                  <button onClick={() => navigator.clipboard?.writeText(p.caption)} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">Copy caption</button>
                  <button onClick={() => remove(p.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-red-400">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <PostDialog post={editing === "new" ? null : editing} today={todayIso()}
        onCancel={() => setEditing(null)} onSubmit={upsert} />}
    </div>
  );
}

function PostDialog({ post, today, onCancel, onSubmit }: {
  post: CrmSocialPost | null; today: string; onCancel: () => void;
  onSubmit: (input: Omit<CrmSocialPost, "createdAt" | "updatedAt" | "id"> & { id?: string }) => void;
}) {
  const [platform, setPlatform] = useState<SocialPlatform>(post?.platform ?? "instagram");
  const [date, setDate] = useState(post?.date ?? today);
  const [caption, setCaption] = useState(post?.caption ?? "");
  const [status, setStatus] = useState<SocialStatus>(post?.status ?? "idea");
  const [notes, setNotes] = useState(post?.notes ?? "");
  const input = "mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!caption.trim() || !date) return;
    onSubmit({ id: post?.id, platform, date, caption: caption.trim(), status, notes: notes.trim() || null });
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onCancel}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">{post ? "Edit post" : "New post"}</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-zinc-500">Platform
            <select value={platform} onChange={e => setPlatform(e.target.value as SocialPlatform)} className={input}>
              {PLATFORMS.map(p => <option key={p} value={p}>{PLATFORM_META[p].label}</option>)}
            </select></label>
          <label className="block text-xs font-semibold text-zinc-500">Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} /></label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-zinc-500">Caption
          <textarea value={caption} onChange={e => setCaption(e.target.value)} rows={4} className={input} placeholder="Post copy…" autoFocus /></label>
        <label className="mt-3 block text-xs font-semibold text-zinc-500">Status
          <select value={status} onChange={e => setStatus(e.target.value as SocialStatus)} className={input}>
            <option value="idea">Idea</option><option value="scheduled">Scheduled</option><option value="posted">Posted</option>
          </select></label>
        <label className="mt-3 block text-xs font-semibold text-zinc-500">Notes
          <input value={notes} onChange={e => setNotes(e.target.value)} className={input} placeholder="Optional" /></label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">{post ? "Save" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
