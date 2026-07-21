import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { SamplerConfig } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · Walk-In Samplers — V2 counterpart of Manus WalkInSamplerEditor
 * (parity row 53). Menu truth: the Walk-In Sampler may only contain the five
 * approved proteins (pulled pork, brisket, sausage, ribs, chicken quarters).
 * The UI only offers those five and the DAL rejects anything else — its
 * validation error is surfaced prominently.
 */

type Sync = "idle" | "saving" | "saved" | "error";

function dollarsToCents(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function SamplerEditor() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ open: boolean; sampler: SamplerConfig | null }>({ open: false, sampler: null });

  const allowed = dal.samplers.allowedProteins();
  const { data: samplers, isLoading } = useQuery({ queryKey: ["samplers"], queryFn: () => dal.samplers.list() });

  const upsertMut = useMutation({
    mutationFn: (s: SamplerConfig) => {
      setSync("saving");
      return dal.samplers.upsert(s, actor).then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
    },
    onSuccess: () => { setDialog({ open: false, sampler: null }); qc.invalidateQueries({ queryKey: ["samplers"] }); },
  });

  if (isLoading || !samplers) return <p className="py-20 text-center text-zinc-500">Loading samplers…</p>;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Walk-In Samplers</h1>
          <p className="text-sm text-zinc-500">{samplers.length} sampler{samplers.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ open: true, sampler: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add sampler</button>
        </div>
      </header>

      <p className="mt-4 rounded-lg border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-sm font-semibold text-amber-400">
        Menu truth: samplers may only include the 5 approved proteins — {allowed.join(", ")}. The data layer rejects anything else.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {samplers.map(s => (
          <article key={s.id} className={`rounded-xl border border-ink-700 bg-ink-900 p-4 ${s.active ? "" : "opacity-60"}`}>
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-bold text-zinc-100">{s.name}</h2>
              <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                s.active ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                {s.active ? "ACTIVE" : "OFF"}
              </span>
            </div>
            <p className="mt-1 font-mono text-lg font-bold text-fire-light">{formatCents(s.priceCents)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {s.proteins.map(p => (
                <span key={p} className="rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs font-semibold text-zinc-300">{p}</span>
              ))}
              {s.proteins.length === 0 && <span className="text-xs text-zinc-600">No proteins selected.</span>}
            </div>
            <button onClick={() => setDialog({ open: true, sampler: s })}
              className="mt-3 min-h-[44px] w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-200">
              Edit sampler
            </button>
          </article>
        ))}
        {samplers.length === 0 && <p className="py-10 text-center text-zinc-500 sm:col-span-2">No samplers configured.</p>}
      </div>

      {dialog.open && (
        <SamplerDialog sampler={dialog.sampler} allowed={allowed}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialog({ open: false, sampler: null })}
          onSubmit={s => upsertMut.mutate(s)} />
      )}
    </div>
  );
}

function SamplerDialog({ sampler, allowed, onSubmit, onCancel, busy, error }: {
  sampler: SamplerConfig | null;
  allowed: string[];
  onSubmit: (s: SamplerConfig) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(sampler?.name ?? "");
  const [price, setPrice] = useState(sampler ? (sampler.priceCents / 100).toFixed(2) : "");
  const [proteins, setProteins] = useState<string[]>(sampler?.proteins ?? []);
  const [active, setActive] = useState(sampler?.active ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const toggleProtein = (p: string) =>
    setProteins(cur => cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p]);

  const submit = () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    const cents = dollarsToCents(price);
    if (cents === null) return setFormError("Price must be a valid non-negative dollar amount.");
    if (proteins.length === 0) return setFormError("Pick at least one protein.");
    onSubmit({ id: sampler?.id ?? "", name: name.trim(), priceCents: cents, proteins, active }); // empty id = create
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={sampler ? "Edit sampler" : "Add sampler"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">{sampler ? "Edit sampler" : "Add sampler"}</h3>
        {(formError || error) && (
          <p className="mt-2 rounded-lg border border-red-700/60 bg-red-950/60 px-3 py-2 text-sm font-semibold text-red-400" role="alert">
            {formError ?? error}
          </p>
        )}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <label className="col-span-2 block text-sm font-semibold text-zinc-400">Name
            <input value={name} onChange={e => setName(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Price ($)
            <input value={price} onChange={e => setPrice(e.target.value)} inputMode="decimal" placeholder="0.00" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <fieldset className="mt-3">
          <legend className="text-sm font-semibold text-zinc-400">Proteins (approved list only)</legend>
          <div className="mt-1 space-y-1.5">
            {allowed.map(p => (
              <label key={p} className="flex min-h-[44px] items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
                <input type="checkbox" checked={proteins.includes(p)} onChange={() => toggleProtein(p)} className="h-4 w-4" />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm font-semibold text-zinc-300">
          <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="h-4 w-4" />
          Active
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : sampler ? "Save changes" : "Add sampler"}
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
