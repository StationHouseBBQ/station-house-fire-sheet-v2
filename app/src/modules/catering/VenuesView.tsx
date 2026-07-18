import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Venue } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Catering · Venues — V2 counterpart of the Manus SalesVenues. Venue cards
 * with capacity + load-in notes, upsert dialog, and two-tap delete.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function VenuesView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [editing, setEditing] = useState<Venue | "new" | null>(null);
  const [armedDeleteId, setArmedDeleteId] = useState<string | null>(null);

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["venues", "list"],
    queryFn: () => dal.venues.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["venues", "list"] });

  const upsertMut = useMutation({
    mutationFn: (v: Omit<Venue, "updatedAt">) => withSync(dal.venues.upsert(v, actor)),
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.venues.remove(id, actor)),
    onSuccess: () => { invalidate(); setArmedDeleteId(null); },
  });

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Venues</h1>
          <p className="text-sm text-zinc-500">{venues.length} venues with load-in intel</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Venue</button>
        </div>
      </header>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading venues…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {venues.map(v => (
            <div key={v.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-zinc-100">{v.name}</p>
                {v.capacity !== null && (
                  <span className="shrink-0 rounded-full border border-ink-700 bg-ink-800 px-2.5 py-0.5 text-xs font-bold text-zinc-300">
                    {v.capacity} cap
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-zinc-400">{v.address}</p>
              <p className="mt-1 text-sm text-zinc-500">{v.contactName} · {v.phone}</p>
              {v.loadInNotes && (
                <p className="mt-2 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
                  🚚 {v.loadInNotes}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setEditing(v); setArmedDeleteId(null); }}
                  className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">Edit</button>
                {armedDeleteId === v.id ? (
                  <button onClick={() => removeMut.mutate(v.id)} disabled={removeMut.isPending}
                    className="min-h-[44px] rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">Confirm delete</button>
                ) : (
                  <button onClick={() => setArmedDeleteId(v.id)}
                    className="min-h-[44px] rounded-lg border border-red-800/60 bg-ink-800 px-3 py-2 text-sm font-semibold text-red-400">Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <VenueDialog venue={editing === "new" ? null : editing}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setEditing(null)}
          onSubmit={v => upsertMut.mutate(v)} />
      )}
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

function VenueDialog({ venue, onSubmit, onCancel, busy, error }: {
  venue: Venue | null;
  onSubmit: (v: Omit<Venue, "updatedAt">) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(venue?.name ?? "");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [contactName, setContactName] = useState(venue?.contactName ?? "");
  const [phone, setPhone] = useState(venue?.phone ?? "");
  const [capacity, setCapacity] = useState(venue?.capacity !== null && venue !== null ? String(venue.capacity) : "");
  const [loadInNotes, setLoadInNotes] = useState(venue?.loadInNotes ?? "");

  return (
    <div role="dialog" aria-modal="true" aria-label={venue ? "Edit venue" : "New venue"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          const cap = capacity.trim() === "" ? null : Math.max(0, Math.round(Number(capacity) || 0));
          onSubmit({
            id: venue?.id ?? "",
            name: name.trim(), address: address.trim(),
            contactName: contactName.trim(), phone: phone.trim(),
            capacity: cap, loadInNotes: loadInNotes.trim() || null,
          });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{venue ? "Edit venue" : "New venue"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name *
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Address
          <input value={address} onChange={e => setAddress(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Contact
            <input value={contactName} onChange={e => setContactName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Phone
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Capacity
          <input inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 200"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Load-in notes
          <textarea value={loadInNotes} onChange={e => setLoadInNotes(e.target.value)} rows={2}
            placeholder="Dock access, elevators, power…"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save venue"}
          </button>
        </div>
      </form>
    </div>
  );
}
