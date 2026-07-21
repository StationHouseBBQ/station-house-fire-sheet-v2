import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import type { CrmChannel, CrmMessage, CrmThreadMap } from "./_data/types";
import { CRM_THREADS_KEY } from "./_data/keys";
import { fmtAt, leadLabel } from "./_data/util";

/**
 * CRM · Conversations — per-lead message threads. Each thread is seeded from
 * the lead's real activity[] and merged with locally-added messages persisted
 * to dal.settings["crm.threads"]. Composing appends a note/message with a
 * channel tag. This is an INTERNAL log — nothing is actually sent.
 * Merges the ideas from Manus CrmConversations.tsx + CrmMessaging.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const CHANNELS: CrmChannel[] = ["note", "call", "email", "sms"];
const CHANNEL_META: Record<CrmChannel, { label: string; badge: string; bubble: string }> = {
  note: { label: "Note", badge: "text-amber-300 border-amber-700/50", bubble: "border border-amber-700/40 bg-amber-950/20 text-amber-100" },
  call: { label: "Call", badge: "text-sky-300 border-sky-700/50", bubble: "border border-ink-700 bg-ink-800 text-zinc-100" },
  email: { label: "Email", badge: "text-indigo-300 border-indigo-700/50", bubble: "border border-ink-700 bg-ink-800 text-zinc-100" },
  sms: { label: "SMS", badge: "text-emerald-300 border-emerald-700/50", bubble: "border border-ink-700 bg-ink-800 text-zinc-100" },
};

/** Map a lead.activity.kind (free string) onto a CRM channel. */
function toChannel(kind: string): CrmChannel {
  const k = kind.toLowerCase();
  if (k === "call") return "call";
  if (k === "email") return "email";
  if (k === "sms" || k === "text") return "sms";
  return "note";
}

interface ThreadItem { id: string; channel: CrmChannel; body: string; actor: string; at: string; seeded: boolean; }

function buildThread(lead: Lead, local: CrmMessage[]): ThreadItem[] {
  const fromActivity: ThreadItem[] = lead.activity.map(a => ({
    id: `act-${a.id}`, channel: toChannel(a.kind), body: a.body, actor: a.actor, at: a.at, seeded: true,
  }));
  const fromLocal: ThreadItem[] = local.map(m => ({
    id: m.id, channel: m.channel, body: m.body, actor: m.actor, at: m.at, seeded: false,
  }));
  return [...fromActivity, ...fromLocal].sort((a, b) => a.at.localeCompare(b.at));
}

export function CrmConversations() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<CrmChannel>("note");
  const [body, setBody] = useState("");

  const { data: leads = [], isLoading } = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });
  const { data: threads = {} } = useQuery({
    queryKey: ["settings", CRM_THREADS_KEY],
    queryFn: () => dal.settings.get<CrmThreadMap>(CRM_THREADS_KEY, {}),
  });

  const appendMsg = useMutation({
    mutationFn: ({ leadId, msg }: { leadId: string; msg: CrmMessage }) => {
      setSync("saving");
      const next: CrmThreadMap = { ...threads, [leadId]: [...(threads[leadId] ?? []), msg] };
      return dal.settings.set(CRM_THREADS_KEY, next, actor).then(
        () => { setSync("saved"); return next; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", CRM_THREADS_KEY] }),
  });

  const filteredLeads = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? leads.filter(l => leadLabel(l).toLowerCase().includes(q) || l.email.toLowerCase().includes(q)) : leads;
    return [...base].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [leads, search]);

  const selected = selectedId ? leads.find(l => l.id === selectedId) ?? null : null;
  const thread = useMemo(
    () => (selected ? buildThread(selected, threads[selected.id] ?? []) : []),
    [selected, threads],
  );

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !body.trim()) return;
    const msg: CrmMessage = {
      id: `msg-${Date.now()}`, channel, body: body.trim(), actor, at: currentTime().toISOString(),
    };
    appendMsg.mutate({ leadId: selected.id, msg });
    setBody("");
  }

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading conversations…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Conversations</h1>
          <p className="text-sm text-zinc-500">Internal contact log — nothing is actually sent</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Lead list */}
        <div className="rounded-2xl border border-ink-700 bg-ink-950/60 p-2">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search contacts…"
            className="mb-2 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
            {filteredLeads.map(l => {
              const count = (l.activity.length) + (threads[l.id]?.length ?? 0);
              return (
                <li key={l.id}>
                  <button onClick={() => setSelectedId(l.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-colors ${
                      selectedId === l.id ? "border-fire/60 bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-fire/40"
                    }`}>
                    <p className="truncate font-semibold text-zinc-100">{l.name}</p>
                    <p className="truncate text-xs text-zinc-500">{l.company ?? l.eventType} · {count} msg</p>
                  </button>
                </li>
              );
            })}
            {filteredLeads.length === 0 && <li className="px-2 py-4 text-center text-xs text-zinc-600">No contacts match.</li>}
          </ul>
        </div>

        {/* Thread */}
        <div className="rounded-2xl border border-ink-700 bg-ink-900">
          {!selected ? (
            <p className="py-20 text-center text-zinc-500">Pick a contact to open the thread.</p>
          ) : (
            <div className="flex h-[32rem] flex-col">
              <div className="shrink-0 border-b border-ink-700 p-4">
                <p className="font-bold text-zinc-100">{leadLabel(selected)}</p>
                <p className="text-xs text-zinc-500">{selected.email} · {selected.phone}</p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {thread.length === 0 ? (
                  <p className="py-8 text-center text-sm text-zinc-500">No messages yet — add the first note below.</p>
                ) : thread.map(m => (
                  <div key={m.id} className={`rounded-2xl px-3 py-2 text-sm ${CHANNEL_META[m.channel].bubble}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full border bg-ink-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${CHANNEL_META[m.channel].badge}`}>
                        {CHANNEL_META[m.channel].label}
                      </span>
                      <span className="text-[11px] opacity-60">{fmtAt(m.at)}</span>
                    </div>
                    <p className="mt-1">{m.body}</p>
                    <p className="mt-0.5 text-[11px] opacity-60">{m.actor}{m.seeded ? " · from pipeline" : ""}</p>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="shrink-0 space-y-2 border-t border-ink-700 p-4">
                <div className="flex flex-wrap gap-1.5">
                  {CHANNELS.map(c => (
                    <button key={c} type="button" onClick={() => setChannel(c)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        channel === c ? `bg-ink-800 ${CHANNEL_META[c].badge}` : "border-ink-700 bg-ink-900 text-zinc-400"
                      }`}>
                      {CHANNEL_META[c].label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input value={body} onChange={e => setBody(e.target.value)} placeholder={`Log a ${CHANNEL_META[channel].label.toLowerCase()}…`}
                    className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100" />
                  <button type="submit" disabled={appendMsg.isPending || !body.trim()}
                    className="min-h-[44px] shrink-0 rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Log</button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
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
