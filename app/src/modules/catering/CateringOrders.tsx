import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import { useRole } from "../../app/RoleContext";
import { useUndo } from "../shared/undo";
import { formatCents, orderTotals } from "../../lib/money";
import type { CateringOrder, CateringStage, CateringTimelineEntry, LeadPriority, QuoteLine } from "../../dal/types";
import { CateringDocument, documentPlainText, openPrint, isInvoiceReal, type DocumentKind } from "./CateringDocuments";

/**
 * Catering · Orders — the unified lifecycle cockpit. One screen carries a
 * catering order from inquiry → quote → invoice → payment → kitchen →
 * completed. Left: stage-grouped rail. Right: the command card with a single
 * clear next-action per stage, an editable quote, payments, kitchen handoff,
 * and the shared timeline/comms log everyone reads.
 */

const SERVICE_TYPES = ["Drop-off", "Buffet Setup", "Full Service", "Food Truck"];

const STAGE_ORDER: CateringStage[] = [
  "inquiry", "quoting", "quote_sent", "accepted", "invoiced", "paid", "in_kitchen", "ready", "completed",
];
const CLOSED_STAGES: CateringStage[] = ["lost", "cancelled"];

const STAGE_META: Record<CateringStage, { label: string; cls: string }> = {
  inquiry: { label: "Inquiry", cls: "bg-ink-700 text-zinc-300" },
  quoting: { label: "Building quote", cls: "bg-sky-800 text-sky-100" },
  quote_sent: { label: "Quote sent", cls: "bg-amber-700 text-amber-50" },
  accepted: { label: "Accepted", cls: "bg-emerald-800 text-emerald-50" },
  invoiced: { label: "Invoiced", cls: "bg-indigo-800 text-indigo-50" },
  paid: { label: "Paid", cls: "bg-green-700 text-green-50" },
  in_kitchen: { label: "In kitchen", cls: "bg-fire text-white" },
  ready: { label: "Ready", cls: "bg-teal-700 text-teal-50" },
  completed: { label: "Completed", cls: "bg-zinc-600 text-zinc-100" },
  lost: { label: "Lost", cls: "bg-red-900 text-red-200" },
  cancelled: { label: "Cancelled", cls: "bg-zinc-800 text-zinc-400" },
};

const PRIORITIES: LeadPriority[] = ["low", "normal", "high", "urgent"];
const PRIORITY_CLS: Record<LeadPriority, string> = {
  low: "bg-ink-700 text-zinc-400", normal: "bg-sky-900 text-sky-200",
  high: "bg-amber-800 text-amber-100", urgent: "bg-red-800 text-red-100",
};

const KIND_ICON: Record<CateringTimelineEntry["kind"], string> = {
  stage: "🔵", note: "📝", email: "✉️", call: "📞", text: "💬", system: "⚙️",
};

const PREV_STAGE: Partial<Record<CateringStage, CateringStage>> = {
  quote_sent: "quoting", accepted: "quote_sent", invoiced: "accepted", ready: "in_kitchen", completed: "ready",
};

function dollarsToCents(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CateringOrders() {
  const { actor } = useRole();
  const qc = useQueryClient();
  const dal = getDal();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["cateringLifecycle", "list"],
    queryFn: () => dal.cateringLifecycle.list(),
    refetchInterval: 30_000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["cateringLifecycle"] });

  const selected = useMemo(() => orders.find(o => o.id === selectedId) ?? null, [orders, selectedId]);

  const createMut = useMutation({
    mutationFn: (input: Parameters<typeof dal.cateringLifecycle.createFromLead>[1]) =>
      dal.cateringLifecycle.createFromLead(null, input, actor),
    onSuccess: (o) => { invalidate(); setSelectedId(o.id); setCreateOpen(false); },
  });

  const grouped = useMemo(() => {
    const g: Partial<Record<CateringStage, CateringOrder[]>> = {};
    for (const o of orders) (g[o.stage] ??= []).push(o);
    return g;
  }, [orders]);

  const closedCount = CLOSED_STAGES.reduce((n, s) => n + (grouped[s]?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-7xl pt-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Catering · Orders</h1>
          <p className="text-sm text-zinc-500">One screen per order — quote, invoice, payment, kitchen, all in one story.</p>
        </div>
        <button onClick={() => setCreateOpen(true)}
          className="min-h-[44px] rounded-lg bg-fire px-4 text-sm font-bold text-white">+ New catering order</button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* LEFT — stage-grouped rail */}
        <aside className="space-y-4">
          {isLoading && <p className="py-10 text-center text-zinc-500">Loading orders…</p>}
          {!isLoading && orders.length === 0 && <p className="rounded-xl border border-ink-700 bg-ink-900 p-4 text-sm text-zinc-500">No catering orders yet. Create one to get started.</p>}
          {STAGE_ORDER.map(stage => {
            const list = grouped[stage];
            if (!list?.length) return null;
            return (
              <StageGroup key={stage} stage={stage} orders={list} selectedId={selectedId} onSelect={setSelectedId} />
            );
          })}
          {closedCount > 0 && (
            <details className="rounded-xl border border-ink-800 bg-ink-950/60">
              <summary className="cursor-pointer px-3 py-2 text-xs font-bold uppercase tracking-wider text-zinc-500">Lost / Cancelled ({closedCount})</summary>
              <div className="space-y-3 p-2">
                {CLOSED_STAGES.map(stage => grouped[stage]?.length ? (
                  <StageGroup key={stage} stage={stage} orders={grouped[stage]!} selectedId={selectedId} onSelect={setSelectedId} />
                ) : null)}
              </div>
            </details>
          )}
        </aside>

        {/* RIGHT — command card */}
        <section>
          {selected ? (
            <CommandCard key={selected.id} order={selected} actor={actor} onChanged={invalidate} />
          ) : (
            <div className="grid min-h-[24rem] place-items-center rounded-2xl border border-dashed border-ink-700 bg-ink-950/40 p-8 text-center">
              <div>
                <p className="text-lg font-bold text-zinc-300">Select a catering order, or create one.</p>
                <p className="mt-1 text-sm text-zinc-500">The full lifecycle — quote to kitchen — lives on one screen.</p>
              </div>
            </div>
          )}
        </section>
      </div>

      {createOpen && (
        <CreateDialog busy={createMut.isPending} error={createMut.error?.message ?? null}
          onCancel={() => setCreateOpen(false)} onSubmit={i => createMut.mutate(i)} />
      )}
    </div>
  );
}

function StageGroup({ stage, orders, selectedId, onSelect }: {
  stage: CateringStage; orders: CateringOrder[]; selectedId: string | null; onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${STAGE_META[stage].cls}`}>{STAGE_META[stage].label}</span>
        <span className="text-xs text-zinc-600">{orders.length}</span>
      </div>
      <ul className="space-y-2">
        {orders.map(o => (
          <li key={o.id}>
            <button onClick={() => onSelect(o.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${o.id === selectedId ? "border-fire bg-ink-800" : "border-ink-700 bg-ink-900 hover:border-ink-600"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate font-bold text-zinc-100">{o.customer}</p>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${PRIORITY_CLS[o.priority]}`}>{o.priority}</span>
              </div>
              {o.companyName && <p className="truncate text-xs text-zinc-500">{o.companyName}</p>}
              <p className="mt-1 text-xs text-zinc-400">{o.event.eventDate ?? "Date TBD"} · {o.event.guests ?? "?"} guests</p>
              <p className="mt-1 text-sm font-black text-fire-light">{formatCents(o.totalCents)}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommandCard({ order, actor, onChanged }: { order: CateringOrder; actor: string; onChanged: () => void }) {
  const dal = getDal();
  const undo = useUndo();
  const [err, setErr] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [docKind, setDocKind] = useState<DocumentKind | null>(null);

  const { data: equipmentCatalog = [] } = useQuery({
    queryKey: ["equipment", "catalog"],
    queryFn: () => dal.equipment.list(),
    staleTime: 5 * 60_000,
  });

  const clc = dal.cateringLifecycle;
  const run = async (p: Promise<unknown>) => { setErr(null); try { await p; onChanged(); } catch (e) { setErr((e as Error).message); } };

  const setStage = (stage: CateringStage) => clc.setStage(order.id, stage, actor);
  const offerRevert = (label: string, from: CateringStage) => {
    const prev = PREV_STAGE[from];
    if (prev) undo.offer(label, async () => { await setStage(prev); onChanged(); });
  };

  const balanceDue = Math.max(0, order.totalCents - order.paidCents);
  const ev = order.event;

  return (
    <div className="space-y-5 rounded-2xl border border-ink-700 bg-ink-900 p-5">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-fire">{order.ref}</p>
          <h2 className="mt-1 text-xl font-black text-zinc-100">{order.customer}</h2>
          {order.companyName && <p className="text-sm text-zinc-500">{order.companyName}</p>}
        </div>
        <label className="text-xs font-semibold text-zinc-500">Priority
          <select value={order.priority} onChange={e => run(clc.setPriority(order.id, e.target.value as LeadPriority, actor))}
            className="mt-1 block rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm font-bold text-zinc-100">
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </header>

      {/* Documents */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Documents</span>
        <button onClick={() => setDocKind("quote")} className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">Quote</button>
        <button onClick={() => setDocKind("invoice")} title={isInvoiceReal(order) ? "" : "Preview (DRAFT) — invoice not issued yet"}
          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200">
          Invoice{!isInvoiceReal(order) && <span className="ml-1 text-[10px] font-bold uppercase text-amber-400">draft</span>}
        </button>
        <button onClick={() => setDocKind("beo")} disabled={order.lines.length === 0}
          title={order.lines.length === 0 ? "Add items first" : ""}
          className="min-h-[40px] rounded-lg border border-ink-700 bg-ink-800 px-3 text-sm font-semibold text-zinc-200 disabled:opacity-40">BEO / Pull Sheet</button>
      </div>

      {err && <p role="alert" className="rounded-lg bg-red-950/60 px-4 py-2 text-sm text-red-400">{err}</p>}

      {/* Event details — inline editable */}
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-ink-800 bg-ink-950/50 p-3 text-sm sm:grid-cols-3">
        <EventField label="Event date" value={ev.eventDate ?? ""} type="date" onSave={v => run(clc.updateEvent(order.id, { eventDate: v || null }, actor))} />
        <EventField label="Time" value={ev.eventTime ?? ""} onSave={v => run(clc.updateEvent(order.id, { eventTime: v || null }, actor))} />
        <EventField label="Guests" value={ev.guests != null ? String(ev.guests) : ""} type="number" onSave={v => run(clc.updateEvent(order.id, { guests: v ? Number(v) : null }, actor))} />
        <EventSelect label="Service" value={ev.serviceType ?? ""} options={SERVICE_TYPES} onSave={v => run(clc.updateEvent(order.id, { serviceType: v || null }, actor))} />
        <EventField label="Address" value={ev.address ?? ""} onSave={v => run(clc.updateEvent(order.id, { address: v || null }, actor))} />
        <EventField label="Phone" value={ev.phone} onSave={v => run(clc.updateEvent(order.id, { phone: v }, actor))} />
      </div>

      {/* Stage progress + next action */}
      <StageProgress stage={order.stage} />
      <NextAction
        order={order}
        onSendQuote={() => run(clc.sendQuote(order.id, actor).then(() => offerRevert("Quote sent", "quote_sent")))}
        onCopyLink={async () => {
          const url = `${window.location.origin}${window.location.pathname}#/catering-quote/${order.quotePublicToken}`;
          try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setErr("Could not copy — copy manually: " + url); }
        }}
        copied={copied}
        onMarkAccepted={() => run(setStage("accepted").then(() => offerRevert("Marked accepted", "accepted")))}
        onIssueInvoice={() => run(clc.issueInvoice(order.id, actor).then(() => offerRevert("Invoice issued", "invoiced")))}
        onRecordPayment={() => setPayOpen(true)}
        onSendKitchen={() => setKitchenOpen(true)}
        onAdvanceKitchen={(s) => run(clc.advanceKitchen(order.id, s, actor))}
        onMarkCompleted={() => run(clc.markCompleted(order.id, actor).then(() => offerRevert("Marked completed", "completed")))}
      />

      {/* Items / quote editor */}
      <QuoteEditor order={order} onSave={lines => run(clc.updateLines(order.id, lines, actor))}
        onSetDeposit={cents => run(clc.setDeposit(order.id, cents, actor))} />

      {/* Fulfillment */}
      <FulfillmentPanel order={order}
        onSave={(mode, feeCents) => run(clc.setFulfillment(order.id, mode, feeCents, actor))} />

      {/* Staffing (BEO) */}
      <StaffPanel order={order} onSave={rows => run(clc.setStaff(order.id, rows, actor))} />

      {/* Equipment & rentals */}
      <EquipmentPanel order={order} catalog={equipmentCatalog.map(e => e.name)}
        onSave={rows => run(clc.setEquipment(order.id, rows, actor))} />

      {/* Payments summary */}
      <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3 text-sm">
        <p className="font-bold uppercase tracking-wider text-zinc-400">Payments</p>
        <p className="mt-1 text-zinc-300">Paid <span className="font-bold text-green-400">{formatCents(order.paidCents)}</span> of {formatCents(order.totalCents)}</p>
        <p className="text-zinc-400">Balance due: <span className="font-bold text-fire-light">{formatCents(balanceDue)}</span></p>
      </div>

      {/* Kitchen panel */}
      {order.kitchen.handedOffAt && (
        <div className="rounded-xl border border-fire/40 bg-fire/5 p-3 text-sm">
          <p className="font-bold uppercase tracking-wider text-fire-light">Kitchen</p>
          <p className="mt-1 text-zinc-300">Ticket status: <span className="font-bold capitalize">{order.kitchen.ticketStatus.replace("_", " ")}</span></p>
          <p className="text-zinc-500">Handed off {shortTime(order.kitchen.handedOffAt)}</p>
          {order.kitchen.prepNotes && <p className="mt-1 text-zinc-300">Prep notes: {order.kitchen.prepNotes}</p>}
          <p className="mt-1 text-xs text-zinc-500">BEO + pull sheet generated with the items above.</p>
          <label className="mt-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <input type="checkbox" checked={order.kitchen.pullSheetConfirmed}
              onChange={e => run(clc.confirmPullSheet(order.id, e.target.checked, actor))}
              className="h-4 w-4 accent-fire" />
            Pull sheet confirmed by kitchen
          </label>
        </div>
      )}

      {/* Timeline + comms */}
      <Timeline order={order} onLog={(kind, body) => run(clc.logComm(order.id, kind, body, actor))} />

      {payOpen && (
        <PaymentDialog defaultCents={balanceDue} busy={false} error={null}
          onCancel={() => setPayOpen(false)}
          onSubmit={cents => { setPayOpen(false); run(clc.recordPayment(order.id, cents, actor)); }} />
      )}
      {kitchenOpen && (
        <KitchenDialog onCancel={() => setKitchenOpen(false)}
          onSubmit={notes => { setKitchenOpen(false); run(clc.handToKitchen(order.id, notes || null, actor)); }} />
      )}
      {docKind && <DocumentModal order={order} kind={docKind} onClose={() => setDocKind(null)} />}
    </div>
  );
}

function StageProgress({ stage }: { stage: CateringStage }) {
  const closed = CLOSED_STAGES.includes(stage);
  const currentIdx = STAGE_ORDER.indexOf(stage);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {STAGE_ORDER.map((s, i) => {
        const done = !closed && i < currentIdx;
        const active = !closed && i === currentIdx;
        return (
          <span key={s}
            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${active ? STAGE_META[s].cls + " ring-2 ring-fire" : done ? "bg-ink-700 text-zinc-400" : "bg-ink-950 text-zinc-600"}`}>
            {STAGE_META[s].label}
          </span>
        );
      })}
      {closed && <span className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${STAGE_META[stage].cls}`}>{STAGE_META[stage].label}</span>}
    </div>
  );
}

function NextAction(props: {
  order: CateringOrder;
  onSendQuote: () => void; onCopyLink: () => void; copied: boolean; onMarkAccepted: () => void;
  onIssueInvoice: () => void; onRecordPayment: () => void; onSendKitchen: () => void;
  onAdvanceKitchen: (s: CateringOrder["kitchen"]["ticketStatus"]) => void; onMarkCompleted: () => void;
}) {
  const { order } = props;
  const primary = "min-h-[44px] w-full rounded-xl bg-fire px-6 text-base font-bold text-white disabled:opacity-50";
  const secondary = "min-h-[44px] rounded-xl border border-ink-700 bg-ink-800 px-4 text-sm font-semibold text-zinc-300";

  switch (order.stage) {
    case "inquiry":
    case "quoting": {
      const noLines = order.lines.length === 0;
      return (
        <div>
          <button className={primary} disabled={noLines} onClick={props.onSendQuote}>Send quote</button>
          {noLines && <p className="mt-1 text-center text-xs text-amber-400">Add at least one line item below before sending.</p>}
        </div>
      );
    }
    case "quote_sent":
      return (
        <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
          <p className="text-center font-bold text-amber-300">Awaiting customer response</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button className={`${secondary} flex-1`} onClick={props.onCopyLink}>{props.copied ? "✓ Link copied" : "Copy accept link"}</button>
            <button className={`${secondary} flex-1`} onClick={props.onMarkAccepted}>Mark accepted</button>
          </div>
        </div>
      );
    case "accepted":
      return <button className={primary} onClick={props.onIssueInvoice}>Issue invoice</button>;
    case "invoiced":
      return <button className={primary} onClick={props.onRecordPayment}>Record payment</button>;
    case "paid":
      return <button className={primary} onClick={props.onSendKitchen}>Send to kitchen</button>;
    case "in_kitchen": {
      const next: CateringOrder["kitchen"]["ticketStatus"] | null =
        order.kitchen.ticketStatus === "queued" ? "in_production" :
        order.kitchen.ticketStatus === "in_production" ? "ready" : null;
      return (
        <div>
          <p className="mb-2 text-center text-sm text-zinc-400">Kitchen ticket: <span className="font-bold capitalize text-zinc-200">{order.kitchen.ticketStatus.replace("_", " ")}</span></p>
          {next && <button className={primary} onClick={() => props.onAdvanceKitchen(next)}>Advance to {next.replace("_", " ")}</button>}
        </div>
      );
    }
    case "ready":
      return <button className={primary} onClick={props.onMarkCompleted}>Mark completed</button>;
    case "completed":
      return <p className="rounded-xl border border-green-800/50 bg-green-950/30 p-3 text-center font-bold text-green-300">✓ Event completed 🎉</p>;
    default:
      return <p className="rounded-xl border border-ink-700 bg-ink-950/50 p-3 text-center font-bold text-zinc-400">This order is {STAGE_META[order.stage].label.toLowerCase()}.</p>;
  }
}

function QuoteEditor({ order, onSave, onSetDeposit }: {
  order: CateringOrder; onSave: (lines: Array<QuoteLine>) => void; onSetDeposit: (cents: number) => void;
}) {
  const [lines, setLines] = useState<QuoteLine[]>(order.lines);
  const [deposit, setDeposit] = useState(String((order.depositCents / 100).toFixed(2)));
  const dirty = JSON.stringify(lines) !== JSON.stringify(order.lines);

  const totals = useMemo(() => orderTotals(lines.map(l => ({ unitPriceCents: l.unitPriceCents, qty: l.qty }))), [lines]);

  const update = (id: string, patch: Partial<QuoteLine>) => setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const remove = (id: string) => setLines(ls => ls.filter(l => l.id !== id));
  const add = () => setLines(ls => [...ls, { id: `new-${Date.now()}`, name: "New item", qty: 1, unitPriceCents: 0 }]);

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-bold uppercase tracking-wider text-zinc-400">Items / quote</p>
        <button onClick={add} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">+ Add line</button>
      </div>
      <ul className="space-y-2">
        {lines.map(l => (
          <li key={l.id} className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 p-2">
            <input value={l.name} onChange={e => update(l.id, { name: e.target.value })}
              className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" aria-label="Item name" />
            <div className="flex items-center gap-1">
              <button onClick={() => update(l.id, { qty: Math.max(1, l.qty - 1) })} className="grid h-8 w-8 place-items-center rounded bg-ink-800 text-zinc-300" aria-label="Decrease qty">−</button>
              <span className="w-7 text-center text-sm font-bold text-zinc-100">{l.qty}</span>
              <button onClick={() => update(l.id, { qty: l.qty + 1 })} className="grid h-8 w-8 place-items-center rounded bg-ink-800 text-zinc-300" aria-label="Increase qty">+</button>
            </div>
            <PriceEditor cents={l.unitPriceCents} onChange={c => update(l.id, { unitPriceCents: c })} />
            <button onClick={() => remove(l.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded text-zinc-500 hover:text-red-400" aria-label="Remove line">✕</button>
          </li>
        ))}
      </ul>

      <div className="mt-3 space-y-1 border-t border-ink-800 pt-3 text-sm">
        <Row label="Subtotal" value={formatCents(totals.subtotalCents)} />
        <Row label="Tax (7.5%)" value={formatCents(totals.taxCents)} />
        <Row label="Total" value={formatCents(totals.totalCents)} bold />
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <label className="text-xs font-semibold text-zinc-500">Deposit ($)
          <div className="mt-1 flex gap-1">
            <input value={deposit} onChange={e => setDeposit(e.target.value)} inputMode="decimal"
              className="w-24 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" />
            <button onClick={() => { const c = dollarsToCents(deposit); if (c != null) onSetDeposit(c); }}
              className="rounded border border-ink-700 bg-ink-800 px-3 text-xs font-bold text-zinc-300">Set</button>
          </div>
        </label>
        <button disabled={!dirty} onClick={() => onSave(lines)}
          className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-40">Save items</button>
      </div>
    </div>
  );
}

function PriceEditor({ cents, onChange }: { cents: number; onChange: (c: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((cents / 100).toFixed(2));
  if (!editing) {
    return (
      <button onClick={() => { setVal((cents / 100).toFixed(2)); setEditing(true); }}
        className="w-20 shrink-0 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-right text-sm font-bold text-zinc-200" aria-label="Edit unit price">
        {formatCents(cents)}
      </button>
    );
  }
  const commit = () => { const c = dollarsToCents(val); if (c != null) onChange(c); setEditing(false); };
  return (
    <input autoFocus inputMode="decimal" value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
      onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-20 shrink-0 rounded border border-fire/50 bg-ink-800 px-2 py-1.5 text-right text-sm font-bold text-zinc-100" aria-label="Unit price dollars" />
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={bold ? "font-bold text-zinc-200" : "text-zinc-500"}>{label}</span>
      <span className={bold ? "font-black text-fire-light" : "text-zinc-300"}>{value}</span>
    </div>
  );
}

function EventField({ label, value, type = "text", onSave }: { label: string; value: string; type?: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  if (!editing) {
    return (
      <button onClick={() => { setVal(value); setEditing(true); }} className="text-left">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
        <span className="block font-semibold text-zinc-200">{value || <span className="text-zinc-600">Tap to set</span>}</span>
      </button>
    );
  }
  const commit = () => { onSave(val.trim()); setEditing(false); };
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}
      <input autoFocus type={type} value={val} onChange={e => setVal(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="mt-1 w-full rounded border border-fire/50 bg-ink-800 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100" />
    </label>
  );
}

function EventSelect({ label, value, options, onSave }: { label: string; value: string; options: string[]; onSave: (v: string) => void }) {
  return (
    <label className="block text-[11px] font-bold uppercase tracking-wider text-zinc-500">{label}
      <select value={value} onChange={e => onSave(e.target.value)}
        className="mt-1 w-full rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm font-normal normal-case text-zinc-100">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

const COMM_KINDS: Array<{ id: "note" | "email" | "call" | "text"; label: string }> = [
  { id: "note", label: "Note" }, { id: "email", label: "Email logged" },
  { id: "call", label: "Call logged" }, { id: "text", label: "Text logged" },
];

function Timeline({ order, onLog }: { order: CateringOrder; onLog: (kind: "note" | "email" | "call" | "text", body: string) => void }) {
  const [kind, setKind] = useState<"note" | "email" | "call" | "text">("note");
  const [body, setBody] = useState("");
  const submit = () => { if (body.trim()) { onLog(kind, body.trim()); setBody(""); } };
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
      <p className="mb-2 font-bold uppercase tracking-wider text-zinc-400">Timeline &amp; communication</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select value={kind} onChange={e => setKind(e.target.value as typeof kind)}
          className="rounded-lg border border-ink-700 bg-ink-800 px-2 py-2 text-sm text-zinc-100">
          {COMM_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
        </select>
        <input value={body} onChange={e => setBody(e.target.value)} placeholder="Log a note, call, email, or text…"
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          className="min-w-0 flex-1 rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-zinc-100" />
        <button onClick={submit} disabled={!body.trim()}
          className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-40">Log</button>
      </div>
      <ul className="mt-3 space-y-2">
        {order.timeline.map(e => (
          <li key={e.id} className="flex gap-3 rounded-lg border border-ink-800 bg-ink-900 p-2.5">
            <span aria-hidden className="text-lg leading-none">{KIND_ICON[e.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-200">{e.body}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{e.actor} · {shortTime(e.at)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CreateDialog({ onSubmit, onCancel, busy, error }: {
  onSubmit: (i: Parameters<ReturnType<typeof getDal>["cateringLifecycle"]["createFromLead"]>[1]) => void;
  onCancel: () => void; busy: boolean; error: string | null;
}) {
  const [customer, setCustomer] = useState("");
  const [company, setCompany] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [guests, setGuests] = useState("");
  const [serviceType, setServiceType] = useState(SERVICE_TYPES[0]);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  return (
    <div role="dialog" aria-modal="true" aria-label="New catering order"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit({
          customer, companyName: company.trim() || null, source: "manual",
          event: { eventDate: eventDate || null, eventTime: eventTime || null, guests: guests ? Number(guests) : null, serviceType, phone, email },
          lines: [],
        }); }}>
        <h3 className="text-lg font-bold text-zinc-100">New catering order</h3>
        {error && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{error}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Customer
          <input value={customer} onChange={e => setCustomer(e.target.value)} required
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <label className="mt-3 block text-sm font-semibold text-zinc-400">Company (optional)
          <input value={company} onChange={e => setCompany(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="block text-sm font-semibold text-zinc-400">Event date
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Time
            <input value={eventTime} onChange={e => setEventTime(e.target.value)} placeholder="5:00 PM"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Guests
            <input value={guests} onChange={e => setGuests(e.target.value)} inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Service type
            <select value={serviceType} onChange={e => setServiceType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100">
              {SERVICE_TYPES.map(s => <option key={s}>{s}</option>)}
            </select>
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Phone
            <input value={phone} onChange={e => setPhone(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
          <label className="block text-sm font-semibold text-zinc-400">Email
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" disabled={busy} className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? "Creating…" : "Create order"}
          </button>
        </div>
      </form>
    </div>
  );
}

function PaymentDialog({ defaultCents, onSubmit, onCancel }: {
  defaultCents: number; busy: boolean; error: string | null; onSubmit: (cents: number) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState((defaultCents / 100).toFixed(2));
  const [err, setErr] = useState<string | null>(null);
  return (
    <div role="dialog" aria-modal="true" aria-label="Record payment"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-sm rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); const c = dollarsToCents(val); if (c == null || c <= 0) { setErr("Enter a positive amount"); return; } onSubmit(c); }}>
        <h3 className="text-lg font-bold text-zinc-100">Record payment</h3>
        {err && <p className="mt-2 rounded-lg bg-red-950/60 px-3 py-2 text-sm text-red-400">{err}</p>}
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Amount ($)
          <input autoFocus value={val} onChange={e => setVal(e.target.value)} inputMode="decimal"
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-lg font-bold text-zinc-100" />
        </label>
        <p className="mt-1 text-xs text-zinc-500">Defaulted to the balance due.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">Record payment</button>
        </div>
      </form>
    </div>
  );
}

function KitchenDialog({ onSubmit, onCancel }: { onSubmit: (notes: string) => void; onCancel: () => void }) {
  const [notes, setNotes] = useState("");
  return (
    <div role="dialog" aria-modal="true" aria-label="Send to kitchen"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <form className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5"
        onSubmit={e => { e.preventDefault(); onSubmit(notes.trim()); }}>
        <h3 className="text-lg font-bold text-zinc-100">Send to kitchen</h3>
        <p className="mt-1 text-sm text-zinc-500">Creates a real kitchen ticket and generates the BEO + pull sheet from the items above.</p>
        <label className="mt-4 block text-sm font-semibold text-zinc-400">Prep notes (optional)
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
            className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-zinc-100" />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-ink-700 px-4 py-2 text-sm font-semibold text-zinc-300">Cancel</button>
          <button type="submit" className="rounded-lg bg-fire px-4 py-2 text-sm font-bold text-white">Send to kitchen</button>
        </div>
      </form>
    </div>
  );
}

// ── Fulfillment panel ───────────────────────────────────────────────────────
function FulfillmentPanel({ order, onSave }: {
  order: CateringOrder; onSave: (mode: "pickup" | "delivery", feeCents: number) => void;
}) {
  const [fee, setFee] = useState((order.deliveryFeeCents / 100).toFixed(2));
  const isDelivery = order.fulfillment === "delivery";
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3 text-sm">
      <p className="mb-2 font-bold uppercase tracking-wider text-zinc-400">Fulfillment</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-lg border border-ink-700 bg-ink-800 p-1">
          <button onClick={() => onSave("pickup", 0)}
            className={`min-h-[36px] rounded px-3 text-sm font-bold ${!isDelivery ? "bg-fire text-white" : "text-zinc-400"}`}>Pickup</button>
          <button onClick={() => { const c = dollarsToCents(fee) ?? 0; onSave("delivery", c); }}
            className={`min-h-[36px] rounded px-3 text-sm font-bold ${isDelivery ? "bg-fire text-white" : "text-zinc-400"}`}>Delivery</button>
        </div>
        {isDelivery && (
          <label className="flex items-center gap-1 text-xs font-semibold text-zinc-500">Delivery fee ($)
            <input value={fee} onChange={e => setFee(e.target.value)} inputMode="decimal"
              className="w-24 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" />
            <button onClick={() => { const c = dollarsToCents(fee); if (c != null) onSave("delivery", c); }}
              className="rounded border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">Set</button>
          </label>
        )}
      </div>
      {isDelivery && <p className="mt-2 text-xs text-zinc-500">Delivery fee adds {formatCents(order.deliveryFeeCents)} to totals and every document.</p>}
    </div>
  );
}

// ── Staffing (BEO) panel ────────────────────────────────────────────────────
interface StaffDraft { id: string; role: string; name: string; callTime: string }
function StaffPanel({ order, onSave }: {
  order: CateringOrder; onSave: (rows: Array<{ id?: string; role: string; name: string; callTime: string | null }>) => void;
}) {
  const toDraft = (): StaffDraft[] => order.staff.map(s => ({ id: s.id, role: s.role, name: s.name, callTime: s.callTime ?? "" }));
  const [rows, setRows] = useState<StaffDraft[]>(toDraft);
  const dirty = JSON.stringify(rows) !== JSON.stringify(toDraft());
  const fullService = order.event.serviceType === "Full Service";

  const update = (id: string, patch: Partial<StaffDraft>) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const add = () => setRows(rs => [...rs, { id: `new-${Date.now()}`, role: "", name: "", callTime: "" }]);
  const remove = (id: string) => setRows(rs => rs.filter(r => r.id !== id));

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-bold uppercase tracking-wider text-zinc-400">Staffing (BEO)</p>
        <button onClick={add} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">+ Add role</button>
      </div>
      {fullService && <p className="mb-2 text-xs text-amber-400">Full Service event — assign an event lead + servers.</p>}
      {rows.length === 0 && <p className="text-sm text-zinc-500">No staff assigned yet.</p>}
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 p-2">
            <input value={r.role} onChange={e => update(r.id, { role: e.target.value })} placeholder="Role (Event lead)"
              aria-label="Staff role" className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" />
            <input value={r.name} onChange={e => update(r.id, { name: e.target.value })} placeholder="Name"
              aria-label="Staff name" className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" />
            <input value={r.callTime} onChange={e => update(r.id, { callTime: e.target.value })} placeholder="3:30 PM"
              aria-label="Call time" className="w-24 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" />
            <button onClick={() => remove(r.id)} aria-label="Remove staff row"
              className="grid h-8 w-8 shrink-0 place-items-center rounded text-zinc-500 hover:text-red-400">✕</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button disabled={!dirty} onClick={() => onSave(rows)}
          className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-40">Save staffing</button>
      </div>
    </div>
  );
}

// ── Equipment & rentals panel ───────────────────────────────────────────────
interface EquipDraft { id: string; name: string; qty: number }
function EquipmentPanel({ order, catalog, onSave }: {
  order: CateringOrder; catalog: string[]; onSave: (rows: Array<{ id?: string; name: string; qty: number }>) => void;
}) {
  const toDraft = (): EquipDraft[] => order.equipment.map(e => ({ id: e.id, name: e.name, qty: e.qty }));
  const [rows, setRows] = useState<EquipDraft[]>(toDraft);
  const [showCatalog, setShowCatalog] = useState(false);
  const dirty = JSON.stringify(rows) !== JSON.stringify(toDraft());

  const update = (id: string, patch: Partial<EquipDraft>) => setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  const add = (name = "") => setRows(rs => [...rs, { id: `new-${Date.now()}-${rs.length}`, name, qty: 1 }]);
  const remove = (id: string) => setRows(rs => rs.filter(r => r.id !== id));
  const quickAdd = (name: string) => { if (!rows.some(r => r.name === name)) add(name); };

  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-bold uppercase tracking-wider text-zinc-400">Equipment &amp; rentals</p>
        <div className="flex gap-2">
          <button onClick={() => setShowCatalog(v => !v)} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">Suggest from catalog</button>
          <button onClick={() => add()} className="rounded-lg border border-ink-700 bg-ink-800 px-3 py-1.5 text-xs font-bold text-zinc-300">+ Add</button>
        </div>
      </div>
      {showCatalog && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {catalog.length === 0 && <span className="text-xs text-zinc-500">No catalog items.</span>}
          {catalog.map(name => (
            <button key={name} onClick={() => quickAdd(name)}
              className="rounded-full border border-ink-700 bg-ink-800 px-2.5 py-1 text-xs font-semibold text-zinc-300 hover:border-fire/50">+ {name}</button>
          ))}
        </div>
      )}
      {rows.length === 0 && <p className="text-sm text-zinc-500">No equipment listed.</p>}
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id} className="flex items-center gap-2 rounded-lg border border-ink-800 bg-ink-900 p-2">
            <input value={r.name} onChange={e => update(r.id, { name: e.target.value })} placeholder="Chafers (full size)"
              aria-label="Equipment name" className="min-w-0 flex-1 rounded border border-ink-700 bg-ink-800 px-2 py-1.5 text-sm text-zinc-100" />
            <div className="flex items-center gap-1">
              <button onClick={() => update(r.id, { qty: Math.max(1, r.qty - 1) })} className="grid h-8 w-8 place-items-center rounded bg-ink-800 text-zinc-300" aria-label="Decrease qty">−</button>
              <span className="w-7 text-center text-sm font-bold text-zinc-100">{r.qty}</span>
              <button onClick={() => update(r.id, { qty: r.qty + 1 })} className="grid h-8 w-8 place-items-center rounded bg-ink-800 text-zinc-300" aria-label="Increase qty">+</button>
            </div>
            <button onClick={() => remove(r.id)} aria-label="Remove equipment row"
              className="grid h-8 w-8 shrink-0 place-items-center rounded text-zinc-500 hover:text-red-400">✕</button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex justify-end">
        <button disabled={!dirty} onClick={() => onSave(rows)}
          className="min-h-[40px] rounded-lg bg-fire px-4 text-sm font-bold text-white disabled:opacity-40">Save equipment</button>
      </div>
    </div>
  );
}

// ── Print-ready document modal ──────────────────────────────────────────────
function DocumentModal({ order, kind, onClose }: { order: CateringOrder; kind: DocumentKind; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(documentPlainText(order, kind)); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { /* clipboard unavailable */ }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={`${kind} document`}
      className="fixed inset-0 z-[9000] overflow-y-auto bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-gray-300 bg-white px-4 py-3">
        <p className="text-sm font-bold uppercase tracking-wider text-gray-700">{kind === "beo" ? "BEO / Pull Sheet" : kind} · {order.ref}</p>
        <div className="flex gap-2">
          <button onClick={openPrint} className="min-h-[40px] rounded-lg bg-black px-4 text-sm font-bold text-white">🖨 Print</button>
          <button onClick={copy} className="min-h-[40px] rounded-lg border border-gray-400 px-4 text-sm font-bold text-gray-800">{copied ? "✓ Copied" : "📋 Copy for email"}</button>
          <button onClick={onClose} className="min-h-[40px] rounded-lg border border-gray-400 px-4 text-sm font-bold text-gray-800">Close</button>
        </div>
      </div>
      <CateringDocument order={order} kind={kind} />
    </div>
  );
}
