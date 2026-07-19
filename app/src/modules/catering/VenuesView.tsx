import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Venue } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import {
  getVenueOverlay, setVenueOverlay, type VenueKind, type VenueOverlay,
} from "./_data/overlay";
import { useOverlayVersion } from "./_data/useOverlayVersion";

/**
 * Catering - Venues: V2 counterpart of the Manus SalesVenues / CoordinatorVenues.
 * Venue library cards with capacity, venue type, indoor/outdoor badge, load-in
 * notes and logistics chips (kitchen access, trailer parking, power) plus an
 * optional delivery-fee override. Search across name/city/contact. The venue
 * type + logistics + fee ride a module-local overlay until the shared Venue
 * type carries them (noted in report); name/address/contact/capacity/load-in
 * persist through the shared DAL.
 */

type Sync = "idle" | "saving" | "saved" | "error";

const VENUE_KINDS: Array<{ value: VenueKind; label: string }> = [
  { value: "ballroom", label: "Ballroom" },
  { value: "outdoor", label: "Outdoor" },
  { value: "church", label: "Church" },
  { value: "corporate", label: "Corporate" },
  { value: "backyard", label: "Backyard" },
  { value: "rooftop", label: "Rooftop" },
  { value: "festival", label: "Festival" },
  { value: "other", label: "Other" },
];
const KIND_LABEL: Record<VenueKind, string> = Object.fromEntries(VENUE_KINDS.map(k => [k.value, k.label])) as Record<VenueKind, string>;

export function VenuesView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  useOverlayVersion();
  const [sync, setSync] = useState<Sync>("idle");
  const [search, setSearch] = useState("");
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
    mutationFn: async ({ venue, overlay }: { venue: Omit<Venue, "updatedAt">; overlay: VenueOverlay }) => {
      const saved = await withSync(dal.venues.upsert(venue, actor));
      setVenueOverlay(saved.id, overlay);
      return saved;
    },
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.venues.remove(id, actor)),
    onSuccess: () => { invalidate(); setArmedDeleteId(null); },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return venues;
    return venues.filter(v =>
      v.name.toLowerCase().includes(q) ||
      v.address.toLowerCase().includes(q) ||
      v.contactName.toLowerCase().includes(q));
  }, [venues, search]);

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

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search venue, city, contact..."
        className="mt-4 w-full rounded-lg border border-ink-700 bg-ink-800 px-4 py-3 text-zinc-100" />

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading venues...</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No venues match.</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {filtered.map(v => {
            const o = getVenueOverlay(v.id);
            return (
              <div key={v.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-zinc-100">{v.name}</p>
                  {v.capacity !== null && (
                    <span className="shrink-0 rounded-full border border-ink-700 bg-ink-800 px-2.5 py-0.5 text-xs font-bold text-zinc-300">
                      {v.capacity} cap
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[11px] font-semibold text-zinc-300">{KIND_LABEL[o.kind]}</span>
                  <span className="rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[11px] font-semibold capitalize text-zinc-400">{o.indoorOutdoor}</span>
                  {o.deliveryFeeCents !== null && (
                    <span className="rounded-full border border-amber-800/50 bg-amber-950/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      delivery {formatCents(o.deliveryFeeCents)}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-400">{v.address}</p>
                <p className="mt-1 text-sm text-zinc-500">{v.contactName} · {v.phone}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <LogChip on={o.kitchenAccess} label="Kitchen" icon="🍳" />
                  <LogChip on={o.trailerParking} label="Trailer" icon="🚚" />
                  <LogChip on={o.powerAccess} label="Power" icon="⚡" />
                </div>
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
            );
          })}
        </div>
      )}

      {editing && (
        <VenueDialog venue={editing === "new" ? null : editing}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setEditing(null)}
          onSubmit={(venue, overlay) => upsertMut.mutate({ venue, overlay })} />
      )}
    </div>
  );
}

function LogChip({ on, label, icon }: { on: boolean; label: string; icon: string }) {
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
      on ? "border-green-700/60 bg-green-600/15 text-green-300" : "border-ink-700 bg-ink-800 text-zinc-600"
    }`}>
      {icon} {label}{on ? "" : " —"}
    </span>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving...", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed - retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

function VenueDialog({ venue, onSubmit, onCancel, busy, error }: {
  venue: Venue | null;
  onSubmit: (v: Omit<Venue, "updatedAt">, o: VenueOverlay) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const initial = venue ? getVenueOverlay(venue.id) : getVenueOverlay("__new__");
  const [name, setName] = useState(venue?.name ?? "");
  const [address, setAddress] = useState(venue?.address ?? "");
  const [contactName, setContactName] = useState(venue?.contactName ?? "");
  const [phone, setPhone] = useState(venue?.phone ?? "");
  const [capacity, setCapacity] = useState(venue?.capacity !== null && venue !== null ? String(venue.capacity) : "");
  const [loadInNotes, setLoadInNotes] = useState(venue?.loadInNotes ?? "");
  const [kind, setKind] = useState<VenueKind>(initial.kind);
  const [indoorOutdoor, setIndoorOutdoor] = useState<VenueOverlay["indoorOutdoor"]>(initial.indoorOutdoor);
  const [kitchenAccess, setKitchenAccess] = useState(initial.kitchenAccess);
  const [trailerParking, setTrailerParking] = useState(initial.trailerParking);
  const [powerAccess, setPowerAccess] = useState(initial.powerAccess);
  const [deliveryFee, setDeliveryFee] = useState(initial.deliveryFeeCents !== null ? String(initial.deliveryFeeCents / 100) : "");

  return (
    <div role="dialog" aria-modal="true" aria-label={venue ? "Edit venue" : "New venue"}
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/60 p-4 sm:items-center">
      <form className="my-8 w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          const cap = capacity.trim() === "" ? null : Math.max(0, Math.round(Number(capacity) || 0));
          const feeCents = deliveryFee.trim() === "" ? null : Math.max(0, Math.round(Number(deliveryFee) * 100));
          onSubmit(
            {
              id: venue?.id ?? "",
              name: name.trim(), address: address.trim(),
              contactName: contactName.trim(), phone: phone.trim(),
              capacity: cap, loadInNotes: loadInNotes.trim() || null,
            },
            { kind, indoorOutdoor, kitchenAccess, trailerParking, powerAccess, deliveryFeeCents: feeCents },
          );
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
          <label className="block text-sm font-semibold text-zinc-400">Venue type
            <select value={kind} onChange={e => setKind(e.target.value as VenueKind)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              {VENUE_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Indoor / Outdoor
            <select value={indoorOutdoor} onChange={e => setIndoorOutdoor(e.target.value as VenueOverlay["indoorOutdoor"])}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              <option value="indoor">Indoor</option>
              <option value="outdoor">Outdoor</option>
              <option value="both">Both</option>
            </select>
          </label>
        </div>
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
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Capacity
            <input inputMode="numeric" value={capacity} onChange={e => setCapacity(e.target.value)} placeholder="e.g. 200"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Delivery fee ($)
            <input inputMode="decimal" value={deliveryFee} onChange={e => setDeliveryFee(e.target.value)} placeholder="override"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <fieldset className="mt-3 grid grid-cols-3 gap-2">
          <ToggleCard on={kitchenAccess} onToggle={() => setKitchenAccess(x => !x)} icon="🍳" label="Kitchen" />
          <ToggleCard on={trailerParking} onToggle={() => setTrailerParking(x => !x)} icon="🚚" label="Trailer" />
          <ToggleCard on={powerAccess} onToggle={() => setPowerAccess(x => !x)} icon="⚡" label="Power" />
        </fieldset>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Load-in notes
          <textarea value={loadInNotes} onChange={e => setLoadInNotes(e.target.value)} rows={2}
            placeholder="Dock access, elevators, power..."
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving..." : "Save venue"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ToggleCard({ on, onToggle, icon, label }: { on: boolean; onToggle: () => void; icon: string; label: string }) {
  return (
    <button type="button" onClick={onToggle}
      className={`flex min-h-[56px] flex-col items-center justify-center rounded-lg border px-2 py-2 text-xs font-bold ${
        on ? "border-green-700/60 bg-green-600/15 text-green-300" : "border-ink-700 bg-ink-800 text-zinc-500"
      }`}>
      <span className="text-base">{icon}</span>
      {label}
    </button>
  );
}
