import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { AdCampaign, MarketingAnalytics, PerfRow } from "../../dal/types";
import { useRole } from "../../app/RoleContext";
import { formatCents } from "../../lib/money";

/**
 * Marketing · Performance — real performance analytics driven by
 * dal.marketing.analytics(). Sub-views: Overview (channel revenue + a
 * week trend from topDays), Channels (sortable channel table), Leads (source
 * conversion table with bars), Ads (campaign spend/CPL with status toggle),
 * and Social (sample platform metrics, clearly labelled pending a connector).
 */

type Tab = "overview" | "channels" | "leads" | "ads" | "social";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "channels", label: "Channels" },
  { id: "leads", label: "Leads" },
  { id: "ads", label: "Ads" },
  { id: "social", label: "Social" },
];

type ChannelSort = "revenue" | "orders" | "label";
type Sync = "idle" | "saving" | "saved" | "error";

export function PerformanceView() {
  const { actor } = useRole();
  const dal = getDal();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [channelSort, setChannelSort] = useState<ChannelSort>("revenue");
  const [sync, setSync] = useState<Sync>("idle");

  const analyticsQ = useQuery({ queryKey: ["marketing", "analytics"], queryFn: () => dal.marketing.analytics() });
  const perfQ = useQuery({ queryKey: ["marketing", "performance"], queryFn: () => dal.marketing.performance() });
  const adsQ = useQuery({ queryKey: ["marketing", "adCampaigns"], queryFn: () => dal.marketing.adCampaigns() });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AdCampaign["status"] }) => {
      setSync("saving");
      return dal.marketing.updateCampaignStatus(id, status, actor).then(
        r => { setSync("saved"); return r; }, e => { setSync("error"); throw e; });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketing", "adCampaigns"] }),
  });

  if (analyticsQ.isLoading || perfQ.isLoading || adsQ.isLoading || !analyticsQ.data) {
    return <p className="py-20 text-center text-zinc-500">Loading performance&hellip;</p>;
  }
  const a = analyticsQ.data;
  const campaigns = adsQ.data ?? [];
  const perfRows = perfQ.data ?? [];

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Performance</h1>
          <p className="text-sm text-zinc-500">
            {formatCents(a.totalRevenueCents)} tracked · {a.channelRevenue.reduce((s, c) => s + c.orders, 0)} orders
          </p>
        </div>
        {tab === "ads" && <SyncBadge sync={sync} />}
      </header>

      <div role="tablist" aria-label="Performance views" className="mt-4 flex flex-wrap gap-2">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`min-h-[44px] rounded-lg border px-4 py-2 text-sm font-semibold ${
              tab === t.id ? "border-fire bg-fire/20 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview a={a} />}
      {tab === "channels" && <Channels a={a} sort={channelSort} onSort={setChannelSort} />}
      {tab === "leads" && <Leads a={a} />}
      {tab === "ads" && <Ads campaigns={campaigns} onToggle={(id, status) => statusMut.mutate({ id, status })} />}
      {tab === "social" && <Social rows={perfRows} />}
    </div>
  );
}

function Overview({ a }: { a: MarketingAnalytics }) {
  const maxChannel = Math.max(1, ...a.channelRevenue.map(c => c.revenueCents));
  const trend = [...a.topDays].sort((x, y) => x.date.localeCompare(y.date));
  const maxDay = Math.max(1, ...trend.map(d => d.revenueCents));
  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Revenue by channel</h2>
        <ul className="mt-3 space-y-3">
          {a.channelRevenue.map(c => (
            <li key={c.channel}>
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-semibold text-zinc-200">{c.label}</span>
                <span className="font-semibold text-zinc-100">{formatCents(c.revenueCents)}</span>
              </div>
              <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full rounded-full bg-gradient-to-r from-fire to-fire-light"
                  style={{ width: `${(c.revenueCents / maxChannel) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-ink-700 bg-ink-900 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Revenue by day</h2>
        <div className="mt-4 flex items-end justify-between gap-1.5" style={{ height: 140 }}>
          {trend.map(d => (
            <div key={d.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex w-full items-end justify-center" style={{ height: 100 }}>
                <div className="w-full max-w-[2.5rem] rounded-t bg-gradient-to-t from-fire to-fire-light"
                  style={{ height: `${Math.max(4, (d.revenueCents / maxDay) * 100)}%` }}
                  title={`${d.date}: ${formatCents(d.revenueCents)}`} />
              </div>
              <span className="truncate text-[10px] text-zinc-500">{d.date.slice(5)}</span>
            </div>
          ))}
          {trend.length === 0 && <p className="w-full text-center text-sm text-zinc-500">No day data yet.</p>}
        </div>
      </section>
    </div>
  );
}

function Channels({ a, sort, onSort }: { a: MarketingAnalytics; sort: ChannelSort; onSort: (s: ChannelSort) => void }) {
  const rows = useMemo(() => {
    const list = [...a.channelRevenue];
    if (sort === "revenue") list.sort((x, y) => y.revenueCents - x.revenueCents);
    else if (sort === "orders") list.sort((x, y) => y.orders - x.orders);
    else list.sort((x, y) => x.label.localeCompare(y.label));
    return list;
  }, [a.channelRevenue, sort]);
  const th = (id: ChannelSort, label: string, right?: boolean) => (
    <th className={`pb-2 font-semibold ${right ? "text-right" : ""}`}>
      <button onClick={() => onSort(id)} className={`uppercase tracking-wide ${sort === id ? "text-fire-light" : "text-zinc-500"}`}>
        {label}{sort === id ? " ↓" : ""}
      </button>
    </th>
  );
  return (
    <section className="mt-4 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs">
            {th("label", "Channel")}
            {th("orders", "Orders", true)}
            {th("revenue", "Revenue", true)}
            <th className="pb-2 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">Avg order</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(c => (
            <tr key={c.channel} className="border-t border-ink-800">
              <td className="py-2.5 font-semibold text-zinc-200">{c.label}</td>
              <td className="py-2.5 text-right text-zinc-300">{c.orders}</td>
              <td className="py-2.5 text-right text-zinc-100">{formatCents(c.revenueCents)}</td>
              <td className="py-2.5 text-right text-zinc-400">{c.orders > 0 ? formatCents(Math.round(c.revenueCents / c.orders)) : "—"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No channel data yet.</td></tr>}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-ink-700 font-bold text-zinc-100">
              <td className="pt-2.5">Total</td>
              <td className="pt-2.5 text-right">{rows.reduce((s, c) => s + c.orders, 0)}</td>
              <td className="pt-2.5 text-right">{formatCents(a.totalRevenueCents)}</td>
              <td className="pt-2.5" />
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

function Leads({ a }: { a: MarketingAnalytics }) {
  const maxLeads = Math.max(1, ...a.leadSources.map(s => s.leads));
  return (
    <section className="mt-4 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4">
      <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Leads &amp; conversion by source</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 font-semibold">Source</th>
            <th className="pb-2 text-right font-semibold">Leads</th>
            <th className="pb-2 text-right font-semibold">Booked</th>
            <th className="pb-2 pl-4 font-semibold">Conversion</th>
          </tr>
        </thead>
        <tbody>
          {a.leadSources.map(s => (
            <tr key={s.source} className="border-t border-ink-800">
              <td className="py-2.5 font-semibold text-zinc-200">{s.source}</td>
              <td className="py-2.5 text-right text-zinc-300">{s.leads}</td>
              <td className="py-2.5 text-right text-zinc-300">{s.booked}</td>
              <td className="py-2.5 pl-4">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-full max-w-[9rem] overflow-hidden rounded-full bg-ink-800">
                    <div className="h-full bg-gradient-to-r from-fire to-fire-light" style={{ width: `${(s.leads / maxLeads) * 100}%` }} />
                  </div>
                  <span className="w-12 text-right text-xs text-fire-light">{s.conversionPct}%</span>
                </div>
              </td>
            </tr>
          ))}
          {a.leadSources.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-zinc-500">No lead data yet.</td></tr>}
        </tbody>
      </table>
    </section>
  );
}

function Ads({ campaigns, onToggle }: { campaigns: AdCampaign[]; onToggle: (id: string, status: AdCampaign["status"]) => void }) {
  const CLS: Record<AdCampaign["status"], string> = {
    active: "bg-green-600 text-white", paused: "bg-amber-600 text-white", ended: "bg-ink-700 text-zinc-400",
  };
  const totalSpend = campaigns.reduce((s, c) => s + c.spendCents, 0);
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0);
  return (
    <section className="mt-4 overflow-x-auto rounded-xl border border-ink-700 bg-ink-900 p-4">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
            <th className="pb-2 font-semibold">Platform</th>
            <th className="pb-2 font-semibold">Campaign</th>
            <th className="pb-2 font-semibold">Status</th>
            <th className="pb-2 text-right font-semibold">Spend</th>
            <th className="pb-2 text-right font-semibold">Leads</th>
            <th className="pb-2 text-right font-semibold">Cost/lead</th>
            <th className="pb-2 pl-3 font-semibold"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id} className="border-t border-ink-800">
              <td className="py-2.5 text-zinc-300">{c.platform}</td>
              <td className="py-2.5 font-semibold text-zinc-100">{c.name}</td>
              <td className="py-2.5">
                <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${CLS[c.status]}`}>{c.status}</span>
              </td>
              <td className="py-2.5 text-right text-zinc-200">{formatCents(c.spendCents)}</td>
              <td className="py-2.5 text-right text-zinc-200">{c.leads}</td>
              <td className="py-2.5 text-right text-zinc-200">{formatCents(c.costPerLeadCents)}</td>
              <td className="py-2.5 pl-3 text-right">
                {c.status === "ended" ? <span className="text-xs text-zinc-600">—</span> : (
                  <button onClick={() => onToggle(c.id, c.status === "active" ? "paused" : "active")}
                    className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2 text-xs font-bold text-zinc-200">
                    {c.status === "active" ? "Pause" : "Resume"}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {campaigns.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-zinc-500">No campaigns yet.</td></tr>}
        </tbody>
        {campaigns.length > 0 && (
          <tfoot>
            <tr className="border-t border-ink-700 font-bold text-zinc-100">
              <td className="pt-2.5" colSpan={3}>Total</td>
              <td className="pt-2.5 text-right">{formatCents(totalSpend)}</td>
              <td className="pt-2.5 text-right">{totalLeads}</td>
              <td className="pt-2.5 text-right">{totalLeads > 0 ? formatCents(Math.round(totalSpend / totalLeads)) : "—"}</td>
              <td className="pt-2.5" />
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

function Social({ rows }: { rows: PerfRow[] }) {
  const byPlatform = useMemo(() => {
    const g = new Map<string, PerfRow[]>();
    for (const r of rows) { const l = g.get(r.platform) ?? []; l.push(r); g.set(r.platform, l); }
    return g;
  }, [rows]);
  return (
    <div className="mt-4">
      <p role="note" className="rounded-xl border border-amber-700/50 bg-amber-950/40 px-4 py-2.5 text-sm text-amber-300">
        Sample data pending connector — social platform metrics (Meta, TikTok, Google) sync in the integrations phase.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...byPlatform.entries()].map(([platform, list]) => (
          <section key={platform} className="rounded-xl border border-ink-700 bg-ink-900 p-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-fire-light">{platform}</h2>
            <dl className="mt-3 space-y-2">
              {list.map(r => (
                <div key={r.id} className="flex items-baseline justify-between gap-2">
                  <dt className="text-sm text-zinc-400">{r.metric}</dt>
                  <dd className="font-bold text-zinc-100">{r.value.toLocaleString("en-US")}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {byPlatform.size === 0 && (
          <p className="col-span-full rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">No social rows yet.</p>
        )}
      </div>
    </div>
  );
}

function SyncBadge({ sync }: { sync: Sync }) {
  const meta: Record<Sync, { label: string; cls: string }> = {
    idle: { label: "Up to date", cls: "text-zinc-500 border-ink-700" },
    saving: { label: "Saving…", cls: "text-amber-400 border-amber-700/50" },
    saved: { label: "Saved ✓", cls: "text-green-400 border-green-700/50" },
    error: { label: "Save failed — retry", cls: "text-red-400 border-red-700/50" },
  };
  return <span role="status" className={`rounded-lg border bg-ink-900 px-3 py-2 text-xs font-semibold ${meta[sync].cls}`}>{meta[sync].label}</span>;
}
