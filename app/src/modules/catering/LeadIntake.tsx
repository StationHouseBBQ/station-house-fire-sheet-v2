import { useEffect, useState, type ReactNode } from "react";
import { useMutation } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { Lead } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { captureAttribution, getAttribution } from "../../lib/attribution";

/**
 * Catering · Lead Intake — V2 counterpart of the Manus LeadIntakeForm.
 * Captures attribution on mount (native capture, no GoHighLevel) and
 * attaches it to dal.leads.create. Budget entered in dollars, stored as
 * integer cents. Success state offers "add another".
 */

const EVENT_TYPES = ["wedding", "corporate", "birthday", "graduation", "festival", "other"] as const;
const SOURCES = ["google", "facebook", "instagram", "referral", "walk-in", "other"] as const;

export function LeadIntake() {
  const { actor } = useRole();
  const dal = getDal();
  const [done, setDone] = useState<Lead | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => { captureAttribution(); }, []);

  const createMut = useMutation({
    mutationFn: async ({ input, startNow }: { input: Parameters<typeof dal.leads.create>[0]; startNow: boolean }) => {
      const lead = await dal.leads.create(input, actor);
      if (startNow) { await dal.cateringLifecycle.convertLead(lead.id, actor); }
      return { lead, startNow };
    },
    onSuccess: ({ lead, startNow }) => { setDone(lead); setStarted(startNow); },
  });

  if (done) {
    return (
      <div className="mx-auto max-w-xl pt-6 pb-12">
        <div className="rounded-2xl border border-green-800/50 bg-green-950/10 p-8 text-center">
          <p className="text-3xl">🎉</p>
          <h1 className="mt-2 text-xl font-black text-zinc-100">{started ? "Lead captured & order started" : "Lead captured"}</h1>
          <p className="mt-1 text-sm text-zinc-400">
            <span className="font-semibold text-zinc-200">{done.name}</span>{" "}
            {started
              ? "was added and a catering order was started — find it in the Director Cockpit."
              : "was added to the pipeline as a new lead."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-2">
            {started && (
              <a href="#/catering/cockpit"
                className="min-h-[44px] rounded-lg bg-fire px-6 py-2.5 text-sm font-bold text-white">
                Open Director Cockpit
              </a>
            )}
            <button onClick={() => { setDone(null); setStarted(false); createMut.reset(); }}
              className={`min-h-[44px] rounded-lg px-6 py-2.5 text-sm font-bold ${started ? "border border-ink-700 text-zinc-300" : "bg-fire text-white"}`}>
              + Add another lead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl pt-6 pb-12">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Lead Intake</h1>
        <p className="text-sm text-zinc-500">New catering inquiry — attribution is captured automatically</p>
      </header>
      <IntakeForm busy={createMut.isPending} error={createMut.error?.message ?? null}
        onSubmit={(i, startNow) => createMut.mutate({ input: i, startNow })} />
    </div>
  );
}

function IntakeForm({ onSubmit, busy, error }: {
  onSubmit: (input: Parameters<ReturnType<typeof getDal>["leads"]["create"]>[0], startNow: boolean) => void;
  busy: boolean; error: string | null;
}) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [eventType, setEventType] = useState<string>("corporate");
  const [eventDate, setEventDate] = useState("");
  const [guests, setGuests] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState<string>("google");
  const [startNow, setStartNow] = useState(false);

  const submit = () => {
    const attr = getAttribution();
    const guestsN = guests.trim() === "" ? null : Math.max(0, Math.round(Number(guests)));
    const budgetN = budget.trim() === "" ? null : Math.max(0, Math.round(Number(budget) * 100));
    onSubmit({
      name: name.trim(),
      company: company.trim() || null,
      email: email.trim(),
      phone: phone.trim(),
      eventType,
      eventDate: eventDate || null,
      guests: Number.isFinite(guestsN as number) ? guestsN : null,
      budgetCents: Number.isFinite(budgetN as number) ? budgetN : null,
      source,
      notes: notes.trim() || null,
      utm: {
        source: attr?.utm_source ?? null,
        medium: attr?.utm_medium ?? null,
        campaign: attr?.utm_campaign ?? null,
        gclid: attr?.gclid ?? null,
        fbclid: attr?.fbclid ?? null,
        referrer: attr?.referrer ?? null,
        landingPage: attr?.landing_page ?? null,
      },
    }, startNow);
  };

  return (
    <form className="mt-5 rounded-2xl border border-ink-700 bg-ink-900 p-5"
      onSubmit={e => { e.preventDefault(); submit(); }}>
      {error && <p className="mb-3 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name *">
          <input value={name} onChange={e => setName(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="Company">
          <input value={company} onChange={e => setCompany(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="Email *">
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="Phone *">
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="Event type">
          <select value={eventType} onChange={e => setEventType(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Event date">
          <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="Guest count">
          <input inputMode="numeric" value={guests} onChange={e => setGuests(e.target.value)} placeholder="e.g. 75"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="Budget ($)">
          <input inputMode="decimal" value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. 2500"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </Field>
        <Field label="How did they find us?">
          <select value={source} onChange={e => setSource(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-2 py-2.5 text-zinc-100">
            {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes" className="mt-3 block">
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
          className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
      </Field>

      <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-zinc-300">
        <input type="checkbox" checked={startNow} onChange={e => setStartNow(e.target.checked)} className="h-4 w-4 accent-fire" />
        Start catering order now (send straight to the Cockpit)
      </label>

      <button type="submit" disabled={busy}
        className="mt-5 w-full rounded-lg bg-fire px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "Saving…" : startNow ? "Create lead & start order" : "Create lead"}
      </button>
    </form>
  );
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className ?? "block"}>
      <span className="text-sm font-semibold text-zinc-400">{label}</span>
      {children}
    </label>
  );
}
