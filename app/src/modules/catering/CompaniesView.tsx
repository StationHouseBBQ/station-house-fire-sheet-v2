import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Company } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Catering · Companies — V2 counterpart of the Manus CompaniesTab
 * (parity row #40). Company cards with industry, portal badge and notes;
 * upsert dialog with portalEnabled checkbox.
 */

type Sync = "idle" | "saving" | "saved" | "error";

export function CompaniesView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [editing, setEditing] = useState<Company | "new" | null>(null);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies", "list"],
    queryFn: () => dal.companies.list(),
    refetchInterval: 30_000,
  });

  const withSync = <T,>(p: Promise<T>): Promise<T> => {
    setSync("saving");
    return p.then(r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
  };

  const upsertMut = useMutation({
    mutationFn: (c: Omit<Company, "updatedAt">) => withSync(dal.companies.upsert(c, actor)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["companies", "list"] }); setEditing(null); },
  });

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Companies</h1>
          <p className="text-sm text-zinc-500">{companies.length} B2B accounts</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setEditing("new")}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New Company</button>
        </div>
      </header>

      {isLoading ? (
        <p className="py-20 text-center text-zinc-500">Loading companies…</p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {companies.map(c => (
            <div key={c.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-bold text-zinc-100">{c.name}</p>
                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                  c.portalEnabled
                    ? "border-green-700/60 bg-green-600/20 text-green-400"
                    : "border-ink-700 bg-ink-800 text-zinc-500"
                }`}>
                  {c.portalEnabled ? "Portal" : "No portal"}
                </span>
              </div>
              <p className="mt-1 text-sm text-zinc-400">{c.industry ?? "Industry —"}</p>
              {c.notes && <p className="mt-2 text-sm text-zinc-500">{c.notes}</p>}
              <button onClick={() => setEditing(c)}
                className="mt-3 min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm font-semibold text-zinc-300">
                Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CompanyDialog company={editing === "new" ? null : editing}
          busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setEditing(null)}
          onSubmit={c => upsertMut.mutate(c)} />
      )}
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

function CompanyDialog({ company, onSubmit, onCancel, busy, error }: {
  company: Company | null;
  onSubmit: (c: Omit<Company, "updatedAt">) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState(company?.name ?? "");
  const [industry, setIndustry] = useState(company?.industry ?? "");
  const [notes, setNotes] = useState(company?.notes ?? "");
  const [portalEnabled, setPortalEnabled] = useState(company?.portalEnabled ?? false);

  return (
    <div role="dialog" aria-modal="true" aria-label={company ? "Edit company" : "New company"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit({
            id: company?.id ?? "",
            name: name.trim(),
            industry: industry.trim() || null,
            notes: notes.trim() || null,
            portalEnabled,
            contactIds: company?.contactIds ?? [],
          });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">{company ? "Edit company" : "New company"}</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name *
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Industry
          <input value={industry} onChange={e => setIndustry(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-4 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5">
          <input type="checkbox" checked={portalEnabled} onChange={e => setPortalEnabled(e.target.checked)}
            className="h-5 w-5 accent-orange-600" />
          <span className="text-sm font-semibold text-zinc-200">Portal enabled</span>
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save company"}
          </button>
        </div>
      </form>
    </div>
  );
}
