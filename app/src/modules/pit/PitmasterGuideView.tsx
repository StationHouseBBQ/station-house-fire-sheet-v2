import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { GuideStep, PitmasterProtein } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Pit · Pitmaster Guide — V2 of the Manus PitmasterGuide page.
 * Protein chips select a guide; spec header shows target internal °F,
 * smoker °F, est hrs/lb, rest minutes and woods; ordered step cards with
 * add/edit dialogs (upsertStep) and two-tap remove (removeStep).
 */

type Sync = "idle" | "saving" | "saved" | "error";

interface StepDialogState {
  step: GuideStep | null; // null = add
}

export function PitmasterGuideView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<StepDialogState | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const proteinsQ = useQuery({
    queryKey: ["pit", "pitmaster", "proteins"],
    queryFn: () => dal.pitmaster.proteins(),
  });

  const proteins = proteinsQ.data ?? [];
  const selected: PitmasterProtein | undefined =
    proteins.find(p => p.id === selectedId) ?? proteins[0];

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["pit", "pitmaster", "proteins"] });

  const upsertMut = useMutation({
    mutationFn: (input: { proteinId: string; step: Omit<GuideStep, "id"> & { id?: string } }) =>
      withSync(dal.pitmaster.upsertStep(input.proteinId, input.step, actor)),
    onSuccess: () => { invalidate(); setDialog(null); },
  });
  const removeMut = useMutation({
    mutationFn: (input: { proteinId: string; stepId: string }) =>
      withSync(dal.pitmaster.removeStep(input.proteinId, input.stepId, actor)),
    onSuccess: () => { invalidate(); setConfirmRemove(null); },
  });

  const steps = useMemo(
    () => [...(selected?.steps ?? [])].sort((a, b) => a.order - b.order),
    [selected],
  );

  if (proteinsQ.isLoading) return <p className="py-20 text-center text-zinc-500">Loading pitmaster guide…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Pitmaster Guide</h1>
          <p className="text-sm text-zinc-500">House specs and step-by-step cooks per protein</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* ── Protein chips ─────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Proteins">
        {proteins.map(p => {
          const active = selected?.id === p.id;
          return (
            <button key={p.id} role="tab" aria-selected={active}
              onClick={() => { setSelectedId(p.id); setConfirmRemove(null); }}
              className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                active ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-300"
              }`}>
              {p.name}
            </button>
          );
        })}
      </div>

      {!selected && <p className="mt-8 text-center text-sm text-zinc-500">No proteins in the guide yet.</p>}

      {selected && (
        <>
          {/* ── Spec header ───────────────────────────────────────────── */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Spec label="Target internal" value={`${selected.targetInternalF}°F`} />
            <Spec label="Smoker temp" value={`${selected.smokerTempF}°F`} />
            <Spec label="Est hrs / lb" value={selected.estHoursPerLb > 0 ? String(selected.estHoursPerLb) : "—"} />
            <Spec label="Rest" value={`${selected.restMin} min`} />
            <Spec label="Woods" value={selected.woods} />
          </div>

          {/* ── Steps ─────────────────────────────────────────────────── */}
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Steps</h2>
              <button
                onClick={() => { upsertMut.reset(); setDialog({ step: null }); }}
                className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">
                + Add step
              </button>
            </div>

            {steps.length === 0 && (
              <p className="mt-3 rounded-xl border border-dashed border-ink-700 bg-ink-900 p-6 text-center text-sm text-zinc-500">
                No steps yet — add the first one.
              </p>
            )}

            <ol className="mt-3 space-y-3">
              {steps.map(s => (
                <li key={s.id} className="flex gap-3 rounded-xl border border-ink-700 bg-ink-900 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fire text-sm font-black text-white">
                    {s.order}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-zinc-100">{s.title}</p>
                    <p className="mt-0.5 text-sm text-zinc-400">{s.detail}</p>
                    {(s.tempF !== null || s.durationMin !== null) && (
                      <p className="mt-2 flex flex-wrap gap-2">
                        {s.tempF !== null && (
                          <span className="rounded-full bg-fire/15 px-2 py-0.5 text-xs font-bold text-fire-light">🌡 {s.tempF}°F</span>
                        )}
                        {s.durationMin !== null && (
                          <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-bold text-zinc-300">⏱ {s.durationMin} min</span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <button
                      onClick={() => { upsertMut.reset(); setDialog({ step: s }); }}
                      className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300"
                      aria-label={`Edit step ${s.order}: ${s.title}`}>
                      Edit
                    </button>
                    {confirmRemove === s.id ? (
                      <button
                        onClick={() => removeMut.mutate({ proteinId: selected.id, stepId: s.id })}
                        disabled={removeMut.isPending}
                        className="min-h-[44px] rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                        aria-label={`Confirm remove step ${s.title}`}>
                        Confirm?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmRemove(s.id)}
                        className="min-h-[44px] min-w-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-3 py-2 text-xs font-semibold text-red-400"
                        aria-label={`Remove step ${s.title}`}>
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {dialog && (
            <StepDialog
              key={dialog.step?.id ?? "new"}
              proteinName={selected.name}
              step={dialog.step}
              nextOrder={steps.length ? Math.max(...steps.map(s => s.order)) + 1 : 1}
              busy={upsertMut.isPending}
              error={upsertMut.error?.message ?? null}
              onCancel={() => setDialog(null)}
              onSubmit={step => upsertMut.mutate({ proteinId: selected.id, step })}
            />
          )}
        </>
      )}
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 truncate text-lg font-black text-zinc-100" title={value}>{value}</p>
    </div>
  );
}

function StepDialog({ proteinName, step, nextOrder, busy, error, onSubmit, onCancel }: {
  proteinName: string;
  step: GuideStep | null;
  nextOrder: number;
  busy: boolean;
  error: string | null;
  onSubmit: (s: Omit<GuideStep, "id"> & { id?: string }) => void;
  onCancel: () => void;
}) {
  const [order, setOrder] = useState(step ? String(step.order) : String(nextOrder));
  const [title, setTitle] = useState(step?.title ?? "");
  const [detail, setDetail] = useState(step?.detail ?? "");
  const [tempF, setTempF] = useState(step?.tempF !== null && step?.tempF !== undefined ? String(step.tempF) : "");
  const [durationMin, setDurationMin] = useState(step?.durationMin !== null && step?.durationMin !== undefined ? String(step.durationMin) : "");
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const o = Number(order);
    if (!Number.isFinite(o) || o < 1) return setClientError("Order must be a positive number");
    if (!title.trim()) return setClientError("Title is required");
    if (!detail.trim()) return setClientError("Detail is required");
    const t = tempF.trim() === "" ? null : Number(tempF);
    if (t !== null && !Number.isFinite(t)) return setClientError("Temp must be a number (or blank)");
    const d = durationMin.trim() === "" ? null : Number(durationMin);
    if (d !== null && (!Number.isFinite(d) || d < 0)) return setClientError("Duration must be a non-negative number (or blank)");
    setClientError(null);
    onSubmit({ id: step?.id, order: Math.round(o), title: title.trim(), detail: detail.trim(), tempF: t, durationMin: d });
  };

  const shown = clientError ?? error;

  return (
    <div role="dialog" aria-modal="true" aria-label={step ? "Edit step" : "Add step"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5">
        <h3 className="text-lg font-bold text-zinc-100">{step ? "Edit step" : "Add step"} · {proteinName}</h3>
        {shown && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{shown}</p>}

        <div className="mt-4 grid grid-cols-4 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Order
            <input inputMode="numeric" value={order} onChange={e => setOrder(e.target.value)} required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="col-span-3 block text-sm font-semibold text-zinc-400">Title
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="e.g. Wrap"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>

        <label className="mt-3 block text-sm font-semibold text-zinc-400">Detail
          <textarea value={detail} onChange={e => setDetail(e.target.value)} required rows={3}
            placeholder="What to do and what to look for"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Temp °F (optional)
            <input inputMode="numeric" value={tempF} onChange={e => setTempF(e.target.value)} placeholder="e.g. 250"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Duration min (optional)
            <input inputMode="numeric" value={durationMin} onChange={e => setDurationMin(e.target.value)} placeholder="e.g. 60"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : step ? "Save step" : "Add step"}
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
