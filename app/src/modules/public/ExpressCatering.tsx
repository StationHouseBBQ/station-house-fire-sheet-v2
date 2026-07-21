import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { DiscountCode, ExpressCheckoutInput } from "../../dal/types";
import { formatCents, orderTotals } from "../../lib/money";
import { currentTime } from "../../lib/clock";
import { captureAttribution } from "../../lib/attribution";
import {
  EXPRESS_DEFAULTS, EXPRESS_DELIVERY_FEE_CENTS, EXPRESS_DELIVERY_FEE_LABEL,
  EXPRESS_DELIVERY_MIN_CENTS, EXPRESS_PICKUP_MIN_CENTS, EXPRESS_SETTINGS_KEY,
  recommendedPackageId, type ExpressCategory, type ExpressCateringSettings,
} from "../../lib/expressMenu";
import { PublicLayout, DemoPaymentNotice } from "./PublicLayout";

/**
 * Express Catering funnel — mirrors the LIVE 4-step wizard:
 * 1 Guests · 2 Pickup or Delivery · 3 Menu · 4 Details & Payment.
 * Prices shown are display-only; dal.publicCheckout.expressCheckout
 * recomputes everything server-side style (settings prices, 24h notice,
 * minimums, discount, delivery fee, 7.5% tax).
 */

const STEPS = ["Guests", "Pickup or Delivery", "Menu", "Details & Payment"] as const;
const GUEST_PRESETS = [10, 20, 30, 50];

const CATEGORY_CHIPS: Array<{ key: ExpressCategory; label: string }> = [
  { key: "proteins", label: "🥩 Proteins" },
  { key: "sides", label: "🥗 Sides" },
  { key: "extras", label: "🍞 Extras" },
];

type Fulfillment = "pickup" | "delivery";

export function ExpressCatering() {
  const dal = getDal();
  const [, navigate] = useLocation();
  useEffect(() => { captureAttribution(); }, []);

  const { data: menu } = useQuery({
    queryKey: ["public", "expressCatering"],
    queryFn: () => dal.settings.get<ExpressCateringSettings>(EXPRESS_SETTINGS_KEY, EXPRESS_DEFAULTS),
  });

  const [step, setStep] = useState(0);
  // Step 1
  const [guests, setGuests] = useState<number | null>(null);
  const [customGuests, setCustomGuests] = useState("");
  const [eventAt, setEventAt] = useState("");
  // Step 2
  const [fulfillment, setFulfillment] = useState<Fulfillment | null>(null);
  // Step 3
  const [tab, setTab] = useState<"sampler" | "custom">("sampler");
  const [category, setCategory] = useState<ExpressCategory>("proteins");
  const [sel, setSel] = useState<Record<string, number>>({});
  // Step 4
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [applied, setApplied] = useState<DiscountCode | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const checkoutMut = useMutation({
    mutationFn: (input: ExpressCheckoutInput) => dal.publicCheckout.expressCheckout(input),
    onSuccess: r => navigate(`/express/confirmation?ref=${encodeURIComponent(r.orderRef)}`),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Checkout failed — please try again."),
  });

  const packages = menu?.packages ?? [];
  const alaCarte = menu?.alaCarte ?? [];
  const recommendedId = guests ? recommendedPackageId(packages, guests) : null;

  const lines = useMemo(() => {
    const out: Array<{ id: string; name: string; unit: string; qty: number; unitPriceCents: number }> = [];
    for (const p of packages) {
      const q = sel[p.id] ?? 0;
      if (q > 0) out.push({ id: p.id, name: p.name, unit: "package", qty: q, unitPriceCents: p.priceCents });
    }
    for (const a of alaCarte) {
      const q = sel[a.id] ?? 0;
      if (q > 0) out.push({ id: a.id, name: a.name, unit: a.unit, qty: q, unitPriceCents: a.priceCents });
    }
    return out;
  }, [packages, alaCarte, sel]);

  const subtotalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
  const discountCents = applied
    ? Math.min(subtotalCents, Math.max(0, applied.kind === "percent"
        ? Math.floor((subtotalCents * applied.value) / 100)
        : applied.value))
    : 0;
  const discountedSubtotal = subtotalCents - discountCents;
  const feeCents = fulfillment === "delivery" ? EXPRESS_DELIVERY_FEE_CENTS : 0;
  const taxable: Array<{ unitPriceCents: number; qty: number }> = [{ unitPriceCents: discountedSubtotal, qty: 1 }];
  if (feeCents > 0) taxable.push({ unitPriceCents: feeCents, qty: 1 });
  const totals = orderTotals(taxable);

  const minCents = fulfillment === "delivery" ? EXPRESS_DELIVERY_MIN_CENTS : EXPRESS_PICKUP_MIN_CENTS;
  const minimumMet = subtotalCents >= minCents;

  const eventDate = eventAt ? new Date(eventAt) : null;
  const eventValid = !!eventDate && !Number.isNaN(eventDate.getTime());
  const noticeOk = eventValid && eventDate!.getTime() - currentTime().getTime() >= 24 * 3600_000;

  const stepValid = [
    (guests ?? 0) >= 1 && eventValid && noticeOk,
    fulfillment !== null,
    lines.length > 0 && minimumMet,
    name.trim().length > 0 && email.trim().length > 0,
  ][step];

  const togglePackage = (id: string) => {
    setSel(cur => {
      const next = { ...cur };
      const wasOn = (next[id] ?? 0) > 0;
      for (const p of packages) delete next[p.id];   // single-select
      if (!wasOn) next[id] = 1;
      return next;
    });
  };
  const setQty = (id: string, q: number) => setSel(cur => ({ ...cur, [id]: Math.max(0, q) }));

  const applyCode = async () => {
    setCodeError(null);
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    const d = (await dal.discounts.list()).find(x => x.code === code && x.active);
    if (!d) { setApplied(null); setCodeError("Invalid or inactive discount code."); return; }
    setApplied(d);
  };

  const submit = () => {
    setError(null);
    checkoutMut.mutate({
      guests: guests ?? 0,
      eventAt,
      fulfillment: fulfillment ?? "pickup",
      items: lines.map(l => ({ id: l.id, qty: l.qty })),
      customer: { name: name.trim(), email: email.trim(), phone: phone.trim() },
      notes: notes.trim() ? notes.trim() : null,
      discountCode: applied?.code ?? null,
    });
  };

  if (!menu) {
    return <PublicLayout><p className="py-24 text-center text-zinc-500">Loading express catering…</p></PublicLayout>;
  }

  return (
    <PublicLayout>
      {/* Hero + progress */}
      <section className="pt-10 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-fire-light">⚡ Express Catering</p>
        <h1 className="mt-2 text-4xl font-black uppercase tracking-tight text-zinc-100 sm:text-5xl">
          BBQ for your <span className="bg-gradient-to-r from-fire to-fire-light bg-clip-text text-transparent">whole crew</span>
        </h1>
        <p className="mt-2 text-sm text-zinc-400">Four quick steps — packages or build-your-own, pickup or delivery.</p>
      </section>

      <nav aria-label="Checkout progress" className="sticky top-[64px] z-30 mt-6 -mx-4 border-y border-ink-700 bg-ink-950/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <ol className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {STEPS.map((label, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <li key={label} className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider">
                <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full text-[11px] ${
                  done ? "bg-green-600 text-white" : active ? "bg-fire text-white" : "bg-ink-800 text-zinc-500"}`}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={done ? "text-green-500" : active ? "text-zinc-100" : "text-zinc-600"}>{label}</span>
              </li>
            );
          })}
          {lines.length > 0 && (
            <li className="ml-auto rounded-lg border border-fire/50 bg-ink-900 px-2.5 py-1 text-xs font-black tabular-nums text-fire-light" aria-label="Cart total">
              🛒 {formatCents(totals.totalCents)}
            </li>
          )}
        </ol>
      </nav>

      {/* STEP 1 — Guests + event date */}
      {step === 0 && (
        <section className="mx-auto mt-8 max-w-xl" aria-label="Guest count and event date">
          <h2 className="text-center text-xl font-black uppercase text-zinc-100">How many people are you feeding?</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GUEST_PRESETS.map(n => (
              <button key={n} onClick={() => { setGuests(n); setCustomGuests(""); }}
                aria-pressed={guests === n && customGuests === ""}
                className={`min-h-[64px] rounded-xl border px-3 py-3 text-center ${
                  guests === n && customGuests === "" ? "border-fire bg-ink-800" : "border-ink-700 bg-ink-900 hover:bg-ink-800"}`}>
                <span className="block text-2xl font-black tabular-nums text-zinc-100">{n}</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Guests</span>
              </button>
            ))}
          </div>
          <label className="mt-4 block text-xs font-bold uppercase tracking-wider text-zinc-400">
            Or enter a custom number
            <input value={customGuests} inputMode="numeric" placeholder="e.g. 75"
              onChange={e => {
                setCustomGuests(e.target.value);
                const n = parseInt(e.target.value, 10);
                setGuests(Number.isFinite(n) && n >= 1 ? n : null);
              }}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
          </label>

          <h2 className="mt-8 text-center text-xl font-black uppercase text-zinc-100">When is your event?</h2>
          <p className="mt-1 text-center text-xs text-zinc-500">We need at least 24 hours notice to prepare your order</p>
          <input type="datetime-local" value={eventAt} onChange={e => setEventAt(e.target.value)}
            aria-label="Event date and time"
            className="mt-3 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100" />
          {eventValid && !noticeOk && (
            <p role="alert" className="mt-2 rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-400">
              Orders require at least 24 hours notice.
            </p>
          )}
        </section>
      )}

      {/* STEP 2 — Pickup or delivery */}
      {step === 1 && (
        <section className="mx-auto mt-8 max-w-xl" aria-label="Pickup or delivery">
          <h2 className="text-center text-xl font-black uppercase text-zinc-100">Pickup or delivery?</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button onClick={() => setFulfillment("pickup")} aria-pressed={fulfillment === "pickup"}
              className={`rounded-2xl border p-5 text-left ${fulfillment === "pickup" ? "border-fire bg-ink-800" : "border-ink-700 bg-ink-900 hover:bg-ink-800"}`}>
              <p className="text-2xl" aria-hidden>🚗</p>
              <p className="mt-1 text-lg font-black uppercase text-zinc-100">Pickup</p>
              <p className="mt-1 text-sm text-zinc-400">5214 N Nebraska Ave, Tampa</p>
              <p className="mt-2 text-xs font-black uppercase tracking-wider text-fire-light">$250 minimum</p>
            </button>
            <button onClick={() => setFulfillment("delivery")} aria-pressed={fulfillment === "delivery"}
              className={`rounded-2xl border p-5 text-left ${fulfillment === "delivery" ? "border-fire bg-ink-800" : "border-ink-700 bg-ink-900 hover:bg-ink-800"}`}>
              <p className="text-2xl" aria-hidden>🚚</p>
              <p className="mt-1 text-lg font-black uppercase text-zinc-100">Delivery</p>
              <p className="mt-1 text-sm text-zinc-400">We bring it to your event (within 30 miles)</p>
              <p className="mt-2 text-xs font-black uppercase tracking-wider text-fire-light">$35–$80 based on distance · $500 minimum</p>
            </button>
          </div>
          {fulfillment === "delivery" && (
            <p className="mt-3 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-400">
              Demo estimate: a flat {formatCents(EXPRESS_DELIVERY_FEE_CENTS)} delivery fee is added at checkout — the live fee is confirmed by distance.
            </p>
          )}
        </section>
      )}

      {/* STEP 3 — Menu */}
      {step === 2 && (
        <section className="mt-8" aria-label="Menu">
          <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Menu style">
            <button role="tab" aria-selected={tab === "sampler"} onClick={() => setTab("sampler")}
              className={`min-h-[56px] rounded-xl border px-4 py-3 text-sm font-black uppercase ${
                tab === "sampler" ? "border-fire bg-ink-800 text-zinc-100" : "border-ink-700 bg-ink-900 text-zinc-400 hover:bg-ink-800"}`}>
              🍖 Party Sampler <span className="block text-[10px] font-bold tracking-wider text-fire-light">Recommended</span>
            </button>
            <button role="tab" aria-selected={tab === "custom"} onClick={() => setTab("custom")}
              className={`min-h-[56px] rounded-xl border px-4 py-3 text-sm font-black uppercase ${
                tab === "custom" ? "border-fire bg-ink-800 text-zinc-100" : "border-ink-700 bg-ink-900 text-zinc-400 hover:bg-ink-800"}`}>
              🥩 Build Your Own <span className="block text-[10px] font-bold tracking-wider text-zinc-500">À la carte</span>
            </button>
          </div>

          {tab === "sampler" ? (
            <>
              <p className="mt-4 text-center text-sm text-zinc-400">
                All packages include 5 meats + 3 sides + bread + fixings. About ½ lb of food per person — plenty, with leftovers.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {packages.map(p => {
                  const selected = (sel[p.id] ?? 0) > 0;
                  const recommended = p.id === recommendedId;
                  return (
                    <button key={p.id} onClick={() => togglePackage(p.id)} aria-pressed={selected}
                      className={`rounded-2xl border p-5 text-left ${selected ? "border-fire bg-ink-800" : "border-ink-700 bg-ink-900 hover:bg-ink-800"}`}>
                      {recommended && (
                        <p className="mb-2 inline-block rounded bg-fire px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                          ★ Recommended for your guest count
                        </p>
                      )}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-base font-black uppercase text-zinc-100">Feeds {p.feeds}</p>
                        <span className="text-lg font-black tabular-nums text-fire-light">{formatCents(p.priceCents)}</span>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-zinc-400">{p.contents}</p>
                      <p className="mt-2 text-[11px] font-semibold text-zinc-500">{p.note}</p>
                      {selected && <p className="mt-2 text-xs font-black uppercase text-green-500">✓ In your order</p>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <p className="mt-4 text-center text-sm text-zinc-400">
                Choose your proteins, sides, and extras. Aim for about ½ lb of protein per person.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2" role="tablist" aria-label="À la carte categories">
                {CATEGORY_CHIPS.map(c => (
                  <button key={c.key} role="tab" aria-selected={category === c.key} onClick={() => setCategory(c.key)}
                    className={`min-h-[44px] rounded-full border px-4 text-xs font-black uppercase tracking-wider ${
                      category === c.key ? "border-fire bg-ink-800 text-fire-light" : "border-ink-700 bg-ink-900 text-zinc-400 hover:bg-ink-800"}`}>
                    {c.label}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {alaCarte.filter(a => a.category === category).map(a => {
                  const q = sel[a.id] ?? 0;
                  return (
                    <article key={a.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-base font-black uppercase text-zinc-100">{a.name}</h3>
                        <span className="text-base font-black tabular-nums text-fire-light">{formatCents(a.priceCents)}<span className="text-xs font-bold text-zinc-500">/{a.unit}</span></span>
                      </div>
                      {a.description && <p className="mt-1 text-xs text-zinc-500">{a.description}</p>}
                      <div className="mt-3 flex items-center gap-2">
                        <button aria-label={`Remove one ${a.name}`} onClick={() => setQty(a.id, q - 1)} disabled={q === 0}
                          className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-black text-zinc-200 disabled:opacity-40">−</button>
                        <span className="w-8 text-center text-lg font-black tabular-nums text-zinc-100">{q}</span>
                        <button aria-label={`Add one ${a.name}`} onClick={() => setQty(a.id, q + 1)}
                          className="h-11 w-11 rounded-lg bg-fire text-lg font-black text-white">+</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <p className="mt-6 rounded-2xl border border-ink-700 bg-ink-900 p-4 text-center text-sm text-zinc-400">
            Don't see what you want, or planning something bigger? Custom catering — special sides, larger spreads,
            drop-off or staffed — starts at $1,000.{" "}
            <Link href="/catering-request" className="font-black uppercase text-fire-light underline">Request a custom quote →</Link>
          </p>

          {lines.length > 0 && !minimumMet && (
            <p className="mt-3 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-center text-xs font-semibold text-amber-400">
              {fulfillment === "delivery" ? "Delivery has a $500 minimum" : "Pickup has a $250 minimum"} — you're at{" "}
              {formatCents(subtotalCents)} of {formatCents(minCents)}. Add {formatCents(minCents - subtotalCents)} more to continue.
            </p>
          )}
        </section>
      )}

      {/* STEP 4 — Details & Payment */}
      {step === 3 && (
        <section className="mx-auto mt-8 max-w-xl" aria-label="Details and payment">
          <h2 className="text-center text-xl font-black uppercase text-zinc-100">Order summary</h2>
          <div className="mt-4 rounded-2xl border border-ink-700 bg-ink-900 p-5">
            <ul className="space-y-1 text-sm">
              {lines.map(l => (
                <li key={l.id} className="flex justify-between text-zinc-300">
                  <span>{l.qty}× {l.name}</span>
                  <span className="tabular-nums">{formatCents(l.unitPriceCents * l.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-0.5 border-t border-ink-700 pt-2 text-sm">
              <p className="flex justify-between text-zinc-400"><span>Subtotal</span><span className="tabular-nums">{formatCents(subtotalCents)}</span></p>
              {applied && (
                <p className="flex justify-between text-green-500"><span>Discount ({applied.code})</span><span className="tabular-nums">−{formatCents(discountCents)}</span></p>
              )}
              {fulfillment === "delivery" && (
                <p className="flex justify-between text-zinc-400"><span>{EXPRESS_DELIVERY_FEE_LABEL}</span><span className="tabular-nums">{formatCents(feeCents)}</span></p>
              )}
              <p className="flex justify-between text-zinc-400"><span>Tax (7.5%)</span><span className="tabular-nums">{formatCents(totals.taxCents)}</span></p>
              <p className="flex justify-between text-base font-black text-zinc-100"><span>Total due now</span><span className="tabular-nums">{formatCents(totals.totalCents)}</span></p>
              <p className="text-[11px] text-zinc-600">Full payment required to confirm your order.</p>
            </div>
            <p className="mt-3 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs text-zinc-400">
              {fulfillment === "delivery" ? "🚚 Delivery" : "🚗 Pickup — 5214 N Nebraska Ave, Tampa"} ·{" "}
              {eventValid ? eventDate!.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "event time TBD"} · {guests ?? 0} guests
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name *" aria-label="Full name"
              className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *" aria-label="Email" type="email"
              className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" aria-label="Phone" type="tel"
              className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 sm:col-span-2" />
            <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (allergies, setup, timing…)" aria-label="Notes"
              rows={3} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 sm:col-span-2" />
          </div>

          <div className="mt-3 flex gap-2">
            <input value={codeInput} onChange={e => { setCodeInput(e.target.value); setCodeError(null); }}
              placeholder="Discount code" aria-label="Discount code"
              className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm uppercase text-zinc-100 placeholder:normal-case placeholder:text-zinc-600" />
            <button onClick={applyCode}
              className="min-h-[48px] rounded-lg border border-ink-700 bg-ink-800 px-5 text-sm font-black uppercase text-zinc-200 hover:border-fire/50">
              Apply
            </button>
          </div>
          {codeError && <p role="alert" className="mt-2 rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-400">{codeError}</p>}
          {applied && <p className="mt-2 text-xs font-bold text-green-500">✓ {applied.code} applied — {applied.kind === "percent" ? `${applied.value}% off` : `${formatCents(applied.value)} off`}.</p>}

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-400">{error}</p>
          )}

          <div className="mt-4 space-y-2">
            <DemoPaymentNotice />
            <button onClick={submit} disabled={!stepValid || checkoutMut.isPending}
              className="min-h-[52px] w-full rounded-xl bg-gradient-to-r from-fire to-fire-light px-6 text-base font-black uppercase tracking-wider text-white shadow-lg shadow-fire/30 disabled:opacity-50">
              {checkoutMut.isPending ? "Placing order…" : `Place Demo Order — ${formatCents(totals.totalCents)}`}
            </button>
          </div>
        </section>
      )}

      {/* Back / Continue */}
      <div className="mx-auto mt-8 flex max-w-xl items-center justify-between gap-3">
        <button onClick={() => { setError(null); setStep(s => Math.max(0, s - 1)); }} disabled={step === 0}
          className="min-h-[48px] rounded-xl border border-ink-700 bg-ink-900 px-6 text-sm font-black uppercase tracking-wider text-zinc-300 disabled:opacity-40">
          ← Back
        </button>
        {step < 3 && (
          <button onClick={() => stepValid && setStep(s => s + 1)} disabled={!stepValid}
            className="min-h-[48px] rounded-xl bg-fire px-8 text-sm font-black uppercase tracking-wider text-white disabled:opacity-40">
            Continue →
          </button>
        )}
      </div>
    </PublicLayout>
  );
}
