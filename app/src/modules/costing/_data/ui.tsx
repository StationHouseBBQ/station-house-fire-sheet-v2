import type { Sync } from "./helpers";

/** Save-status pill, matching the pit/CRM "SyncBadge" look. */
export function SyncBadge({ sync }: { sync: Sync }) {
  if (sync === "idle") return null;
  const map: Record<Exclude<Sync, "idle">, { text: string; cls: string }> = {
    saving: { text: "Saving…", cls: "border-ink-700 bg-ink-800 text-zinc-400" },
    saved: { text: "Saved", cls: "border-emerald-800 bg-emerald-950 text-emerald-300" },
    error: { text: "Save failed", cls: "border-red-800 bg-red-950 text-red-300" },
  };
  const s = map[sync];
  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${s.cls}`}>{s.text}</span>
  );
}

/** Small KPI card, matching the workspace stat-card look. */
export function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "bad";
}) {
  const toneCls =
    tone === "ok" ? "text-emerald-400" : tone === "warn" ? "text-amber-300" : tone === "bad" ? "text-red-400" : "text-zinc-100";
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <p className="text-xs font-black uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-1 text-2xl font-black ${toneCls}`}>{value}</p>
    </div>
  );
}
