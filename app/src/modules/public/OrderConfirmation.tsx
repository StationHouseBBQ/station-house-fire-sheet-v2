import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { PublicLayout, DemoPaymentNotice } from "./PublicLayout";

/**
 * Shared confirmation page for Fire Drop + Cuban Thursday checkouts. The ref
 * arrives as a hash-route query (`#/fire-drop/confirmation?ref=FD-…`), so we
 * parse it off location.hash rather than location.search.
 */

export function refFromHash(hash: string = window.location.hash): string | null {
  const q = hash.indexOf("?");
  if (q === -1) return null;
  return new URLSearchParams(hash.slice(q + 1)).get("ref");
}

const STATUS_CLS: Record<string, string> = {
  pending: "bg-amber-600 text-white",
  paid: "bg-green-600 text-white",
  ready: "bg-fire text-white",
  picked_up: "bg-ink-700 text-zinc-300",
  cancelled: "bg-red-600 text-white",
  refunded: "bg-red-600 text-white",
};

export function OrderConfirmation() {
  const dal = getDal();
  const ref = refFromHash();

  const { data: order, isLoading } = useQuery({
    queryKey: ["public", "track", ref],
    queryFn: () => dal.publicCheckout.trackByRef(ref ?? ""),
    enabled: !!ref,
  });

  if (!ref) {
    return (
      <PublicLayout>
        <Missing title="No order reference" body="We couldn't find an order reference in this link. If you just placed an order, check your confirmation for the ref (looks like FD-0717-1042)." />
      </PublicLayout>
    );
  }
  if (isLoading) {
    return <PublicLayout><p className="py-24 text-center text-zinc-500">Looking up your order…</p></PublicLayout>;
  }
  if (!order) {
    return (
      <PublicLayout>
        <Missing title="Order not found" body={`We couldn't find an order with ref "${ref}". Double-check the link, or look it up on the tracker.`} />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <section className="mx-auto max-w-lg pt-12 text-center">
        <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-600 text-3xl font-black text-white">✓</span>
        <h1 className="mt-4 text-3xl font-black uppercase text-zinc-100">You're on the list</h1>
        <p className="mt-1 text-sm text-zinc-400">Order confirmed for {order.customer}.</p>
        <p className="mt-3 inline-block rounded-lg border border-fire/50 bg-ink-900 px-4 py-2 text-xl font-black tracking-widest text-fire-light">{order.orderRef}</p>

        <div className="mt-6 rounded-2xl border border-ink-700 bg-ink-900 p-5 text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500">Pickup</p>
              <p className="text-base font-black text-zinc-100">{order.pickupDate} · {order.pickupWindow}</p>
            </div>
            <span className={`rounded px-2 py-1 text-[10px] font-black uppercase ${STATUS_CLS[order.status] ?? "bg-ink-700 text-zinc-300"}`}>
              {order.status.replace("_", " ")}
            </span>
          </div>
          <ul className="mt-4 space-y-1 border-t border-ink-700 pt-3 text-sm">
            {order.items.map(i => (
              <li key={i.id} className="flex justify-between text-zinc-300">
                <span>{i.qty}× {i.name}</span>
                <span className="tabular-nums">{formatCents(i.unitPriceCents * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-0.5 border-t border-ink-700 pt-2 text-sm">
            <p className="flex justify-between text-zinc-400"><span>Subtotal</span><span className="tabular-nums">{formatCents(order.subtotalCents)}</span></p>
            <p className="flex justify-between text-zinc-400"><span>Tax</span><span className="tabular-nums">{formatCents(order.taxCents)}</span></p>
            <p className="flex justify-between text-base font-black text-zinc-100"><span>Total</span><span className="tabular-nums">{formatCents(order.totalCents)}</span></p>
          </div>
        </div>

        <div className="mt-4 text-left"><DemoPaymentNotice /></div>
        <p className="mt-4 text-sm text-zinc-500">
          Save your ref — you can check status any time on the{" "}
          <Link href="/track" className="font-bold text-fire-light underline">order tracker</Link>.
        </p>
      </section>
    </PublicLayout>
  );
}

function Missing({ title, body }: { title: string; body: string }) {
  return (
    <section className="mx-auto max-w-md pt-20 text-center">
      <h1 className="text-2xl font-black uppercase text-zinc-100">{title}</h1>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
      <Link href="/track"
        className="mt-6 inline-flex min-h-[48px] items-center rounded-xl bg-fire px-6 text-sm font-black uppercase tracking-wider text-white">
        Open order tracker
      </Link>
    </section>
  );
}
