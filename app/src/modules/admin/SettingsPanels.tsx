import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { ImportJob, SpecialEvent } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";
import { ADDRESS_LINE, PHONE } from "../../config/brand";
import {
  EXPRESS_DEFAULTS, EXPRESS_SETTINGS_KEY,
  type ExpressAlaCarteItem, type ExpressCategory, type ExpressCateringSettings, type ExpressPackage,
} from "../../lib/expressMenu";
import {
  LICENSE_KEY, DEFAULT_LICENSE, TIER_PRICE_CENTS, TIER_META, STATUS_META, TIER_FEATURES,
  type LicenseRecord, type PlanTier, type LicenseStatus,
} from "./_data_settings/store";
import {
  parseDelimited, autoMap, IMPORT_TARGETS, type ParsedTable, type ImportTarget,
} from "./_data_settings/parse";

/**
 * Admin · settings-backed panels — V2 counterparts of the smaller Manus admin
 * pages: BrandSetup (row 68), BrandStudio (69), LicensingDashboard (70),
 * AIImportHub (71), CustomerHome admin (72), ExpressMenuAdmin (65) and
 * EventsAdmin (67). Config persists through dal.settings; license & schedule
 * demo state lives in ./_data_settings. No secrets are handled in the
 * frontend — license keys are masked and integrations use placeholder fields.
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
const labelCls = "block text-sm font-semibold text-zinc-400";

function dollarsToCents(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function slugId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Brand Setup ───────────────────────────────────────────────────────────
interface DayHours { open: string; close: string; closed: boolean; }
interface BrandSettings {
  businessName: string; tagline: string; logoUrl: string;
  primaryColor: string; backgroundColor: string; accentColor: string;
  phone: string; email: string; website: string; address: string; city: string; state: string;
  instagram: string; facebook: string; tiktok: string;
  ownerName: string; businessType: string; foundedYear: string; aboutText: string;
  taxRateBp: number;
  hours: Record<string, DayHours>;
  features: { pickupDelivery: boolean; fullServiceBooking: boolean; weekendPreorder: boolean; shop: boolean };
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function defaultHours(): Record<string, DayHours> {
  const h: Record<string, DayHours> = {};
  for (const d of DAYS) h[d] = { open: "11:00", close: "20:00", closed: d === "Mon" };
  return h;
}

const DEFAULT_BRAND: BrandSettings = {
  businessName: "Station House BBQ", tagline: "Tampa's fire-kissed BBQ", logoUrl: "",
  primaryColor: "#EA580C", backgroundColor: "#0F0F0F", accentColor: "#F5F0E8",
  phone: PHONE, email: "admin@stationhousebbq.com", website: "https://stationhousebbq.com",
  address: ADDRESS_LINE, city: "Tampa", state: "FL",
  instagram: "stationhousebbq", facebook: "", tiktok: "",
  ownerName: "", businessType: "BBQ Catering", foundedYear: "", aboutText: "",
  taxRateBp: 750, hours: defaultHours(),
  features: { pickupDelivery: true, fullServiceBooking: true, weekendPreorder: true, shop: true },
};

const BRAND_STEPS = [
  { id: 1, title: "Identity" },
  { id: 2, title: "Colors" },
  { id: 3, title: "Contact" },
  { id: 4, title: "Hours & Tax" },
  { id: 5, title: "Social" },
  { id: 6, title: "Features" },
];

export function BrandSetup() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data } = useQuery({
    queryKey: ["settings", "brand"],
    queryFn: () => dal.settings.get<Partial<BrandSettings>>("brand", DEFAULT_BRAND),
    // merge partial legacy shapes with defaults
    select: (v: Partial<BrandSettings>) => ({ ...DEFAULT_BRAND, ...v, hours: { ...defaultHours(), ...(v.hours ?? {}) }, features: { ...DEFAULT_BRAND.features, ...(v.features ?? {}) } }),
  });

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
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Brand Setup</h1>
          <p className="text-sm text-zinc-500">Identity, colors, contact, hours, tax &amp; features</p>
        </div>
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
  const [step, setStep] = useState(1);
  const set = (patch: Partial<BrandSettings>) => { setV(cur => ({ ...cur, ...patch })); setDirty(true); };
  const setHours = (day: string, patch: Partial<DayHours>) => {
    setV(cur => ({ ...cur, hours: { ...cur.hours, [day]: { ...cur.hours[day], ...patch } } })); setDirty(true);
  };
  const taxPct = (v.taxRateBp / 100).toString();

  return (
    <form className="mt-6 rounded-xl border border-ink-700 bg-ink-900 p-4"
      onSubmit={e => { e.preventDefault(); onSave(v); }}>
      {error && <p role="alert" className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Live preview strip */}
      <div className="mb-4 overflow-hidden rounded-xl border border-ink-700">
        <div className="p-4 text-center" style={{ backgroundColor: v.backgroundColor }}>
          <div className="text-xl font-black" style={{ color: v.accentColor }}>{v.businessName || "Your Business"}</div>
          <div className="mt-0.5 text-xs" style={{ color: v.accentColor, opacity: 0.7 }}>{v.tagline || "Your tagline"}</div>
          <button type="button" className="mt-3 rounded-lg px-5 py-2 text-sm font-bold text-white" style={{ backgroundColor: v.primaryColor }}>Book Catering</button>
        </div>
      </div>

      {/* Step tabs */}
      <div className="mb-4 flex flex-wrap gap-1">
        {BRAND_STEPS.map(s => (
          <button type="button" key={s.id} onClick={() => setStep(s.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${step === s.id ? "bg-fire text-white" : "border border-ink-700 text-zinc-400 hover:text-zinc-200"}`}>
            {s.title}
          </button>
        ))}
      </div>

      {step === 1 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>Business name
            <input value={v.businessName} onChange={e => set({ businessName: e.target.value })} required className={inputCls} />
          </label>
          <label className={labelCls}>Tagline
            <input value={v.tagline} onChange={e => set({ tagline: e.target.value })} className={inputCls} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>Logo URL
            <input value={v.logoUrl} onChange={e => set({ logoUrl: e.target.value })} placeholder="https://cdn.example.com/logo.png"
              className={`${inputCls} font-mono text-sm`} />
          </label>
          <label className={labelCls}>Owner / operator
            <input value={v.ownerName} onChange={e => set({ ownerName: e.target.value })} className={inputCls} />
          </label>
          <label className={labelCls}>Business type
            <input value={v.businessType} onChange={e => set({ businessType: e.target.value })} className={inputCls} />
          </label>
          <label className={labelCls}>Founded year
            <input value={v.foundedYear} onChange={e => set({ foundedYear: e.target.value })} inputMode="numeric" placeholder="2020" className={inputCls} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>About
            <textarea value={v.aboutText} onChange={e => set({ aboutText: e.target.value })} rows={2} className={inputCls} />
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          {([
            ["Primary (buttons, highlights)", "primaryColor"],
            ["Background (dark base)", "backgroundColor"],
            ["Accent (text, warm tones)", "accentColor"],
          ] as Array<[string, "primaryColor" | "backgroundColor" | "accentColor"]>).map(([lbl, key]) => (
            <label key={key} className={labelCls}>{lbl}
              <span className="mt-1 flex items-center gap-2">
                <input type="color" value={v[key]} onChange={e => set({ [key]: e.target.value } as Partial<BrandSettings>)}
                  aria-label={`${lbl} color picker`} className="h-10 w-12 shrink-0 rounded-lg border border-ink-700 bg-transparent" />
                <input value={v[key]} onChange={e => set({ [key]: e.target.value } as Partial<BrandSettings>)}
                  className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 font-mono text-zinc-100" />
              </span>
            </label>
          ))}
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>Phone
            <input value={v.phone} onChange={e => set({ phone: e.target.value })} className={inputCls} />
          </label>
          <label className={labelCls}>Email
            <input type="email" value={v.email} onChange={e => set({ email: e.target.value })} className={inputCls} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>Website
            <input value={v.website} onChange={e => set({ website: e.target.value })} className={inputCls} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>Street address
            <input value={v.address} onChange={e => set({ address: e.target.value })} className={inputCls} />
          </label>
          <label className={labelCls}>City
            <input value={v.city} onChange={e => set({ city: e.target.value })} className={inputCls} />
          </label>
          <label className={labelCls}>State
            <input value={v.state} onChange={e => set({ state: e.target.value })} className={inputCls} />
          </label>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-3">
          <label className={labelCls}>Sales tax rate (%)
            <input value={taxPct} inputMode="decimal"
              onChange={e => { const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0 && n <= 20) set({ taxRateBp: Math.round(n * 100) }); }}
              className={`${inputCls} w-40`} />
            <span className="mt-1 block text-xs font-normal text-zinc-600">Applied to taxable checkout subtotals ({v.taxRateBp} basis points).</span>
          </label>
          <div className="rounded-xl border border-ink-700 bg-ink-800/50 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-zinc-400">Business hours</p>
            <ul className="space-y-1.5">
              {DAYS.map(d => (
                <li key={d} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-10 font-bold text-zinc-300">{d}</span>
                  <input type="time" value={v.hours[d].open} disabled={v.hours[d].closed}
                    onChange={e => setHours(d, { open: e.target.value })}
                    aria-label={`${d} open`} className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-zinc-100 disabled:opacity-40" />
                  <span className="text-zinc-600">–</span>
                  <input type="time" value={v.hours[d].close} disabled={v.hours[d].closed}
                    onChange={e => setHours(d, { close: e.target.value })}
                    aria-label={`${d} close`} className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-zinc-100 disabled:opacity-40" />
                  <label className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                    <input type="checkbox" checked={v.hours[d].closed} onChange={e => setHours(d, { closed: e.target.checked })} className="h-4 w-4" />
                    Closed
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={labelCls}>Instagram handle
            <input value={v.instagram} onChange={e => set({ instagram: e.target.value })} placeholder="stationhousebbq" className={inputCls} />
          </label>
          <label className={labelCls}>TikTok handle
            <input value={v.tiktok} onChange={e => set({ tiktok: e.target.value })} placeholder="stationhousebbq" className={inputCls} />
          </label>
          <label className={`${labelCls} sm:col-span-2`}>Facebook URL
            <input value={v.facebook} onChange={e => set({ facebook: e.target.value })} placeholder="https://facebook.com/…" className={inputCls} />
          </label>
        </div>
      )}

      {step === 6 && (
        <div className="space-y-2">
          {([
            ["pickupDelivery", "Pickup & Delivery ordering"],
            ["fullServiceBooking", "Full-service catering booking"],
            ["weekendPreorder", "Weekend retail pre-orders"],
            ["shop", "Shop & shipping"],
          ] as Array<[keyof BrandSettings["features"], string]>).map(([key, lbl]) => (
            <label key={key} className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
              {lbl}
              <input type="checkbox" checked={v.features[key]}
                onChange={e => set({ features: { ...v.features, [key]: e.target.checked } })} className="h-5 w-5" />
            </label>
          ))}
          <p className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-300">
            Disabled features are hidden from the public customer app.
          </p>
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep(s => Math.max(1, s - 1))} disabled={step === 1}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 text-sm font-semibold text-zinc-300 disabled:opacity-40">Back</button>
          <button type="button" onClick={() => setStep(s => Math.min(BRAND_STEPS.length, s + 1))} disabled={step === BRAND_STEPS.length}
            className="min-h-[44px] rounded-lg border border-ink-700 px-4 text-sm font-semibold text-zinc-300 disabled:opacity-40">Next</button>
        </div>
        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save brand" : "Saved"}
        </button>
      </div>
    </form>
  );
}

// ── Brand Studio ──────────────────────────────────────────────────────────
interface StudioSettings {
  primaryColor: string; backgroundColor: string; accentColor: string;
  fontFamily: string; voiceTone: string; voiceSample: string;
}
const DEFAULT_STUDIO: StudioSettings = {
  primaryColor: "#EA580C", backgroundColor: "#0F0F0F", accentColor: "#F5F0E8",
  fontFamily: "Inter", voiceTone: "Bold & smoky", voiceSample: "Real fire. Real BBQ. A Servant's Way.",
};

const PRESET_PALETTES = [
  { name: "Fire & Smoke", primary: "#DC2626", bg: "#0F0F0F", accent: "#F5F0E8" },
  { name: "Midnight BBQ", primary: "#F97316", bg: "#1C1917", accent: "#FEF3C7" },
  { name: "Pitmaster Gold", primary: "#D97706", bg: "#111827", accent: "#FFFBEB" },
  { name: "Carolina Blue", primary: "#2563EB", bg: "#0F172A", accent: "#EFF6FF" },
  { name: "Southern Green", primary: "#16A34A", bg: "#052E16", accent: "#F0FDF4" },
  { name: "Texas Red", primary: "#B91C1C", bg: "#1C0000", accent: "#FFF5F5" },
];
const STUDIO_FONTS = ["Inter", "Poppins", "Montserrat", "Oswald", "Bebas Neue", "Playfair Display", "DM Sans", "Work Sans"];
const VOICE_TONES = ["Bold & smoky", "Warm & neighborly", "Premium & refined", "Playful & casual"];
const BRAND_CONTROLS = [
  "App header logo, name & tagline",
  "Navigation & button colors throughout",
  "Card backgrounds and text contrast",
  "Font family across all text",
  "Customer-facing checkout & invoices",
  "Email templates (integrations phase)",
];

export function BrandStudio() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const { data } = useQuery({ queryKey: ["settings", "brandStudio"], queryFn: () => dal.settings.get<StudioSettings>("brandStudio", DEFAULT_STUDIO) });
  const saveMut = useMutation({
    mutationFn: (v: StudioSettings) => { setSync("saving"); return dal.settings.set("brandStudio", v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "brandStudio"] }),
  });
  if (!data) return <p className="py-20 text-center text-zinc-500">Loading brand studio…</p>;
  return (
    <div className="mx-auto max-w-5xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Brand Studio</h1>
          <p className="text-sm text-zinc-500">Palettes, typography &amp; voice — make the software feel like yours</p>
        </div>
        <SyncBadge sync={sync} />
      </header>
      <StudioForm key={JSON.stringify(data)} initial={data} busy={saveMut.isPending} error={saveMut.error?.message ?? null} onSave={v => saveMut.mutate(v)} />
    </div>
  );
}

function StudioForm({ initial, onSave, busy, error }: { initial: StudioSettings; onSave: (v: StudioSettings) => void; busy: boolean; error: string | null; }) {
  const [v, setV] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<StudioSettings>) => { setV(cur => ({ ...cur, ...patch })); setDirty(true); };
  return (
    <form className="mt-6 grid gap-6 lg:grid-cols-2" onSubmit={e => { e.preventDefault(); onSave(v); }}>
      <div className="space-y-5">
        {error && <p role="alert" className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

        {/* Palettes */}
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Color palette</h2>
          <p className="mt-1 text-xs text-zinc-500">Quick presets</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PRESET_PALETTES.map(p => (
              <button type="button" key={p.name} onClick={() => set({ primaryColor: p.primary, backgroundColor: p.bg, accentColor: p.accent })}
                className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-800 p-2 hover:border-zinc-500">
                <span className="flex gap-0.5">
                  <span className="h-5 w-3 rounded-l-sm" style={{ background: p.primary }} />
                  <span className="h-5 w-3" style={{ background: p.bg }} />
                  <span className="h-5 w-3 rounded-r-sm" style={{ background: p.accent }} />
                </span>
                <span className="truncate text-[10px] text-zinc-400">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {([["Primary", "primaryColor"], ["Background", "backgroundColor"], ["Accent", "accentColor"]] as Array<[string, "primaryColor" | "backgroundColor" | "accentColor"]>).map(([lbl, key]) => (
              <div key={key} className="flex items-center gap-3">
                <input type="color" value={v[key]} onChange={e => set({ [key]: e.target.value } as Partial<StudioSettings>)}
                  aria-label={`${lbl} color`} className="h-9 w-10 shrink-0 rounded-lg border border-ink-700 bg-transparent" />
                <span className="flex-1 text-xs text-zinc-400">{lbl}</span>
                <span className="font-mono text-xs text-zinc-300">{v[key]}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Typography */}
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Typography</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {STUDIO_FONTS.map(f => (
              <button type="button" key={f} onClick={() => set({ fontFamily: f })}
                className={`rounded-lg border p-2.5 text-left text-xs font-medium ${v.fontFamily === f ? "border-fire bg-fire/10 text-zinc-100" : "border-ink-700 bg-ink-800 text-zinc-300 hover:border-zinc-500"}`}>
                {f}{v.fontFamily === f && <span className="mt-0.5 block text-[10px] text-fire">Selected</span>}
              </button>
            ))}
          </div>
        </section>

        {/* Voice */}
        <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Brand voice</h2>
          <label className="mt-2 block text-sm font-semibold text-zinc-400">Tone
            <select value={v.voiceTone} onChange={e => set({ voiceTone: e.target.value })} className={inputCls}>
              {VOICE_TONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="mt-3 block text-sm font-semibold text-zinc-400">Sample copy
            <textarea value={v.voiceSample} onChange={e => set({ voiceSample: e.target.value })} rows={2} className={inputCls} />
          </label>
        </section>
      </div>

      {/* Live preview + controls */}
      <div className="space-y-4">
        <div className="rounded-xl border border-ink-700 shadow-2xl" style={{ fontFamily: v.fontFamily }}>
          <div className="flex items-center gap-2 px-3 py-2.5" style={{ backgroundColor: v.backgroundColor }}>
            <span className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-black text-white" style={{ backgroundColor: v.primaryColor }}>SH</span>
            <span className="text-xs font-bold" style={{ color: v.accentColor }}>Station House BBQ</span>
            <span className="ml-auto rounded px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: v.primaryColor }}>Catering</span>
          </div>
          <div className="space-y-2 p-3" style={{ backgroundColor: `${v.backgroundColor}dd` }}>
            <p className="text-xs font-bold" style={{ color: v.accentColor }}>Today's Orders</p>
            {["Johnson Wedding", "Corp Lunch — 50pp", "Church Pickup"].map((o, i) => (
              <div key={o} className="flex items-center gap-2 rounded-lg p-2" style={{ backgroundColor: `${v.accentColor}0d` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i === 0 ? v.primaryColor : "#16A34A" }} />
                <span className="flex-1 truncate text-[10px]" style={{ color: v.accentColor }}>{o}</span>
              </div>
            ))}
            <div className="rounded-lg py-1.5 text-center text-[10px] font-bold text-white" style={{ backgroundColor: v.primaryColor }}>+ New Order</div>
            <p className="pt-1 text-center text-[10px] italic" style={{ color: v.accentColor, opacity: 0.6 }}>&ldquo;{v.voiceSample}&rdquo;</p>
          </div>
        </div>

        <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-bold text-zinc-200">What your brand controls</p>
          <ul className="mt-2 space-y-1.5">
            {BRAND_CONTROLS.map(c => (
              <li key={c} className="flex items-start gap-2 text-xs text-zinc-400"><span className="text-green-400">✓</span>{c}</li>
            ))}
          </ul>
        </div>

        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] w-full rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Apply brand changes" : "Saved"}
        </button>
      </div>
    </form>
  );
}

// ── License Manager ───────────────────────────────────────────────────────
export function LicenseManager() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const { data } = useQuery({ queryKey: ["settings", LICENSE_KEY], queryFn: () => dal.settings.get<LicenseRecord>(LICENSE_KEY, DEFAULT_LICENSE) });
  const saveMut = useMutation({
    mutationFn: (v: LicenseRecord) => { setSync("saving"); return dal.settings.set(LICENSE_KEY, v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", LICENSE_KEY] }),
  });
  if (!data) return <p className="py-20 text-center text-zinc-500">Loading license…</p>;

  const save = (patch: Partial<LicenseRecord>) => saveMut.mutate({ ...data, ...patch });
  const setTier = (tier: PlanTier) => {
    const allowed = new Set(TIER_FEATURES[tier]);
    save({ tier, monthlyFeeCents: TIER_PRICE_CENTS[tier], features: data.features.map(f => ({ ...f, enabled: allowed.has(f.key) })) });
  };
  const setStatus = (status: LicenseStatus) => save({ status });
  const toggleFeature = (key: string) => save({ features: data.features.map(f => f.key === key ? { ...f, enabled: !f.enabled } : f) });
  const enabledCount = data.features.filter(f => f.enabled).length;
  const seatPct = Math.round((data.seatsUsed / Math.max(1, data.seatsTotal)) * 100);

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">License Manager</h1>
          <p className="text-sm text-zinc-500">Plan, seats, status &amp; feature access</p>
        </div>
        <SyncBadge sync={sync} />
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-lg font-black text-zinc-100">{TIER_META[data.tier].label}</p>
          <p className="text-xs text-zinc-500">Current plan</p>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-lg font-black text-green-400">{formatCents(data.monthlyFeeCents)}</p>
          <p className="text-xs text-zinc-500">Per month</p>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-lg font-black text-zinc-100">{data.seatsUsed}/{data.seatsTotal}</p>
          <p className="text-xs text-zinc-500">Seats used</p>
        </div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3">
          <p className="text-lg font-black text-zinc-100">{enabledCount}/{data.features.length}</p>
          <p className="text-xs text-zinc-500">Features on</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">🔑 License key</p>
        <p className="mt-1 font-mono text-sm text-amber-400">{data.maskedKey}</p>
        <p className="mt-1 text-xs text-zinc-600">Keys are masked and validated server-side — full keys never live in the browser.</p>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {(["starter", "pro", "enterprise"] as PlanTier[]).map(tier => (
          <button key={tier} onClick={() => setTier(tier)} disabled={saveMut.isPending}
            className={`rounded-xl border p-3 text-center transition-all ${data.tier === tier ? "border-fire bg-fire/10" : "border-ink-700 bg-ink-900 hover:border-zinc-500"}`}>
            <p className="text-xs font-bold uppercase text-zinc-200">{TIER_META[tier].label}</p>
            <p className="text-lg font-black text-zinc-100">{formatCents(TIER_PRICE_CENTS[tier])}<span className="text-xs font-normal text-zinc-500">/mo</span></p>
            <p className="mt-0.5 text-[10px] text-zinc-500">{TIER_FEATURES[tier].length} features</p>
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">License status</p>
        <div className="grid grid-cols-4 gap-2">
          {(["trial", "active", "suspended", "cancelled"] as LicenseStatus[]).map(s => (
            <button key={s} onClick={() => setStatus(s)} disabled={data.status === s || saveMut.isPending}
              className={`min-h-[40px] rounded-lg px-2 py-1.5 text-xs font-bold ${data.status === s ? STATUS_META[s].cls : "border border-ink-700 text-zinc-500 hover:border-zinc-500"}`}>
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Seats</p>
          <span className="text-xs text-zinc-500">{seatPct}% used</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800">
          <div className="h-full bg-fire" style={{ width: `${Math.min(100, seatPct)}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold text-zinc-400">Seats used
            <input value={String(data.seatsUsed)} inputMode="numeric"
              onChange={e => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n >= 0) save({ seatsUsed: n }); }}
              className="mt-1 w-24 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-right font-mono text-zinc-100" />
          </label>
          <label className="text-sm font-semibold text-zinc-400">Seats total
            <input value={String(data.seatsTotal)} inputMode="numeric"
              onChange={e => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n) && n > 0) save({ seatsTotal: n }); }}
              className="mt-1 w-24 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-right font-mono text-zinc-100" />
          </label>
          <label className="text-sm font-semibold text-zinc-400">Renews
            <input type="date" value={data.renewalDate} onChange={e => save({ renewalDate: e.target.value })}
              className="mt-1 rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-zinc-100" />
          </label>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Feature access</p>
        <div className="grid grid-cols-2 gap-2">
          {data.features.map(f => (
            <button key={f.key} onClick={() => toggleFeature(f.key)} disabled={saveMut.isPending}
              className={`flex items-center gap-2 rounded-lg border p-2 text-left text-xs font-semibold ${f.enabled ? "border-green-800 bg-green-900/20 text-green-300" : "border-ink-800 bg-ink-900 text-zinc-500"}`}>
              <span>{f.enabled ? "✓" : "○"}</span>{f.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Customer App ──────────────────────────────────────────────────────────
interface FeaturedItem { id: string; title: string; subtitle: string; }
interface QuickLink { id: string; label: string; href: string; enabled: boolean; }
interface CustomerAppSettings {
  enabled: boolean; orderingEnabled: boolean; announcement: string;
  heroHeadline: string; heroSub: string;
  featured: FeaturedItem[]; links: QuickLink[];
}
const DEFAULT_CUSTOMER_APP: CustomerAppSettings = {
  enabled: true, orderingEnabled: true, announcement: "",
  heroHeadline: "Station House BBQ", heroSub: "Tampa, Florida",
  featured: [
    { id: "f1", title: "Book Catering", subtitle: "Pickup & Delivery · Full-Service Events" },
    { id: "f2", title: "Retail Weekend", subtitle: "Fire Drop — Fri & Sat Pre-Orders" },
    { id: "f3", title: "Shop & Shipping", subtitle: "Rubs, Sauces, Merch & Nationwide Shipping" },
  ],
  links: [
    { id: "l1", label: "Home", href: "/app", enabled: true },
    { id: "l2", label: "Catering", href: "/app/catering", enabled: true },
    { id: "l3", label: "Shop", href: "/shop", enabled: true },
    { id: "l4", label: "Events", href: "/app/events", enabled: true },
    { id: "l5", label: "About", href: "/app/about", enabled: true },
    { id: "l6", label: "Serve With Us", href: "/app/serve", enabled: true },
  ],
};

export function CustomerApp() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const { data } = useQuery({
    queryKey: ["settings", "customerApp"],
    queryFn: () => dal.settings.get<Partial<CustomerAppSettings>>("customerApp", DEFAULT_CUSTOMER_APP),
    select: (v: Partial<CustomerAppSettings>) => ({ ...DEFAULT_CUSTOMER_APP, ...v, featured: v.featured ?? DEFAULT_CUSTOMER_APP.featured, links: v.links ?? DEFAULT_CUSTOMER_APP.links }),
  });
  const saveMut = useMutation({
    mutationFn: (v: CustomerAppSettings) => { setSync("saving"); return dal.settings.set("customerApp", v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", "customerApp"] }),
  });
  if (!data) return <p className="py-20 text-center text-zinc-500">Loading customer app settings…</p>;
  return (
    <div className="mx-auto max-w-2xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Customer App</h1>
          <p className="text-sm text-zinc-500">Hero, featured tiles, banner &amp; nav links</p>
        </div>
        <SyncBadge sync={sync} />
      </header>
      <CustomerAppForm key={JSON.stringify(data)} initial={data} busy={saveMut.isPending} error={saveMut.error?.message ?? null} onSave={v => saveMut.mutate(v)} />
    </div>
  );
}

function CustomerAppForm({ initial, onSave, busy, error }: { initial: CustomerAppSettings; onSave: (v: CustomerAppSettings) => void; busy: boolean; error: string | null; }) {
  const [v, setV] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const set = (patch: Partial<CustomerAppSettings>) => { setV(cur => ({ ...cur, ...patch })); setDirty(true); };
  const patchFeatured = (id: string, patch: Partial<FeaturedItem>) => { setV(c => ({ ...c, featured: c.featured.map(f => f.id === id ? { ...f, ...patch } : f) })); setDirty(true); };
  const patchLink = (id: string, patch: Partial<QuickLink>) => { setV(c => ({ ...c, links: c.links.map(l => l.id === id ? { ...l, ...patch } : l) })); setDirty(true); };

  return (
    <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); onSave(v); }}>
      {error && <p role="alert" className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Availability</h2>
        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
          Customer app enabled
          <input type="checkbox" checked={v.enabled} onChange={e => set({ enabled: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className="flex min-h-[44px] items-center justify-between gap-3 rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
          Online ordering enabled
          <input type="checkbox" checked={v.orderingEnabled} onChange={e => set({ orderingEnabled: e.target.checked })} className="h-5 w-5" />
        </label>
        <label className={labelCls}>Announcement banner
          <textarea value={v.announcement} onChange={e => set({ announcement: e.target.value })} rows={2} placeholder="Shown at the top of the customer app" className={inputCls} />
        </label>
      </section>

      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Home hero</h2>
        <label className={labelCls}>Headline
          <input value={v.heroHeadline} onChange={e => set({ heroHeadline: e.target.value })} className={inputCls} />
        </label>
        <label className={labelCls}>Sub-headline
          <input value={v.heroSub} onChange={e => set({ heroSub: e.target.value })} className={inputCls} />
        </label>
      </section>

      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Featured tiles</h2>
        <ul className="mt-3 space-y-2">
          {v.featured.map(f => (
            <li key={f.id} className="rounded-lg border border-ink-700 bg-ink-800/60 p-2">
              <input value={f.title} onChange={e => patchFeatured(f.id, { title: e.target.value })} aria-label="Featured title"
                className="w-full rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm font-bold text-zinc-100" />
              <input value={f.subtitle} onChange={e => patchFeatured(f.id, { subtitle: e.target.value })} aria-label="Featured subtitle"
                className="mt-1.5 w-full rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-xs text-zinc-400" />
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">Navigation links</h2>
        <ul className="mt-3 space-y-2">
          {v.links.map(l => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2">
              <input value={l.label} onChange={e => patchLink(l.id, { label: e.target.value })} aria-label="Link label"
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-zinc-100" />
              <input value={l.href} onChange={e => patchLink(l.id, { href: e.target.value })} aria-label="Link href"
                className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 font-mono text-xs text-zinc-400" />
              <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                <input type="checkbox" checked={l.enabled} onChange={e => patchLink(l.id, { enabled: e.target.checked })} className="h-4 w-4" /> On
              </label>
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-zinc-400">
        These settings drive the public customer home &amp; layout. Preview at <span className="font-mono text-zinc-300">/app</span>.
      </p>

      <div className="flex justify-end">
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

  return (
    <div className="mx-auto max-w-3xl pt-6 pb-12">
      <h1 className="text-2xl font-black uppercase text-zinc-100">AI Import Hub</h1>
      <p className="mt-1 text-sm text-zinc-500">Paste or upload CSV/TSV data — parsed in your browser, mapped, and staged for import</p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["1", "Paste or upload", "CSV, TSV or spreadsheet export — any delimiter"],
          ["2", "Map columns", "Match your headers to the target fields"],
          ["3", "Review & stage", "Preview parsed rows before they queue for import"],
        ].map(([n, t, d]) => (
          <div key={n} className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-900 p-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fire text-sm font-bold text-white">{n}</span>
            <div><p className="text-sm font-semibold text-zinc-100">{t}</p><p className="mt-0.5 text-xs text-zinc-500">{d}</p></div>
          </div>
        ))}
      </div>

      <ImportWorkbench />

      <h2 className="mt-8 text-sm font-black uppercase tracking-wider text-zinc-300">Import history</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-ink-700">
        <table className="w-full text-left text-sm">
          <thead className="bg-ink-800 text-xs font-bold uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2.5">Source</th><th className="px-3 py-2.5">Kind</th>
              <th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5 text-right">Rows</th><th className="px-3 py-2.5">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-800 bg-ink-900">
            {isLoading && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">Loading…</td></tr>}
            {jobs?.map(j => (
              <tr key={j.id}>
                <td className="px-3 py-2.5 font-semibold text-zinc-100">{j.source}</td>
                <td className="px-3 py-2.5 text-zinc-400">{j.kind}</td>
                <td className="px-3 py-2.5"><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${IMPORT_STATUS_CLS[j.status]}`}>{j.status.replace("_", " ")}</span></td>
                <td className="px-3 py-2.5 text-right font-mono text-zinc-400">{j.rows}</td>
                <td className="px-3 py-2.5 text-xs text-zinc-500">{new Date(j.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {jobs && jobs.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No import jobs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface StagedImport { target: ImportTarget; mapping: Record<string, string>; table: ParsedTable; }

function ImportWorkbench() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [targetKind, setTargetKind] = useState<string>(IMPORT_TARGETS[0].kind);
  const [text, setText] = useState("");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [parseError, setParseError] = useState<string | null>(null);
  const [staged, setStaged] = useState<StagedImport[]>([]);

  const target = useMemo(() => IMPORT_TARGETS.find(t => t.kind === targetKind) ?? IMPORT_TARGETS[0], [targetKind]);

  const doParse = (raw: string) => {
    setParseError(null);
    const parsed = parseDelimited(raw);
    if (!parsed || parsed.rows.length === 0) { setTable(null); setParseError("No rows detected. Paste a header row plus at least one data row."); return; }
    setTable(parsed);
    setMapping(autoMap(parsed.headers, target));
  };

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => { const t = String(reader.result ?? ""); setText(t); doParse(t); };
    reader.onerror = () => setParseError("Could not read file.");
    reader.readAsText(file);
  };

  const mappedRows = useMemo(() => {
    if (!table) return [];
    return table.rows.slice(0, 8).map(row =>
      target.fields.map(f => {
        const src = mapping[f];
        const idx = src ? table.headers.indexOf(src) : -1;
        return idx >= 0 ? row[idx] : "";
      })
    );
  }, [table, mapping, target]);

  const stage = () => {
    if (!table) return;
    setStaged(cur => [{ target, mapping: { ...mapping }, table }, ...cur]);
    setText(""); setTable(null); setMapping({});
  };

  return (
    <div className="mt-4 rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className={labelCls}>Import into
          <select value={targetKind} onChange={e => { setTargetKind(e.target.value); if (table) setMapping(autoMap(table.headers, IMPORT_TARGETS.find(t => t.kind === e.target.value)!)); }}
            className="mt-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
            {IMPORT_TARGETS.map(t => <option key={t.kind} value={t.kind}>{t.label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => fileRef.current?.click()}
          className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-4 text-sm font-bold text-zinc-200">Upload file…</button>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>

      <label className={`${labelCls} mt-3`}>Or paste data (CSV/TSV, with header row)
        <textarea value={text} onChange={e => setText(e.target.value)} onBlur={() => text.trim() && doParse(text)} rows={5}
          placeholder={"name,category,price,unit\nBrisket,Proteins,32.99,lb"} className={`${inputCls} font-mono text-xs`} />
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => doParse(text)} disabled={!text.trim()}
          className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-50">Parse preview</button>
        {parseError && <span role="alert" className="text-xs font-semibold text-red-400">{parseError}</span>}
      </div>

      {table && (
        <div className="mt-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {target.fields.map(f => (
              <label key={f} className="text-xs font-semibold text-zinc-400">Map <span className="text-zinc-200">{f}</span> from
                <select value={mapping[f] ?? ""} onChange={e => setMapping(m => ({ ...m, [f]: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100">
                  <option value="">— none —</option>
                  {table.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-ink-700">
            <table className="w-full text-left text-xs">
              <thead className="bg-ink-800 font-bold uppercase text-zinc-400">
                <tr>{target.fields.map(f => <th key={f} className="px-2.5 py-2">{f}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-ink-800 bg-ink-900">
                {mappedRows.map((r, i) => (
                  <tr key={i}>{r.map((c, j) => <td key={j} className="px-2.5 py-1.5 text-zinc-300">{c || <span className="text-zinc-600">—</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-500">{table.rows.length} row{table.rows.length === 1 ? "" : "s"} parsed{table.rows.length > 8 ? " (showing first 8)" : ""}.</p>
          <button type="button" onClick={stage}
            className="min-h-[44px] rounded-lg bg-green-600 px-5 text-sm font-bold text-white">Stage {table.rows.length} rows for import</button>
        </div>
      )}

      {staged.length > 0 && (
        <div className="mt-4 rounded-lg border border-green-800 bg-green-950/30 p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-green-300">Staged this session</p>
          <ul className="mt-2 space-y-1">
            {staged.map((s, i) => (
              <li key={i} className="flex items-center justify-between text-xs text-zinc-300">
                <span>{s.target.label}</span>
                <span className="font-mono text-zinc-500">{s.table.rows.length} rows · mapped {Object.values(s.mapping).filter(Boolean).length}/{s.target.fields.length}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-zinc-600">Staged rows queue as import jobs in the integrations phase — nothing leaves your browser here.</p>
        </div>
      )}
    </div>
  );
}
// ── Express Menu (Express Catering funnel pricing) ───────────────────────
// Edits the "expressCatering" settings shape read by the public /express
// funnel: Party Sampler packages + à la carte items. Prices use the same
// tap-to-edit pattern as the master Menu editor; saves audit via settings.set.

export function ExpressMenu() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");

  const { data } = useQuery({
    queryKey: ["settings", EXPRESS_SETTINGS_KEY],
    queryFn: () => dal.settings.get<ExpressCateringSettings>(EXPRESS_SETTINGS_KEY, EXPRESS_DEFAULTS),
  });

  const saveMut = useMutation({
    mutationFn: (v: ExpressCateringSettings) => {
      setSync("saving");
      return dal.settings.set(EXPRESS_SETTINGS_KEY, v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["settings", EXPRESS_SETTINGS_KEY] }),
  });

  if (!data) return <p className="py-20 text-center text-zinc-500">Loading express menu…</p>;

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-12">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-black uppercase text-zinc-100">Express Menu</h1>
        <div className="flex items-center gap-2">
          <a href="/express" target="_blank" rel="noopener noreferrer"
            className="min-h-[44px] rounded-lg border border-ink-700 px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-zinc-100">
            Preview order page →
          </a>
          <SyncBadge sync={sync} />
        </div>
      </header>
      <p className="mt-1 text-sm text-zinc-500">
        Powers the public Express Catering funnel (/express) — Party Sampler packages and à la carte pricing. Tap a price to edit.
        Package minimum guest counts are set per package below; pickup requires a $250 minimum, delivery $500.
      </p>
      <ExpressCateringForm key={JSON.stringify(data)} initial={data} busy={saveMut.isPending}
        error={saveMut.error?.message ?? null} onSave={v => saveMut.mutate(v)} />
    </div>
  );
}

const EXPRESS_CATEGORIES: Array<{ key: ExpressCategory; label: string }> = [
  { key: "proteins", label: "🥩 Proteins" },
  { key: "sides", label: "🥗 Sides" },
  { key: "extras", label: "🍞 Extras" },
];

function ExpressCateringForm({ initial, onSave, busy, error }: {
  initial: ExpressCateringSettings; onSave: (v: ExpressCateringSettings) => void; busy: boolean; error: string | null;
}) {
  const [packages, setPackages] = useState<ExpressPackage[]>(initial.packages);
  const [alaCarte, setAlaCarte] = useState<ExpressAlaCarteItem[]>(initial.alaCarte);
  const [dirty, setDirty] = useState(false);
  const [alcFilter, setAlcFilter] = useState<ExpressCategory | "all">("all");

  const patchPackage = (id: string, patch: Partial<ExpressPackage>) => {
    setPackages(cur => cur.map(p => p.id === id ? { ...p, ...patch } : p)); setDirty(true);
  };
  const patchAlc = (id: string, patch: Partial<ExpressAlaCarteItem>) => {
    setAlaCarte(cur => cur.map(a => a.id === id ? { ...a, ...patch } : a)); setDirty(true);
  };

  const rowInput = "min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-2.5 py-1.5 text-sm text-zinc-100";

  return (
    <form className="mt-6 space-y-6"
      onSubmit={e => {
        e.preventDefault();
        if (packages.some(p => !p.name.trim()) || alaCarte.some(a => !a.name.trim())) return;
        onSave({ packages, alaCarte });
      }}>
      {error && <p role="alert" className="rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

      {/* Packages */}
      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">🍖 Party Sampler packages</h2>
        <ul className="mt-3 space-y-2">
          {packages.map(p => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2">
              <input value={p.name} onChange={e => patchPackage(p.id, { name: e.target.value })}
                aria-label={`Package name for ${p.name || "new package"}`}
                className={`${rowInput} min-w-0 flex-1`} />
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase text-zinc-500">
                Feeds
                <input value={String(p.feeds)} inputMode="numeric" aria-label={`Feeds count for ${p.name}`}
                  onChange={e => { const n = parseInt(e.target.value, 10); patchPackage(p.id, { feeds: Number.isFinite(n) && n > 0 ? n : 0 }); }}
                  className={`${rowInput} w-16 text-right font-mono`} />
              </label>
              <ExpressPriceCell label={p.name} priceCents={p.priceCents} onSave={cents => patchPackage(p.id, { priceCents: cents })} />
              <button type="button" onClick={() => { setPackages(cur => cur.filter(x => x.id !== p.id)); setDirty(true); }}
                aria-label={`Remove package ${p.name}`}
                className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 text-xs font-semibold text-zinc-500 hover:text-red-400">
                Remove
              </button>
              <textarea value={p.contents} onChange={e => patchPackage(p.id, { contents: e.target.value })}
                aria-label={`Contents for ${p.name}`} rows={2}
                className={`${rowInput} w-full text-xs text-zinc-400`} />
            </li>
          ))}
          {packages.length === 0 && <li className="py-4 text-center text-sm text-zinc-600">No packages.</li>}
        </ul>
        <button type="button"
          onClick={() => {
            setPackages(cur => [...cur, {
              id: slugId("pkg"), name: "New package", feeds: 10, priceCents: 0,
              contents: "", note: "All 5 meats · 3 sides · bread & fixings. Not available for full service.",
            }]); setDirty(true);
          }}
          className="mt-3 min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-4 text-sm font-bold text-zinc-200">
          + Add package
        </button>
      </section>

      {/* À la carte */}
      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-black uppercase tracking-wider text-zinc-300">🥩 À la carte items</h2>
          <div className="flex flex-wrap gap-1">
            {([{ key: "all", label: "All" }, ...EXPRESS_CATEGORIES] as Array<{ key: ExpressCategory | "all"; label: string }>).map(c => (
              <button type="button" key={c.key} onClick={() => setAlcFilter(c.key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold ${alcFilter === c.key ? "bg-fire text-white" : "border border-ink-700 text-zinc-400 hover:text-zinc-200"}`}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
        <ul className="mt-3 space-y-2">
          {alaCarte.filter(a => alcFilter === "all" || a.category === alcFilter).map(a => (
            <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-700 bg-ink-800/60 px-3 py-2">
              <select value={a.category} onChange={e => patchAlc(a.id, { category: e.target.value as ExpressCategory })}
                aria-label={`Category for ${a.name}`} className={`${rowInput} w-32`}>
                {EXPRESS_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
              </select>
              <input value={a.name} onChange={e => patchAlc(a.id, { name: e.target.value })}
                aria-label={`Item name for ${a.name || "new item"}`} className={`${rowInput} min-w-0 flex-1`} />
              <label className="flex items-center gap-1.5 text-xs font-bold uppercase text-zinc-500">
                Unit
                <input value={a.unit} onChange={e => patchAlc(a.id, { unit: e.target.value })}
                  aria-label={`Unit for ${a.name}`} className={`${rowInput} w-20`} />
              </label>
              <ExpressPriceCell label={a.name} priceCents={a.priceCents} onSave={cents => patchAlc(a.id, { priceCents: cents })} />
              <button type="button" onClick={() => { setAlaCarte(cur => cur.filter(x => x.id !== a.id)); setDirty(true); }}
                aria-label={`Remove item ${a.name}`}
                className="min-h-[36px] rounded-lg border border-ink-700 px-2.5 text-xs font-semibold text-zinc-500 hover:text-red-400">
                Remove
              </button>
              <input value={a.description ?? ""} onChange={e => patchAlc(a.id, { description: e.target.value })}
                aria-label={`Description for ${a.name}`} placeholder="Optional description shown on the order page"
                className={`${rowInput} w-full text-xs text-zinc-400`} />
            </li>
          ))}
          {alaCarte.length === 0 && <li className="py-4 text-center text-sm text-zinc-600">No à la carte items.</li>}
        </ul>
        <button type="button"
          onClick={() => { setAlaCarte(cur => [...cur, { id: slugId("alc"), category: "proteins", name: "New item", unit: "lb", priceCents: 0 }]); setDirty(true); }}
          className="mt-3 min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-4 text-sm font-bold text-zinc-200">
          + Add item
        </button>
      </section>

      <div className="flex justify-end">
        <button type="submit" disabled={busy || !dirty}
          className="min-h-[44px] rounded-lg bg-fire px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
          {busy ? "Saving…" : dirty ? "Save express menu" : "Saved"}
        </button>
      </div>
    </form>
  );
}

/** Tap-to-edit price (same interaction as MenuEditor's PriceCell). */
function ExpressPriceCell({ label, priceCents, onSave }: { label: string; priceCents: number; onSave: (cents: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");
  if (!editing) {
    return (
      <button type="button" onClick={() => { setVal((priceCents / 100).toFixed(2)); setEditing(true); }}
        title="Tap to edit price" aria-label={`Edit price for ${label}`}
        className="min-h-[36px] rounded-lg border border-transparent px-2.5 py-1 font-mono text-sm text-zinc-200 hover:border-ink-700 hover:bg-ink-800">
        {formatCents(priceCents)}
      </button>
    );
  }
  const commit = () => {
    const cents = dollarsToCents(val);
    if (cents !== null && cents !== priceCents) onSave(cents);
    setEditing(false);
  };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape") setEditing(false); }}
      className="w-24 rounded-lg border border-fire/50 bg-ink-800 px-2 py-1 text-right font-mono text-sm text-zinc-100"
      aria-label={`Price in dollars for ${label}`} />
  );
}

// ── Events Manager ────────────────────────────────────────────────────────
export function EventsManager() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [sync, setSync] = useState<Sync>("idle");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "live" | "off" | "upcoming">("all");

  const { data: events, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => dal.events.list() });

  const upsertMut = useMutation({
    mutationFn: (e: Omit<SpecialEvent, "updatedAt">) => {
      setSync("saving");
      return dal.events.upsert(e, actor).then(r => { setSync("saved"); return r; }, err => { setSync("error"); throw err; });
    },
    onSuccess: () => { setDialogOpen(false); qc.invalidateQueries({ queryKey: ["events"] }); },
  });

  if (isLoading || !events) return <p className="py-20 text-center text-zinc-500">Loading events…</p>;

  const today = new Date().toISOString().slice(0, 10);
  const liveCount = events.filter(e => e.landingEnabled).length;
  const orderingCount = events.filter(e => e.orderingEnabled).length;
  const upcomingCount = events.filter(e => e.eventDate && e.eventDate >= today).length;
  const shown = events.filter(ev =>
    filter === "all" ? true :
    filter === "live" ? ev.landingEnabled :
    filter === "off" ? !ev.landingEnabled :
    !!ev.eventDate && ev.eventDate >= today);

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

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3"><p className="text-lg font-black text-zinc-100">{events.length}</p><p className="text-xs text-zinc-500">Total</p></div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3"><p className="text-lg font-black text-green-400">{liveCount}</p><p className="text-xs text-zinc-500">Landing live</p></div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3"><p className="text-lg font-black text-green-400">{orderingCount}</p><p className="text-xs text-zinc-500">Ordering open</p></div>
        <div className="rounded-xl border border-ink-700 bg-ink-900 p-3"><p className="text-lg font-black text-zinc-100">{upcomingCount}</p><p className="text-xs text-zinc-500">Upcoming</p></div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {([["all", "All"], ["live", "Landing live"], ["off", "Landing off"], ["upcoming", "Upcoming"]] as Array<[typeof filter, string]>).map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${filter === k ? "bg-fire text-white" : "border border-ink-700 text-zinc-400 hover:text-zinc-200"}`}>
            {lbl}
          </button>
        ))}
      </div>

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
            {shown.map(ev => (
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
            {shown.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-zinc-500">No events match this filter.</td></tr>}
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
