import { useEffect } from "react";
import { Link } from "wouter";
import { captureAttribution } from "../../lib/attribution";
import { PublicLayout } from "./PublicLayout";

/**
 * Public catering marketing page. Pure content + CTAs into the request form —
 * no pricing engine, no login, nothing interactive that could dead-end.
 */

const TRUST = [
  { icon: "💍", title: "Weddings", body: "Plated-quality BBQ without the banquet-hall markup. We handle timing so the toast never waits on the brisket." },
  { icon: "🏢", title: "Corporate", body: "On-time drop-offs and full-service lines for 20 to 500. Invoicing that keeps your accounting team happy." },
  { icon: "🏡", title: "Backyard", body: "Graduations, reunions, birthdays. Real smoked meat, real sides, zero stress on the host." },
];

const STEPS = [
  { n: "1", title: "Tell us about your event", body: "Two minutes on the request form — date, headcount, vibe." },
  { n: "2", title: "Get a real quote fast", body: "A person (not a bot) replies within one business day with a menu and price." },
  { n: "3", title: "We show up ready", body: "Smoked overnight, packed hot, on site on time. You take the credit." },
];

const PACKAGES = [
  { name: "The Block Party", feeds: "Feeds 25", from: "from $450", items: ["Pulled pork + smoked chicken", "Two sides + rolls", "Sauces & setup kit"] },
  { name: "The Main Event", feeds: "Feeds 50", from: "from $950", items: ["Brisket, pulled pork + ribs", "Three sides + rolls", "Chafers, serviceware, setup"] },
  { name: "The Whole Hog", feeds: "Feeds 100", from: "from $1,900", items: ["Full pit spread, all proteins", "Four sides + dessert", "Staffed service line available"] },
];

export function CateringLanding() {
  useEffect(() => { captureAttribution(); }, []);

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="pt-12 text-center">
        <p className="text-xs font-black uppercase tracking-[0.3em] text-fire-light">Station House Catering · Tampa Bay</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-black uppercase leading-tight tracking-tight text-zinc-100 sm:text-6xl">
          BBQ that shows up{" "}
          <span className="bg-gradient-to-r from-fire to-fire-light bg-clip-text text-transparent">ready to win the room</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-zinc-400">
          Oak-smoked overnight in Seminole Heights, delivered hot and on schedule.
          From backyard birthdays to 300-seat weddings.
        </p>
        <Link href="/catering-request"
          className="mt-6 inline-flex min-h-[52px] items-center rounded-xl bg-gradient-to-r from-fire to-fire-light px-8 text-base font-black uppercase tracking-wider text-white shadow-lg shadow-fire/30">
          Get a catering quote
        </Link>
      </section>

      {/* Trust */}
      <section className="mt-14 grid gap-3 sm:grid-cols-3" aria-label="Who we serve">
        {TRUST.map(t => (
          <article key={t.title} className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
            <p className="text-2xl" aria-hidden>{t.icon}</p>
            <h2 className="mt-2 text-base font-black uppercase text-zinc-100">{t.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{t.body}</p>
          </article>
        ))}
      </section>

      {/* How it works */}
      <section className="mt-14" aria-label="How it works">
        <h2 className="text-center text-2xl font-black uppercase text-zinc-100">How it works</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map(s => (
            <article key={s.n} className="rounded-2xl border border-ink-700 bg-ink-900 p-5 text-center">
              <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-fire text-lg font-black text-white">{s.n}</span>
              <h3 className="mt-3 text-sm font-black uppercase text-zinc-100">{s.title}</h3>
              <p className="mt-1 text-sm text-zinc-400">{s.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Packages */}
      <section className="mt-14" aria-label="Sample packages">
        <h2 className="text-center text-2xl font-black uppercase text-zinc-100">Sample packages</h2>
        <p className="mt-1 text-center text-xs text-zinc-500">Every event is quoted to fit — these are starting points, not a menu ceiling.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {PACKAGES.map(p => (
            <article key={p.name} className="flex flex-col rounded-2xl border border-ink-700 bg-ink-900 p-5">
              <h3 className="text-lg font-black uppercase text-zinc-100">{p.name}</h3>
              <p className="text-xs font-bold uppercase tracking-wider text-fire-light">{p.feeds} · {p.from}</p>
              <ul className="mt-3 flex-1 space-y-1 text-sm text-zinc-400">
                {p.items.map(i => <li key={i}>• {i}</li>)}
              </ul>
              <Link href="/catering-request"
                className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-xl border border-fire/60 px-4 text-sm font-black uppercase tracking-wider text-fire-light hover:bg-ink-800">
                Start with this one
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mt-16 rounded-2xl border border-fire/40 bg-gradient-to-r from-ink-900 to-ink-800 p-8 text-center">
        <h2 className="text-2xl font-black uppercase text-zinc-100">Got a date? Let's feed it.</h2>
        <p className="mt-1 text-sm text-zinc-400">Tell us about your event — we reply within one business day.</p>
        <Link href="/catering-request"
          className="mt-5 inline-flex min-h-[52px] items-center rounded-xl bg-gradient-to-r from-fire to-fire-light px-8 text-base font-black uppercase tracking-wider text-white shadow-lg shadow-fire/30">
          Request catering
        </Link>
      </section>
    </PublicLayout>
  );
}
