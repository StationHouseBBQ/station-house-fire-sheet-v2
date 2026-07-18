import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { MenuItem, SpecialEvent } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Special Event Admin — one generic component serving the Father's
 * Day (fathers-day), Cuban Thursday (cuban-thursday) and 4th of July (july4)
 * tabs (Manus FathersDayAdmin / CubanThursdayAdmin / July4Admin, parity rows
 * 55–57). Landing/ordering toggles (ordering is two-tap), event date, notes,
 * and a menu-item multi-select. Menu truth: Thursday-only items are only
 * selectable for the cuban-thursday event.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function EventAdmin({ slug, title }: { slug: string; title: string }) {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [confirmOrdering, setConfirmOrdering] = useState(false);

  const { data: events, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => dal.events.list() });
  const { data: menuItems } = useQuery({ queryKey: ["menu", "items"], queryFn: () => dal.menu.items() });

  const event = events?.find(e => e.slug === slug) ?? null;

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const upsertMut = useMutation({
    mutationFn: (e: Omit<SpecialEvent, "updatedAt">) => withSync(dal.events.upsert(e, actor)),
    onSuccess: () => { setConfirmOrdering(false); qc.invalidateQueries({ queryKey: ["events"] }); },
  });

  if (isLoading || !events || !menuItems) return <p className="py-20 text-center text-zinc-500">Loading event…</p>;
  if (!event) {
    return (
      <div className="py-20 text-center">
        <p className="text-base font-semibold text-zinc-300">Event "{slug}" not found</p>
        <p className="mt-1 text-sm text-zinc-500">Create it in the Events Manager tab first.</p>
      </div>
    );
  }

  const patch = (p: Partial<SpecialEvent>) => upsertMut.mutate({ ...event, ...p });

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500">{event.name} · /{event.slug}</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Toggles */}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-400">Landing page</p>
          <button role="switch" aria-checked={event.landingEnabled}
            onClick={() => patch({ landingEnabled: !event.landingEnabled })} disabled={upsertMut.isPending}
            className={`mt-2 min-h-[44px] w-full rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50 ${
              event.landingEnabled ? "bg-green-600 text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
            {event.landingEnabled ? "Landing LIVE — tap to disable" : "Landing off — tap to enable"}
          </button>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-black uppercase tracking-wider text-zinc-400">Online ordering</p>
          {confirmOrdering ? (
            <div className="mt-2 flex gap-2">
              <button onClick={() => patch({ orderingEnabled: !event.orderingEnabled })} disabled={upsertMut.isPending}
                className="min-h-[44px] flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">
                {event.orderingEnabled ? "Confirm CLOSE ordering" : "Confirm OPEN ordering"}
              </button>
              <button onClick={() => setConfirmOrdering(false)}
                className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold text-zinc-400">✕</button>
            </div>
          ) : (
            <button role="switch" aria-checked={event.orderingEnabled} onClick={() => setConfirmOrdering(true)}
              className={`mt-2 min-h-[44px] w-full rounded-lg px-3 py-2 text-sm font-bold ${
                event.orderingEnabled ? "bg-green-600 text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
              {event.orderingEnabled ? "Ordering OPEN — tap to close" : "Ordering closed — tap to open"}
            </button>
          )}
          {confirmOrdering && (
            <p className="mt-2 text-xs font-semibold text-amber-400">
              ⚠️ This changes whether customers can check out. Tap Confirm to proceed.
            </p>
          )}
        </div>
      </div>

      <EventDetailForm key={event.updatedAt} event={event} menuItems={menuItems} slug={slug}
        busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
        onSave={d => patch(d)} />
    </div>
  );
}

function EventDetailForm({ event, menuItems, slug, onSave, busy, error }: {
  event: SpecialEvent; menuItems: MenuItem[]; slug: string;
  onSave: (d: { eventDate: string | null; notes: string | null; menuItemIds: string[] }) => void;
  busy: boolean; error: string | null;
}) {
  const [eventDate, setEventDate] = useState(event.eventDate ?? "");
  const [notes, setNotes] = useState(event.notes ?? "");
  const [selected, setSelected] = useState<string[]>(event.menuItemIds);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setDirty(false); }, [event.updatedAt]);

  const toggleItem = (id: string) => {
    setSelected(cur => cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id]);
    setDirty(true);
  };

  const isCuban = slug === "cuban-thursday";

  return (
    <form className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4"
      onSubmit={e => { e.preventDefault(); onSave({ eventDate: eventDate || null, notes: notes.trim() || null, menuItemIds: selected }); }}>
      <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Event details</h2>
      {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-zinc-400">Event date
          <input type="date" value={eventDate} onChange={e => { setEventDate(e.target.value); setDirty(true); }}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true); }} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold text-zinc-400">Event menu items ({selected.length} selected)</legend>
        {!isCuban && (
          <p className="mt-1 text-xs text-zinc-600">Thursday-only items can't be added to this event — they only sell on Cuban Thursday.</p>
        )}
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {menuItems.map(i => {
            const locked = i.thursdayOnly && !isCuban;
            return (
              <label key={i.id} title={locked ? "Thursday-only item" : undefined}
                className={`flex min-h-[44px] items-center gap-3 rounded-lg border px-3 text-sm ${
                  locked ? "cursor-not-allowed border-ink-800 bg-ink-900 text-zinc-600"
                    : "border-ink-700 bg-ink-800 text-zinc-200"}`}>
                <input type="checkbox" className="h-4 w-4" disabled={locked}
                  checked={selected.includes(i.id)} onChange={() => toggleItem(i.id)} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {i.name}
                  {i.thursdayOnly && <span className="ml-1.5 rounded bg-amber-600/80 px-1.5 py-0.5 text-[10px] font-black text-white">THU</span>}
                </span>
                <span className="font-mono text-xs text-zinc-500">{formatCents(i.priceCents)}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save event details" : "Saved"}
        </button>
      </div>
    </form>
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
