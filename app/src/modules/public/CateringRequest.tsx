import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { captureAttribution, getAttribution } from "../../lib/attribution";
import { PublicLayout } from "./PublicLayout";

/**
 * Catering lead intake — full parity with the LIVE request form: name split,
 * event address, date + half-hour time select, menu category, service type,
 * budget range, "how did you hear". Creates a Lead via the DAL with native
 * attribution — no prices, no checkout; the catering team follows up with a
 * real quote within 24 hours.
 */

// Live form selects (verbatim):
const MENU_CATEGORIES = [
  "Weddings & Formals", "Corporate & Events", "BBQ Parties & Gatherings",
  "Asian Fusion", "Italian", "Cuban", "Custom Menu",
];
const SERVICE_TYPES = [
  "Drop-off (food delivered, no staff)",
  "Buffet Setup (setup + chafing, no staff)",
  "Full Service (setup + staff + breakdown)",
  "Food Truck / Mobile Unit",
  "Not sure yet",
];
const HEARD_ABOUT = [
  "Instagram", "Facebook", "TikTok", "Google Search", "Word of Mouth",
  "Attended a Station House Event", "Yelp", "ChatGPT / Grok / Gemini / Other AI", "Other",
];
/**
 * Budget ranges map to budgetCents via the range midpoint; the open-ended
 * "$10,000+" uses its floor and "Not sure yet" stays null. The raw label is
 * always kept on lead.budgetRange.
 */
const BUDGET_RANGES: Array<{ label: string; cents: number | null }> = [
  { label: "Under $500", cents: 25000 },
  { label: "$500 – $1,000", cents: 75000 },
  { label: "$1,000 – $2,500", cents: 175000 },
  { label: "$2,500 – $5,000", cents: 375000 },
  { label: "$5,000 – $10,000", cents: 750000 },
  { label: "$10,000+", cents: 1000000 },
  { label: "Not sure yet", cents: null },
];

/** Half-hour pickup times, 7:00 AM – 9:00 PM (live select). */
function buildTimeOptions(): string[] {
  const out: string[] = [];
  for (let m = 7 * 60; m <= 21 * 60; m += 30) {
    const h24 = Math.floor(m / 60);
    const min = m % 60;
    const h12 = ((h24 + 11) % 12) + 1;
    out.push(`${h12}:${String(min).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`);
  }
  return out;
}

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

  const timeOptions = useMemo(buildTimeOptions, []);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [guests, setGuests] = useState("");
  const [menuCategory, setMenuCategory] = useState(MENU_CATEGORIES[0]);
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [budgetRange, setBudgetRange] = useState(BUDGET_RANGES[BUDGET_RANGES.length - 1].label);
  const [heardAbout, setHeardAbout] = useState("");
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
    if (!firstName.trim() || !lastName.trim()) { setError("First and last name are required."); return; }
    if (!email.trim() && !phone.trim()) { setError("Give us an email or a phone number so we can reply."); return; }
    const guestsNum = guests.trim() === "" ? null : Number(guests);
    if (guestsNum !== null && (!Number.isFinite(guestsNum) || guestsNum < 1)) { setError("Guest count must be a positive number."); return; }
    if (zip.trim() !== "" && !/^\d{5}(-\d{4})?$/.test(zip.trim())) { setError("Zip code doesn't look right."); return; }

    const budget = BUDGET_RANGES.find(b => b.label === budgetRange) ?? null;
    const addressParts = [street.trim(), city.trim(), zip.trim()].filter(Boolean);
    const noteLines = [notes.trim(), eventTime ? `Event time: ${eventTime}` : ""].filter(Boolean);

    createMut.mutate({
      name: `${firstName.trim()} ${lastName.trim()}`,
      company: null,
      email: email.trim(),
      phone: phone.trim(),
      eventType: menuCategory,
      eventDate: eventDate || null,
      guests: guestsNum === null ? null : Math.round(guestsNum),
      budgetCents: budget?.cents ?? null,
      source: "website", // attribution-derived; heardAbout is stored separately
      utm: utmFromAttribution(),
      notes: noteLines.length ? noteLines.join("\n") : null,
      serviceType,
      menuCategory,
      budgetRange,
      heardAbout: heardAbout || null,
      eventAddress: addressParts.length ? addressParts.join(", ") : null,
    });
  };

  if (done) {
    return (
      <PublicLayout>
        <section className="mx-auto max-w-md pt-20 text-center">
          <span aria-hidden className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-green-600 text-3xl font-black text-white">✓</span>
          <h1 className="mt-4 text-3xl font-black uppercase text-zinc-100">Got it</h1>
          <p className="mt-2 text-sm text-zinc-400">We'll respond within 24 hours with next steps and a real quote.</p>
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
        <p className="mt-1 text-sm text-zinc-400">Two minutes now — we'll respond within 24 hours.</p>

        <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); submit(); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>First name *
              <input value={firstName} onChange={e => setFirstName(e.target.value)} className={inputCls} placeholder="Jordan" autoComplete="given-name" />
            </label>
            <label className={labelCls}>Last name *
              <input value={lastName} onChange={e => setLastName(e.target.value)} className={inputCls} placeholder="Rivera" autoComplete="family-name" />
            </label>
            <label className={labelCls}>Email
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" autoComplete="email" />
            </label>
            <label className={labelCls}>Phone
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="(813) 555-0123" autoComplete="tel" />
            </label>
          </div>

          <fieldset className="rounded-xl border border-ink-700 p-4">
            <legend className="px-1 text-xs font-black uppercase tracking-wider text-zinc-500">Event location</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className={`${labelCls} sm:col-span-3`}>Street address
                <input value={street} onChange={e => setStreet(e.target.value)} className={inputCls} placeholder="123 Bayshore Blvd" autoComplete="street-address" />
              </label>
              <label className={`${labelCls} sm:col-span-2`}>City
                <input value={city} onChange={e => setCity(e.target.value)} className={inputCls} placeholder="Tampa" />
              </label>
              <label className={labelCls}>Zip
                <input value={zip} onChange={e => setZip(e.target.value)} className={inputCls} placeholder="33603" inputMode="numeric" autoComplete="postal-code" />
              </label>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className={labelCls}>Event date
              <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className={inputCls} />
            </label>
            <label className={labelCls}>Event time
              <select value={eventTime} onChange={e => setEventTime(e.target.value)} className={inputCls}>
                <option value="">Choose a time…</option>
                {timeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className={labelCls}>Guest count
              <input type="number" min={1} value={guests} onChange={e => setGuests(e.target.value)} className={inputCls} placeholder="50" />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelCls}>Menu category
              <select value={menuCategory} onChange={e => setMenuCategory(e.target.value)} className={inputCls}>
                {MENU_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className={labelCls}>Service type
              <select value={serviceType} onChange={e => setServiceType(e.target.value)} className={inputCls}>
                {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label className={labelCls}>Estimated budget
              <select value={budgetRange} onChange={e => setBudgetRange(e.target.value)} className={inputCls}>
                {BUDGET_RANGES.map(b => <option key={b.label} value={b.label}>{b.label}</option>)}
              </select>
            </label>
            <label className={labelCls}>How did you hear about us?
              <select value={heardAbout} onChange={e => setHeardAbout(e.target.value)} className={inputCls}>
                <option value="">Choose one…</option>
                {HEARD_ABOUT.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
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
          <p className="text-center text-xs text-zinc-500">We'll respond within 24 hours.</p>
        </form>
      </section>
    </PublicLayout>
  );
}
