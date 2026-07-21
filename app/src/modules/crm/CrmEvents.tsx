import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import type { CrmEvent, CrmEventKind, CrmEventStatus } from "./_data/types";
import { CRM_EVENTS_KEY } from "./_data/keys";
import { CRM_EVENTS_SEED } from "./_data/seeds";
import { fmtDate, todayIso, leadLabel } from "./_data/util";

/**
 * CRM · Events — schedule of CRM touchpoints (tastings, meetings, site visits,
 * calls, follow-ups) optionally linked to a lead. Persisted to
 * dal.settings["crm.events"]. Source: Manus CrmEvents.tsx.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type Filter = "upcoming" | "past" | "all";

const KINDS: CrmEventKind[] = ["tasting", "meeting", "site_visit", "call", "follow_up"];
const KIND_META: Record<CrmEventKind, { label: string; cls: string; icon: string }> = {
  tasting: { label: "Tasting", cls: "text-fire-light border-fire/40", icon: "🍽️" },
  meeting: { label: "Meeting", cls: "text-sky-300 border-sky-700/50", icon: "🤝" },
  site_visit: { label: "Site visit", cls: "text-emerald-300 border-emerald-700/50", icon: "📍" },
  call: { label: "Call", cls: "text-amber-300 border-amber-700/50", icon: "📞" },
  follow_up: { label: "Follow-up", cls: "text-indigo-300 border-indigo-700/50", icon: "🔁" },
};

export function CrmEvents() {
  const dal = getDal();
  const { actor } = useRole();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [editing, setEditing] = useState<CrmEvent | "new" | null>(null);

  const { data: events = [], isLoading } = useQuery({ queryKey: ["settings", CRM_EVENTS_KEY], queryFn: () => dal.settings.get<CrmEvent[]>(CRM_EVENTS_KEY, CRM_EVENTS_SEED) });
  const { data: leads = [] } = useQuery({ queryKey: ["leads", "list"], queryFn: () => dal.leads.list() });

  const save = useMutation({
    mutationFn: (next: CrmEvent[]) => { setSync("saving"); return dal.settings.set(CRM_EVENTS_KEY, next, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", CRM_EVENTS_KEY] }),
  });

  const today = todayIso();
  const rows = useMemo(() => {
    const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
    if (filter === "all") return sorted;
    if (filter === "upcoming") return sorted.filter(e => e.date >= today && e.status !== "cancelled");
    return sorted.filter(e => e.date < today || e.status === "done").reverse();
  }, [events, filter, today]);

  const upsert = (input: Omit<CrmEvent, "createdAt" | "updatedAt" | "id"> & { id?: string }) => {
    const now = new Date().toISOString();
    if (input.id) {
      save.mutate(events.map(e => e.id === input.id ? { ...e, ...input, id: e.id, updatedAt: now } : e));
    } else {
      const ev: CrmEvent = { ...input, id: `ev-${Date.now()}`, createdAt: now, updatedAt: now };
      save.mutate([...events, ev]);
    }
    setEditing(null);
  };
  const setStatus = (id: string, status: CrmEventStatus) =>
    save.mutate(events.map(e => e.id === id ? { ...e, status, updatedAt: new Date().toISOString() } : e));
  const remove = (id: string) => save.mutate(events.filter(e => e.id !== id));

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading events…</p>;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">CRM Events</h1>
          <p className="text-sm text-zinc-500">Tastings, meetings, site visits & calls</p>
        </div>
        <div className="flex items-center gap-2">
          {sync === "saved" && <span className="text-xs font-semibold text-green-400">Saved ✓</span>}
          <button onClick={() => setEditing("new")} className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white">+ New event</button>
        </div>
      </header>

      <div className="mt-4 flex gap-1">
        {(["upcoming", "past", "all"] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize ${filter === f ? "bg-fire text-white" : "bg-ink-800 text-zinc-400"}`}>{f}</button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">No {filter} events.</p>
      ) : (
        <ul className="mt-5 space-y-2">
          {rows.map(e => {
            const meta = KIND_META[e.kind];
            return (
              <li key={e.id} className={`rounded-2xl border p-4 ${e.status === "cancelled" ? "border-ink-800 bg-ink-950/40 opacity-60" : e.status === "done" ? "border-green-800/40 bg-green-950/10" : "border-ink-700 bg-ink-900"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-zinc-100">{meta.icon} {e.title}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      <span className={`rounded-full border px-2 py-0.5 font-semibold ${meta.cls}`}>{meta.label}</span>
                      {e.linkedLabel && <span className="ml-2">· {e.linkedLabel}</span>}
                      {e.location && <span className="ml-2">· {e.location}</span>}
                    </p>
                    {e.notes && <p className="mt-1 text-sm text-zinc-400">{e.notes}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-black text-fire-light">{fmtDate(e.date)}</p>
                    {e.time && <p className="text-xs text-zinc-500">{e.time}</p>}
                    {e.status === "done" && <p className="text-[10px] font-black uppercase text-green-400">Done</p>}
                    {e.status === "cancelled" && <p className="text-[10px] font-black uppercase text-zinc-500">Cancelled</p>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {e.status === "scheduled" && <button onClick={() => setStatus(e.id, "done")} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white">Mark done</button>}
                  {e.status !== "scheduled" && <button onClick={() => setStatus(e.id, "scheduled")} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">Reopen</button>}
                  <button onClick={() => setEditing(e)} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-zinc-300">Edit</button>
                  {e.status !== "cancelled" && <button onClick={() => setStatus(e.id, "cancelled")} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-semibold text-zinc-400">Cancel</button>}
                  <button onClick={() => remove(e.id)} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-500 hover:text-red-400">Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <EventDialog event={editing === "new" ? null : editing} leads={leads} today={today}
        onCancel={() => setEditing(null)} onSubmit={upsert} />}
    </div>
  );
}

function EventDialog({ event, leads, today, onCancel, onSubmit }: {
  event: CrmEvent | null; leads: Lead[]; today: string; onCancel: () => void;
  onSubmit: (input: Omit<CrmEvent, "createdAt" | "updatedAt" | "id"> & { id?: string }) => void;
}) {
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<CrmEventKind>(event?.kind ?? "meeting");
  const [date, setDate] = useState(event?.date ?? today);
  const [time, setTime] = useState(event?.time ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [leadId, setLeadId] = useState(event?.leadId ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const input = "mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !date) return;
    const lead = leadId ? leads.find(l => l.id === leadId) ?? null : null;
    onSubmit({
      id: event?.id, title: title.trim(), kind, date, time: time.trim() || null,
      location: location.trim() || null, leadId: lead?.id ?? null, linkedLabel: lead ? leadLabel(lead) : (event?.linkedLabel ?? null),
      status: event?.status ?? "scheduled", notes: notes.trim() || null,
    });
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center" onClick={onCancel}>
      <form onClick={e => e.stopPropagation()} onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">{event ? "Edit event" : "New event"}</h3>
        <label className="mt-3 block text-xs font-semibold text-zinc-500">Title
          <input value={title} onChange={e => setTitle(e.target.value)} className={input} placeholder="Tasting — …" autoFocus /></label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-zinc-500">Type
            <select value={kind} onChange={e => setKind(e.target.value as CrmEventKind)} className={input}>
              {KINDS.map(k => <option key={k} value={k}>{KIND_META[k].label}</option>)}
            </select></label>
          <label className="block text-xs font-semibold text-zinc-500">Date
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={input} /></label>
          <label className="block text-xs font-semibold text-zinc-500">Time
            <input value={time} onChange={e => setTime(e.target.value)} className={input} placeholder="2:00 PM" /></label>
          <label className="block text-xs font-semibold text-zinc-500">Location
            <input value={location} onChange={e => setLocation(e.target.value)} className={input} placeholder="Optional" /></label>
        </div>
        <label className="mt-3 block text-xs font-semibold text-zinc-500">Linked lead
          <select value={leadId} onChange={e => setLeadId(e.target.value)} className={input}>
            <option value="">— none —</option>
            {leads.map(l => <option key={l.id} value={l.id}>{leadLabel(l)}</option>)}
          </select></label>
        <label className="mt-3 block text-xs font-semibold text-zinc-500">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={input} placeholder="Optional" /></label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">{event ? "Save" : "Create"}</button>
        </div>
      </form>
    </div>
  );
}
