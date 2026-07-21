import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { LandingPage } from "../../dal/types";

/**
 * Marketing · Landing Page Hub — the campaign funnel catalog.
 *
 * Lists every live public funnel with traffic + conversion metrics from
 * dal.marketing.landingPages(), links straight to the real public route, and
 * gives a one-tap "copy shareable link" for the full public URL so the team
 * can drop it into a bio, DM or ad (the signature Manus MarketingHub move).
 * A summary strip rolls up live/draft counts, total visits and overall
 * conversion. All eight public funnels are mapped to their live routes.
 */

interface FunnelMeta { route: string; emoji: string; blurb: string; }

/**
 * Map a landing page (by slug or kind) to its live public route + presentation.
 * Every public funnel that ships in the app is covered.
 */
const SLUG_ROUTES: Record<string, FunnelMeta> = {
  "/fire-drop": { route: "/fire-drop", emoji: "🔥", blurb: "Weekly retail BBQ drop — pickup Fri/Sat" },
  "/cuban-thursday": { route: "/cuban-thursday", emoji: "🥪", blurb: "Award-winning Cuban sandwich pre-orders" },
  "/catering-landing": { route: "/catering", emoji: "🎉", blurb: "Event catering packages — 10 to 50+ guests" },
  "/catering-request": { route: "/catering-request", emoji: "📋", blurb: "Full-service catering inquiry form" },
  "/july4": { route: "/july4", emoji: "🇺🇸", blurb: "Independence Day cookout packs" },
  "/fathers-day": { route: "/fathers-day", emoji: "👨", blurb: "Father's Day special pre-order" },
  "/c/football-sunday": { route: "/football-sunday", emoji: "🏈", blurb: "Sunday smoked-meat drop until sellout" },
  "/express": { route: "/express", emoji: "🚚", blurb: "Express catering — fast turnaround" },
};

const KIND_FALLBACK: Record<string, FunnelMeta> = {
  fire_drop: { route: "/fire-drop", emoji: "🔥", blurb: "Weekly retail BBQ drop" },
  event: { route: "/cuban-thursday", emoji: "📅", blurb: "Seasonal event funnel" },
  catering: { route: "/catering", emoji: "🎉", blurb: "Catering funnel" },
  collection: { route: "/football-sunday", emoji: "🏈", blurb: "Collection drop" },
};

function funnelMeta(page: LandingPage): FunnelMeta | null {
  const slug = page.slug.startsWith("/") ? page.slug : `/${page.slug}`;
  if (SLUG_ROUTES[slug]) return SLUG_ROUTES[slug];
  if (slug.includes("cuban")) return SLUG_ROUTES["/cuban-thursday"];
  if (slug.includes("football")) return SLUG_ROUTES["/c/football-sunday"];
  if (slug.includes("catering") && slug.includes("request")) return SLUG_ROUTES["/catering-request"];
  return KIND_FALLBACK[page.kind] ?? null;
}

function siteOrigin(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "https://stationhousebbq.com";
}

export function LandingHub() {
  const dal = getDal();
  const { data: pages, isLoading } = useQuery({
    queryKey: ["marketing", "landingPages"],
    queryFn: () => dal.marketing.landingPages(),
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "live" | "draft">("all");

  const list = pages ?? [];
  const live = list.filter(p => p.status === "live").length;
  const totalVisits = list.reduce((s, p) => s + p.visits, 0);
  const totalConversions = list.reduce((s, p) => s + p.conversions, 0);

  const visible = useMemo(
    () => (statusFilter === "all" ? list : list.filter(p => p.status === statusFilter)),
    [list, statusFilter],
  );

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading landing pages&hellip;</p>;

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black uppercase text-zinc-100">Landing Page Hub</h1>
          <p className="text-sm text-zinc-500">
            {live} live · {list.length - live} draft ·{" "}
            {totalVisits.toLocaleString("en-US")} visits ·{" "}
            {totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(1) : "0.0"}% overall conversion
          </p>
        </div>
        <div className="flex gap-1.5">
          {(["all", "live", "draft"] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`min-h-[40px] rounded-lg border px-3 py-1.5 text-sm font-semibold capitalize ${
                statusFilter === s ? "border-fire bg-fire/20 text-fire-light" : "border-ink-700 bg-ink-800 text-zinc-300"}`}>
              {s}
            </button>
          ))}
        </div>
      </header>

      <p role="note" className="mt-3 rounded-xl border border-ink-700 bg-ink-900 px-4 py-3 text-sm text-zinc-400">
        Each card links to the real public funnel and copies its shareable link — drop it in a bio, DM, ad or
        QR code. Visits + conversions are tracked per page.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map(p => <PageCard key={p.id} page={p} />)}
      </div>
      {visible.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">
          No {statusFilter === "all" ? "" : `${statusFilter} `}landing pages.
        </p>
      )}
    </div>
  );
}

function PageCard({ page }: { page: LandingPage }) {
  const [copied, setCopied] = useState(false);
  const rate = page.visits > 0 ? (page.conversions / page.visits) * 100 : 0;
  const meta = funnelMeta(page);
  const shareUrl = meta ? `${siteOrigin()}${meta.route}` : null;

  const copyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <span className="text-xl" aria-hidden>{meta?.emoji ?? "📄"}</span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-zinc-100">{page.title}</p>
            <p className="truncate text-xs text-zinc-500">{meta?.blurb ?? `${page.slug} · ${page.kind}`}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${
          page.status === "live" ? "bg-green-600 text-white" : "bg-ink-700 text-zinc-300"}`}>
          {page.status}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ink-800 px-2 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Visits</dt>
          <dd className="text-lg font-bold text-zinc-100">{page.visits.toLocaleString("en-US")}</dd>
        </div>
        <div className="rounded-lg bg-ink-800 px-2 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Conv.</dt>
          <dd className="text-lg font-bold text-zinc-100">{page.conversions.toLocaleString("en-US")}</dd>
        </div>
        <div className="rounded-lg bg-ink-800 px-2 py-2.5">
          <dt className="text-[11px] uppercase tracking-wide text-zinc-500">Rate</dt>
          <dd className="text-lg font-bold text-fire-light">{rate.toFixed(1)}%</dd>
        </div>
      </dl>

      <div className="mt-3 flex-1" />

      {meta ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={meta.route} target="_blank" rel="noopener noreferrer"
            className="min-h-[44px] rounded-lg border border-fire/40 bg-fire/10 px-3 py-2.5 text-center text-sm font-bold text-fire-light hover:bg-fire/20">
            Open ↗
          </a>
          <button onClick={copyLink}
            aria-label={`Copy shareable link for ${page.title}`}
            className="min-h-[44px] rounded-lg border border-ink-700 bg-ink-800 px-3 py-2.5 text-sm font-bold text-zinc-200 hover:border-fire/50">
            {copied ? "Copied ✓" : "Copy link"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-zinc-600">No public route yet</p>
      )}
      {shareUrl && <p className="mt-2 truncate text-[11px] text-zinc-600" title={shareUrl}>{shareUrl}</p>}
    </div>
  );
}
