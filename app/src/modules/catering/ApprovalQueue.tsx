import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { PortalOrder, PortalOrderStatus } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Catering · Approval Queue — V2 counterpart of the Manus ApprovalQueue
 * (parity row #37). B2B portal order review: status filter chips, order
 * cards with per-status actions (approve / request changes / reject on
 * pending; mark paid on approved/invoiced) and a pending count badge.
 */

const STATUSES: PortalOrderStatus[] = ["pending_approval", "approved", "changes_requested", "rejected", "invoiced", "paid"];

const STATUS_META: Record<PortalOrderStatus, { label: string; cls: string }> = {
  pending_approval: { label: "Pending", cls: "bg-amber-600/20 text-amber-400 border-amber-700/50" },
  approved: { label: "Approved", cls: "bg-green-600/20 text-green-400 border-green-700/50" },
  changes_requested: { label: "Changes Requested", cls: "bg-blue-600/20 text-blue-400 border-blue-700/50" },
  rejected: { label: "Rejected", cls: "bg-red-600/20 text-red-400 border-red-700/50" },
  invoiced: { label: "Invoiced", cls: "bg-purple-600/20 text-purple-400 border-purple-700/50" },
  paid: { label: "Paid", cls: "bg-ink-700 text-zinc-400 border-ink-700" },
};

function fmtDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
}

type Filter = "all" | PortalOrderStatus;
type Sync = "idle" | "saving" | "saved" | "error";
type NoteMode = { orderId: string; kind: "reject" | "changes" } | null;

export function ApprovalQueueView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [filter, setFilter] = useState<Filter>("all");
  const [noteMode, setNoteMode] = useState<NoteMode>(null);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["portal", "orders", filter],
    queryFn: () => dal.portalAdmin.orders({ status: filter }),
    refetchInterval: 30_000,
  });
  const { data: pending = 0 } = useQuery({
    queryKey: ["portal", "pendingCount"],
    queryFn: () => dal.portalAdmin.pendingCount(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["portal"] });
    qc.invalidateQueries({ queryKey: ["cockpit"] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) => withSync(dal.portalAdmin.approve(id, actor)),
    onSuccess: invalidate,
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => withSync(dal.portalAdmin.reject(id, note, actor)),
    onSuccess: () => { invalidate(); setNoteMode(null); },
  });
  const changesMut = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => withSync(dal.portalAdmin.requestChanges(id, note, actor)),
    onSuccess: () => { invalidate(); setNoteMode(null); },
  });
  const paidMut = useMutation({
    mutationFn: (id: string) => withSync(dal.portalAdmin.markPaid(id, actor)),
    onSuccess: invalidate,
  });

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black uppercase text-zinc-100">Approval Queue</h1>
          {pending > 0 && (
            <span className="rounded-full bg-amber-600 px-2.5 py-0.5 text-sm font-black text-white" aria-label={`${pending} pending`}>
              {pending}
            </span>
          )}
        </div>
        <SyncBadge sync={sync} />
      </header>
      <p className="mt-1 text-sm text-zinc-500">B2B portal orders awaiting director review</p>

      {/* Filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        {(["all", ...STATUSES] as Filter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`min-h-[44px] rounded-full border px-4 py-2 text-xs font-bold ${
              filter === f ? "border-fire bg-fire/20 text-fire-light" : "border-ink-700 bg-ink-900 text-zinc-400"
            }`}>
            {f === "all" ? "All" : STATUS_META[f].label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="py-16 text-center text-zinc-500">No portal orders in this view.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {orders.map(o => (
            <OrderCard key={o.id} order={o}
              busy={approveMut.isPending || paidMut.isPending}
              onApprove={() => approveMut.mutate(o.id)}
              onRequestChanges={() => setNoteMode({ orderId: o.id, kind: "changes" })}
              onReject={() => setNoteMode({ orderId: o.id, kind: "reject" })}
              onMarkPaid={() => paidMut.mutate(o.id)} />
          ))}
        </ul>
      )}

      {noteMode && (
        <NoteDialog kind={noteMode.kind}
          busy={rejectMut.isPending || changesMut.isPending}
          error={(rejectMut.error ?? changesMut.error)?.message ?? null}
          onCancel={() => setNoteMode(null)}
          onSubmit={note => {
            if (noteMode.kind === "reject") rejectMut.mutate({ id: noteMode.orderId, note });
            else changesMut.mutate({ id: noteMode.orderId, note });
          }} />
      )}
    </div>
  );
}

function OrderCard({ order: o, busy, onApprove, onRequestChanges, onReject, onMarkPaid }: {
  order: PortalOrder; busy: boolean;
  onApprove: () => void; onRequestChanges: () => void; onReject: () => void; onMarkPaid: () => void;
}) {
  return (
    <li className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-zinc-100">{o.companyName} <span className="font-mono text-xs text-zinc-500">{o.ref}</span></p>
          <p className="mt-0.5 text-sm text-zinc-400">Requested by {o.requestedBy} · event {fmtDate(o.eventDate)}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_META[o.status].cls}`}>
          {STATUS_META[o.status].label}
        </span>
      </div>

      <ul className="mt-3 space-y-1 rounded-xl border border-ink-700 bg-ink-800/60 p-3 text-sm">
        {o.items.map(it => (
          <li key={it.id} className="flex justify-between gap-3">
            <span className="text-zinc-300">{it.qty} × {it.name}</span>
            <span className="font-semibold text-zinc-200">{formatCents(it.unitPriceCents * it.qty)}</span>
          </li>
        ))}
        <li className="flex justify-between gap-3 border-t border-ink-700 pt-1.5">
          <span className="font-bold text-zinc-300">Total (incl. tax)</span>
          <span className="font-black text-fire-light">{formatCents(o.totalCents)}</span>
        </li>
      </ul>

      {o.adminNote && (
        <p className="mt-2 rounded-lg border border-blue-800/40 bg-blue-950/20 px-3 py-2 text-sm text-blue-300">
          📝 Admin note: {o.adminNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {o.status === "pending_approval" && (
          <>
            <button onClick={onApprove} disabled={busy}
              className="min-h-[44px] rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve</button>
            <button onClick={onRequestChanges}
              className="min-h-[44px] rounded-lg border border-blue-700/60 bg-ink-800 px-4 py-2 text-sm font-semibold text-blue-400">Request Changes</button>
            <button onClick={onReject}
              className="min-h-[44px] rounded-lg border border-red-800/60 bg-ink-800 px-4 py-2 text-sm font-semibold text-red-400">Reject</button>
          </>
        )}
        {(o.status === "approved" || o.status === "invoiced") && (
          <button onClick={onMarkPaid} disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Mark Paid</button>
        )}
      </div>
    </li>
  );
}

function NoteDialog({ kind, onSubmit, onCancel, busy, error }: {
  kind: "reject" | "changes";
  onSubmit: (note: string) => void; onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [note, setNote] = useState("");
  const title = kind === "reject" ? "Reject order" : "Request changes";
  return (
    <div role="dialog" aria-modal="true" aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); if (note.trim()) onSubmit(note.trim()); }}>
        <h3 className="text-lg font-bold text-zinc-100">{title}</h3>
        <p className="mt-1 text-sm text-zinc-500">The note is shared with the requesting company.</p>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Note *
          <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy || !note.trim()}
            className={`min-h-[44px] rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${kind === "reject" ? "bg-red-600" : "bg-blue-600"}`}>
            {busy ? "Saving…" : title}
          </button>
        </div>
      </form>
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
