import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { PublicLayout } from "./PublicLayout";

function tokenFromHash(): string {
  const h = window.location.hash;               // "#/quote/<token>"
  const parts = h.split("/");
  return parts[parts.length - 1]?.split("?")[0] ?? "";
}

/** Public quote review + accept/decline (token-addressed, no login). */
export function QuoteAccept() {
  const dal = getDal();
  const qc = useQueryClient();
  const token = tokenFromHash();
  const [error, setError] = useState<string | null>(null);

  const { data: quote, isLoading } = useQuery({
    queryKey: ["publicQuote", token],
    queryFn: () => dal.quotes.byToken(token),
  });

  const respond = useMutation({
    mutationFn: (r: "accepted" | "declined") => dal.quotes.respondByToken(token, r),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ["publicQuote", token] }); },
    onError: e => setError((e as Error).message),
  });

  if (isLoading) return <PublicLayout><p className="py-24 text-center text-zinc-500">Loading your quote…</p></PublicLayout>;
  if (!quote) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-md py-24 text-center">
          <h1 className="text-2xl font-black uppercase text-zinc-100">Quote not found</h1>
          <p className="mt-3 text-zinc-400">This link may have expired. Reply to your quote email or call us and we'll resend it.</p>
        </div>
      </PublicLayout>
    );
  }

  const open = quote.status === "sent" || quote.status === "draft";
  return (
    <PublicLayout>
      <div className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-xs font-bold uppercase tracking-[0.3em] text-fire">Catering quote · {quote.quoteRef}</p>
        <h1 className="mt-2 text-3xl font-black uppercase text-zinc-100">Prepared for {quote.customer}</h1>
        {quote.eventDate && <p className="mt-1 text-zinc-400">Event date: {quote.eventDate}</p>}

        <div className="mt-6 overflow-hidden rounded-2xl border border-ink-700">
          <table className="w-full text-sm">
            <thead className="bg-ink-800 text-left text-xs uppercase tracking-wider text-zinc-500">
              <tr><th className="px-4 py-3">Item</th><th className="px-4 py-3 text-right">Qty</th><th className="px-4 py-3 text-right">Price</th><th className="px-4 py-3 text-right">Total</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-800 bg-ink-900">
              {quote.lines.map(l => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-semibold text-zinc-200">{l.name}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{l.qty}</td>
                  <td className="px-4 py-3 text-right text-zinc-400">{formatCents(l.unitPriceCents)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-zinc-200">{formatCents(l.unitPriceCents * l.qty)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-ink-800 text-sm">
              <tr><td colSpan={3} className="px-4 py-2 text-right text-zinc-500">Subtotal</td><td className="px-4 py-2 text-right text-zinc-300">{formatCents(quote.subtotalCents)}</td></tr>
              <tr><td colSpan={3} className="px-4 py-2 text-right text-zinc-500">Sales tax (7.5%)</td><td className="px-4 py-2 text-right text-zinc-300">{formatCents(quote.taxCents)}</td></tr>
              <tr><td colSpan={3} className="px-4 py-2 text-right font-bold text-zinc-200">Total</td><td className="px-4 py-2 text-right text-lg font-black text-fire-light">{formatCents(quote.totalCents)}</td></tr>
            </tfoot>
          </table>
        </div>

        {error && <p role="alert" className="mt-4 rounded-lg bg-red-950/60 px-4 py-3 text-sm text-red-400">{error}</p>}

        {open ? (
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button onClick={() => respond.mutate("accepted")} disabled={respond.isPending}
              className="flex-1 rounded-xl bg-fire px-6 py-4 text-lg font-bold text-white disabled:opacity-50">
              Accept quote
            </button>
            <button onClick={() => respond.mutate("declined")} disabled={respond.isPending}
              className="rounded-xl border border-ink-700 bg-ink-800 px-6 py-4 font-semibold text-zinc-300 disabled:opacity-50">
              Decline
            </button>
          </div>
        ) : (
          <div className={`mt-6 rounded-2xl border p-6 text-center ${quote.status === "accepted" || quote.status === "paid" || quote.status === "invoiced" ? "border-green-800/50 bg-green-950/30" : "border-ink-700 bg-ink-900"}`}>
            <p className="text-lg font-bold text-zinc-100">
              {quote.status === "accepted" ? "✓ Quote accepted — we'll be in touch to confirm details." :
               quote.status === "declined" ? "This quote was declined." :
               quote.status === "invoiced" ? "This quote has been invoiced." :
               quote.status === "paid" ? "✓ Paid — see you at the event!" : "This quote is closed."}
            </p>
          </div>
        )}
        <p className="mt-6 text-center text-xs text-zinc-600">Questions? Call Station House BBQ · Seminole Heights, Tampa</p>
      </div>
    </PublicLayout>
  );
}
