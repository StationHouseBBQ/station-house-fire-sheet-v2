import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { MediaAsset } from "../../dal/types";
import { useRole } from "../../app/RoleContext";

/**
 * Marketing · Media Library — V2 take on the Manus MediaLibrary.
 * Catalog of assets (name, kind, tags) with kind filter + tag search.
 * Real file upload/preview arrives with the Supabase Storage phase; until
 * then this tracks the catalog metadata only.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type Kind = MediaAsset["kind"];

const KINDS: Kind[] = ["photo", "video", "graphic"];
const KIND_META: Record<Kind, { icon: string; label: string }> = {
  photo: { icon: "📷", label: "Photos" },
  video: { icon: "🎬", label: "Videos" },
  graphic: { icon: "🎨", label: "Graphics" },
};

export function MediaLibraryView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [kindFilter, setKindFilter] = useState<Kind | "all">("all");
  const [search, setSearch] = useState("");
  const [sync, setSync] = useState<Sync>("idle");
  const [addOpen, setAddOpen] = useState(false);

  const { data: assets, isLoading } = useQuery({
    queryKey: ["marketing", "media"],
    queryFn: () => dal.marketing.media(),
  });

  const addMut = useMutation({
    mutationFn: (m: { name: string; kind: Kind; tags: string[] }) => {
      setSync("saving");
      return dal.marketing.addMedia(m, actor).then(
        r => { setSync("saved"); return r; },
        e => { setSync("error"); throw e; },
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["marketing", "media"] });
      setAddOpen(false);
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (assets ?? []).filter(a =>
      (kindFilter === "all" || a.kind === kindFilter) &&
      (q === "" || a.name.toLowerCase().includes(q) || a.tags.some(t => t.toLowerCase().includes(q))),
    );
  }, [assets, kindFilter, search]);

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading media library…</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Media Library</h1>
          <p className="text-sm text-zinc-500">{filtered.length} of {(assets ?? []).length} assets</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setAddOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ Add asset</button>
        </div>
      </header>

      <p role="note" className="mt-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-400">
        Real file upload and previews arrive with the Supabase Storage phase — this library tracks
        the asset catalog (names, kinds, tags) so it's ready to link files.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["all", ...KINDS] as Array<Kind | "all">).map(k => (
          <button key={k} onClick={() => setKindFilter(k)}
            className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-semibold ${
              kindFilter === k ? "border-fire bg-fire/20 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"}`}>
            {k === "all" ? "All" : `${KIND_META[k].icon} ${KIND_META[k].label}`}
          </button>
        ))}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or tag…"
          aria-label="Search assets by name or tag"
          className="min-h-[44px] flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 sm:max-w-xs" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {KINDS.map(k => {
          const n = (assets ?? []).filter(a => a.kind === k).length;
          return (
            <div key={k} className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-center">
              <p className="text-lg font-bold text-zinc-100">{n}</p>
              <p className="text-[11px] uppercase tracking-wide text-zinc-500">{KIND_META[k].icon} {KIND_META[k].label}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map(a => (
          <div key={a.id} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-ink-800 text-xl" aria-hidden>
                {KIND_META[a.kind].icon}
              </span>
              <div className="min-w-0">
                <p className="truncate font-semibold text-zinc-100">{a.name}</p>
                <p className="text-xs text-zinc-500">{a.kind} · added {a.addedAt.slice(0, 10)}</p>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wide text-zinc-600">{a.kind}</span>
              <CopyAssetBtn asset={a} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {a.tags.map(t => (
                <span key={t} className="rounded-full bg-ink-800 px-2.5 py-1 text-xs text-zinc-400">#{t}</span>
              ))}
              {a.tags.length === 0 && <span className="text-xs text-zinc-600">no tags</span>}
            </div>
          </div>
        ))}
      </div>
      {filtered.length === 0 && (
        <p className="mt-4 rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">
          No assets match this filter.
        </p>
      )}

      {addOpen && <AddAssetDialog busy={addMut.isPending} error={addMut.error?.message ?? null}
        onCancel={() => setAddOpen(false)}
        onSubmit={m => addMut.mutate(m)} />}
    </div>
  );
}

function CopyAssetBtn({ asset }: { asset: MediaAsset }) {
  const [copied, setCopied] = useState(false);
  const text = `${asset.name}${asset.tags.length ? ` — ${asset.tags.map(t => `#${t}`).join(" ")}` : ""}`;
  return (
    <button type="button"
      onClick={() => { navigator.clipboard?.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
      aria-label={`Copy reference for ${asset.name}`}
      className="rounded-md border border-ink-600 bg-ink-800 px-2 py-1 text-[11px] font-semibold text-zinc-300 hover:border-fire/50">
      {copied ? "Copied ✓" : "Copy ref"}
    </button>
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

function AddAssetDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (m: { name: string; kind: Kind; tags: string[] }) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("photo");
  const [tags, setTags] = useState("");
  return (
    <div role="dialog" aria-modal="true" aria-label="Add asset"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => {
          e.preventDefault();
          onSubmit({ name, kind, tags: tags.split(",").map(t => t.trim()).filter(Boolean) });
        }}>
        <h3 className="text-lg font-bold text-zinc-100">Add asset</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Name
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Kind
          <select value={kind} onChange={e => setKind(e.target.value as Kind)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {KINDS.map(k => <option key={k} value={k}>{KIND_META[k].icon} {KIND_META[k].label}</option>)}
          </select>
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Tags (comma-separated)
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="brisket, fire-drop, reel"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Adding…" : "Add asset"}
          </button>
        </div>
      </form>
    </div>
  );
}
