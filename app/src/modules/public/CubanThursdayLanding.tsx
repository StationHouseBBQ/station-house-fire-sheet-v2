import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { MenuItem, PublicCheckoutInput } from "../../dal/types";
import { formatCents, orderTotals } from "../../lib/money";
import { etParts } from "../../lib/time";
import { captureAttribution, getAttribution } from "../../lib/attribution";
import { PublicLayout, DemoPaymentNotice } from "./PublicLayout";

/**
 * Cuban Thursday landing — Thursday-only Cubans & brisket smash burgers,
 * 11AM–2PM pickup. Menu comes from the admin menu (thursdayOnly items); the
 * DAL checkout enforces the Thursday 2PM ET cutoff authoritatively, but we
 * also show a proactive closed banner so nobody builds a doomed cart.
 */

/** Thu after 2PM ET, or Fri/Sat/Sun → this week's window has passed. */
function orderingClosedNow(now: Date = new Date()): boolean {
  const p = etParts(now);
  if (p.weekday === 4 && p.hour >= 14) return true;   // Thu 2PM+
  return p.weekday === 5 || p.weekday === 6 || p.weekday === 0; // Fri/Sat/Sun
}

export function CubanThursdayLanding() {
  const dal = getDal();
  const [, navigate] = useLocation();

  useEffect(() => { captureAttribution(); }, []);

  const { data: items, isLoading } = useQuery({
    queryKey: ["public", "cubanMenu"],
    queryFn: () => dal.menu.items(),
  });

  const [qty, setQty] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const closed = orderingClosedNow();

  const menu = useMemo(
    () => (items ?? []).filter(i => i.thursdayOnly && i.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );

  const cartLines = menu.filter(m => (qty[m.id] ?? 0) > 0).map(m => ({ item: m, qty: qty[m.id] ?? 0 }));
  const totals = orderTotals(cartLines.map(l => ({ unitPriceCents: l.item.priceCents, qty: l.qty })));

  const checkoutMut = useMutation({
    mutationFn: (input: PublicCheckoutInput) => dal.publicCheckout.checkout(input),
    onSuccess: r => navigate(`/cuban-thursday/confirmation?ref=${encodeURIComponent(r.orderRef)}`),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Checkout failed — please try again."),
  });

  const submit = () => {
    setError(null);
    const attr = getAttribution();
    checkoutMut.mutate({
      channel: "cuban_thursday",
      day: "thursday",
      slotId: null,
      items: cartLines.map(l => ({ productId: l.item.id, qty: l.qty })),
      customer: { name: name.trim(), phone: phone.trim(), email: email.trim() },
      attribution: attr ? ({ ...attr } as Record<string, string | null>) : null,
    });
  };

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pt-10 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-lime-400">One day. One press. One line out the door.</p>
        <h1 className="mt-3 text-5xl font-black uppercase leading-none tracking-tight sm:text-6xl">
          <span className="text-zinc-100">Cuban </span>
          <span className="bg-gradient-to-r from-lime-400 to-emerald-400 bg-clip-text text-transparent">Thursday</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-zinc-400">
          Smoked mojo pork Cubans pressed to order, plus brisket smash burgers off the flat top.
          Thursday only, 11AM–2PM, Seminole Heights. When they're gone, they're gone.
        </p>
      </section>

      {closed && (
        <p className="mx-auto mt-6 max-w-xl rounded-xl border border-amber-600/40 bg-amber-950/40 px-4 py-3 text-center text-sm font-bold text-amber-400">
          Ordering for this week's Cuban Thursday is closed — back Monday. Menu below is view-only.
        </p>
      )}

      {/* Menu */}
      <section className="mx-auto mt-8 max-w-2xl" aria-label="Cuban Thursday menu">
        {isLoading ? (
          <p className="py-16 text-center text-zinc-500">Loading the Thursday menu…</p>
        ) : menu.length === 0 ? (
          <p className="py-16 text-center text-zinc-500">Thursday menu is being finalized — check back soon.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {menu.map(m => (
              <MenuCard key={m.id} item={m} qty={qty[m.id] ?? 0} disabled={closed}
                onChange={n => setQty(q => ({ ...q, [m.id]: n }))} />
            ))}
          </div>
        )}
      </section>

      {/* Cart + checkout */}
      {!closed && cartLines.length > 0 && (
        <section className="mx-auto mt-8 max-w-2xl rounded-2xl border border-ink-700 bg-ink-900 p-5" aria-label="Your order">
          <h2 className="text-sm font-black uppercase tracking-widest text-zinc-300">Your order · pickup Thursday 11AM–2PM</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {cartLines.map(l => (
              <li key={l.item.id} className="flex justify-between text-zinc-300">
                <span>{l.qty}× {l.item.name}</span>
                <span className="tabular-nums">{formatCents(l.item.priceCents * l.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 space-y-0.5 border-t border-ink-700 pt-2 text-sm">
            <p className="flex justify-between text-zinc-400"><span>Subtotal</span><span className="tabular-nums">{formatCents(totals.subtotalCents)}</span></p>
            <p className="flex justify-between text-zinc-400"><span>Tax (7.5%)</span><span className="tabular-nums">{formatCents(totals.taxCents)}</span></p>
            <p className="flex justify-between text-base font-black text-zinc-100"><span>Total</span><span className="tabular-nums">{formatCents(totals.totalCents)}</span></p>
            <p className="text-[11px] text-zinc-600">Final total is confirmed at checkout.</p>
          </div>

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
              className="min-h-[52px] w-full rounded-xl bg-gradient-to-r from-lime-500 to-emerald-500 px-6 text-base font-black uppercase tracking-wider text-ink-950 disabled:opacity-50">
              {checkoutMut.isPending ? "Placing order…" : "Lock in Thursday pickup"}
            </button>
          </div>
        </section>
      )}
    </PublicLayout>
  );
}

function MenuCard({ item: m, qty, disabled, onChange }: { item: MenuItem; qty: number; disabled: boolean; onChange: (n: number) => void }) {
  return (
    <article className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-black uppercase text-zinc-100">{m.name}</h3>
        <span className="text-base font-black tabular-nums text-lime-400">{formatCents(m.priceCents)}</span>
      </div>
      {m.description && <p className="mt-1 text-xs text-zinc-500">{m.description}</p>}
      {!disabled && (
        <div className="mt-3 flex items-center gap-2">
          <button aria-label={`Remove one ${m.name}`} onClick={() => onChange(Math.max(0, qty - 1))} disabled={qty === 0}
            className="h-11 w-11 rounded-lg border border-ink-700 bg-ink-800 text-lg font-black text-zinc-200 disabled:opacity-40">−</button>
          <span className="w-8 text-center text-lg font-black tabular-nums text-zinc-100">{qty}</span>
          <button aria-label={`Add one ${m.name}`} onClick={() => onChange(qty + 1)}
            className="h-11 w-11 rounded-lg bg-lime-500 text-lg font-black text-ink-950">+</button>
        </div>
      )}
    </article>
  );
}
