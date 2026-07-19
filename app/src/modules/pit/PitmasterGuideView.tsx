import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { GuideStep, PitmasterProtein } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { SMOKE_GUIDE, SAFETY_RULES, TROUBLESHOOTING, yieldTone, type SmokeGuideRow } from "./_data/pitReference";
import { TempLogPanel } from "./_data/TempLogPanel";

/**
 * Pit · Pitmaster Guide — deepened to Manus parity.
 * Protein chips select a guide; a Season / Smoke / Reheat tab switcher shows
 * the matching house spec. The Smoke tab shows the canonical smoke-guide card
 * (smoker/internal temp, cook time, yield, wood, rest, notes) plus the DAL
 * ordered step editor and a live temp-log session panel. Season shows the rub
 * + prep notes; Reheat shows safe-reheat targets. A food-safety cheat sheet
 * and a pitmaster Q&A round out the reference.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type GuideType = "season" | "smoke" | "reheat";

interface StepDialogState { step: GuideStep | null; }

const GUIDE_META: Record<GuideType, { label: string; icon: string }> = {
  season: { label: "Season", icon: "🧂" },
  smoke: { label: "Smoke", icon: "🔥" },
  reheat: { label: "Reheat", icon: "🌡" },
};

/** Match a DAL protein to a static smoke-guide row by slug or name prefix. */
function guideRowFor(p: PitmasterProtein): SmokeGuideRow | undefined {
  return (
    SMOKE_GUIDE.find(g => g.slug === p.slug) ??
    SMOKE_GUIDE.find(g => p.name.toLowerCase().startsWith(g.name.toLowerCase().split(" (")[0])) ??
    SMOKE_GUIDE.find(g => g.name.toLowerCase().split(" ")[0] === p.name.toLowerCase().split(" ")[0])
  );
}

export function PitmasterGuideView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [guideType, setGuideType] = useState<GuideType>("smoke");
  const [dialog, setDialog] = useState<StepDialogState | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const proteinsQ = useQuery({
    queryKey: ["pit", "pitmaster", "proteins"],
    queryFn: () => dal.pitmaster.proteins(),
  });

  const proteins = proteinsQ.data ?? [];
  const selected: PitmasterProtein | undefined =
    proteins.find(p => p.id === selectedId) ?? proteins[0];
  const guideRow = selected ? guideRowFor(selected) : undefined;

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
          <p className="text-sm text-zinc-500">Step-by-step season, smoke &amp; reheat guides for every protein</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      {/* ── Protein chips ─────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Proteins">
        {proteins.map(p => {
          const active = selected?.id === p.id;
          const g = guideRowFor(p);
          return (
            <button key={p.id} role="tab" aria-selected={active}
              onClick={() => { setSelectedId(p.id); setConfirmRemove(null); }}
              className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-bold transition-colors ${
                active ? "border-fire bg-fire text-white" : "border-ink-700 bg-ink-800 text-zinc-300"
              }`}>
              {g ? `${g.emoji} ` : ""}{p.name}
            </button>
          );
        })}
      </div>

      {!selected && <p className="mt-8 text-center text-sm text-zinc-500">No proteins in the guide yet.</p>}

      {selected && (
        <>
          {/* ── Guide-type tabs ───────────────────────────────────────── */}
          <div className="mt-5 grid grid-cols-3 gap-2" role="tablist" aria-label="Guide type">
            {(Object.keys(GUIDE_META) as GuideType[]).map(t => {
              const active = guideType === t;
              return (
                <button key={t} role="tab" aria-selected={active} onClick={() => setGuideType(t)}
                  className={`min-h-[52px] rounded-xl border text-sm font-bold transition-colors ${
                    active ? "border-fire bg-fire/15 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"
                  }`}>
                  <span className="mr-1">{GUIDE_META[t].icon}</span>{GUIDE_META[t].label}
                </button>
              );
            })}
          </div>

          {/* ── SMOKE tab ─────────────────────────────────────────────── */}
          {guideType === "smoke" && (
            <>
              {guideRow ? (
                <div className="mt-5 rounded-2xl border border-ink-700 bg-ink-900 p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Spec label="Smoker temp" value={guideRow.smokerTemp} accent />
                    <Spec label="Target internal" value={guideRow.internalTemp} />
                    <Spec label="Cook time" value={guideRow.cookTime} />
                    <Spec label="Yield target" value={`${guideRow.yieldPct}%`} tone={yieldTone(guideRow.yieldPct)} />
                    <Spec label="Wood" value={guideRow.wood} />
                    <Spec label="Rest" value={guideRow.restTime} />
                  </div>
                  <p className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
                    <span className="font-bold">Pitmaster notes · {guideRow.smoker}:</span> {guideRow.notes}
                  </p>
                </div>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Spec label="Target internal" value={`${selected.targetInternalF}°F`} />
                  <Spec label="Smoker temp" value={`${selected.smokerTempF}°F`} accent />
                  <Spec label="Est hrs / lb" value={selected.estHoursPerLb > 0 ? String(selected.estHoursPerLb) : "—"} />
                  <Spec label="Rest" value={`${selected.restMin} min`} />
                  <Spec label="Woods" value={selected.woods} />
                </div>
              )}

              {/* Ordered steps (DAL-editable) */}
              <StepEditor
                steps={steps} selected={selected}
                confirmRemove={confirmRemove} setConfirmRemove={setConfirmRemove}
                removePending={removeMut.isPending}
                onRemove={(stepId) => removeMut.mutate({ proteinId: selected.id, stepId })}
                onAdd={() => { upsertMut.reset(); setDialog({ step: null }); }}
                onEdit={(s) => { upsertMut.reset(); setDialog({ step: s }); }}
              />

              {/* Live temp log */}
              <TempLogPanel
                proteinSlug={selected.slug}
                proteinName={selected.name}
                defaultPitF={selected.smokerTempF}
                defaultInternalF={selected.targetInternalF}
                defaultWood={selected.woods}
              />
            </>
          )}

          {/* ── SEASON tab ────────────────────────────────────────────── */}
          {guideType === "season" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Rub &amp; season</h3>
                <p className="mt-2 text-sm text-zinc-300">
                  {seasonNoteFor(selected.name)}
                </p>
                <p className="mt-2 text-xs text-zinc-500">
                  Trim to spec, apply a light binder (mustard or oil), then house rub. Whole muscle
                  (brisket, butt, belly) is best seasoned the night before and held cold overnight.
                </p>
              </div>
              <StepEditor
                steps={steps} selected={selected} heading="Prep steps"
                confirmRemove={confirmRemove} setConfirmRemove={setConfirmRemove}
                removePending={removeMut.isPending}
                onRemove={(stepId) => removeMut.mutate({ proteinId: selected.id, stepId })}
                onAdd={() => { upsertMut.reset(); setDialog({ step: null }); }}
                onEdit={(s) => { upsertMut.reset(); setDialog({ step: s }); }}
              />
            </div>
          )}

          {/* ── REHEAT tab ────────────────────────────────────────────── */}
          {guideType === "reheat" && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Spec label="Reheat oven" value="275°F" accent />
                <Spec label="Safe internal" value="165°F" tone="ok" />
                <Spec label="Hold at" value="≥ 135°F" />
              </div>
              <div className="rounded-2xl border border-ink-700 bg-ink-900 p-4 text-sm text-zinc-300">
                <p className="font-bold text-zinc-100">Reheat {selected.name} safely</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-400">
                  <li>Reheat in a 275°F oven wrapped with a splash of stock or tallow to keep it moist.</li>
                  <li>Bring to <span className="font-semibold text-green-400">165°F internal</span> before service — verify with a probe, not by feel.</li>
                  <li>Once up to temp, hold at <span className="font-semibold text-amber-300">≥ 135°F</span>. Discard anything held below that for over 4 hours.</li>
                  <li>Never reheat more than once. Portion first, reheat to order.</li>
                </ul>
              </div>
            </div>
          )}

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

      {/* ── Food-safety cheat sheet ───────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Food-safety cheat sheet</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SAFETY_RULES.map(r => (
            <div key={r.label} className={`rounded-xl border p-3 ${
              r.tone === "danger" ? "border-red-800/50 bg-red-950/20"
              : r.tone === "warn" ? "border-amber-800/40 bg-amber-950/15"
              : "border-ink-700 bg-ink-900"
            }`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${
                r.tone === "danger" ? "text-red-400" : r.tone === "warn" ? "text-amber-300" : "text-zinc-400"
              }`}>{r.label}</p>
              <p className="mt-0.5 text-sm font-semibold text-zinc-200">{r.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Troubleshooting Q&A ───────────────────────────────────────── */}
      <section className="mt-8 pb-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Pitmaster Q&amp;A</h2>
        <div className="mt-3 space-y-2">
          {TROUBLESHOOTING.map(t => <QA key={t.q} q={t.q} a={t.a} />)}
        </div>
      </section>
    </div>
  );
}

function seasonNoteFor(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("brisket")) return "Salt & coarse pepper 50/50 (Dalmatian rub), then a light layer of house rub. Trim fat cap to 1/4\" and square the edges.";
  if (n.includes("pork")) return "Mustard binder, then house pork rub applied heavy. Season the night before for whole butts.";
  if (n.includes("rib")) return "Remove the membrane, trim the flap. Light binder then rib rub — not too heavy, ribs are thin.";
  if (n.includes("chicken")) return "Dry brine with salt, then house rub under and over the skin for crispy, seasoned bites.";
  if (n.includes("oxtail")) return "Mojo marinade overnight, then house rub before it hits the smoke.";
  return "Apply a light binder, then house rub evenly. Season whole-muscle cuts the night before.";
}

function StepEditor({ steps, selected, heading = "Steps", confirmRemove, setConfirmRemove, removePending, onRemove, onAdd, onEdit }: {
  steps: GuideStep[];
  selected: PitmasterProtein;
  heading?: string;
  confirmRemove: string | null;
  setConfirmRemove: (v: string | null) => void;
  removePending: boolean;
  onRemove: (stepId: string) => void;
  onAdd: () => void;
  onEdit: (s: GuideStep) => void;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">{heading}</h2>
        <button onClick={onAdd} className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">
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
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fire text-sm font-black text-white">{s.order}</span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-zinc-100">{s.title}</p>
              <p className="mt-0.5 text-sm text-zinc-400">{s.detail}</p>
              {(s.tempF !== null || s.durationMin !== null) && (
                <p className="mt-2 flex flex-wrap gap-2">
                  {s.tempF !== null && <span className="rounded-full bg-fire/15 px-2 py-0.5 text-xs font-bold text-fire-light">🌡 {s.tempF}°F</span>}
                  {s.durationMin !== null && <span className="rounded-full bg-ink-800 px-2 py-0.5 text-xs font-bold text-zinc-300">⏱ {s.durationMin} min</span>}
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
              <button onClick={() => onEdit(s)}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-semibold text-zinc-300"
                aria-label={`Edit step ${s.order}: ${s.title}`}>Edit</button>
              {confirmRemove === s.id ? (
                <button onClick={() => onRemove(s.id)} disabled={removePending}
                  className="min-h-[44px] rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                  aria-label={`Confirm remove step ${s.title}`}>Confirm?</button>
              ) : (
                <button onClick={() => setConfirmRemove(s.id)}
                  className="min-h-[44px] min-w-[44px] rounded-lg border border-red-900/60 bg-ink-800 px-3 py-2 text-xs font-semibold text-red-400"
                  aria-label={`Remove step ${s.title}`}>Remove</button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <p className="sr-only">{selected.name} steps</p>
    </section>
  );
}

function QA({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold text-zinc-200">{q}</span>
        <span className="shrink-0 text-zinc-500">{open ? "−" : "+"}</span>
      </button>
      {open && <p className="border-t border-ink-800 px-4 py-3 text-sm text-zinc-400">{a}</p>}
    </div>
  );
}

function Spec({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "ok" | "warn" | "bad" }) {
  const valueCls = tone === "ok" ? "text-green-400" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-400" : accent ? "text-fire-light" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-lg font-black ${valueCls}`} title={value}>{value}</p>
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
