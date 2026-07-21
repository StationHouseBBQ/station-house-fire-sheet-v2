import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { KdsStage, KdsTicket } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { etParts } from "../../lib/time";
import { currentTime } from "../../lib/clock";
import { usePersistentState } from "./_data/localState";

/**
 * Kitchen · Expo KDS — V2 implementation of the Manus ExpoKDS.
 * Three lanes (Kitchen / Expo / Ready) plus a collapsed "Handed off" count.
 * Kitchen lane checks kitchen boxes → Bump to Expo; Expo lane checks expo
 * boxes → Mark Ready; Ready lane → Hand Off. All-day totals panel.
 *
 * Parity additions over the lean version:
 *  - Station focus toggle (All / Kitchen / Expo) like Manus's station picker
 *  - Live age timer per ticket (since fired) + due-window countdown, colored
 *    by urgency (green / amber / red / late) — re-ticks every 20s
 *  - Sort by urgency; "late" ring on overdue tickets
 *  - Sound-on-new-late toggle (browser beep) so expo hears escalations
 */

type Sync = "idle" | "saving" | "saved" | "error";
type Focus = "all" | "kitchen" | "expo";

const LANES: Array<{ stage: KdsStage; title: string; hint: string; accent: string }> = [
  { stage: "kitchen", title: "Kitchen", hint: "Check items as cooked, then bump", accent: "border-orange-500/40 text-orange-300" },
  { stage: "expo", title: "Expo", hint: "Check items as packed", accent: "border-blue-500/40 text-blue-300" },
  { stage: "ready", title: "Ready", hint: "Waiting on pickup / handoff", accent: "border-green-500/40 text-green-300" },
];

const ADVANCE: Partial<Record<KdsStage, { to: KdsStage; label: string }>> = {
  kitchen: { to: "expo", label: "⬆ Bump to Expo" },
  expo: { to: "ready", label: "✅ Mark Ready" },
  ready: { to: "handed_off", label: "🤝 Hand Off" },
};

/** One-tap back-step targets for lanes that can move a ticket back. */
const BACK: Partial<Record<KdsStage, KdsStage>> = { expo: "kitchen", ready: "expo" };

const STAGE_LABEL: Record<KdsStage, string> = {
  kitchen: "Kitchen", expo: "Expo", ready: "Ready", handed_off: "Handed off",
};

function todayEt(): string {
  const p = etParts(currentTime());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Minutes since the ticket was fired (business clock aware). */
function ageMinutes(firedAt: string): number {
  const ms = currentTime().getTime() - new Date(firedAt).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/** Parse a leading "1:30 PM" style start time from a window like "1:30–2:00 PM". */
function windowStartMinutes(win: string): number | null {
  const m = win.match(/(\d{1,2}):(\d{2})\s*([ap]m)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const mer = (m[3] ?? "").toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  const p = etParts(currentTime());
  const nowMin = p.hour * 60 + p.minute;
  return h * 60 + min - nowMin; // minutes until the window start (negative = past)
}

/** Urgency from age + due countdown. */
function urgency(t: KdsTicket): { level: "ok" | "warn" | "late"; ageLabel: string; dueLabel: string | null } {
  const age = ageMinutes(t.firedAt);
  const ageLabel = age < 60 ? `${age}m` : `${Math.floor(age / 60)}h ${age % 60}m`;
  const due = windowStartMinutes(t.timeWindow);
  let dueLabel: string | null = null;
  let level: "ok" | "warn" | "late" = "ok";
  if (due != null) {
    if (due < 0) { dueLabel = `${Math.abs(due)}m late`; level = "late"; }
    else if (due <= 15) { dueLabel = `${due}m`; level = "warn"; }
    else if (due < 120) { dueLabel = `${due}m`; }
    else { dueLabel = `${Math.floor(due / 60)}h ${due % 60}m`; }
  }
  // Age escalation independent of due time.
  if (level === "ok" && age >= 25) level = "late";
  else if (level === "ok" && age >= 12) level = "warn";
  return { level, ageLabel, dueLabel };
}

const LEVEL_CLS: Record<"ok" | "warn" | "late", { ring: string; text: string }> = {
  ok: { ring: "border-ink-700", text: "text-green-400" },
  warn: { ring: "border-amber-600/60", text: "text-amber-400" },
  late: { ring: "border-red-600/70", text: "text-red-400" },
};

export function ExpoKds() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const undo = useUndo();
  const today = todayEt();
  const [sync, setSync] = useState<Sync>("idle");
  const [focus, setFocus] = usePersistentState<Focus>("kds.focus.v1", "all");
  const [sound, setSound] = usePersistentState<boolean>("kds.sound.v1", false);

  // Live tick so age/countdown labels update without a refetch.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 20_000);
    return () => clearInterval(id);
  }, []);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["kds", "tickets", today],
    queryFn: () => dal.kds.tickets(today),
    refetchInterval: 15_000,
  });
  const { data: totals = [] } = useQuery({
    queryKey: ["kds", "totals", today],
    queryFn: () => dal.kds.allDayTotals(today),
    refetchInterval: 15_000,
  });

  // Escalation beep when the number of late tickets rises.
  const lateCount = tickets.filter(t => t.stage !== "handed_off" && urgency(t).level === "late").length;
  const [prevLate, setPrevLate] = useState(0);
  useEffect(() => {
    if (sound && lateCount > prevLate) beep();
    setPrevLate(lateCount);
  }, [lateCount, sound, prevLate]);

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };
  const invalidate = () => qc.invalidateQueries({ queryKey: ["kds"] });

  const checkMut = useMutation({
    mutationFn: ({ ticketId, itemId, lane }: { ticketId: string; itemId: string; lane: "kitchen" | "expo" }) =>
      withSync(dal.kds.toggleItemCheck(ticketId, itemId, lane, actor)),
    onSuccess: invalidate,
  });
  const advanceMut = useMutation({
    mutationFn: ({ ticketId, to }: { ticketId: string; to: KdsStage; from?: KdsStage; orderRef?: string }) =>
      withSync(dal.kds.advance(ticketId, to, actor)),
    onSuccess: (_ticket, { ticketId, to, from, orderRef }) => {
      void invalidate();
      if (from && orderRef && from !== to) {
        undo.offer(`${orderRef} → ${STAGE_LABEL[to]}`, async () => {
          await withSync(dal.kds.advance(ticketId, from, actor));
          await invalidate();
        });
      }
    },
  });

  const byStage = useMemo(() => {
    const m: Record<KdsStage, KdsTicket[]> = { kitchen: [], expo: [], ready: [], handed_off: [] };
    for (const t of tickets) m[t.stage].push(t);
    // Sort each lane by urgency then window.
    const rank = { late: 0, warn: 1, ok: 2 } as const;
    for (const k of Object.keys(m) as KdsStage[]) {
      m[k].sort((a, b) => rank[urgency(a).level] - rank[urgency(b).level] || a.timeWindow.localeCompare(b.timeWindow));
    }
    return m;
  }, [tickets]);

  const visibleLanes = focus === "all" ? LANES : LANES.filter(l => (focus === "kitchen" ? l.stage === "kitchen" : l.stage !== "kitchen"));

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading KDS…</p>;

  return (
    <div className="pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Expo KDS</h1>
          <p className="text-sm text-zinc-500">
            {today} · {tickets.length} ticket{tickets.length !== 1 ? "s" : ""} ·{" "}
            <span className="text-zinc-400">✓ Handed off: {byStage.handed_off.length}</span>
            {lateCount > 0 && <span className="ml-1 font-bold text-red-400">· 🔴 {lateCount} late</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-lg border border-ink-700 text-xs" role="group" aria-label="Station focus">
            {(["all", "kitchen", "expo"] as Focus[]).map(f => (
              <button key={f} onClick={() => setFocus(f)}
                className={`min-h-[40px] px-3 py-1.5 font-bold capitalize first:rounded-l-lg last:rounded-r-lg ${focus === f ? "bg-fire text-white" : "text-zinc-400"}`}>
                {f === "all" ? "All lanes" : f}
              </button>
            ))}
          </div>
          <button onClick={() => setSound(s => !s)} aria-pressed={sound}
            className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-xs font-bold ${sound ? "border-fire/50 bg-fire/10 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-400"}`}>
            {sound ? "🔔 Alerts on" : "🔕 Alerts off"}
          </button>
          <SyncBadge sync={sync} />
        </div>
      </header>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_16rem]">
        <div className={`grid gap-3 ${focus === "all" ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
          {visibleLanes.map(lane => {
            const back = BACK[lane.stage];
            return (
            <section key={lane.stage} className="rounded-xl border border-ink-700 bg-ink-950/60 p-2">
              <header className={`rounded-lg border bg-ink-900 px-3 py-2 ${lane.accent}`}>
                <p className="text-sm font-black uppercase tracking-wider">
                  {lane.title} <span className="font-normal opacity-80">({byStage[lane.stage].length})</span>
                </p>
                <p className="text-[11px] font-normal text-zinc-500">{lane.hint}</p>
              </header>
              <div className="mt-2 space-y-2">
                {byStage[lane.stage].length === 0 && (
                  <p className="py-8 text-center text-xs text-zinc-600">No tickets</p>
                )}
                {byStage[lane.stage].map(t => (
                  <TicketCard key={t.id} ticket={t}
                    lane={lane.stage === "kitchen" ? "kitchen" : "expo"}
                    checksEnabled={lane.stage !== "ready"}
                    onToggle={(itemId, checkLane) => checkMut.mutate({ ticketId: t.id, itemId, lane: checkLane })}
                    onAdvance={() => {
                      const a = ADVANCE[lane.stage];
                      if (a) advanceMut.mutate({ ticketId: t.id, to: a.to, from: lane.stage, orderRef: t.orderRef });
                    }}
                    onBack={back ? () => advanceMut.mutate({ ticketId: t.id, to: back }) : undefined}
                    advanceLabel={ADVANCE[lane.stage]?.label ?? ""}
                    busy={advanceMut.isPending} />
                ))}
              </div>
            </section>
            );
          })}
        </div>

        {/* All-day totals */}
        <aside className="h-fit rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-fire-light">All-day totals</h2>
          <p className="text-xs text-zinc-500">Kitchen-checked progress</p>
          {totals.length === 0 ? (
            <p className="py-6 text-center text-xs text-zinc-600">Nothing fired today</p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {totals.map(t => {
                const pct = t.total ? Math.round((t.checked / t.total) * 100) : 0;
                return (
                  <li key={`${t.name}|${t.unit}`}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-zinc-300">{t.name}</span>
                      <span className={`shrink-0 font-bold ${pct === 100 ? "text-green-400" : "text-zinc-100"}`}>
                        {t.checked}/{t.total} {t.unit}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-800">
                      <div className={`h-full transition-all ${pct === 100 ? "bg-green-500" : "bg-fire"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function TicketCard({ ticket, lane, checksEnabled, onToggle, onAdvance, onBack, advanceLabel, busy }: {
  ticket: KdsTicket;
  lane: "kitchen" | "expo";
  checksEnabled: boolean;
  onToggle: (itemId: string, lane: "kitchen" | "expo") => void;
  onAdvance: () => void;
  onBack?: () => void;
  advanceLabel: string;
  busy: boolean;
}) {
  const allChecked = ticket.items.every(i => (lane === "kitchen" ? i.kitchenChecked : i.expoChecked));
  const checked = ticket.items.filter(i => (lane === "kitchen" ? i.kitchenChecked : i.expoChecked)).length;
  const u = urgency(ticket);
  const lv = LEVEL_CLS[u.level];
  return (
    <article className={`rounded-lg border-l-4 border bg-ink-900 p-3 ${lv.ring} ${u.level === "late" ? "border-l-red-500" : u.level === "warn" ? "border-l-amber-500" : "border-l-green-500"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-zinc-100">{ticket.customer}</p>
          <p className="text-xs text-zinc-500"><span className="font-mono">{ticket.orderRef}</span> · {ticket.timeWindow}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-xs font-black ${lv.text}`}>⏱ {u.ageLabel}</p>
          {u.dueLabel && <p className={`text-[10px] font-bold ${u.level === "late" ? "text-red-400" : "text-zinc-500"}`}>
            {u.level === "late" ? "🔴 " : ""}{u.dueLabel}</p>}
        </div>
      </div>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-zinc-600">
        {checked}/{ticket.items.length} {lane === "kitchen" ? "cooked" : "packed"}
      </p>
      <ul className="mt-1.5 space-y-1">
        {ticket.items.map(it => {
          const isChecked = lane === "kitchen" ? it.kitchenChecked : it.expoChecked;
          return (
            <li key={it.id}>
              <button
                onClick={() => checksEnabled && onToggle(it.id, lane)}
                disabled={!checksEnabled}
                aria-pressed={isChecked}
                aria-label={`${it.name} — ${isChecked ? "checked" : "unchecked"} (${lane})`}
                className={`flex min-h-[44px] w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                  isChecked ? "border-green-600/50 bg-green-500/10" : "border-ink-700 bg-ink-950"
                } ${!checksEnabled ? "cursor-default opacity-70" : ""}`}>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs font-black ${
                  isChecked ? "border-green-500 bg-green-600 text-white" : "border-zinc-600 text-transparent"
                }`}>✓</span>
                <span className={`flex-1 truncate ${isChecked ? "text-zinc-500 line-through" : "text-zinc-200"}`}>{it.name}</span>
                <span className="shrink-0 text-xs font-bold text-zinc-400">{it.qty} {it.unit}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {(advanceLabel !== "" || onBack) && (
        <div className="mt-2 flex items-stretch gap-2">
          {onBack && (
            <button onClick={onBack} disabled={busy} aria-label="Move back a stage"
              className="min-h-[44px] min-w-[44px] shrink-0 rounded-lg border border-ink-700 bg-ink-950 px-3 text-lg font-black text-zinc-300 hover:text-white disabled:opacity-50">
              ↩
            </button>
          )}
          {advanceLabel !== "" && (
            <button onClick={onAdvance} disabled={busy}
              className={`min-h-[44px] flex-1 rounded-lg px-3 py-2 text-sm font-black uppercase tracking-wide text-white disabled:opacity-50 ${
                allChecked || !checksEnabled ? "bg-fire" : "bg-ink-700 text-zinc-300"
              }`}>
              {advanceLabel}
            </button>
          )}
        </div>
      )}
    </article>
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

/** Short browser beep for escalation alerts (best-effort; silent if blocked). */
function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    osc.onended = () => ctx.close();
  } catch {
    /* audio unavailable — non-fatal */
  }
}
