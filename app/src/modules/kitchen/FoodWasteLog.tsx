import { useMemo, useState } from "react";
import { useRole } from "../../app/RoleContext";
import { currentTime } from "../../lib/clock";
import { formatCents } from "../../lib/money";
import { SyncBadge, dayKey, dateLabel, timeLabel, uid, useSettingsState } from "./_ext/opsState";
import { seedWaste } from "./_ext/opsSeeds";

/**
 * Kitchen · Food Waste Log — track waste, estimate cost, spot patterns.
 * Log item + qty + unit + reason; cost auto-estimates from a cost reference
 * (editable per entry). Shows today's + all-time cost totals and a reason
 * breakdown. Persists via dal.settings key "kitchen.waste". Money math is
 * done in cents and rendered via formatCents.
 */

export interface WasteEntry {
  id: string;
  item: string;
  qty: number;
  unit: string;
  costPerUnit: number; // dollars per unit
  reason: WasteReason;
  preventable: "yes" | "no" | "maybe";
  notes: string;
  loggedBy: string;
  loggedAt: string;
}

type WasteReason =
  | "raw"
  | "overcooked"
  | "held_too_long"
  | "spoiled"
  | "overproduction"
  | "accident"
  | "customer_return";

const REASON_META: Record<WasteReason, { label: string; icon: string }> = {
  raw: { label: "Raw (never cooked)", icon: "🥩" },
  overcooked: { label: "Overcooked / quality", icon: "🔥" },
  held_too_long: { label: "Held too long", icon: "⏱️" },
  spoiled: { label: "Spoiled / expired", icon: "🦠" },
  overproduction: { label: "Overproduction", icon: "📈" },
  accident: { label: "Dropped / accident", icon: "💥" },
  customer_return: { label: "Customer return", icon: "↩️" },
};

const COST_REFERENCE: Record<string, { costPerUnit: number; unit: string }> = {
  "Brisket (raw)": { costPerUnit: 8, unit: "lbs" },
  "Pulled Pork (raw)": { costPerUnit: 4, unit: "lbs" },
  "Chicken (raw)": { costPerUnit: 3, unit: "lbs" },
  "Ribs (raw)": { costPerUnit: 6, unit: "lbs" },
  "Sausage": { costPerUnit: 2, unit: "lbs" },
  "Turkey (raw)": { costPerUnit: 4, unit: "lbs" },
  "Mac & Cheese": { costPerUnit: 45, unit: "pans" },
  "Baked Beans": { costPerUnit: 35, unit: "pans" },
  "Coleslaw": { costPerUnit: 30, unit: "pans" },
  "Potato Salad": { costPerUnit: 35, unit: "pans" },
  "Cornbread": { costPerUnit: 1.5, unit: "pieces" },
  "Other": { costPerUnit: 0, unit: "each" },
};

const UNITS = ["lbs", "pans", "half pans", "pints", "quarts", "pieces", "oz", "each"];

/** dollars → cents (rounded), guarding NaN. */
function toCents(dollars: number): number {
  return Math.round((Number.isFinite(dollars) ? dollars : 0) * 100);
}
function entryCents(e: { qty: number; costPerUnit: number }): number {
  return toCents(e.qty * e.costPerUnit);
}

export function FoodWasteLog() {
  const { actor } = useRole();
  const { value: entries, set: setEntries, loading, sync } = useSettingsState<WasteEntry[]>("kitchen.waste", seedWaste());
  const [tab, setTab] = useState<"log" | "history" | "dashboard">("log");

  const [item, setItem] = useState("");
  const [customItem, setCustomItem] = useState("");
  const [qtyStr, setQtyStr] = useState("");
  const [unit, setUnit] = useState("lbs");
  const [costStr, setCostStr] = useState("");
  const [reason, setReason] = useState<WasteReason>("overproduction");
  const [preventable, setPreventable] = useState<"yes" | "no" | "maybe">("maybe");
  const [notes, setNotes] = useState("");

  const resolvedItem = item === "Other" ? customItem.trim() : item;
  const qty = Number(qtyStr);
  const qtyValid = qtyStr.trim() !== "" && Number.isFinite(qty) && qty > 0;
  const costPerUnit = costStr.trim() !== "" ? Number(costStr) : (COST_REFERENCE[item]?.costPerUnit ?? 0);
  const liveCents = qtyValid ? toCents(qty * costPerUnit) : 0;

  const todayKey = dayKey(currentTime().toISOString());
  const todayEntries = entries.filter(e => dayKey(e.loggedAt) === todayKey);
  const todayCents = todayEntries.reduce((s, e) => s + entryCents(e), 0);
  const allCents = entries.reduce((s, e) => s + entryCents(e), 0);
  const preventableCount = entries.filter(e => e.preventable === "yes").length;
  const preventablePct = entries.length ? Math.round((preventableCount / entries.length) * 100) : 0;

  const byReason = useMemo(() => {
    const map = new Map<WasteReason, number>();
    for (const e of entries) map.set(e.reason, (map.get(e.reason) ?? 0) + entryCents(e));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);
  const maxReasonCents = byReason.reduce((m, [, c]) => Math.max(m, c), 1);

  const grouped = useMemo(() => {
    const map = new Map<string, WasteEntry[]>();
    for (const e of [...entries].sort((a, b) => b.loggedAt.localeCompare(a.loggedAt))) {
      const k = dayKey(e.loggedAt);
      const arr = map.get(k);
      if (arr) arr.push(e);
      else map.set(k, [e]);
    }
    return [...map.entries()];
  }, [entries]);

  if (loading) return <p className="py-20 text-center text-zinc-500">Loading waste log…</p>;

  const submit = () => {
    if (!resolvedItem || !qtyValid) return;
    const entry: WasteEntry = {
      id: uid(),
      item: resolvedItem,
      qty,
      unit,
      costPerUnit,
      reason,
      preventable,
      notes: notes.trim(),
      loggedBy: actor,
      loggedAt: currentTime().toISOString(),
    };
    setEntries(prev => [entry, ...prev]);
    setItem("");
    setCustomItem("");
    setQtyStr("");
    setCostStr("");
    setNotes("");
    setTab("history");
  };

  const selectItem = (v: string) => {
    setItem(v);
    const ref = COST_REFERENCE[v];
    if (ref) { setUnit(ref.unit); setCostStr(ref.costPerUnit ? String(ref.costPerUnit) : ""); }
  };

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">🗑️ Food Waste Log</h1>
          <p className="text-sm text-zinc-500">Track waste, reduce cost, improve production</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-center">
          <div className="text-2xl font-black text-red-300">{formatCents(todayCents)}</div>
          <div className="mt-1 text-xs text-red-500/80">Today's waste</div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-center">
          <div className="text-2xl font-black text-zinc-100">{formatCents(allCents)}</div>
          <div className="mt-1 text-xs text-zinc-500">All-time cost</div>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-center">
          <div className="text-2xl font-black text-amber-400">{preventablePct}%</div>
          <div className="mt-1 text-xs text-zinc-500">Preventable</div>
        </div>
      </div>

      <div className="mt-4 flex gap-1 rounded-lg bg-ink-900 p-1">
        {(["log", "history", "dashboard"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded-md py-2 text-sm font-bold capitalize ${tab === t ? "bg-fire text-white" : "text-zinc-400"}`}>
            {t === "log" ? "📝 Log" : t === "history" ? "📋 History" : "📊 Dashboard"}
          </button>
        ))}
      </div>

      {tab === "log" && (
        <section className="mt-4 space-y-4 rounded-xl border border-ink-700 bg-ink-900 p-5">
          <label className="block text-sm font-semibold text-zinc-400">Item wasted
            <select value={item} onChange={e => selectItem(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
              <option value="">Select item…</option>
              {Object.keys(COST_REFERENCE).map(k => (
                <option key={k} value={k}>{k}{COST_REFERENCE[k].costPerUnit > 0 ? ` ($${COST_REFERENCE[k].costPerUnit}/${COST_REFERENCE[k].unit})` : ""}</option>
              ))}
            </select>
          </label>
          {item === "Other" && (
            <input value={customItem} onChange={e => setCustomItem(e.target.value)} placeholder="Item name"
              className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-600" />
          )}

          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm font-semibold text-zinc-400">Qty
              <input inputMode="decimal" value={qtyStr} onChange={e => setQtyStr(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-center text-zinc-100 placeholder:text-zinc-600" />
            </label>
            <label className="block text-sm font-semibold text-zinc-400">Unit
              <select value={unit} onChange={e => setUnit(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </label>
            <label className="block text-sm font-semibold text-zinc-400">$/unit
              <input inputMode="decimal" value={costStr} onChange={e => setCostStr(e.target.value)} placeholder="0"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-center text-zinc-100 placeholder:text-zinc-600" />
            </label>
          </div>

          {liveCents > 0 && (
            <div className="flex items-center gap-3 rounded-lg border border-red-800 bg-red-950/40 px-4 py-3">
              <span className="text-2xl" aria-hidden>💸</span>
              <div>
                <p className="text-lg font-black text-red-300">{formatCents(liveCents)} estimated waste cost</p>
                <p className="text-xs text-red-500/80">{qty} {unit} × ${costPerUnit}/unit</p>
              </div>
            </div>
          )}

          <label className="block text-sm font-semibold text-zinc-400">Reason
            <select value={reason} onChange={e => setReason(e.target.value as WasteReason)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
              {(Object.keys(REASON_META) as WasteReason[]).map(r => (
                <option key={r} value={r}>{REASON_META[r].icon} {REASON_META[r].label}</option>
              ))}
            </select>
          </label>

          <div>
            <p className="text-sm font-semibold text-zinc-400">Preventable?</p>
            <div className="mt-1 flex gap-2">
              {(["yes", "no", "maybe"] as const).map(v => (
                <button key={v} onClick={() => setPreventable(v)}
                  className={`flex-1 rounded-lg border py-2 text-sm font-semibold capitalize ${preventable === v ? "border-fire bg-fire/20 text-white" : "border-ink-700 bg-ink-800 text-zinc-400"}`}>
                  {v === "yes" ? "✅ Yes" : v === "no" ? "❌ No" : "🤔 Maybe"}
                </button>
              ))}
            </div>
          </div>

          <label className="block text-sm font-semibold text-zinc-400">Notes (optional)
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="What happened? How can we prevent this?"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600" />
          </label>

          <button onClick={submit} disabled={!resolvedItem || !qtyValid}
            className="h-12 w-full rounded-xl bg-fire text-base font-black uppercase tracking-wide text-white disabled:bg-ink-800 disabled:text-zinc-500">
            Log waste entry
          </button>
        </section>
      )}

      {tab === "history" && (
        <section className="mt-4 space-y-5">
          {grouped.length === 0 && (
            <p className="rounded-xl border border-ink-700 bg-ink-900 py-14 text-center text-sm text-zinc-500">No waste entries yet.</p>
          )}
          {grouped.map(([day, dayEntries]) => {
            const dayCents = dayEntries.reduce((s, e) => s + entryCents(e), 0);
            return (
              <div key={day}>
                <h2 className="mb-2 flex items-center justify-between text-xs font-black uppercase tracking-wider text-zinc-400">
                  <span>{day === todayKey ? "Today" : dateLabel(day)}</span>
                  <span className="text-red-400">{formatCents(dayCents)}</span>
                </h2>
                <ul className="space-y-2">
                  {dayEntries.map(e => (
                    <li key={e.id} className="rounded-lg border border-ink-700 bg-ink-900 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-zinc-100">{e.item}</p>
                          <p className="text-xs text-zinc-500">{e.qty} {e.unit} · {REASON_META[e.reason].icon} {REASON_META[e.reason].label}</p>
                          {e.notes && <p className="mt-1 text-xs italic text-zinc-500">{e.notes}</p>}
                          <p className="mt-1 text-[11px] text-zinc-600">{e.loggedBy} · {timeLabel(e.loggedAt)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="font-black text-red-400">{formatCents(entryCents(e))}</div>
                          <div className={`mt-1 text-xs ${e.preventable === "yes" ? "text-amber-400" : "text-zinc-500"}`}>
                            {e.preventable === "yes" ? "⚠️ Preventable" : e.preventable === "no" ? "Not preventable" : "Maybe"}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>
      )}

      {tab === "dashboard" && (
        <section className="mt-4 space-y-4">
          <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <h3 className="mb-3 text-sm font-black uppercase tracking-wider text-zinc-300">Cost by reason (all-time)</h3>
            {byReason.length === 0 ? (
              <p className="text-sm text-zinc-500">No data yet.</p>
            ) : (
              <div className="space-y-2.5">
                {byReason.map(([r, cents]) => (
                  <div key={r} className="flex items-center gap-3">
                    <span className="w-40 shrink-0 text-sm text-zinc-300">{REASON_META[r].icon} {REASON_META[r].label}</span>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-ink-800">
                      <div className="h-full rounded-full bg-red-700" style={{ width: `${Math.max((cents / maxReasonCents) * 100, 3)}%` }} />
                    </div>
                    <span className="w-16 shrink-0 text-right text-sm font-bold text-red-400">{formatCents(cents)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-center">
            <div className="text-3xl font-black text-red-300">{formatCents(allCents)}</div>
            <div className="mt-1 text-sm text-red-500/80">Total waste cost logged · {entries.length} entries</div>
          </div>
        </section>
      )}
    </div>
  );
}
