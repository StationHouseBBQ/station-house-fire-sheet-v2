import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import {
  CATERING_CATALOG_KEY, CATERING_CATALOG_DEFAULTS, type CateringCatalog,
} from "../../lib/cateringCatalog";

/**
 * Admin · Catering Menu — the full Station House catering catalog (from the
 * House Catering Collection), browsable and price-editable. Persists to the
 * "cateringCatalog" settings key; the catering quote builder reads the same
 * catalog so edits here flow straight into quotes. Every price is editable
 * because catering pricing changes.
 */

type Sync = "idle" | "saving" | "saved" | "error";
type Tab = "packages" | "proteins" | "sides" | "bites" | "extras" | "staffing" | "fees";

function dollars(cents: number): string { return (cents / 100).toFixed(2); }
function toCents(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function MoneyInput({ cents, onChange, suffix }: { cents: number; onChange: (c: number) => void; suffix?: string }) {
  const [val, setVal] = useState(dollars(cents));
  return (
    <div className="flex items-center gap-1">
      <div className="relative w-24">
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-zinc-500">$</span>
        <input inputMode="decimal" value={val}
          onChange={e => { setVal(e.target.value); const c = toCents(e.target.value); if (c != null) onChange(c); }}
          onBlur={() => setVal(dollars(cents))}
          className="w-full rounded border border-ink-700 bg-ink-800 py-1.5 pl-5 pr-2 text-right text-sm font-bold text-zinc-100 focus:border-fire/60"
          aria-label="Price" />
      </div>
      {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
    </div>
  );
}

function NumberInput({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [val, setVal] = useState(String(value));
  return (
    <div className="flex items-center gap-1">
      <input inputMode="decimal" value={val}
        onChange={e => { setVal(e.target.value); const n = Number(e.target.value); if (Number.isFinite(n) && n >= 0) onChange(n); }}
        onBlur={() => setVal(String(value))}
        className="w-16 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-right text-sm font-bold text-zinc-100 focus:border-fire/60" aria-label="Value" />
      {suffix && <span className="text-xs text-zinc-500">{suffix}</span>}
    </div>
  );
}

export function CateringMenu() {
  const dal = getDal();
  const { actor } = useRole();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("packages");
  const [sync, setSync] = useState<Sync>("idle");
  const [draft, setDraft] = useState<CateringCatalog | null>(null);

  const { data } = useQuery({
    queryKey: ["settings", CATERING_CATALOG_KEY],
    queryFn: () => dal.settings.get<CateringCatalog>(CATERING_CATALOG_KEY, CATERING_CATALOG_DEFAULTS),
  });

  const cat = draft ?? data ?? CATERING_CATALOG_DEFAULTS;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(data ?? CATERING_CATALOG_DEFAULTS);

  const saveMut = useMutation({
    mutationFn: (v: CateringCatalog) => { setSync("saving"); return dal.settings.set(CATERING_CATALOG_KEY, v, actor).then(() => setSync("saved"), e => { setSync("error"); throw e; }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", CATERING_CATALOG_KEY] }); setDraft(null); },
  });

  const edit = (fn: (c: CateringCatalog) => CateringCatalog) => setDraft(d => fn(structuredClone(d ?? data ?? CATERING_CATALOG_DEFAULTS)));

  const TABS: Array<{ k: Tab; label: string }> = [
    { k: "packages", label: "Packages" }, { k: "proteins", label: "Proteins" }, { k: "sides", label: "Sides" },
    { k: "bites", label: "Starter Bites" }, { k: "extras", label: "Extras" }, { k: "staffing", label: "Staffing" }, { k: "fees", label: "Fees & Rules" },
  ];

  const groups = useMemo(() => {
    const g: Record<string, typeof cat.packages> = {};
    for (const p of cat.packages) (g[p.group] ??= []).push(p);
    return g;
  }, [cat.packages]);

  return (
    <div className="mx-auto max-w-4xl pt-6 pb-16">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Catering Menu</h1>
          <p className="text-sm text-zinc-500">The House Catering Collection · every price is editable and feeds the quote builder</p>
        </div>
        <div className="flex items-center gap-2">
          {sync === "saved" && <span className="text-xs font-semibold text-green-400">Saved ✓</span>}
          {sync === "error" && <span className="text-xs font-semibold text-red-400">Save failed</span>}
          <button disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate(cat)}
            className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-40">Save changes</button>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-1">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${tab === t.k ? "bg-fire text-white" : "bg-ink-800 text-zinc-400"}`}>{t.label}</button>
        ))}
      </div>

      <div className="mt-5 space-y-6">
        {tab === "packages" && Object.entries(groups).map(([group, pkgs]) => (
          <section key={group}>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-fire-light">{group}</h2>
            <ul className="space-y-2">
              {pkgs.map(p => (
                <li key={p.id} className="rounded-xl border border-ink-800 bg-ink-900 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-zinc-100">{p.name}</span>
                    <MoneyInput cents={p.pricePerGuestCents} suffix="/ guest"
                      onChange={c => edit(cc => { const t = cc.packages.find(x => x.id === p.id); if (t) t.pricePerGuestCents = c; return cc; })} />
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{p.includes}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {tab === "packages" && (
          <section>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-amber-300">Premium upgrade surcharges (per guest)</h2>
            <p className="text-xs text-zinc-500">Smoked and Beyond-the-Pit premium upgrades are configured on the Proteins tab.</p>
          </section>
        )}

        {tab === "proteins" && (["smoked", "beyond_pit"] as const).map(line => (
          <section key={line}>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-fire-light">{line === "smoked" ? "Smoked" : "Beyond the Pit"}</h2>
            <ul className="space-y-1.5">
              {cat.proteins.filter(p => p.line === line).map(p => (
                <li key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-zinc-100">{p.name}</span>
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${p.tier === "premium" ? "bg-amber-600/20 text-amber-300" : "bg-emerald-600/20 text-emerald-300"}`}>{p.tier === "premium" ? "Premium" : "Included"}</span>
                    <p className="text-xs text-zinc-500">{p.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {tab === "sides" && (["A", "B"] as const).map(shift => (
          <section key={shift}>
            <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-fire-light">{shift}-Shift Sides</h2>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {cat.sides.filter(s => s.shift === shift).map(s => (
                <li key={s.id} className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
                  <span className="text-sm font-semibold text-zinc-100">{s.name}</span>
                  {s.description && <p className="text-xs text-zinc-500">{s.description}</p>}
                </li>
              ))}
            </ul>
          </section>
        ))}

        {tab === "bites" && (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {cat.starterBites.map(b => (
              <li key={b.id} className="rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
                <span className="text-sm font-semibold text-zinc-100">{b.name}</span>
                <p className="text-xs text-zinc-500">{b.description}</p>
              </li>
            ))}
          </ul>
        )}

        {tab === "extras" && (
          <>
            <PricedSection title="À la carte / Tailgate" items={cat.alaCarte}
              onPrice={(id, c) => edit(cc => { const t = cc.alaCarte.find(x => x.id === id); if (t) t.priceCents = c; return cc; })} />
            <PricedSection title="Desserts" items={cat.desserts}
              onPrice={(id, c) => edit(cc => { const t = cc.desserts.find(x => x.id === id); if (t) t.priceCents = c; return cc; })} />
            <PricedSection title="Beverages" items={cat.beverages}
              onPrice={(id, c) => edit(cc => { const t = cc.beverages.find(x => x.id === id); if (t) t.priceCents = c; return cc; })} />
            <PricedSection title="Breakfast (30-guest min)" items={cat.breakfast}
              onPrice={(id, c) => edit(cc => { const t = cc.breakfast.find(x => x.id === id); if (t) t.priceCents = c; return cc; })} />
          </>
        )}

        {tab === "staffing" && (
          <ul className="space-y-2">
            {cat.staffRates.map(r => (
              <li key={r.id} className="rounded-xl border border-ink-800 bg-ink-900 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-zinc-100">{r.role}</span>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-zinc-500">Base <MoneyInput cents={r.baseCents} onChange={c => edit(cc => { const t = cc.staffRates.find(x => x.id === r.id); if (t) t.baseCents = c; return cc; })} /></label>
                    {r.addlHourCents != null && (
                      <label className="text-xs text-zinc-500">+/hr <MoneyInput cents={r.addlHourCents} onChange={c => edit(cc => { const t = cc.staffRates.find(x => x.id === r.id); if (t) t.addlHourCents = c; return cc; })} /></label>
                    )}
                  </div>
                </div>
                {r.note && <p className="mt-1 text-xs text-zinc-500">{r.note}</p>}
              </li>
            ))}
            <li className="rounded-lg border border-ink-800 bg-ink-950/50 px-3 py-2 text-xs text-zinc-500">Rule: 1 Buffet Captain + 1 Server per {cat.fees.captainPerGuests} guests (non-negotiable).</li>
          </ul>
        )}

        {tab === "fees" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FeeRow label="Operations fee %" ><NumberInput value={cat.fees.operationsFeePct} suffix="%" onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, operationsFeePct: n } }))} /></FeeRow>
            <FeeRow label="Ops fee min (f&b)"><MoneyInput cents={cat.fees.operationsFeeMinCents} onChange={c => edit(cc => ({ ...cc, fees: { ...cc.fees, operationsFeeMinCents: c } }))} /></FeeRow>
            <FeeRow label="Gratuity (full service) %"><NumberInput value={cat.fees.gratuityFullServicePct} suffix="%" onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, gratuityFullServicePct: n } }))} /></FeeRow>
            <FeeRow label="Gratuity (delivery) %"><NumberInput value={cat.fees.gratuityDeliveryPct} suffix="%" onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, gratuityDeliveryPct: n } }))} /></FeeRow>
            <FeeRow label="Delivery base"><MoneyInput cents={cat.fees.deliveryBaseCents} onChange={c => edit(cc => ({ ...cc, fees: { ...cc.fees, deliveryBaseCents: c } }))} /></FeeRow>
            <FeeRow label="Delivery / mile"><MoneyInput cents={cat.fees.deliveryPerMileCents} onChange={c => edit(cc => ({ ...cc, fees: { ...cc.fees, deliveryPerMileCents: c } }))} /></FeeRow>
            <FeeRow label="Cake cutting / guest"><MoneyInput cents={cat.fees.cakeCuttingPerGuestCents} onChange={c => edit(cc => ({ ...cc, fees: { ...cc.fees, cakeCuttingPerGuestCents: c } }))} /></FeeRow>
            <FeeRow label="Boxed surcharge / guest"><MoneyInput cents={cat.fees.boxedSurchargePerGuestCents} onChange={c => edit(cc => ({ ...cc, fees: { ...cc.fees, boxedSurchargePerGuestCents: c } }))} /></FeeRow>
            <FeeRow label="Deposit >6 mo %"><NumberInput value={cat.fees.depositOver6moPct} suffix="%" onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, depositOver6moPct: n } }))} /></FeeRow>
            <FeeRow label="Deposit <6 mo %"><NumberInput value={cat.fees.depositWithin6moPct} suffix="%" onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, depositWithin6moPct: n } }))} /></FeeRow>
            <FeeRow label="Min guests (buffet)"><NumberInput value={cat.fees.minGuestsBuffet} onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, minGuestsBuffet: n } }))} /></FeeRow>
            <FeeRow label="Min guests (boxed)"><NumberInput value={cat.fees.minGuestsBoxed} onChange={n => edit(cc => ({ ...cc, fees: { ...cc.fees, minGuestsBoxed: n } }))} /></FeeRow>
          </div>
        )}
      </div>
    </div>
  );
}

function PricedSection({ title, items, onPrice }: {
  title: string; items: Array<{ id: string; name: string; priceCents: number; unit?: string; note?: string }>; onPrice: (id: string, cents: number) => void;
}) {
  return (
    <section className="mb-2">
      <h2 className="mb-2 text-sm font-black uppercase tracking-wider text-fire-light">{title}</h2>
      <ul className="space-y-1.5">
        {items.map(i => (
          <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
            <div className="min-w-0">
              <span className="text-sm font-semibold text-zinc-100">{i.name}</span>
              {i.note && <p className="text-xs text-zinc-500">{i.note}</p>}
            </div>
            <MoneyInput cents={i.priceCents} suffix={i.unit ? `/ ${i.unit}` : undefined} onChange={c => onPrice(i.id, c)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FeeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2">
      <span className="text-sm font-semibold text-zinc-300">{label}</span>
      {children}
    </div>
  );
}
