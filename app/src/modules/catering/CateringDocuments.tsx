import { formatCents } from "../../lib/money";
import { ADDRESS_LINE, PHONE, INSTAGRAM } from "../../config/brand";
import type { CateringOrder } from "../../dal/types";

/**
 * Catering documents — clean, black-on-white, print-optimized customer- and
 * kitchen-facing paperwork rendered from a single CateringOrder:
 *   • QUOTE     — priced estimate with an online accept link.
 *   • INVOICE   — amount paid / balance due + remit-to.
 *   • BEO       — Banquet Event Order / pull sheet the kitchen + event lead run.
 * All three share the brand header and the same money math (7.5% tax, integer
 * cents, delivery fee as a flat post-tax line). Wrapped in `.print-area` so the
 * shared print stylesheet in index.css shows them cleanly and hides the app.
 */

export type DocumentKind = "quote" | "invoice" | "beo";

const TAX_LABEL = "Sales tax (7.5%)";

function fmtDate(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
function fmtDateShort(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}
function today(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

/** True once the order has reached (or passed) the invoiced stage. */
export function isInvoiceReal(order: CateringOrder): boolean {
  return ["invoiced", "paid", "in_kitchen", "ready", "completed"].includes(order.stage);
}

function acceptUrl(order: CateringOrder): string {
  const origin = typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : "";
  return `${origin}#/catering-quote/${order.quotePublicToken}`;
}

/** Open the browser print dialog with the current document as the print area. */
export function openPrint(): void {
  if (typeof window !== "undefined") window.print();
}

// ── Shared bits ────────────────────────────────────────────────────────────
function BrandHeader({ docTitle, draft }: { docTitle: string; draft?: boolean }) {
  return (
    <div className="mb-6 border-b-2 border-black pb-4">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-2xl font-black uppercase tracking-tight text-black">Station House BBQ</p>
          <p className="text-sm text-black">{ADDRESS_LINE}</p>
          <p className="text-sm text-black">{PHONE} · {INSTAGRAM}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-black uppercase tracking-widest text-black">{docTitle}</p>
          {draft && <p className="mt-1 inline-block border border-black px-2 py-0.5 text-xs font-black uppercase tracking-widest text-black">Draft — preview only</p>}
        </div>
      </div>
    </div>
  );
}

function LineItemsTable({ order }: { order: CateringOrder }) {
  return (
    <table className="w-full border-collapse text-sm text-black">
      <thead>
        <tr className="border-b border-black text-left">
          <th className="py-1 pr-2 font-bold uppercase tracking-wide">Item</th>
          <th className="py-1 px-2 text-right font-bold uppercase tracking-wide">Qty</th>
          <th className="py-1 px-2 text-right font-bold uppercase tracking-wide">Unit price</th>
          <th className="py-1 pl-2 text-right font-bold uppercase tracking-wide">Line total</th>
        </tr>
      </thead>
      <tbody>
        {order.lines.map(l => (
          <tr key={l.id} className="border-b border-gray-300">
            <td className="py-1.5 pr-2">{l.name}</td>
            <td className="py-1.5 px-2 text-right">{l.qty}</td>
            <td className="py-1.5 px-2 text-right">{formatCents(l.unitPriceCents)}</td>
            <td className="py-1.5 pl-2 text-right">{formatCents(l.unitPriceCents * l.qty)}</td>
          </tr>
        ))}
        {order.lines.length === 0 && (
          <tr className="border-b border-gray-300"><td colSpan={4} className="py-3 text-center italic text-gray-500">No line items yet.</td></tr>
        )}
      </tbody>
    </table>
  );
}

function TotalsBlock({ order, paid }: { order: CateringOrder; paid?: boolean }) {
  const fee = order.fulfillment === "delivery" ? order.deliveryFeeCents : 0;
  const balance = Math.max(0, order.totalCents - order.paidCents);
  return (
    <div className="mt-4 flex justify-end">
      <table className="text-sm text-black">
        <tbody>
          <tr><td className="py-0.5 pr-8 text-right">Subtotal</td><td className="py-0.5 text-right font-semibold">{formatCents(order.subtotalCents)}</td></tr>
          <tr><td className="py-0.5 pr-8 text-right">{TAX_LABEL}</td><td className="py-0.5 text-right font-semibold">{formatCents(order.taxCents)}</td></tr>
          {fee > 0 && <tr><td className="py-0.5 pr-8 text-right">Delivery &amp; setup</td><td className="py-0.5 text-right font-semibold">{formatCents(fee)}</td></tr>}
          <tr className="border-t-2 border-black"><td className="py-1 pr-8 text-right font-black uppercase">Total</td><td className="py-1 text-right font-black">{formatCents(order.totalCents)}</td></tr>
          {order.depositCents > 0 && <tr><td className="py-0.5 pr-8 text-right">Deposit requested</td><td className="py-0.5 text-right font-semibold">{formatCents(order.depositCents)}</td></tr>}
          {paid && <tr><td className="py-0.5 pr-8 text-right">Amount paid</td><td className="py-0.5 text-right font-semibold">{formatCents(order.paidCents)}</td></tr>}
          {paid && <tr className="border-t border-black"><td className="py-1 pr-8 text-right font-black uppercase">Balance due</td><td className="py-1 text-right font-black">{formatCents(balance)}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function EventDetails({ order, includeFulfillment }: { order: CateringOrder; includeFulfillment?: boolean }) {
  const ev = order.event;
  const rows: Array<[string, string]> = [
    ["Event date", fmtDate(ev.eventDate)],
    ["Time", ev.eventTime || "TBD"],
    ["Guests", ev.guests != null ? String(ev.guests) : "TBD"],
    ["Service", ev.serviceType || "TBD"],
  ];
  if (includeFulfillment) rows.push(["Fulfillment", order.fulfillment === "delivery" ? "Delivery & setup" : "Customer pickup"]);
  rows.push(["Address", ev.address || "TBD"]);
  rows.push(["Contact", `${ev.contactName || order.customer}${ev.phone ? ` · ${ev.phone}` : ""}${ev.email ? ` · ${ev.email}` : ""}`]);
  return (
    <dl className="grid grid-cols-1 gap-x-8 gap-y-1 text-sm text-black sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-28 shrink-0 font-bold uppercase tracking-wide text-gray-600">{k}</dt>
          <dd className="font-semibold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

// ── The document ───────────────────────────────────────────────────────────
export function CateringDocument({ order, kind }: { order: CateringOrder; kind: DocumentKind }) {
  if (kind === "quote") return <QuoteDoc order={order} />;
  if (kind === "invoice") return <InvoiceDoc order={order} />;
  return <BeoDoc order={order} />;
}

function DocShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-area mx-auto max-w-[8.5in] bg-white p-8 text-black">{children}</div>
  );
}

function QuoteDoc({ order }: { order: CateringOrder }) {
  return (
    <DocShell>
      <BrandHeader docTitle="Catering Quote" />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 text-sm text-black">
        <div>
          <p className="text-lg font-bold">{order.customer}</p>
          {order.companyName && <p>{order.companyName}</p>}
        </div>
        <div className="text-right">
          <p><span className="font-bold">Quote ref:</span> {order.ref}</p>
          <p><span className="font-bold">Date:</span> {today()}</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-black">Event details</h2>
      <EventDetails order={order} includeFulfillment />

      <h2 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-black">Estimate</h2>
      <LineItemsTable order={order} />
      <TotalsBlock order={order} />

      <div className="mt-8 border-t border-gray-300 pt-4 text-sm text-black">
        <p className="font-bold">Valid 14 days · Accept online</p>
        <p className="mt-1 break-all text-gray-700">{acceptUrl(order)}</p>
        {order.depositCents > 0 && (
          <p className="mt-2">A deposit of <span className="font-bold">{formatCents(order.depositCents)}</span> reserves your date. The balance is due on or before the event.</p>
        )}
        <p className="mt-3 text-gray-600">Thank you for considering Station House BBQ. Prices include all preparation; 7.5% Florida sales tax applies.</p>
      </div>
    </DocShell>
  );
}

function InvoiceDoc({ order }: { order: CateringOrder }) {
  const draft = !isInvoiceReal(order);
  const status = order.stage === "paid" ? "PAID IN FULL" : order.paidCents > 0 ? "PARTIALLY PAID" : "UNPAID";
  return (
    <DocShell>
      <BrandHeader docTitle="Invoice" draft={draft} />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 text-sm text-black">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600">Bill to</p>
          <p className="text-lg font-bold">{order.customer}</p>
          {order.companyName && <p>{order.companyName}</p>}
          {order.event.email && <p>{order.event.email}</p>}
        </div>
        <div className="text-right">
          <p><span className="font-bold">Invoice ref:</span> {order.ref}</p>
          <p><span className="font-bold">Date:</span> {today()}</p>
          <p className="mt-1 inline-block border border-black px-2 py-0.5 text-xs font-black uppercase tracking-widest">{status}</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-black">Event details</h2>
      <EventDetails order={order} includeFulfillment />

      <h2 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-black">Charges</h2>
      <LineItemsTable order={order} />
      <TotalsBlock order={order} paid />

      <div className="mt-8 border-t border-gray-300 pt-4 text-sm text-black">
        <p className="font-bold">Remit to</p>
        <p>Station House BBQ · {ADDRESS_LINE}</p>
        <p>{PHONE} · pay by card, check, or cash. Reference {order.ref} on all payments.</p>
        <p className="mt-3 text-gray-600">Thank you for your business. 7.5% Florida sales tax included above.</p>
      </div>
    </DocShell>
  );
}

function BeoDoc({ order }: { order: CateringOrder }) {
  const ev = order.event;
  return (
    <DocShell>
      <BrandHeader docTitle="Banquet Event Order" />
      <div className="mb-4 flex flex-wrap items-start justify-between gap-4 text-sm text-black">
        <div>
          <p className="text-lg font-bold">{order.customer}</p>
          {order.companyName && <p>{order.companyName}</p>}
        </div>
        <div className="text-right">
          <p><span className="font-bold">BEO ref:</span> {order.ref}</p>
          <p><span className="font-bold">Printed:</span> {today()}</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-black uppercase tracking-widest text-black">Event logistics</h2>
      <div className="rounded border border-black p-3">
        <EventDetails order={order} includeFulfillment />
      </div>

      <h2 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-black">Food pull list</h2>
      <table className="w-full border-collapse text-sm text-black">
        <thead>
          <tr className="border-b border-black text-left">
            <th className="py-1 pr-2 font-bold uppercase tracking-wide">Item</th>
            <th className="py-1 pl-2 text-right font-bold uppercase tracking-wide">Production qty</th>
            <th className="py-1 pl-6 text-left font-bold uppercase tracking-wide">Pulled ✓</th>
          </tr>
        </thead>
        <tbody>
          {order.lines.map(l => (
            <tr key={l.id} className="border-b border-gray-300">
              <td className="py-2 pr-2">{l.name}</td>
              <td className="py-2 pl-2 text-right font-bold">{l.qty}</td>
              <td className="py-2 pl-6"><span className="inline-block h-4 w-4 border border-black align-middle" /></td>
            </tr>
          ))}
          {order.lines.length === 0 && <tr><td colSpan={3} className="py-3 text-center italic text-gray-500">No items on this order yet.</td></tr>}
        </tbody>
      </table>

      <h2 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-black">Staffing</h2>
      {order.staff.length ? (
        <table className="w-full border-collapse text-sm text-black">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 pr-2 font-bold uppercase tracking-wide">Role</th>
              <th className="py-1 px-2 font-bold uppercase tracking-wide">Name</th>
              <th className="py-1 pl-2 font-bold uppercase tracking-wide">Call time</th>
            </tr>
          </thead>
          <tbody>
            {order.staff.map(s => (
              <tr key={s.id} className="border-b border-gray-300">
                <td className="py-1.5 pr-2">{s.role || "—"}</td>
                <td className="py-1.5 px-2">{s.name || "—"}</td>
                <td className="py-1.5 pl-2">{s.callTime || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="text-sm italic text-gray-500">No staffing assigned{ev.serviceType === "Full Service" ? " — required for Full Service." : "."}</p>}

      <h2 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-black">Equipment &amp; rentals</h2>
      {order.equipment.length ? (
        <ul className="text-sm text-black">
          {order.equipment.map(e => (
            <li key={e.id} className="flex items-center gap-2 border-b border-gray-300 py-1.5">
              <span className="inline-block h-4 w-4 border border-black" />
              <span className="font-bold">{e.qty}×</span> {e.name}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm italic text-gray-500">No equipment listed.</p>}

      <h2 className="mb-2 mt-6 text-sm font-black uppercase tracking-widest text-black">Prep notes</h2>
      <p className="min-h-[3rem] whitespace-pre-wrap rounded border border-gray-300 p-2 text-sm text-black">{order.kitchen.prepNotes || order.notes || "—"}</p>

      <div className="mt-8 grid grid-cols-2 gap-8 border-t border-black pt-4 text-sm text-black">
        <div>
          <p className="mb-6 text-gray-600">Kitchen sign-off</p>
          <div className="border-t border-black pt-1">Name / date</div>
        </div>
        <div>
          <p className="mb-6 text-gray-600">Event lead sign-off</p>
          <div className="border-t border-black pt-1">Name / date</div>
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500">Pull sheet {order.kitchen.pullSheetConfirmed ? "CONFIRMED" : "NOT yet confirmed"} · Fulfillment: {order.fulfillment === "delivery" ? "Delivery & setup" : "Customer pickup"}</p>
    </DocShell>
  );
}

// ── Plain-text builder (Copy for email) ─────────────────────────────────────
export function documentPlainText(order: CateringOrder, kind: DocumentKind): string {
  const L: string[] = [];
  const push = (s = "") => L.push(s);
  const money = (c: number) => formatCents(c);
  push("STATION HOUSE BBQ");
  push(ADDRESS_LINE);
  push(`${PHONE} · ${INSTAGRAM}`);
  push("");
  const ev = order.event;
  if (kind === "quote") {
    push(`CATERING QUOTE — ${order.ref}`);
    push(`Date: ${today()}`);
    push(`Customer: ${order.customer}${order.companyName ? ` (${order.companyName})` : ""}`);
    push("");
    push(`Event: ${fmtDateShort(ev.eventDate)} ${ev.eventTime || ""} · ${ev.guests ?? "?"} guests · ${ev.serviceType || "TBD"}`);
    push(`Fulfillment: ${order.fulfillment === "delivery" ? "Delivery & setup" : "Customer pickup"}`);
    if (ev.address) push(`Address: ${ev.address}`);
    push("");
    push("ITEMS");
    for (const l of order.lines) push(`  ${l.qty} × ${l.name} @ ${money(l.unitPriceCents)} = ${money(l.unitPriceCents * l.qty)}`);
    push("");
    push(`  Subtotal: ${money(order.subtotalCents)}`);
    push(`  ${TAX_LABEL}: ${money(order.taxCents)}`);
    if (order.fulfillment === "delivery" && order.deliveryFeeCents > 0) push(`  Delivery & setup: ${money(order.deliveryFeeCents)}`);
    push(`  TOTAL: ${money(order.totalCents)}`);
    if (order.depositCents > 0) push(`  Deposit to reserve: ${money(order.depositCents)}`);
    push("");
    push("Valid 14 days. Accept online:");
    push(acceptUrl(order));
  } else if (kind === "invoice") {
    const balance = Math.max(0, order.totalCents - order.paidCents);
    push(`INVOICE — ${order.ref}${isInvoiceReal(order) ? "" : "  (DRAFT — preview only)"}`);
    push(`Date: ${today()}`);
    push(`Bill to: ${order.customer}${order.companyName ? ` (${order.companyName})` : ""}`);
    push("");
    push(`Event: ${fmtDateShort(ev.eventDate)} · ${ev.guests ?? "?"} guests · ${ev.serviceType || "TBD"}`);
    push("");
    push("CHARGES");
    for (const l of order.lines) push(`  ${l.qty} × ${l.name} @ ${money(l.unitPriceCents)} = ${money(l.unitPriceCents * l.qty)}`);
    push("");
    push(`  Subtotal: ${money(order.subtotalCents)}`);
    push(`  ${TAX_LABEL}: ${money(order.taxCents)}`);
    if (order.fulfillment === "delivery" && order.deliveryFeeCents > 0) push(`  Delivery & setup: ${money(order.deliveryFeeCents)}`);
    push(`  TOTAL: ${money(order.totalCents)}`);
    push(`  Amount paid: ${money(order.paidCents)}`);
    push(`  BALANCE DUE: ${money(balance)}`);
    push("");
    push(`Remit to: Station House BBQ · ${ADDRESS_LINE} · ${PHONE}`);
    push(`Reference ${order.ref} on all payments.`);
  } else {
    push(`BANQUET EVENT ORDER — ${order.ref}`);
    push(`Printed: ${today()}`);
    push(`Customer: ${order.customer}${order.companyName ? ` (${order.companyName})` : ""}`);
    push("");
    push("EVENT LOGISTICS");
    push(`  Date: ${fmtDateShort(ev.eventDate)}  Time: ${ev.eventTime || "TBD"}`);
    push(`  Guests: ${ev.guests ?? "?"}  Service: ${ev.serviceType || "TBD"}`);
    push(`  Fulfillment: ${order.fulfillment === "delivery" ? "Delivery & setup" : "Customer pickup"}`);
    if (ev.address) push(`  Address: ${ev.address}`);
    push(`  Contact: ${ev.contactName || order.customer} · ${ev.phone} · ${ev.email}`);
    push("");
    push("FOOD PULL LIST");
    for (const l of order.lines) push(`  [ ] ${l.qty} × ${l.name}`);
    push("");
    push("STAFFING");
    if (order.staff.length) for (const s of order.staff) push(`  ${s.role || "—"} — ${s.name || "—"} — call ${s.callTime || "—"}`);
    else push("  (none assigned)");
    push("");
    push("EQUIPMENT & RENTALS");
    if (order.equipment.length) for (const e of order.equipment) push(`  [ ] ${e.qty}× ${e.name}`);
    else push("  (none)");
    push("");
    push(`PREP NOTES: ${order.kitchen.prepNotes || order.notes || "—"}`);
    push("");
    push(`Pull sheet: ${order.kitchen.pullSheetConfirmed ? "CONFIRMED" : "not yet confirmed"}`);
    push("Kitchen sign-off: ____________________   Event lead sign-off: ____________________");
  }
  return L.join("\n");
}
