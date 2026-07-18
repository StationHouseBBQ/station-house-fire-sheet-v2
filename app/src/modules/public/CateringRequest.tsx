import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { captureAttribution, getAttribution } from "../../lib/attribution";
import { PublicLayout } from "./PublicLayout";

/**
 * Catering lead intake. Creates a Lead via the DAL with native attribution —
 * no prices, no checkout; the catering team follows up with a real quote.
 */

const EVENT_TYPES = ["Wedding", "Corporate", "Backyard", "Holiday", "Other"];

function utmFromAttribution(): Lead["utm"] {
  const a = getAttribution();
  return {
    source: a?.utm_source ?? null,
    medium: a?.utm_medium ?? null,
    campaign: a?.utm_campaign ?? null,
    gclid: a?.gclid ?? null,
    fbclid: a?.fbclid ?? null,
    referrer: a?.referrer ?? null,
    landingPage: a?.landing_page ?? null,
  };
}

const inputCls = "mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-3 text-sm text-zinc-100 placeholder:text-zinc-600";
const labelCls = "block text-xs font-bold uppercase tracking-wider text-zinc-400";

export function CateringRequest() {
  const dal = getDal();

  useEffect(() => { captureAttribution(); }, []);

  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState(EVENT_TYPES[0]);
  const [eventDate, setEventDate] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof dal.leads.create>[0]) => dal.leads.create(input, "public-web"),
    onSuccess: () => setDone(true),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : "Something went wrong — please try again."),
  });

  const submit = () => {
    setError(null);
    if (!name.trim()) { setError("Your name is required."); return; }
    if (!email.trim() && !phone.trim()) { setError("Give us an email or a phone number so we can reply."); return; }
    const guestsNum = guests.trim() === "" ? null : Number(guests);
    if (guestsNum !== null && (!Number.isFinite(guestsNum) || guestsNum < 1)) { setError("Guest count must be a positive number."); return; }
    const budgetNum = budget.trim() === "" ? null : Number(budget);
    if (budgetNum !== null && (!Number.isFinite(budgetNum) || budgetNum < 0)) { setError("Budget must be a dollar amount."); return; }

    createMut.mutate({
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim(),
      phone: phone.trim(),
      eventType,
      eventDate: eventDate || null,
      guests: guestsNum === null ? null : Math.round(guestsNum),
      budgetCents: budgetNum === null ? null : Math.round(budgetNum * 100),
      source: "website",
      utm: utmFromAttribution(),
      notes: notes.trim() || null,
    });
  };

  if (done) {
    return (
      <PublicLayout>
        <section className="mx-auto max-w-md pt-20 text-center">
          <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-600 text-3xl font-black text-white">✓</span>
          <h1 className="mt-4 text-3xl font-black uppercase text-zinc-100">Got it</h1>
          <p className="mt-2 text-sm text-zinc-400">We'll reach out within one business day with next steps and a real quote.</p>
          <Link href="/catering"
            className="mt-6 inline-flex min-h-[48px] items-center rounded-xl border border-fire/60 px-6 text-sm font-black uppercase tracking-wider text-fire-light">
            Back to catering
          </Link>
        </section>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <section className="mx-auto max-w-xl pt-10">
        <h1 className="text-3xl font-black uppercase text-zinc-100">Request catering</h1>
        <p className="mt-1 text-sm text-zinc-400">Two minutes now, a real quote within one business day.</p>

        <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Your name *
              <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Jordan Rivera" />
            </label>
            <label className={labelCls}>Company (optional)
              <input value={company} onChange={e => setCompany(e.target.value)} className={inputCls} placeholder="Acme Inc." />
            </label>
            <label className={labelCls}>Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
            </label>
            <label className={labelCls}>Phone
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="(813) 555-0123" />
            </label>
            <label className={labelCls}>Event type
              <select value={eventType} onChange={e => setEventType(e.target.value)} className={inputCls}>
                {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className={labelCls}>Event date
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>Guest count
              <input type="number" min={1} value={guests} onChange={e => setGuests(e.target.value)} className={inputCls} placeholder="50" />
            </label>
            <label className={labelCls}>Budget in dollars (optional)
              <input type="number" min={0} step="1" value={budget} onChange={e => setBudget(e.target.value)} className={inputCls} placeholder="1500" />
            </label>
          </div>
          <label className={labelCls}>Anything else we should know?
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4} className={inputCls}
              placeholder="Venue, dietary needs, service style, the guest of honor's favorite meat…" />
          </label>

          {error && (
            <p role="alert" className="rounded-lg border border-red-700/60 bg-red-950/50 px-3 py-2 text-sm font-bold text-red-400">{error}</p>
          )}

          <button type="submit" disabled={createMut.isPending}
            className="min-h-[52px] w-full rounded-xl bg-gradient-to-r from-fire to-fire-light px-6 text-base font-black uppercase tracking-wider text-white shadow-lg shadow-fire/30 disabled:opacity-50">
            {createMut.isPending ? "Sending…" : "Send my request"}
          </button>
        </form>
      </section>
    </PublicLayout>
  );
}
