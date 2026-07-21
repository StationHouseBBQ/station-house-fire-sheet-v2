import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import type { MessageBoardState, TeamMessage } from "./_data/types";
import { TEAM_MESSAGES_KEY } from "./_data/keys";
import { TEAM_MESSAGES_SEED, DEFAULT_BRIEFING } from "./_data/seeds";
import { fmtTime } from "./_data/util";

/**
 * Team · Message Board — team announcements plus an editable "today's
 * briefing" banner (merging the Manus DailyBriefing idea). Post messages
 * (author = actor, timestamp, pinnable), edit the briefing, and delete your
 * posts. The whole board state persists to dal.settings["team.messages"].
 * Source: Manus MessageBoard.tsx + DailyBriefing.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const DEFAULT_STATE: MessageBoardState = {
  briefing: DEFAULT_BRIEFING,
  briefingUpdatedAt: null,
  briefingUpdatedBy: null,
  messages: TEAM_MESSAGES_SEED,
};

function rid(): string {
  return "msg-" + Math.random().toString(36).slice(2, 10);
}

/** "Dana W." style short name from a "staff:email" actor string. */
function shortName(actor: string): string {
  const raw = actor.replace(/^staff:/, "").split("@")[0];
  const parts = raw.split(/[.\-_]/).filter(Boolean);
  if (parts.length === 0) return raw || "Someone";
  const first = parts[0][0].toUpperCase() + parts[0].slice(1);
  return parts[1] ? `${first} ${parts[1][0].toUpperCase()}.` : first;
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const today = currentTime().toDateString();
  const label = d.toDateString() === today
    ? "Today"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${label} · ${fmtTime(iso)}`;
}

export function MessageBoard() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [compose, setCompose] = useState("");
  const [pinNew, setPinNew] = useState(false);
  const [editingBriefing, setEditingBriefing] = useState(false);
  const [briefingDraft, setBriefingDraft] = useState("");

  const { data: state = DEFAULT_STATE, isLoading } = useQuery({
    queryKey: ["settings", TEAM_MESSAGES_KEY],
    queryFn: () => dal.settings.get<MessageBoardState>(TEAM_MESSAGES_KEY, DEFAULT_STATE),
  });

  const save = useMutation({
    mutationFn: (next: MessageBoardState) => {
      setSync("saving");
      return dal.settings.set(TEAM_MESSAGES_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", TEAM_MESSAGES_KEY] }),
  });

  const sortedMessages = useMemo(() => {
    return [...state.messages].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return a.at < b.at ? 1 : -1;
    });
  }, [state.messages]);

  function post() {
    const body = compose.trim();
    if (!body) return;
    const msg: TeamMessage = { id: rid(), author: actor, body, at: currentTime().toISOString(), pinned: pinNew };
    save.mutate({ ...state, messages: [msg, ...state.messages] });
    setCompose("");
    setPinNew(false);
  }

  function togglePin(id: string) {
    save.mutate({ ...state, messages: state.messages.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m) });
  }

  function remove(id: string) {
    save.mutate({ ...state, messages: state.messages.filter(m => m.id !== id) });
  }

  function startEditBriefing() {
    setBriefingDraft(state.briefing);
    setEditingBriefing(true);
  }

  function saveBriefing() {
    save.mutate({
      ...state,
      briefing: briefingDraft.trim(),
      briefingUpdatedAt: currentTime().toISOString(),
      briefingUpdatedBy: actor,
    });
    setEditingBriefing(false);
  }

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading message board…</p>;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-16">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Message Board</h1>
          <p className="text-sm text-zinc-500">
            {currentTime().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <SyncPill sync={sync} />
      </header>

      {/* Today's briefing banner */}
      <section className="mt-4 rounded-2xl border-2 border-fire/50 bg-fire/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-fire-light">📣 Today's Briefing</h2>
          {!editingBriefing && (
            <button onClick={startEditBriefing}
              className="rounded-lg border border-fire/50 bg-ink-900/40 px-2.5 py-1 text-xs font-semibold text-fire-light transition hover:bg-fire/20">
              Edit
            </button>
          )}
        </div>
        {editingBriefing ? (
          <div className="mt-3">
            <textarea value={briefingDraft} onChange={e => setBriefingDraft(e.target.value)} rows={4}
              className="w-full resize-y rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-100 focus:border-fire/60 focus:outline-none"
              placeholder="Priorities, reminders, event details, safety notes…" />
            <div className="mt-2 flex justify-end gap-2">
              <button onClick={() => setEditingBriefing(false)}
                className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500">Cancel</button>
              <button onClick={saveBriefing} disabled={save.isPending}
                className="rounded-lg border border-fire/50 bg-fire/20 px-4 py-1.5 text-sm font-black uppercase tracking-wide text-fire-light transition hover:bg-fire/30 disabled:opacity-50">Save</button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
              {state.briefing || <span className="text-zinc-500">No briefing set. Tap Edit to add one.</span>}
            </p>
            {state.briefingUpdatedAt && (
              <p className="mt-2 text-[11px] uppercase tracking-wider text-fire-light/70">
                Updated {fmtWhen(state.briefingUpdatedAt)}{state.briefingUpdatedBy ? ` by ${shortName(state.briefingUpdatedBy)}` : ""}
              </p>
            )}
          </>
        )}
      </section>

      {/* Compose */}
      <section className="mt-6 rounded-2xl border border-ink-700 bg-ink-900 p-4">
        <textarea value={compose} onChange={e => setCompose(e.target.value)} rows={3}
          className="w-full resize-y rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 focus:border-fire/60 focus:outline-none"
          placeholder="Post an announcement to the team…" />
        <div className="mt-2 flex items-center justify-between">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={pinNew} onChange={e => setPinNew(e.target.checked)} className="accent-fire" />
            📌 Pin to top
          </label>
          <button onClick={post} disabled={save.isPending || !compose.trim()}
            className="rounded-lg border border-fire/50 bg-fire/20 px-4 py-2 text-sm font-black uppercase tracking-wide text-fire-light transition hover:bg-fire/30 disabled:opacity-40">
            Post
          </button>
        </div>
      </section>

      {/* Messages */}
      <section className="mt-6 space-y-3">
        {sortedMessages.length === 0 ? (
          <p className="rounded-2xl border border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">No announcements yet.</p>
        ) : (
          sortedMessages.map(m => {
            const mine = m.author === actor;
            return (
              <article key={m.id}
                className={`rounded-2xl border p-4 ${m.pinned ? "border-amber-700/50 bg-amber-950/20" : "border-ink-700 bg-ink-900"}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-100">{shortName(m.author)}</span>
                    {m.pinned && <span className="rounded-full border border-amber-700/50 bg-amber-600/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300">📌 Pinned</span>}
                  </div>
                  <span className="text-xs text-zinc-500">{fmtWhen(m.at)}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">{m.body}</p>
                <div className="mt-2 flex items-center gap-3 text-xs">
                  <button onClick={() => togglePin(m.id)} disabled={save.isPending}
                    className="font-semibold text-zinc-500 transition hover:text-amber-300 disabled:opacity-50">
                    {m.pinned ? "Unpin" : "Pin"}
                  </button>
                  {mine && (
                    <button onClick={() => remove(m.id)} disabled={save.isPending}
                      className="font-semibold text-zinc-500 transition hover:text-red-400 disabled:opacity-50">
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}

function SyncPill({ sync }: { sync: Sync }) {
  if (sync === "idle") return null;
  const map: Record<Exclude<Sync, "idle">, { label: string; cls: string }> = {
    saving: { label: "Saving…", cls: "text-amber-300 border-amber-700/50 bg-amber-600/10" },
    saved: { label: "Saved", cls: "text-green-300 border-green-700/50 bg-green-600/10" },
    error: { label: "Save failed", cls: "text-red-300 border-red-700/50 bg-red-600/10" },
  };
  const m = map[sync];
  return <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold ${m.cls}`}>{m.label}</span>;
}
