import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { formatCents } from "../../lib/money";
import { captureAttribution, getAttribution } from "../../lib/attribution";
import { PublicLayout } from "./PublicLayout";

/**
 * Special-event landing (e.g. holiday drops, pop-ups). Driven entirely by the
 * admin Events config: slug lookup, landingEnabled kill switch, menu preview
 * via menuItemIds, and a lead-capture interest form. Never a checkout.
 */

export function EventLanding({ slug, fallbackTitle }: { slug: string; fallbackTitle: string }) {
  const dal = getDal();

  useEffect(() => { captureAttribution(); }, []);

  const { data: events, isLoading } = useQuery({
    queryKey: ["public", "events"],
    queryFn: () => dal.events.list(),
  });
  const { data: menuItems } = useQuery({
    queryKey: ["public", "menuItems"],
    queryFn: () => dal.menu.items(),
  });

  const event = useMemo(() => (events ?? []).find(e => e.slug === slug) ?? null, [events, slug]);
  const preview = useMemo(() => {
    if (!event || !menuItems) return [];
    return menuItems.filter(m => event.menuItemIds.includes(m.id));
  }, [event, menuItems]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const interestMut = useMutation({
    mutationFn: (input: Parameters<typeof dal.leads.create>[0]) => dal.leads.create(input, "public-web"),
    onSuccess: () => setDone(true),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong — please try again."),
  });

  if (isLoading) {
    return <PublicLayout><p className="py-24 text-center text-zinc-500">Loading…</p></PublicLayout>;
  }

  if (!event || !event.landingEnabled) {
    return (
      <PublicLayout>
        <section className="mx-auto max-w-md pt-20 text-center">
          <p className="text-4xl" aria-hidden>🌙</p>
          <h1 className="mt-3 text-3xl font-black uppercase text-zinc-100">{fallbackTitle}</h1>
          <p className="mt-2 text-sm text-zinc-400">This event isn't running right now — but the smokers never really sleep.</p>
          <div className="mt-6 flex justify-center gap-2">
            <Link href="/fire-drop"
              className="inline-flex min-h-[48px] items-center rounded-xl bg-gradient-to-r from-fire to-fire-light px-6 text-sm font-black uppercase tracking-wider text-white">
              See this week's Weekend Pre-Order
            </Link>
            <Link href="/catering"
              className="inline-flex min-h-[48px] items-center rounded-xl border border-ink-700 px-6 text-sm font-black uppercase tracking-wider text-zinc-300">
              Home
            </Link>
          </div>
        </section>
      </PublicLayout>
    );
  }

  const submitInterest = () => {
    setError(null);
    if (!name.trim() || !email.trim()) { setError("Name and email are both needed so we can let you know."); return; }
    const a = getAttribution();
    interestMut.mutate({
      name: name.trim(),
      company: null,
      email: email.trim(),
      phone: "",
      eventType: event.name,
      eventDate: event.eventDate,
      guests: null,
      budgetCents: null,
      source: "event-landing",
      utm: {
        source: a?.utm_source ?? null, medium: a?.utm_medium ?? null, campaign: a?.utm_campaign ?? null,
        gclid: a?.gclid ?? null, fbclid: a?.fbclid ?? null, referrer: a?.referrer ?? null,
        landingPage: a?.landing_page ?? null,
      },
      notes: `Interest sign-up for ${event.name} (${slug})`,
    });
  };

  return (
    <PublicLayout>
      <section className="pt-12 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-fire-light">Special Event</p>
        <h1 className="mt-3 text-4xl font-black uppercase leading-tight tracking-tight text-zinc-100 sm:text-6xl">{event.name}</h1>
        {event.eventDate && <p className="mt-3 text-sm font-bold text-zinc-300">{event.eventDate}</p>}
        {event.notes && <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-400">{event.notes}</p>}
        {!event.orderingEnabled && (
          <p className="mx-auto mt-5 inline-block rounded-lg border border-amber-600/40 bg-amber-950/40 px-4 py-2 text-sm font-bold text-amber-400">
            Ordering opens soon — drop your email below and you'll hear first.
          </p>
        )}
      </section>

      {preview.length > 0 && (
        <section className="mx-auto mt-10 max-w-2xl" aria-label="Event menu preview">
          <h2 className="text-center text-sm font-black uppercase tracking-widest text-zinc-300">On the menu</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {preview.map(m => (
              <article key={m.id} className="rounded-2xl border border-ink-700 bg-ink-900 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-black uppercase text-zinc-100">{m.name}</h3>
                  <span className="text-base font-black tabular-nums text-fire-light">{formatCents(m.priceCents)}</span>
                </div>
                {m.description && <p className="mt-1 text-xs text-zinc-500">{m.description}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto mt-10 max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6" aria-label="Get notified">
        {done ? (
          <div className="text-center">
            <p className="text-2xl" aria-hidden>🔥</p>
            <h2 className="mt-2 text-lg font-black uppercase text-zinc-100">You're on the list</h2>
            <p className="mt-1 text-sm text-zinc-400">We'll email you when {event.name} details drop.</p>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-black uppercase text-zinc-100">Want first crack at it?</h2>
            <p className="mt-1 text-sm text-zinc-400">Leave your name and email — we'll ping you before it goes public.</p>
            <form className="mt-4 space-y-2" onSubmit={e => { e.preventDefault(); submitInterest(); }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" aria-label="Name"
                className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" aria-label="Email"
                className="w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600" />
              {error && <p role="alert" className="rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-xs font-bold text-red-400">{error}</p>}
              <button type="submit" disabled={interestMut.isPending}
                className="min-h-[48px] w-full rounded-xl bg-gradient-to-r from-fire to-fire-light text-sm font-black uppercase tracking-wider text-white disabled:opacity-50">
                {interestMut.isPending ? "Saving…" : "Keep me posted"}
              </button>
            </form>
          </>
        )}
      </section>
    </PublicLayout>
  );
}
