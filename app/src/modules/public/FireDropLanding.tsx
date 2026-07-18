import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { FireDropProduct, PublicCheckoutInput } from "../../dal/types";
import { formatCents, orderTotals } from "../../lib/money";
import { etParts, isOrderingOpen, type EtParts, type PickupDay } from "../../lib/time";
import { captureAttribution, getAttribution } from "../../lib/attribution";
import { ADDRESS_LINE } from "../../config/brand";
import { PublicLayout, DemoPaymentNotice } from "./PublicLayout";

/**
 * Public Weekend Pre-Order landing — customer-facing weekend drop page. Prices shown
 * here are display-only; the authoritative totals (and every enforcement
 * rule: windows, caps, 86s, slot capacity) come from dal.publicCheckout.
 */

/** Live funnel section headers, in display order (product.category → label). */
const SECTIONS: Array<{ key: string; label: string }> = [
  { key: "platters", label: "🍽️ Platters" },
  { key: "meats", label: "🥩 Meats" },
  { key: "sides", label: "🥗 Sides" },
  { key: "essentials", label: "➕ Essentials" },
  { key: "desserts", label: "🍪 Desserts" },
];

const THU_5PM = 3 * 1440 + 17 * 60; // minutes since Mon 00:00 ET
const FRI_3PM = 4 * 1440 + 15 * 60;

function weekMinute(p: EtParts): number {
  return ((p.weekday + 6) % 7) * 1440 + p.hour * 60 + p.minute;
}

interface CountdownState { label: string; secondsLeft: number | null }

function computeCountdown(now: Date): CountdownState {
  const p = etParts(now);
  const m = weekMinute(p);
  if (isOrderingOpen("friday", now)) {
    return { label: "Friday ordering closes", secondsLeft: (THU_5PM - m) * 60 - p.second };
  }
  if (isOrderingOpen("saturday", now)) {
    return { label: "Saturday ordering closes", secondsLeft: (FRI_3PM - m) * 60 - p.second };
  }
  return { label: "Ordering opens Monday", secondsLeft: null };
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

function pad(n: number): string { return String(n).padStart(2, "0"); }

export function FireDropLanding() {
  const dal = getDal();
  const qc = useQueryClient();
  const [, navigate] = useLocation();

  useEffect(() => { captureAttribution(); }, []);

  const { data: drop, isLoading } = useQuery({
    queryKey: ["public", "fireDrop"],
    queryFn: () => dal.fireDrop.currentDrop(),
    refetchInterval: 30_000,
  });

  const [countdown, setCountdown] = useState<CountdownState>(() => computeCountdown(new Date()));
  useEffect(() => {
    const t = setInterval(() => setCountdown(computeCountdown(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  const ordering = dal.fireDrop.orderingStatus();
  const defaultDay: PickupDay = ordering.friday || !ordering.saturday ? "friday" : "saturday";
  const [day, setDay] = useState<PickupDay>(defaultDay);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [slotId, setSlotId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const checkoutMut = useMutation({
    mutationFn: (input: PublicCheckoutInput) => dal.publicCheckout.checkout(input),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ["public", "fireDrop"] });
      navigate(`/fire-drop/confirmation?ref=${encodeURIComponent(r.orderRef)}`);
    },
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Checkout failed — please try again."),
  });

  const cartLines = useMemo(() => {
    if (!drop) return [];
    return drop.products
      .filter(p => (qty[p.id] ?? 0) > 0)
      .map(p => ({ product: p, qty: qty[p.id] ?? 0 }));
  }, [drop, qty]);
  const totals = orderTotals(cartLines.map(l => ({ unitPriceCents: l.product.priceCents, qty: l.qty })));

  const dayOpen = day === "friday" ? ordering.friday : ordering.saturday;
  const slots = (drop?.slots ?? []).filter(s => s.day === day);

  const submit = () => {
    setError(null);
    const attr = getAttribution();
    checkoutMut.mutate({
      channel: "fire_drop",
      day,
      slotId: slotId || null,
      items: cartLines.map(l => ({ productId: l.product.id, qty: l.qty })),
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
      attribution: attr ? ({ ...attr } as Record<string, string | null>) : null,
    });
  };

  if (isLoading || !drop) {
    return <PublicLayout><p className="py-24 text-center text-zinc-500">Loading this weekend's drop…</p></PublicLayout>;
  }

  const secondsLeft = countdown.secondsLeft;
  const cd = secondsLeft !== null && secondsLeft > 0
    ? {
        days: Math.floor(secondsLeft / 86400),
        hours: Math.floor((secondsLeft % 86400) / 3600),
        mins: Math.floor((secondsLeft % 3600) / 60),
        secs: secondsLeft % 60,
      }
    : null;

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pt-10 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-fire-light">This Weekend's Limited Weekend Pre-Order</p>
        <h1 className="mt-3 text-5xl font-black uppercase leading-none tracking-tight text-zinc-100 sm:text-6xl">
          {drop.title.split(" ").map((w, i) => (
            <span key={i} className={i % 2 === 1 ? "text-transparent bg-clip-text bg-gradient-to-r from-fire to-fire-light" : undefined}>{w}{" "}</span>
          ))}
        </h1>
        <p className="mt-3 text-sm text-zinc-400">
          {fmtDate(drop.fridayDate)} · {fmtDate(drop.saturdayDate)} · Pickup at {ADDRESS_LINE}
        </p>
        <p className="mt-1 text-xs font-semibold text-zinc-500">
          Limited weekly BBQ drop. Pre-order by 5pm the day before for à la carte items.
        </p>

        <div className="mx-auto mt-6 max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">{countdown.label}</p>
          {cd ? (
            <div className="mt-2 flex justify-center gap-4">
              {([["Days", cd.days], ["Hours", cd.hours], ["Min", cd.mins], ["Sec", cd.secs]] as const).map(([l, v]) => (
                <div key={l} className="w-14">
                  <span className="block text-3xl font-black tabular-nums text-fire-light">{pad(v)}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{l}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-lg font-black uppercase text-zinc-300">Fresh drop posts every Monday</p>
          )}
        </div>
      </section>

      {drop.soldOut ? (
        <section className="mx-auto mt-12 max-w-lg rounded-2xl border border-red-700/50 bg-red-950/30 p-10 text-center">
          <p className="text-4xl">🔥</p>
          <h2 className="mt-3 text-3xl font-black uppercase text-red-400">Sold Out</h2>
          <p className="mt-2 text-sm text-zinc-400">
            This week's drop is gone. Follow us and come back Monday when the next drop posts.
          </p>
        </section>
      ) : (
        <>
          {/* Day selector */}
          <section className="mt-10" aria-label="Pickup day">
            <div className="grid grid-cols-2 gap-2">
              {(["friday", "saturday"] as const).map(d => {
                const open = d === "friday" ? ordering.friday : ordering.saturday;
                const active = day === d;
                return (
                  <button key={d} onClick={() => { setDay(d); setSlotId(""); }}
                    className={`min-h-[56px] rounded-xl border px-4 py-3 text-left ${
                      active ? "border-fire bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-ink-700 hover:bg-ink-800"}`}>
                    <span className="block text-sm font-black uppercase text-zinc-100">
                      {d === "friday" ? `Friday · ${drop.fridayDate}` : `Saturday · ${drop.saturdayDate}`}
                    </span>
                    <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${
                      open ? "bg-green-600 text-white" : "bg-ink-700 text-zinc-400"}`}>
                      {open ? "Ordering open" : "Closed"}
                    </span>
                  </button>
                );
              })}
            </div>
            {!dayOpen && (
              <p className="mt-2 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-400">
                {day === "friday"
                  ? "Friday pickup ordering closes Thursday 5:00 PM ET."
                  : "Saturday ordering runs Thursday 5:00 PM – Friday 3:00 PM ET."} You can browse, but checkout for this day is closed.
              </p>
            )}
          </section>

          {/* Products — grouped under the live funnel's five section headers */}
          <section className="mt-6" aria-label="Drop menu">
            {(() => {
              const sorted = [...drop.products].sort((a, b) => a.sortOrder - b.sortOrder);
              const known = new Set<string>(SECTIONS.map(sec => sec.key));
              const groups = SECTIONS
                .map(sec => ({ ...sec, products: sorted.filter(pr => (pr.category ?? "") === sec.key) }))
                .filter(g => g.products.length > 0);
              const other = sorted.filter(pr => !known.has(pr.category ?? ""));
              if (other.length > 0) groups.push({ key: "other", label: "More from the drop", products: other });
              return groups.map(g => (
                <div key={g.key} className="mt-6 first:mt-0">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-fire-light">{g.label}</h2>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {g.products.map(p => (
                      <ProductCard key={p.id} product={p} qty={qty[p.id] ?? 0}
                        onChange={n => setQty(q => ({ ...q, [p.id]: n }))} />
                    ))}
                  </div>
                </div>
              ));
            })()}
          </section>

          {/* Cart + checkout */}
          <section className="sticky bottom-0 z-30 mt-8 -mx-4 border-t border-ink-700 bg-ink-950/95 px-4 py-4 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-ink-900"
            aria-label="Your order">
            <h2 className="text-sm font-black uppercase tracking-widest text-zinc-300">Your order</h2>
            {cartLines.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">Add something from the drop above.</p>
            ) : (
              <>
                <ul className="mt-2 space-y-1 text-sm">
                  {cartLines.map(l => (
                    <li key={l.product.id} className="flex justify-between text-zinc-300">
                      <span>{l.qty}× {l.product.name}</span>
                      <span className="tabular-nums">{formatCents(l.product.priceCents * l.qty)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 space-y-0.5 border-t border-ink-700 pt-2 text-sm">
                  <p className="flex justify-between text-zinc-400"><span>Subtotal</span><span className="tabular-nums">{formatCents(totals.subtotalCents)}</span></p>
                  <p className="flex justify-between text-zinc-400"><span>Tax (7.5%)</span><span className="tabular-nums">{formatCents(totals.taxCents)}</span></p>
                  <p className="flex justify-between text-base font-black text-zinc-100"><span>Total</span><span className="tabular-nums">{formatCents(totals.totalCents)}</span></p>
                  <p className="text-[11px] text-zinc-600">Final total is confirmed at checkout.</p>
                </div>

                <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Pickup window ({day})
                  <select value={slotId} onChange={e => setSlotId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100">
                    <option value="">Choose a window…</option>
                    {slots.map(s => (
                      <option key={s.id} value={s.id} disabled={s.booked >= s.capacity}>
                        {s.window} — {s.booked} of {s.capacity} booked{s.booked >= s.capacity ? " (full)" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" aria-label="Full name"
                    className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
                  <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Phone" aria-label="Phone" type="tel"
                    className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
                  <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" aria-label="Email" type="email"
                    className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
                </div>

                {error && (
                  <p role="alert" className="mt-3 rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-400">
                    {error}
                  </p>
                )}

                <div className="mt-3 space-y-2">
                  <DemoPaymentNotice />
                  <button onClick={submit} disabled={checkoutMut.isPending}
                    className="min-h-[52px] w-full rounded-xl bg-gradient-to-r from-fire to-fire-light px-6 text-base font-black uppercase tracking-wider text-white shadow-lg shadow-fire/30 disabled:opacity-50">
                    {checkoutMut.isPending ? "Placing order…" : `Reserve ${day === "friday" ? "Friday" : "Saturday"} pickup`}
                  </button>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </PublicLayout>
  );
}

function ProductCard({ product: p, qty, onChange }: { product: FireDropProduct; qty: number; onChange: (n: number) => void }) {
  const remaining = p.capQty !== null ? Math.max(0, p.capQty - p.soldQty) : null;
  const unavailable = p.soldOut || remaining === 0;
  return (
    <article className={`rounded-2xl border border-ink-700 bg-ink-900 p-4 ${unavailable ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-black uppercase text-zinc-100">{p.name}</h3>
        <span className="text-base font-black tabular-nums text-fire-light">{formatCents(p.priceCents)}</span>
      </div>
      {p.description && <p className="mt-1 text-xs text-zinc-500">{p.description}</p>}
      <div className="mt-1 flex items-center gap-2 text-xs">
        {unavailable ? (
          <span className="rounded bg-red-600 px-1.5 py-0.5 font-black uppercase text-white">Sold out</span>
        ) : remaining !== null ? (
          <span className="font-bold text-amber-400">🔥 Only {remaining} left</span>
        ) : (
          <span className="text-zinc-500">Available this weekend</span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button aria-label={`Remove one ${p.name}`} onClick={() => onChange(Math.max(0, qty - 1))}
          disabled={unavailable || qty === 0}
          className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-black text-zinc-200 disabled:opacity-40">−</button>
        <span className="w-8 text-center text-lg font-black tabular-nums text-zinc-100">{qty}</span>
        <button aria-label={`Add one ${p.name}`}
          onClick={() => onChange(remaining !== null ? Math.min(remaining, qty + 1) : qty + 1)}
          disabled={unavailable || (remaining !== null && qty >= remaining)}
          className="h-11 w-11 rounded-lg bg-fire text-lg font-black text-white disabled:opacity-40">+</button>
      </div>
    </article>
  );
}
