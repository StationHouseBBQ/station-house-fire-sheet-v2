import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ContentPost, PostStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Marketing · Content Calendar — V2 take on the Manus ContentCalendar.
 * Month grid with platform color dots, per-day post list, full post CRUD
 * via upsertPost/removePost, and a two-tap delete guard.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const PLATFORMS = ["instagram", "facebook", "tiktok"];
const PLATFORM_DOT: Record<string, string> = {
  instagram: "bg-pink-500",
  facebook: "bg-blue-500",
  tiktok: "bg-zinc-400",
};
const dotCls = (platform: string) => PLATFORM_DOT[platform] ?? "bg-fire";

const POST_STATUSES: PostStatus[] = ["idea", "drafted", "scheduled", "posted"];
const STATUS_META: Record<PostStatus, { label: string; cls: string }> = {
  idea: { label: "Idea", cls: "bg-ink-700 text-zinc-300" },
  drafted: { label: "Drafted", cls: "bg-amber-600 text-white" },
  scheduled: { label: "Scheduled", cls: "bg-blue-600 text-white" },
  posted: { label: "Posted", cls: "bg-green-600 text-white" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function ContentCalendarView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();

  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, []);
  const [ym, setYm] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ post: ContentPost | null } | null>(null);
  const [armedDelete, setArmedDelete] = useState<string | null>(null);

  const { data: posts, isLoading } = useQuery({
    queryKey: ["marketing", "posts"],
    queryFn: () => dal.marketing.posts(),
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketing", "posts"] });

  const saveMut = useMutation({
    mutationFn: (p: { id: string; date: string; platform: string; title: string; body: string; status: PostStatus }) =>
      withSync(dal.marketing.upsertPost(p, actor)),
    onSuccess: () => { invalidate(); setDialog(null); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => withSync(dal.marketing.removePost(id, actor)),
    onSuccess: () => { invalidate(); setArmedDelete(null); },
  });

  const [y, m] = ym.split("-").map(Number); // m is 1-based
  const cells = useMemo(() => {
    const startDow = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    const arr: Array<string | null> = [];
    for (let i = 0; i < startDow; i++) arr.push(null);
    for (let d = 1; d <= days; d++) arr.push(`${y}-${pad(m)}-${pad(d)}`);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [y, m]);

  const byDate = useMemo(() => {
    const g = new Map<string, ContentPost[]>();
    for (const p of posts ?? []) {
      const l = g.get(p.date) ?? [];
      l.push(p);
      g.set(p.date, l);
    }
    return g;
  }, [posts]);

  const shiftMonth = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setYm(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };
  const monthLabel = new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  const dayPosts = byDate.get(selected) ?? [];

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading content calendar…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Content Calendar</h1>
          <p className="text-sm text-zinc-500">
            {PLATFORMS.map(p => (
              <span key={p} className="mr-3 inline-flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-full ${dotCls(p)}`} />{p}
              </span>
            ))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ post: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New post</button>
        </div>
      </header>

      <div className="mt-4 flex items-center justify-between rounded-t-xl border border-ink-700 bg-ink-900 px-3 py-2">
        <button onClick={() => shiftMonth(-1)} aria-label="Previous month"
          className="min-h-[44px] min-w-[44px] rounded-lg text-lg font-bold text-zinc-300 hover:bg-ink-800">‹</button>
        <p className="font-bold text-zinc-100">{monthLabel}</p>
        <button onClick={() => shiftMonth(1)} aria-label="Next month"
          className="min-h-[44px] min-w-[44px] rounded-lg text-lg font-bold text-zinc-300 hover:bg-ink-800">›</button>
      </div>

      <div className="grid grid-cols-7 border-x border-ink-700 bg-ink-900 text-center text-[11px] font-bold uppercase text-zinc-500">
        {DOW.map(d => <div key={d} className="py-1.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 rounded-b-xl border border-ink-700 bg-ink-900 p-1">
        {cells.map((date, i) => date === null ? <div key={i} /> : (
          <button key={date} onClick={() => setSelected(date)}
            aria-label={`${date}: ${(byDate.get(date) ?? []).length} posts`}
            className={`min-h-[52px] rounded-lg p-1 text-left align-top ${
              selected === date ? "bg-fire/20 ring-1 ring-fire" : "hover:bg-ink-800"}`}>
            <span className={`text-xs font-semibold ${date === today ? "text-fire-light" : "text-zinc-400"}`}>
              {Number(date.slice(8))}
            </span>
            <span className="mt-1 flex flex-wrap gap-0.5">
              {(byDate.get(date) ?? []).slice(0, 4).map(p => (
                <span key={p.id} className={`h-1.5 w-1.5 rounded-full ${dotCls(p.platform)}`} />
              ))}
            </span>
          </button>
        ))}
      </div>

      <section className="mt-5">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Posts on {selected}</h2>
        <ul className="mt-2 space-y-2">
          {dayPosts.map(p => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotCls(p.platform)}`} aria-label={p.platform} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-zinc-100">{p.title}</p>
                <p className="truncate text-xs text-zinc-500">{p.platform} · {p.body}</p>
              </div>
              <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${STATUS_META[p.status].cls}`}>
                {STATUS_META[p.status].label}
              </span>
              <button onClick={() => setDialog({ post: p })}
                className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">
                Edit
              </button>
              <button
                onClick={() => armedDelete === p.id ? deleteMut.mutate(p.id) : setArmedDelete(p.id)}
                className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold ${
                  armedDelete === p.id
                    ? "border-red-700/50 bg-red-950/60 text-red-400"
                    : "border-ink-700 bg-ink-800 text-zinc-400"}`}
                aria-label={armedDelete === p.id ? `Confirm delete ${p.title}` : `Delete ${p.title}`}>
                {armedDelete === p.id ? "Confirm?" : "Delete"}
              </button>
            </li>
          ))}
          {dayPosts.length === 0 && (
            <li className="rounded-xl border border-dashed border-ink-700 py-8 text-center text-sm text-zinc-500">
              Nothing planned this day.
            </li>
          )}
        </ul>
      </section>

      {dialog && <PostDialog post={dialog.post} defaultDate={selected}
        busy={saveMut.isPending} error={saveMut.error?.message ?? null}
        onCancel={() => setDialog(null)}
        onSubmit={p => saveMut.mutate(p)} />}
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

function PostDialog({ post, defaultDate, onSubmit, onCancel, busy, error }: {
  post: ContentPost | null;
  defaultDate: string;
  onSubmit: (p: { id: string; date: string; platform: string; title: string; body: string; status: PostStatus }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [date, setDate] = useState(post?.date ?? defaultDate);
  const [platform, setPlatform] = useState(post?.platform ?? "instagram");
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [status, setStatus] = useState<PostStatus>(post?.status ?? "idea");
  return (
    <div role="dialog" aria-modal="true" aria-label={post ? "Edit post" : "New post"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit({ id: post?.id ?? "", date, platform, title, body, status });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{post ? "Edit post" : "New post"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Platform
            <select value={platform} onChange={e => setPlatform(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {PLATFORMS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Title
          <input value={title} onChange={e => setTitle(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Body
          <textarea value={body} onChange={e => setBody(e.target.value)} rows={3}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Status
          <select value={status} onChange={e => setStatus(e.target.value as PostStatus)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {POST_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : post ? "Save post" : "Add post"}
          </button>
        </div>
      </form>
    </div>
  );
}
