import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { PublicLayout } from "./PublicLayout";

/**
 * Public order tracker — ref in, status out. Shows only what a customer at a
 * shared kiosk should see: first name, masked contact, pickup + status trail.
 */

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-600 text-white",
  paid: "bg-green-600 text-white",
  ready: "bg-fire text-white",
  picked_up: "bg-ink-700 text-zinc-300",
  cancelled: "bg-red-600 text-white",
  refunded: "bg-red-600 text-white",
};

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `(•••) •••-${digits.slice(-4)}` : "•••";
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return "•••";
  return `${user.slice(0, 1)}•••@${domain}`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function OrderTrackerView() {
  const dal = getDal();
  const [input, setInput] = useState("");
  const [ref, setRef] = useState<string | null>(null);

  const { data: order, isLoading, isFetched } = useQuery({
    queryKey: ["public", "track", ref],
    queryFn: () => dal.publicCheckout.trackByRef(ref ?? ""),
    enabled: !!ref,
  });

  const lookup = () => { const r = input.trim(); if (r) setRef(r); };

  return (
    <PublicLayout>
      <section className="mx-auto max-w-lg pt-12">
        <h1 className="text-center text-3xl font-black uppercase text-zinc-100">Track your order</h1>
        <p className="mt-2 text-center text-sm text-zinc-400">
          Enter the order ref from your confirmation — it looks like <span className="font-bold text-zinc-300">FD-0717-1042</span>.
        </p>
        <form className="mt-6 flex gap-2" onSubmit={e => { e.preventDefault(); lookup(); }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="FD-0717-1042" aria-label="Order ref"
            className="min-h-[48px] flex-1 rounded-xl border border-ink-700 bg-ink-800 px-4 text-base font-bold uppercase tracking-widest text-zinc-100 placeholder:text-zinc-600" />
          <button type="submit" disabled={!input.trim()}
            className="min-h-[48px] rounded-xl bg-fire px-5 text-sm font-black uppercase tracking-wider text-white disabled:opacity-50">
            Track
          </button>
        </form>

        {isLoading && <p className="mt-8 text-center text-sm text-zinc-500">Looking it up…</p>}

        {ref && isFetched && !isLoading && !order && (
          <div className="mt-8 rounded-2xl border border-amber-600/40 bg-amber-950/30 p-5 text-center">
            <p className="text-base font-black uppercase text-amber-400">No order found for "{ref}"</p>
            <p className="mt-1 text-sm text-zinc-400">
              Check the ref against your confirmation — dashes and digits matter. Fire Drop refs start with FD, Cuban Thursday with CT.
            </p>
          </div>
        )}

        {order && (
          <article className="mt-8 rounded-2xl border border-ink-700 bg-ink-900 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-lg font-black text-zinc-100">{order.customer.split(" ")[0]}'s order</p>
                <p className="text-xs text-zinc-500">{maskPhone(order.phone)} · {maskEmail(order.email)}</p>
              </div>
              <span className={`rounded px-2 py-1 text-[10px] font-black uppercase ${STATUS_CLS[order.status] ?? "bg-ink-700 text-zinc-300"}`}>
                {order.status.replace("_", " ")}
              </span>
            </div>

            <p className="mt-3 rounded-lg bg-ink-800 px-3 py-2 text-sm font-bold text-zinc-200">
              Pickup: {order.pickupDate} · {order.pickupWindow}
            </p>

            <ul className="mt-3 space-y-1 text-sm">
              {order.items.map(i => (
                <li key={i.id} className="flex justify-between text-zinc-300">
                  <span>{i.qty}× {i.name}</span>
                  <span className="tabular-nums">{formatCents(i.unitPriceCents * i.qty)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-ink-700 pt-2 text-base font-black text-zinc-100">
              <span>Total</span><span className="tabular-nums">{formatCents(order.totalCents)}</span>
            </p>

            <h2 className="mt-5 text-xs font-black uppercase tracking-widest text-zinc-500">Status timeline</h2>
            <ol className="mt-2 space-y-2">
              {order.statusHistory.map((h, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_CLS[h.to] ?? "bg-ink-700 text-zinc-300"}`}>
                    {h.to.replace("_", " ")}
                  </span>
                  <span className="text-xs text-zinc-500">{fmtTime(h.at)}</span>
                </li>
              ))}
              {order.statusHistory.length === 0 && <li className="text-xs text-zinc-600">No updates yet.</li>}
            </ol>
          </article>
        )}
      </section>
    </PublicLayout>
  );
}
