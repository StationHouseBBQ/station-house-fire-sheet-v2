import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ImportJob, SpecialEvent } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Admin · settings-backed panels — V2 counterparts of the smaller Manus admin
 * pages: BrandSetup (row 68), BrandStudio (69), LicensingDashboard (70),
 * AIImportHub (71), CustomerHome admin (72), ExpressMenuAdmin (65) and
 * EventsAdmin (67). Simple key/value panels persisted through
 * dal.settings, plus read-only integration placeholders.
 */

type Sync = "idle" | "saving" | "saved" | "error";

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}

const inputCls = "mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100";

function dollarsToCents(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

// ── Brand Setup ───────────────────────────────────────────────────────────
interface BrandSettings {
  businessName: string; tagline: string; primaryColor: string;
  phone: string; email: string; address: string;
}
const DEFAULT_BRAND: BrandSettings = {
  businessName: "Station House BBQ", tagline: "Tampa's fire-kissed BBQ",
  primaryColor: "#EA580C", phone: "(813) 555-0140",
  email: "admin@stationhousebbq.com", address: "6811 N Central Ave, Tampa, FL 33604",
};

export function BrandSetup() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data } = useQuery({ queryKey: ["settings", "brand"], queryFn: () => dal.settings.get<BrandSettings>("brand", DEFAULT_BRAND) });

  const saveMut = useMutation({
    mutationFn: (v: BrandSettings) => {
      setSync("saving");
      return dal.settings.set("brand", v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "brand"] }),
  });

  if (!data) return <p className="py-20 text-center text-zinc-500">Loading brand settings…</p>;

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase text-zinc-100">Brand Setup</h1>
        <SyncBadge sync={sync} />
      </header>
      <BrandForm key={JSON.stringify(data)} initial={data} busy={saveMut.isPending}
        error={saveMut.error?.message ?? null} onSave={v => saveMut.mutate(v)} />
    </div>
  );
}

function BrandForm({ initial, onSave, busy, error }: {
  initial: BrandSettings; onSave: (v: BrandSettings) => void; busy: boolean; error: string | null;
}) {
  const [v, setV] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<BrandSettings>) => { setV(cur => ({ ...cur, ...patch })); setDirty(true); };

  return (
    <form className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4"
      onSubmit={e => { e.preventDefault(); onSave(v); }}>
      {error && <p className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-zinc-400">Business name
          <input value={v.businessName} onChange={e => set({ businessName: e.target.value })} required className={inputCls} />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Tagline
          <input value={v.tagline} onChange={e => set({ tagline: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Primary color
          <span className="mt-1 flex items-center gap-2">
            <input value={v.primaryColor} onChange={e => set({ primaryColor: e.target.value })} placeholder="#EA580C"
              className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 font-mono text-zinc-100" />
            <span aria-hidden className="h-8 w-8 shrink-0 rounded-lg border border-ink-700" style={{ background: v.primaryColor }} />
          </span>
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Phone
          <input value={v.phone} onChange={e => set({ phone: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Email
          <input type="email" value={v.email} onChange={e => set({ email: e.target.value })} className={inputCls} />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Address
          <input value={v.address} onChange={e => set({ address: e.target.value })} className={inputCls} />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save brand" : "Saved"}
        </button>
      </div>
    </form>
  );
}

// ── Brand Studio (read-only asset checklist) ─────────────────────────────
const BRAND_ASSETS = [
  { name: "Primary logo (SVG + PNG)", ready: true },
  { name: "Menu board template (print)", ready: true },
  { name: "Social post templates (IG/FB square)", ready: false },
  { name: "Story templates (9:16)", ready: false },
  { name: "Email header + footer", ready: false },
  { name: "Catering one-pager", ready: true },
];

export function BrandStudio() {
  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <h1 className="text-2xl font-black uppercase text-zinc-100">Brand Studio</h1>
      <p className="mt-1 text-sm text-zinc-500">Asset library checklist (read-only)</p>
      <ul className="mt-6 space-y-2">
        {BRAND_ASSETS.map(a => (
          <li key={a.name} className="flex items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
            <span className={`text-lg ${a.ready ? "text-green-400" : "text-zinc-600"}`}>{a.ready ? "✓" : "○"}</span>
            <span className={`flex-1 text-sm font-semibold ${a.ready ? "text-zinc-100" : "text-zinc-500"}`}>{a.name}</span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
              a.ready ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
              {a.ready ? "READY" : "PENDING"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        Asset upload and storage connects to Supabase Storage in the integrations phase.
      </p>
    </div>
  );
}

// ── License Manager (read-only demo table) ───────────────────────────────
interface LicenseRow { name: string; vendor: string; status: "active" | "expiring" | "expired"; renewalDate: string; }
const DEFAULT_LICENSES: LicenseRow[] = [
  { name: "POS integration", vendor: "Square", status: "active", renewalDate: "2027-01-15" },
  { name: "SMS sender", vendor: "Twilio", status: "active", renewalDate: "2026-11-01" },
];

export function LicenseManager() {
  const dal = getDal();
  const { data: licenses } = useQuery({
    queryKey: ["settings", "licenses"],
    queryFn: () => dal.settings.get<LicenseRow[]>("licenses", DEFAULT_LICENSES),
  });

  if (!licenses) return <p className="py-20 text-center text-zinc-500">Loading licenses…</p>;

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <h1 className="text-2xl font-black uppercase text-zinc-100">License Manager</h1>
      <p className="mt-1 text-sm text-zinc-500">Third-party service licenses (read-only)</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">License</th>
              <th className="px-3 py-2.5">Vendor</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Renews</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {licenses.map(l => (
              <tr key={l.name}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{l.name}</td>
                <td className="px-3 py-2.5 text-zinc-400">{l.vendor}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
                    l.status === "active" ? "bg-green-600 text-white" : l.status === "expiring" ? "bg-amber-600 text-white" : "bg-red-600 text-white"}`}>
                    {l.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">{l.renewalDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Customer App ──────────────────────────────────────────────────────────
interface CustomerAppSettings { enabled: boolean; orderingEnabled: boolean; announcement: string; }
const DEFAULT_CUSTOMER_APP: CustomerAppSettings = { enabled: true, orderingEnabled: true, announcement: "" };

export function CustomerApp() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data } = useQuery({
    queryKey: ["settings", "customerApp"],
    queryFn: () => dal.settings.get<CustomerAppSettings>("customerApp", DEFAULT_CUSTOMER_APP),
  });

  const saveMut = useMutation({
    mutationFn: (v: CustomerAppSettings) => {
      setSync("saving");
      return dal.settings.set("customerApp", v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "customerApp"] }),
  });

  if (!data) return <p className="py-20 text-center text-zinc-500">Loading customer app settings…</p>;

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase text-zinc-100">Customer App</h1>
        <SyncBadge sync={sync} />
      </header>
      <CustomerAppForm key={JSON.stringify(data)} initial={data} busy={saveMut.isPending}
        error={saveMut.error?.message ?? null} onSave={v => saveMut.mutate(v)} />
    </div>
  );
}

function CustomerAppForm({ initial, onSave, busy, error }: {
  initial: CustomerAppSettings; onSave: (v: CustomerAppSettings) => void; busy: boolean; error: string | null;
}) {
  const [v, setV] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<CustomerAppSettings>) => { setV(cur => ({ ...cur, ...patch })); setDirty(true); };

  return (
    <form className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4"
      onSubmit={e => { e.preventDefault(); onSave(v); }}>
      {error && <p className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
      <div className="space-y-3">
        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
          Customer app enabled
          <input type="checkbox" checked={v.enabled} onChange={e => set({ enabled: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
          Online ordering enabled
          <input type="checkbox" checked={v.orderingEnabled} onChange={e => set({ orderingEnabled: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className="block text-sm font-semibold text-zinc-400">Announcement banner
          <textarea value={v.announcement} onChange={e => set({ announcement: e.target.value })} rows={2}
            placeholder="Shown at the top of the customer app" className={inputCls} />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save settings" : "Saved"}
        </button>
      </div>
    </form>
  );
}

// ── AI Import Hub ─────────────────────────────────────────────────────────
const IMPORT_STATUS_CLS: Record<ImportJob["status"], string> = {
  queued: "bg-ink-700 text-zinc-300",
  needs_review: "bg-amber-600 text-white",
  imported: "bg-green-600 text-white",
  failed: "bg-red-600 text-white",
};

export function AiImportHub() {
  const dal = getDal();
  const { data: jobs, isLoading } = useQuery({ queryKey: ["imports"], queryFn: () => dal.imports.list() });

  if (isLoading || !jobs) return <p className="py-20 text-center text-zinc-500">Loading import jobs…</p>;

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <h1 className="text-2xl font-black uppercase text-zinc-100">AI Import Hub</h1>
      <p className="mt-1 text-sm text-zinc-500">Document / spreadsheet imports into menu, prep and order-guide data</p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Source</th>
              <th className="px-3 py-2.5">Kind</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Rows</th>
              <th className="px-3 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {jobs.map(j => (
              <tr key={j.id}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{j.source}</td>
                <td className="px-3 py-2.5 text-zinc-400">{j.kind}</td>
                <td className="px-3 py-2.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${IMPORT_STATUS_CLS[j.status]}`}>
                    {j.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{j.rows}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{new Date(j.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {jobs.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No import jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-4 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        New uploads and AI extraction run in the integrations phase — this view lists job history from the data layer.
      </p>
    </div>
  );
}

// ── Express Menu ──────────────────────────────────────────────────────────
interface ExpressMenuSettings { active: boolean; items: Array<{ name: string; priceCents: number }>; }
const DEFAULT_EXPRESS: ExpressMenuSettings = {
  active: false,
  items: [
    { name: "Pulled Pork Sandwich + chips", priceCents: 1250 },
    { name: "Brisket Sandwich + chips", priceCents: 1550 },
  ],
};

export function ExpressMenu() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data } = useQuery({
    queryKey: ["settings", "expressMenu"],
    queryFn: () => dal.settings.get<ExpressMenuSettings>("expressMenu", DEFAULT_EXPRESS),
  });

  const saveMut = useMutation({
    mutationFn: (v: ExpressMenuSettings) => {
      setSync("saving");
      return dal.settings.set("expressMenu", v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "expressMenu"] }),
  });

  if (!data) return <p className="py-20 text-center text-zinc-500">Loading express menu…</p>;

  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase text-zinc-100">Express Menu</h1>
        <SyncBadge sync={sync} />
      </header>
      <p className="mt-1 text-sm text-zinc-500">Fast lunch line — a short list separate from the master menu</p>
      <ExpressMenuForm key={JSON.stringify(data)} initial={data} busy={saveMut.isPending}
        error={saveMut.error?.message ?? null} onSave={v => saveMut.mutate(v)} />
    </div>
  );
}

function ExpressMenuForm({ initial, onSave, busy, error }: {
  initial: ExpressMenuSettings; onSave: (v: ExpressMenuSettings) => void; busy: boolean; error: string | null;
}) {
  const [active, setActive] = useState(initial.active);
  const [items, setItems] = useState(initial.items);
  const [dirty, setDirty] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const addItem = () => {
    setFormError(null);
    if (!newName.trim()) return setFormError("Item name is required.");
    const cents = dollarsToCents(newPrice);
    if (cents === null) return setFormError("Price must be a valid non-negative dollar amount.");
    setItems(cur => [...cur, { name: newName.trim(), priceCents: cents }]);
    setNewName(""); setNewPrice(""); setDirty(true);
  };
  const removeItem = (idx: number) => { setItems(cur => cur.filter((_, i) => i !== idx)); setDirty(true); };

  return (
    <form className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4"
      onSubmit={e => { e.preventDefault(); onSave({ active, items }); }}>
      {(formError || error) && <p className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
      <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
        Express menu active
        <input type="checkbox" checked={active} onChange={e => { setActive(e.target.checked); setDirty(true); }} className="h-5 w-5" />
      </label>
      <ul className="mt-3 space-y-1.5">
        {items.map((it, idx) => (
          <li key={`${it.name}-${idx}`} className="flex items-center gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-zinc-100">{it.name}</span>
            <span className="font-mono text-sm text-zinc-300">{formatCents(it.priceCents)}</span>
            <button type="button" onClick={() => removeItem(idx)} aria-label={`Remove ${it.name}`}
              className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 py-1 text-xs font-semibold text-zinc-500 hover:text-red-400">
              Remove
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="py-4 text-center text-sm text-zinc-600">No express items.</li>}
      </ul>
      <div className="mt-3 flex gap-2">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Item name"
          aria-label="New express item name"
          className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600" />
        <input value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="$" inputMode="decimal"
          aria-label="New express item price in dollars"
          className="min-h-[44px] w-24 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-right font-mono text-sm text-zinc-100 placeholder:text-zinc-600" />
        <button type="button" onClick={addItem}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 py-2 text-sm font-bold text-zinc-200">+ Add</button>
      </div>
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save express menu" : "Saved"}
        </button>
      </div>
    </form>
  );
}

// ── Events Manager ────────────────────────────────────────────────────────
export function EventsManager() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: events, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => dal.events.list() });

  const upsertMut = useMutation({
    mutationFn: (e: Omit<SpecialEvent, "updatedAt">) => {
      setSync("saving");
      return dal.events.upsert(e, actor).then(r => { setSync("saved"); return r; }, err => { setSync("error"); throw err; });
    },
    onSuccess: () => { setDialogOpen(false); qc.invalidateQueries({ queryKey: ["events"] }); },
  });

  if (isLoading || !events) return <p className="py-20 text-center text-zinc-500">Loading events…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Events Manager</h1>
          <p className="text-sm text-zinc-500">{events.length} special events</p>
        </div>
        <div className="flex items-center gap-2">
          <SyncBadge sync={sync} />
          <button onClick={() => setDialogOpen(true)}
            className="min-h-[44px] rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">+ New event</button>
        </div>
      </header>

      <div className="mt-4 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Event</th>
              <th className="px-3 py-2.5">Slug</th>
              <th className="px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Landing</th>
              <th className="px-3 py-2.5">Ordering</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {events.map(ev => (
              <tr key={ev.id}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-zinc-100">{ev.name}</p>
                  {ev.notes && <p className="max-w-xs truncate text-xs text-zinc-500">{ev.notes}</p>}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">/{ev.slug}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-400">{ev.eventDate ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <button role="switch" aria-checked={ev.landingEnabled} aria-label={`${ev.name} landing`}
                    onClick={() => upsertMut.mutate({ ...ev, landingEnabled: !ev.landingEnabled })}
                    className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                      ev.landingEnabled ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                    {ev.landingEnabled ? "Live" : "Off"}
                  </button>
                </td>
                <td className="px-3 py-2.5">
                  <button role="switch" aria-checked={ev.orderingEnabled} aria-label={`${ev.name} ordering`}
                    onClick={() => upsertMut.mutate({ ...ev, orderingEnabled: !ev.orderingEnabled })}
                    className={`min-h-[36px] rounded-full px-3 py-1 text-xs font-bold ${
                      ev.orderingEnabled ? "bg-green-600 text-white" : "border border-ink-700 text-zinc-500"}`}>
                    {ev.orderingEnabled ? "Open" : "Closed"}
                  </button>
                </td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No events yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-zinc-600">
        Event dates, notes and menus are edited on each event's dedicated admin tab (Father's Day, Cuban Thursday, 4th of July).
      </p>

      {dialogOpen && (
        <NewEventDialog busy={upsertMut.isPending} error={upsertMut.error?.message ?? null}
          onCancel={() => setDialogOpen(false)}
          onSubmit={e => upsertMut.mutate(e)} />
      )}
    </div>
  );
}

function NewEventDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (e: Omit<SpecialEvent, "updatedAt">) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const submit = () => {
    setFormError(null);
    if (!name.trim()) return setFormError("Name is required.");
    const s = slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(s)) return setFormError("Slug must be lowercase letters, numbers and dashes.");
    onSubmit({
      id: "", slug: s, name: name.trim(), landingEnabled: false, orderingEnabled: false,
      eventDate: eventDate || null, menuItemIds: [], notes: notes.trim() || null,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="New event"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); submit(); }}>
        <h3 className="text-lg font-bold text-zinc-100">New event</h3>
        {(formError || error) && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{formError ?? error}</p>}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Name
            <input value={name} onChange={e => setName(e.target.value)} required className={inputCls} />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Slug
            <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="labor-day" required
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 font-mono text-zinc-100" />
          </label>
        </div>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Event date
          <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Notes
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className={inputCls} />
        </label>
        <p className="mt-2 text-xs text-zinc-600">New events start with landing and ordering off.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create event"}
          </button>
        </div>
      </form>
    </div>
  );
}
