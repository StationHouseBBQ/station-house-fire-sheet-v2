import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { DiscountCode } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Discount Codes — V2 counterpart of Manus DiscountCodesAdmin
 * (parity row 66). Codes are uppercase alphanumeric; percent codes 1–100.
 * Codes validate server-side at checkout — there is no client-side path to a
 * free order.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function DiscountCodes() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ open: boolean; code: DiscountCode | null }>({ open: false, code: null });
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const { data: codes, isLoading } = useQuery({ queryKey: ["discounts"], queryFn: () => dal.discounts.list() });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["discounts"] });

  const upsertMut = useMutation({
    mutationFn: (d: Parameters<typeof dal.discounts.upsert>[0]) => withSync(dal.discounts.upsert(d, actor)),
    onSuccess: () => { setDialog({ open: false, code: null }); invalidate(); },
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => withSync(dal.discounts.remove(id, actor)),
    onSuccess: () => { setConfirmRemove(null); invalidate(); },
  });

  if (isLoading || !codes) return <p className="py-20 text-center text-zinc-500">Loading discount codes…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Discount Codes</h1>
          <p className="text-sm text-zinc-500">{codes.filter(c => c.active).length}/{codes.length} active</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ open: true, code: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New code</button>
        </div>
      </header>

      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        🔒 Codes validate server-side at checkout; no client-side free orders.
      </p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Code</th>
              <th className="px-3 py-2.5">Kind</th>
              <th className="px-3 py-2.5 text-right">Value</th>
              <th className="px-3 py-2.5">Active</th>
              <th className="px-3 py-2.5 text-right">Used</th>
              <th className="px-3 py-2.5">Expires</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {codes.map(c => (
              <tr key={c.id} className={c.active ? "" : "opacity-60"}>
                <td className="px-3 py-2.5 font-mono font-bold text-zinc-100">{c.code}</td>
                <td className="px-3 py-2.5 text-zinc-400">{c.kind === "percent" ? "Percent" : "Fixed"}</td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-200">
                  {c.kind === "percent" ? `${c.value}%` : formatCents(c.value)}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                    c.active ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                    {c.active ? "ACTIVE" : "OFF"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{c.usedCount}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never"}</td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setDialog({ open: true, code: c })}
                      className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200">
                      Edit
                    </button>
                    {confirmRemove === c.id ? (
                      <>
                        <button onClick={() => removeMut.mutate(c.id)} disabled={removeMut.isPending}
                          className="min-h-[36px] rounded-lg bg-red-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50">Confirm</button>
                        <button onClick={() => setConfirmRemove(null)}
                          className="min-h-[36px] rounded-lg border border-ink-700 px-2 py-1 text-xs text-zinc-400">✕</button>
                      </>
                    ) : (
                      <button onClick={() => setConfirmRemove(c.id)}
                        className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
                        Remove
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {codes.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-zinc-500">No discount codes.</td></tr>}
          </tbody>
        </table>
      </div>

      {dialog.open && (
        <CodeDialog code={dialog.code} busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, code: null })}
          onSubmit={d => upsertMut.mutate(d)} />
      )}
    </div>
  );
}

function CodeDialog({ code, onSubmit, onCancel, busy, error }: {
  code: DiscountCode | null;
  onSubmit: (d: { id: string; code: string; kind: "percent" | "fixed_cents"; value: number; active: boolean; expiresAt: string | null }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [codeStr, setCodeStr] = useState(code?.code ?? "");
  const [kind, setKind] = useState<"percent" | "fixed_cents">(code?.kind ?? "percent");
  const [value, setValue] = useState(
    code ? (code.kind === "percent" ? String(code.value) : (code.value / 100).toFixed(2)) : "");
  const [active, setActive] = useState(code?.active ?? true);
  const [expires, setExpires] = useState(code?.expiresAt ? code.expiresAt.slice(0, 10) : "");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    const c = codeStr.trim().toUpperCase();
    if (!/^[A-Z0-9]+$/.test(c)) return setFormError("Code must be uppercase letters and numbers only (no spaces).");
    let v: number;
    if (kind === "percent") {
      v = Number(value);
      if (!Number.isFinite(v) || v < 1 || v > 100) return setFormError("Percent must be between 1 and 100.");
    } else {
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) return setFormError("Fixed discount must be a positive dollar amount.");
      v = Math.round(n * 100);
    }
    onSubmit({
      id: code?.id ?? "", // empty id = create
      code: c, kind, value: v, active,
      expiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={code ? "Edit discount code" : "New discount code"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{code ? "Edit discount code" : "New discount code"}</h3>
        {(formError || error) && (
          <p className="mt-2 rounded-lg border border-red-700/60 bg-red-950/60 px-3 py-2 text-sm font-semibold text-red-400" role="alert">
            {formError ?? error}
          </p>
        )}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Code (uppercase A–Z, 0–9)
          <input value={codeStr} onChange={e => setCodeStr(e.target.value.toUpperCase())} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 font-mono text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Kind
            <select value={kind} onChange={e => setKind(e.target.value as "percent" | "fixed_cents")}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
              <option value="percent">Percent</option>
              <option value="fixed_cents">Fixed $</option>
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">{kind === "percent" ? "Percent (1–100)" : "Amount ($)"}
            <input value={value} onChange={e => setValue(e.target.value)} inputMode="decimal" required
              placeholder={kind === "percent" ? "10" : "5.00"}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Expires
            <input type="date" value={expires} onChange={e => setExpires(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
          Active
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : code ? "Save changes" : "Create code"}
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
