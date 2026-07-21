import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { PublicLayout } from "./PublicLayout";
import type { CateringOrder } from "../../dal/types";

function tokenFromHash(): string {
  const h = window.location.hash;               // "#/catering-quote/<token>"
  const parts = h.split("/");
  return parts[parts.length - 1]?.split("?")[0] ?? "";
}

/**
 * Public catering quote review + accept/decline, backed by the unified
 * catering lifecycle record (token-addressed, no login). Mirrors QuoteAccept
 * but drives dal.cateringLifecycle so the whole team sees the response on the
 * shared timeline instantly.
 */
export function CateringQuoteReview() {
  const dal = getDal();
  const qc = useQueryClient();
  const token = tokenFromHash();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["cateringPublicQuote", token],
    queryFn: () => dal.cateringLifecycle.byToken(token),
  });

  const respond = useMutation({
    mutationFn: (r: "accepted" | "declined") =>
      dal.cateringLifecycle.respondByToken(token, r, name.trim() || "Customer"),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ["cateringPublicQuote", token] }); },
    onError: e => setError((e as Error).message),
  });

  if (isLoading) return <PublicLayout><p className="py-24 text-center text-zinc-500">Loading your quote…</p></PublicLayout>;
  if (!order) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="text-2xl font-black uppercase text-zinc-100">Quote not found</h1>
          <p className="mt-3 text-zinc-400">This link may have expired. Reply to your quote email or call us and we'll resend it.</p>
        </div>
      </PublicLayout>
    );
  }

  const open = order.stage === "quote_sent";
  const ev = order.event;
  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-fire">Catering quote · {order.ref}</p>
        <h1 className="mt-2 text-3xl font-black uppercase text-zinc-100">Prepared for {order.customer}</h1>
        {order.companyName && <p className="mt-1 text-zinc-400">{order.companyName}</p>}

        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-ink-700 bg-ink-900 p-4 text-sm sm:grid-cols-4">
          <Detail label="Event date" value={ev.eventDate ?? "TBD"} />
          <Detail label="Time" value={ev.eventTime ?? "TBD"} />
          <Detail label="Guests" value={ev.guests != null ? String(ev.guests) : "TBD"} />
          <Detail label="Service" value={ev.serviceType ?? "TBD"} />
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-ink-700">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-800 bg-ink-900">
              {order.lines.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-semibold text-zinc-200">{l.name}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{l.qty}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{formatCents(l.unitPriceCents)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-200">{formatCents(l.unitPriceCents * l.qty)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink-800 text-sm">
              <tr><td colSpan={3} className="px-4 py-2 text-right text-zinc-500">Subtotal</td><td className="px-4 py-2 text-right text-zinc-300">{formatCents(order.subtotalCents)}</td></tr>
              <tr><td colSpan={3} className="px-4 py-2 text-right text-zinc-500">Sales tax (7.5%)</td><td className="px-4 py-2 text-right text-zinc-300">{formatCents(order.taxCents)}</td></tr>
              <tr><td colSpan={3} className="px-4 py-2 text-right font-bold text-zinc-200">Total</td><td className="px-4 py-2 text-right text-lg font-black text-fire-light">{formatCents(order.totalCents)}</td></tr>
            </tfoot>
          </table>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-400">{error}</p>}

        {open ? (
          <div className="mt-6">
            <label className="block text-sm font-semibold text-zinc-400">Your name
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Customer"
                className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
            </label>
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <button onClick={() => respond.mutate("accepted")} disabled={respond.isPending}
                className="flex-1 rounded-xl bg-fire px-6 py-4 text-lg font-bold text-white disabled:opacity-50">
                Accept quote
              </button>
              <button onClick={() => respond.mutate("declined")} disabled={respond.isPending}
                className="rounded-xl border border-ink-700 bg-ink-800 px-6 py-4 font-semibold text-zinc-300 disabled:opacity-50">
                Decline
              </button>
            </div>
          </div>
        ) : (
          <ClosedState order={order} />
        )}
        <p className="mt-6 text-center text-xs text-zinc-600">Questions? Call Station House BBQ · Seminole Heights, Tampa</p>
      </div>
    </PublicLayout>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function ClosedState({ order }: { order: CateringOrder }) {
  const positive = order.stage === "accepted" || order.stage === "invoiced" || order.stage === "paid" || order.stage === "in_kitchen" || order.stage === "ready" || order.stage === "completed";
  const msg =
    order.stage === "accepted" ? "✓ Quote accepted — we'll be in touch to confirm the details." :
    order.stage === "invoiced" ? "This quote has been invoiced. Check your email for payment details." :
    order.stage === "paid" ? "✓ Paid — thank you! See you at the event." :
    order.stage === "in_kitchen" || order.stage === "ready" ? "✓ Confirmed — our kitchen is preparing your order." :
    order.stage === "completed" ? "✓ Event completed — thank you for choosing Station House BBQ!" :
    order.stage === "lost" || order.stage === "cancelled" ? "This quote was declined or cancelled." :
    "This quote is closed.";
  return (
    <div className={`mt-6 rounded-2xl border p-6 text-center ${positive ? "border-green-800/50 bg-green-950/30" : "border-ink-700 bg-ink-900"}`}>
      <p className="text-lg font-bold text-zinc-100">{msg}</p>
    </div>
  );
}
