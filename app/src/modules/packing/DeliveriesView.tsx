import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Delivery, DeliveryStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { currentTime } from "../../lib/clock";

/**
 * Packing · Deliveries — V2 implementation of the Manus DeliveriesTab.
 * Status-count filter tabs, driver assignment (with address/ETA/notes),
 * one-tap status advancement with undo, a countdown/urgency label, a
 * Google-Maps route link, and inline delivery notes.
 */

const STATUS_META: Record<DeliveryStatus, { label: string; cls: string; next: DeliveryStatus | null; nextLabel: string | null }> = {
  assigned: { label: "Assigned", cls: "border-zinc-600/50 bg-ink-800 text-zinc-300", next: "loaded", nextLabel: "Mark Loaded" },
  loaded: { label: "Loaded", cls: "border-sky-700/50 bg-sky-600/20 text-sky-300", next: "en_route", nextLabel: "Mark En Route" },
  en_route: { label: "En route", cls: "border-fire/40 bg-fire/20 text-fire-light", next: "delivered", nextLabel: "Mark Delivered ✓" },
  delivered: { label: "Delivered", cls: "border-green-700/50 bg-green-600/20 text-green-400", next: null, nextLabel: null },
};

const FILTER_ORDER: DeliveryStatus[] = ["assigned", "loaded", "en_route", "delivered"];

function fmtDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Parse the leading clock time from a window like "11:30 AM – 1:00 PM". */
function windowStart(iso: string, window: string): Date | null {
  const m = window.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const [y, mo, d] = iso.split("-").map(Number);
  return new Date(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h, min);
}

function countdown(iso: string, window: string): { label: string; urgent: boolean; past: boolean } | null {
  const target = windowStart(iso, window);
  if (!target) return null;
  const diff = target.getTime() - currentTime().getTime();
  if (diff < 0) return { label: "OVERDUE", urgent: true, past: true };
  const h = Math.floor(diff / 3_600_000);
  const min = Math.floor((diff % 3_600_000) / 60_000);
  return { label: h > 0 ? `in ${h}h ${min}m` : `in ${min}m`, urgent: diff < 2 * 3_600_000, past: false };
}

type Sync = "idle" | "saving" | "saved" | "error";

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

export function DeliveriesView() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const undo = useUndo();
  const [sync, setSync] = useState<Sync>("idle");
  const [filter, setFilter] = useState<DeliveryStatus | "all">("all");
  const [assignTarget, setAssignTarget] = useState<Delivery | null>(null);
  const drivers = dal.deliveries.drivers();

  const { data: deliveries, isLoading } = useQuery({
    queryKey: ["deliveries", "list"],
    queryFn: () => dal.deliveries.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["deliveries", "list"] }); };

  const assignMut = useMutation({
    mutationFn: async ({ d, driver, notes }: { d: Delivery; driver: string; notes: string }) => {
      const updated = await withSync(dal.deliveries.assignDriver(d.id, driver, actor));
      if (notes.trim() && notes.trim() !== (d.notes ?? "")) await dal.deliveries.updateNotes(d.id, notes.trim(), actor);
      return updated;
    },
    onSuccess: () => { invalidate(); setAssignTarget(null); },
  });
  const advanceMut = useMutation({
    mutationFn: ({ id }: { id: string; from: DeliveryStatus; customer: string }) =>
      withSync(dal.deliveries.advance(id, actor)),
    onSuccess: (updated, { id, from, customer }) => {
      invalidate();
      undo.offer(`${customer} → ${STATUS_META[updated.status].label}`, async () => {
        await withSync(dal.deliveries.setStatus(id, from, actor));
        invalidate();
      });
    },
  });
  const notesMut = useMutation({
    mutationFn: ({ id, notes }: { id: string; notes: string }) =>
      withSync(dal.deliveries.updateNotes(id, notes, actor)),
    onSuccess: invalidate,
  });

  const rows = deliveries ?? [];
  const counts = useMemo(() => {
    const c: Record<DeliveryStatus, number> = { assigned: 0, loaded: 0, en_route: 0, delivered: 0 };
    for (const d of rows) c[d.status]++;
    return c;
  }, [rows]);
  const filtered = filter === "all" ? rows : rows.filter(d => d.status === filter);
  const outForDelivery = counts.en_route;

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading deliveries…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Deliveries</h1>
          <p className="text-sm text-zinc-500">{rows.length} deliveries · {outForDelivery} en route</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* Status filter tabs */}
      <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter deliveries by status">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>All ({rows.length})</FilterChip>
        {FILTER_ORDER.map(s => (
          <FilterChip key={s} active={filter === s} onClick={() => setFilter(s)}>
            {STATUS_META[s].label}{counts[s] > 0 ? ` (${counts[s]})` : ""}
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="mt-10 py-16 text-center">
          <p className="text-base font-semibold text-zinc-300">{rows.length === 0 ? "No deliveries scheduled" : "No deliveries match this filter"}</p>
          <p className="mt-1 text-sm text-zinc-500">{rows.length === 0 ? "Delivery orders will appear here once booked" : "Try a different status"}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {filtered.map(d => (
            <DeliveryRow key={d.id} delivery={d}
              onAssign={() => setAssignTarget(d)}
              onAdvance={() => advanceMut.mutate({ id: d.id, from: d.status, customer: d.customer })}
              onNotes={notes => notesMut.mutate({ id: d.id, notes })} />
          ))}
        </ul>
      )}

      {assignTarget && (
        <AssignDialog delivery={assignTarget} drivers={drivers} busy={assignMut.isPending}
          error={assignMut.error instanceof Error ? assignMut.error.message : null}
          onCancel={() => setAssignTarget(null)}
          onSubmit={(driver, notes) => assignMut.mutate({ d: assignTarget, driver, notes })} />
      )}
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`min-h-[36px] whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold ${active ? "bg-fire text-white" : "border border-ink-700 bg-ink-800 text-zinc-400"}`}>
      {children}
    </button>
  );
}

function DeliveryRow({ delivery: d, onAssign, onAdvance, onNotes }: {
  delivery: Delivery;
  onAssign: () => void; onAdvance: () => void; onNotes: (notes: string) => void;
}) {
  const meta = STATUS_META[d.status];
  const cd = d.status !== "delivered" ? countdown(d.serviceDate, d.window) : null;
  const mapUrl = `https://maps.google.com/?q=${encodeURIComponent(d.address)}`;
  return (
    <li className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-bold text-zinc-100">{d.customer}</p>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase ${meta.cls}`}>{meta.label}</span>
            {cd && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cd.past ? "bg-red-900/40 text-red-400" : cd.urgent ? "bg-amber-900/40 text-amber-300" : "text-zinc-500"}`}>
                {cd.label}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-sm text-zinc-400">{d.address}</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            {d.orderRef} · {fmtDate(d.serviceDate)} · {d.window}
            {d.driver ? <> · Driver <span className="font-semibold text-zinc-300">{d.driver}</span></> : <> · <span className="text-amber-400">Unassigned</span></>}
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2">
          <div className="flex gap-2">
            <button onClick={onAssign}
              className="min-h-[44px] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200"
              aria-label={`Assign driver for ${d.customer}`}>
              {d.driver ? "Reassign" : "Assign driver"}
            </button>
            <a href={mapUrl} target="_blank" rel="noopener noreferrer"
              className="flex min-h-[44px] items-center rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200"
              aria-label={`Open map for ${d.customer}`}>🧭 Map</a>
          </div>
          {meta.next && (
            <button onClick={onAdvance}
              disabled={!d.driver}
              title={d.driver ? undefined : "Assign a driver first"}
              className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              aria-label={`${meta.nextLabel} for ${d.customer}`}>
              {meta.nextLabel}
            </button>
          )}
        </div>
      </div>
      <NotesEditor value={d.notes} onCommit={onNotes} customer={d.customer} />
    </li>
  );
}

function AssignDialog({ delivery: d, drivers, busy, error, onCancel, onSubmit }: {
  delivery: Delivery; drivers: string[]; busy: boolean; error: string | null;
  onCancel: () => void; onSubmit: (driver: string, notes: string) => void;
}) {
  const [driver, setDriver] = useState(d.driver ?? "");
  const [notes, setNotes] = useState(d.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const submit = () => {
    setFormError(null);
    if (!driver) return setFormError("Select a driver.");
    onSubmit(driver, notes);
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`Assign driver for ${d.customer}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">Assign driver</h3>
        <p className="mt-1 text-sm text-zinc-400">{d.customer} <span className="font-mono text-zinc-500">· {d.orderRef}</span></p>
        <p className="mt-0.5 text-xs text-zinc-500">{d.address}</p>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Driver
          <select value={driver} onChange={e => setDriver(e.target.value)} autoFocus
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100">
            <option value="">Select driver…</option>
            {drivers.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Delivery notes <span className="font-normal text-zinc-600">(gate code, ETA, instructions)</span>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
            placeholder="e.g. Gate code 4412 · call on arrival · deliver by 11:15"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !driver} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Assigning…" : "Assign driver"}
          </button>
        </div>
      </form>
    </div>
  );
}

function NotesEditor({ value, onCommit, customer }: { value: string | null; onCommit: (notes: string) => void; customer: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  if (!editing) {
    return (
      <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
        className="mt-3 w-full min-h-[44px] rounded-lg border border-dashed border-ink-700 bg-ink-800/50 px-3 py-2 text-left text-sm text-zinc-400"
        aria-label={`Edit delivery notes for ${customer}`}>
        {value ? value : <span className="italic text-zinc-600">Add delivery notes…</span>}
      </button>
    );
  }
  const commit = () => { onCommit(draft.trim()); setEditing(false); };
  return (
    <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)} rows={2}
      onBlur={commit}
      onKeyDown={e => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); }
        if (e.key === "Escape") setEditing(false);
      }}
      className="mt-3 w-full rounded-lg border border-fire/50 bg-ink-800 px-3 py-2 text-sm text-zinc-100"
      aria-label={`Delivery notes for ${customer}`} />
  );
}
