import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { CreativeBrief } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import {
  KIND_CONFIG, getWorkspace, saveWorkspace, hasWork, checklistProgress,
  type BriefWorkspace, type ChecklistItem, type BriefKindKey,
} from "./_data/briefWorkspace";

/**
 * Marketing · Reusable Creative Brief Queue.
 *
 * Shared board used by Content Agent, Design Agent and Video Studio. Briefs
 * live in status columns (Queued → In review → Approved → Done) with add/edit
 * and one-tap advance. Every brief is real DAL data via
 * dal.marketing.briefs(kind) / upsertBrief.
 *
 * Opening a brief reveals a full creative workspace (module-local, persisted
 * per brief) that mirrors the Manus creative tools per kind: format /
 * platform / target date / owner, scroll-stop hook variations, a full script
 * (hook / body / CTA / on-screen text), a post caption + hashtags, a
 * production checklist, and art-direction notes — all editable, with copy
 * buttons for handing copy to whoever posts it.
 *
 * Real AI generation attaches in a later connector phase (called out
 * honestly); today this is a working plan-review-ship board.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type BriefStatus = CreativeBrief["status"];
type BriefKind = CreativeBrief["kind"];

const BRIEF_STATUSES: BriefStatus[] = ["queued", "in_review", "approved", "done"];
const BRIEF_META: Record<BriefStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-ink-700 text-zinc-300" },
  in_review: { label: "In review", cls: "bg-amber-600 text-white" },
  approved: { label: "Approved", cls: "bg-blue-600 text-white" },
  done: { label: "Done", cls: "bg-green-600 text-white" },
};
const NEXT_STATUS: Record<BriefStatus, BriefStatus> = {
  queued: "in_review",
  in_review: "approved",
  approved: "done",
  done: "queued",
};

export function BriefQueue({ kind, title, accent }: { kind: BriefKind; title: string; accent: string }) {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialog, setDialog] = useState<{ brief: CreativeBrief | null } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: briefs, isLoading } = useQuery({
    queryKey: ["marketing", "briefs", kind],
    queryFn: () => dal.marketing.briefs(kind),
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["marketing", "briefs", kind] });

  const saveMut = useMutation({
    mutationFn: (b: { id: string; title: string; brief: string; status: BriefStatus }) =>
      withSync(dal.marketing.upsertBrief({ ...b, kind }, actor)),
    onSuccess: () => { invalidate(); setDialog(null); },
  });
  const advanceMut = useMutation({
    mutationFn: (b: CreativeBrief) =>
      withSync(dal.marketing.upsertBrief({ id: b.id, kind, title: b.title, brief: b.brief, status: NEXT_STATUS[b.status] }, actor)),
    onSuccess: invalidate,
  });

  const list = briefs ?? [];
  const byStatus = useMemo(() => {
    const g = new Map<BriefStatus, CreativeBrief[]>(BRIEF_STATUSES.map(s => [s, []]));
    for (const b of list) g.get(b.status)?.push(b);
    return g;
  }, [list]);

  const openBrief = list.find(b => b.id === openId) ?? null;
  useEffect(() => { if (openId && !openBrief) setOpenId(null); }, [openId, openBrief]);

  return (
    <div className="mx-auto max-w-6xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">{title}</h1>
          <p className="text-sm text-zinc-500">
            {BRIEF_STATUSES.map(s => `${byStatus.get(s)?.length ?? 0} ${BRIEF_META[s].label.toLowerCase()}`).join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialog({ brief: null })}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New brief</button>
        </div>
      </header>

      <p role="note" className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
        AI generation attaches in a later connector phase &mdash; today this is a working creative desk: open any
        brief to plan hooks, script, caption, checklist and schedule, then ship it.
      </p>

      {isLoading ? <p className="py-16 text-center text-zinc-500">Loading briefs&hellip;</p> : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {BRIEF_STATUSES.map(status => {
            const cards = byStatus.get(status) ?? [];
            return (
              <section key={status} className="rounded-xl border border-ink-700 bg-ink-900 p-2.5">
                <h2 className="flex items-center justify-between px-1 pb-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  {BRIEF_META[status].label}
                  <span className="rounded-full bg-ink-800 px-2 py-0.5 text-zinc-300">{cards.length}</span>
                </h2>
                <ul className="space-y-2">
                  {cards.map(b => <BriefCard key={b.id} brief={b} accent={accent}
                    onOpen={() => setOpenId(b.id)}
                    onAdvance={() => advanceMut.mutate(b)} />)}
                  {cards.length === 0 && (
                    <li className="rounded-lg border border-dashed border-ink-700 py-6 text-center text-xs text-zinc-600">Empty</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {dialog && <BriefDialog brief={dialog.brief} title={title}
        busy={saveMut.isPending} error={saveMut.error?.message ?? null}
        onCancel={() => setDialog(null)}
        onSubmit={b => saveMut.mutate(b)} />}

      {openBrief && <BriefDrawer brief={openBrief} kind={kind} accent={accent}
        onClose={() => setOpenId(null)}
        onEdit={() => { setDialog({ brief: openBrief }); setOpenId(null); }}
        onAdvance={() => advanceMut.mutate(openBrief)} />}
    </div>
  );
}

function BriefCard({ brief: b, accent, onOpen, onAdvance }: {
  brief: CreativeBrief; accent: string; onOpen: () => void; onAdvance: () => void;
}) {
  const ws = getWorkspace(b.id);
  const prog = checklistProgress(ws);
  return (
    <li className="rounded-lg border border-ink-700 bg-ink-800 p-3">
      <button onClick={onOpen} className="w-full text-left" aria-label={`Open ${b.title}`}>
        <p className="font-semibold text-zinc-100">{b.title}</p>
        <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-xs text-zinc-400">{b.brief}</p>
        {(ws.format || ws.platform || ws.targetDate || prog.total > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-1">
            {ws.format && <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">{ws.format}</span>}
            {ws.platform && <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] text-zinc-400">{ws.platform}</span>}
            {ws.targetDate && <span className="rounded bg-ink-900 px-1.5 py-0.5 text-[10px] text-zinc-400">📅 {ws.targetDate.slice(5)}</span>}
            {prog.total > 0 && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${prog.done === prog.total ? "bg-green-600 text-white" : "bg-ink-900 text-zinc-300"}`}>
                ✓ {prog.done}/{prog.total}
              </span>
            )}
          </div>
        )}
      </button>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-zinc-600">{b.createdAt.slice(0, 10)}</span>
        <button onClick={onAdvance}
          className="min-h-[36px] rounded-md border border-ink-600 bg-ink-900 px-2.5 py-1 text-xs font-bold"
          style={{ color: accent }}
          aria-label={`Advance ${b.title} to ${BRIEF_META[NEXT_STATUS[b.status]].label}`}>
          {b.status === "done" ? "↺ Reopen" : `→ ${BRIEF_META[NEXT_STATUS[b.status]].label}`}
        </button>
      </div>
    </li>
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

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  if (!text.trim()) return null;
  return (
    <button type="button"
      onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
      className="rounded-md border border-ink-600 bg-ink-900 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:border-fire/50">
      {copied ? "Copied ✓" : label}
    </button>
  );
}

function BriefDialog({ brief, title, onSubmit, onCancel, busy, error }: {
  brief: CreativeBrief | null; title: string;
  onSubmit: (b: { id: string; title: string; brief: string; status: BriefStatus }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [t, setT] = useState(brief?.title ?? "");
  const [body, setBody] = useState(brief?.brief ?? "");
  const [status, setStatus] = useState<BriefStatus>(brief?.status ?? "queued");
  return (
    <div role="dialog" aria-modal="true" aria-label={brief ? "Edit brief" : `New ${title} brief`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({ id: brief?.id ?? "", title: t, brief: body, status }); }}>
        <h3 className="text-lg font-bold text-zinc-100">{brief ? "Edit brief" : `New ${title.toLowerCase()} brief`}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Title
          <input value={t} onChange={e => setT(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Brief
          <textarea value={body} onChange={e => setBody(e.target.value)} required rows={4}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Status
          <select value={status} onChange={e => setStatus(e.target.value as BriefStatus)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {BRIEF_STATUSES.map(s => <option key={s} value={s}>{BRIEF_META[s].label}</option>)}
          </select>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : brief ? "Save brief" : "Add brief"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ── Creative workspace drawer ──────────────────────────────────────────── */

const inputCls = "w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100";
const labelCls = "block text-xs font-semibold uppercase tracking-wide text-zinc-500";

function BriefDrawer({ brief, kind, accent, onClose, onEdit, onAdvance }: {
  brief: CreativeBrief; kind: BriefKind; accent: string;
  onClose: () => void; onEdit: () => void; onAdvance: () => void;
}) {
  const cfg = KIND_CONFIG[kind as BriefKindKey];
  const [ws, setWs] = useState<BriefWorkspace>(() => getWorkspace(brief.id));
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(getWorkspace(brief.id).updatedAt || null);

  const set = <K extends keyof BriefWorkspace>(k: K, v: BriefWorkspace[K]) => {
    setWs(prev => ({ ...prev, [k]: v }));
    setDirty(true);
  };

  const save = () => {
    const now = currentTime().toISOString();
    const stored = saveWorkspace(ws, now);
    setWs(stored);
    setSavedAt(stored.updatedAt);
    setDirty(false);
  };

  // hooks / on-screen text list helpers
  const addLine = (k: "hooks" | "onScreenText") => set(k, [...ws[k], ""]);
  const setLine = (k: "hooks" | "onScreenText", i: number, v: string) =>
    set(k, ws[k].map((x, idx) => (idx === i ? v : x)));
  const rmLine = (k: "hooks" | "onScreenText", i: number) =>
    set(k, ws[k].filter((_, idx) => idx !== i));

  // checklist helpers
  const addCheck = (text: string) => {
    if (!text.trim()) return;
    const item: ChecklistItem = { id: `c${Date.now()}${Math.random().toString(36).slice(2, 6)}`, text: text.trim(), done: false };
    set("checklist", [...ws.checklist, item]);
  };
  const toggleCheck = (id: string) =>
    set("checklist", ws.checklist.map(c => (c.id === id ? { ...c, done: !c.done } : c)));
  const rmCheck = (id: string) => set("checklist", ws.checklist.filter(c => c.id !== id));
  const loadTemplate = () => {
    const existing = new Set(ws.checklist.map(c => c.text.toLowerCase()));
    const added = cfg.checklistTemplate
      .filter(t => !existing.has(t.toLowerCase()))
      .map((t, i) => ({ id: `t${Date.now()}${i}`, text: t, done: false }));
    if (added.length) set("checklist", [...ws.checklist, ...added]);
  };

  const prog = checklistProgress(ws);
  const scriptFull = `HOOK:\n${ws.scriptHook}\n\nBODY:\n${ws.scriptBody}\n\nCTA:\n${ws.scriptCta}`;
  const captionFull = `${ws.caption}\n\n${ws.hashtags}`.trim();

  return (
    <div role="dialog" aria-modal="true" aria-label={`${brief.title} workspace`}
      className="fixed inset-0 z-50 flex justify-end bg-black/60">
      <div className="flex h-full w-full max-w-xl flex-col border-l border-ink-700 bg-ink-900">
        {/* header */}
        <div className="flex items-start justify-between gap-3 border-b border-ink-700 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold uppercase ${BRIEF_META[brief.status].cls}`}>
                {BRIEF_META[brief.status].label}
              </span>
              {hasWork(ws) && <span className="text-[11px] text-zinc-500">workspace saved {savedAt ? savedAt.slice(0, 10) : ""}</span>}
            </div>
            <h2 className="mt-1 truncate text-lg font-bold text-zinc-100">{brief.title}</h2>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-zinc-400">{brief.brief}</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="shrink-0 rounded-lg border border-ink-700 px-2.5 py-1.5 text-sm text-zinc-400 hover:text-zinc-100">✕</button>
        </div>

        {/* body */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {/* meta */}
          <section className="grid grid-cols-2 gap-3">
            <label className={labelCls}>Format
              <input list={`fmt-${kind}`} value={ws.format} onChange={e => set("format", e.target.value)}
                placeholder="Choose or type…" className={`mt-1 ${inputCls}`} />
              <datalist id={`fmt-${kind}`}>{cfg.formats.map(f => <option key={f} value={f} />)}</datalist>
            </label>
            <label className={labelCls}>Platform
              <input list={`plat-${kind}`} value={ws.platform} onChange={e => set("platform", e.target.value)}
                placeholder="Choose or type…" className={`mt-1 ${inputCls}`} />
              <datalist id={`plat-${kind}`}>{cfg.platforms.map(p => <option key={p} value={p} />)}</datalist>
            </label>
            <label className={labelCls}>Target date
              <input type="date" value={ws.targetDate} onChange={e => set("targetDate", e.target.value)}
                className={`mt-1 ${inputCls}`} />
            </label>
            <label className={labelCls}>Owner
              <input value={ws.owner} onChange={e => set("owner", e.target.value)}
                placeholder="Who's carrying it" className={`mt-1 ${inputCls}`} />
            </label>
          </section>

          {/* hooks */}
          {cfg.showHooks && (
            <Section title="Hook variations" accent={accent}
              action={<button type="button" onClick={() => addLine("hooks")} className="text-xs font-semibold text-fire-light">+ Add hook</button>}>
              {ws.hooks.length === 0 && <p className="text-xs text-zinc-600">Draft a few scroll-stopping openers, pick the winner.</p>}
              <ul className="space-y-2">
                {ws.hooks.map((h, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <textarea value={h} rows={2} onChange={e => setLine("hooks", i, e.target.value)}
                      placeholder={`Hook ${i + 1}`} className={inputCls} />
                    <div className="flex shrink-0 flex-col gap-1">
                      <CopyBtn text={h} />
                      <button type="button" onClick={() => rmLine("hooks", i)}
                        className="rounded-md border border-ink-600 px-2 py-1 text-[11px] text-red-400">✕</button>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* script */}
          {cfg.showScript && (
            <Section title="Script" accent={accent} action={<CopyBtn text={scriptFull} label="Copy script" />}>
              <label className="block text-[11px] font-semibold text-amber-400">HOOK (0–3s)
                <textarea value={ws.scriptHook} rows={2} onChange={e => set("scriptHook", e.target.value)} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="mt-2 block text-[11px] font-semibold text-blue-400">BODY
                <textarea value={ws.scriptBody} rows={4} onChange={e => set("scriptBody", e.target.value)} className={`mt-1 ${inputCls}`} />
              </label>
              <label className="mt-2 block text-[11px] font-semibold text-green-400">CTA (last 3s)
                <textarea value={ws.scriptCta} rows={2} onChange={e => set("scriptCta", e.target.value)} className={`mt-1 ${inputCls}`} />
              </label>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-yellow-400">On-screen text</p>
                <button type="button" onClick={() => addLine("onScreenText")} className="text-xs font-semibold text-fire-light">+ Add</button>
              </div>
              <ul className="mt-1 space-y-1.5">
                {ws.onScreenText.map((t, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <input value={t} onChange={e => setLine("onScreenText", i, e.target.value)}
                      placeholder="On-screen caption" className={inputCls} />
                    <button type="button" onClick={() => rmLine("onScreenText", i)}
                      className="rounded-md border border-ink-600 px-2 py-1 text-[11px] text-red-400">✕</button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* caption */}
          {cfg.showCaption && (
            <Section title="Caption" accent={accent} action={<CopyBtn text={captionFull} label="Copy caption" />}>
              <textarea value={ws.caption} rows={4} onChange={e => set("caption", e.target.value)}
                placeholder="Post caption…" className={inputCls} />
              <label className="mt-2 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Hashtags
                <textarea value={ws.hashtags} rows={2} onChange={e => set("hashtags", e.target.value)}
                  placeholder="#tampabbq #brisket …" className={`mt-1 ${inputCls}`} />
              </label>
            </Section>
          )}

          {/* checklist */}
          <Section title={`Production checklist${prog.total ? ` · ${prog.done}/${prog.total}` : ""}`} accent={accent}
            action={<button type="button" onClick={loadTemplate} className="text-xs font-semibold text-fire-light">Load default</button>}>
            {prog.total > 0 && (
              <div className="mb-2 h-2 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full bg-green-600" style={{ width: `${(prog.done / prog.total) * 100}%` }} />
              </div>
            )}
            <ul className="space-y-1.5">
              {ws.checklist.map(c => (
                <li key={c.id} className="flex items-center gap-2">
                  <button type="button" onClick={() => toggleCheck(c.id)}
                    aria-label={c.done ? `Mark ${c.text} incomplete` : `Mark ${c.text} done`}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${c.done ? "border-green-600 bg-green-600 text-white" : "border-ink-600"}`}>
                    {c.done ? "✓" : ""}
                  </button>
                  <span className={`flex-1 text-sm ${c.done ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{c.text}</span>
                  <button type="button" onClick={() => rmCheck(c.id)}
                    className="rounded-md border border-ink-600 px-1.5 py-0.5 text-[11px] text-red-400">✕</button>
                </li>
              ))}
            </ul>
            <ChecklistAdd onAdd={addCheck} />
          </Section>

          {/* notes */}
          <Section title="Notes / art direction" accent={accent}>
            <textarea value={ws.notes} rows={3} onChange={e => set("notes", e.target.value)}
              placeholder="References, tone, must-haves…" className={inputCls} />
          </Section>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between gap-2 border-t border-ink-700 p-4">
          <div className="flex gap-2">
            <button onClick={onEdit}
              className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold text-zinc-300">Edit brief</button>
            <button onClick={onAdvance}
              className="min-h-[44px] rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 text-sm font-bold"
              style={{ color: accent }}>
              {brief.status === "done" ? "↺ Reopen" : `→ ${BRIEF_META[NEXT_STATUS[brief.status]].label}`}
            </button>
          </div>
          <button onClick={save} disabled={!dirty}
            className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-40">
            {dirty ? "Save workspace" : "Saved"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, accent, action, children }: {
  title: string; accent: string; action?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-ink-700 bg-ink-800/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: accent }}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ChecklistAdd({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <form className="mt-2 flex gap-2"
      onSubmit={e => { e.preventDefault(); onAdd(text); setText(""); }}>
      <input value={text} onChange={e => setText(e.target.value)} placeholder="Add a step…"
        className={inputCls} aria-label="Add checklist step" />
      <button type="submit" className="rounded-lg border border-ink-600 bg-ink-900 px-3 py-2 text-sm font-semibold text-zinc-300">Add</button>
    </form>
  );
}
