import { useQuery } from "@tanstack/react-query";
import { getDal } from "../../dal";
import type { LandingPage } from "../../dal/types";

/**
 * Marketing · Landing Hub — landing-page traffic + conversion tracking from
 * dal.marketing.landingPages(). Each page shows visits, conversions and a
 * computed conversion rate; pages whose slug maps to a live public route link
 * straight to it (/fire-drop, /cuban-thursday, /catering, /express,
 * /catering-request).
 */

const PUBLIC_ROUTES = ["/fire-drop", "/cuban-thursday", "/catering", "/express", "/catering-request"];

/** Resolve a landing page to a live public route, or null when none exists. */
function publicRoute(page: LandingPage): string | null {
  const slug = page.slug.startsWith("/") ? page.slug : `/${page.slug}`;
  if (PUBLIC_ROUTES.includes(slug)) return slug;
  if (page.kind === "fire_drop") return "/fire-drop";
  if (slug.includes("cuban")) return "/cuban-thursday";
  if (page.kind === "catering") return slug.includes("request") ? "/catering-request" : "/catering";
  return null;
}

export function LandingHub() {
  const dal = getDal();
  const { data: pages, isLoading } = useQuery({
    queryKey: ["marketing", "landingPages"],
    queryFn: () => dal.marketing.landingPages(),
  });

  if (isLoading) return <p className="py-20 text-center text-zinc-500">Loading landing pages&hellip;</p>;
  const list = pages ?? [];
  const live = list.filter(p => p.status === "live").length;
  const totalVisits = list.reduce((s, p) => s + p.visits, 0);
  const totalConversions = list.reduce((s, p) => s + p.conversions, 0);

  return (
    <div className="mx-auto max-w-5xl pt-6">
      <header>
        <h1 className="text-2xl font-black uppercase text-zinc-100">Landing Pages</h1>
        <p className="text-sm text-zinc-500">
          {live} live · {list.length - live} draft ·{" "}
          {totalVisits.toLocaleString("en-US")} visits ·{" "}
          {totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(1) : "0.0"}% overall conversion
        </p>
      </header>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.map(p => <PageCard key={p.id} page={p} />)}
      </div>
      {list.length === 0 && (
        <p className="mt-8 rounded-xl border border-dashed border-ink-700 py-12 text-center text-sm text-zinc-500">
          No landing pages yet.
        </p>
      )}
    </div>
  );
}

function PageCard({ page }: { page: LandingPage }) {
  const rate = page.visits > 0 ? (page.conversions / page.visits) * 100 : 0;
  const route = publicRoute(page);
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-zinc-100">{page.title}</p>
          <p className="truncate text-xs text-zinc-500">{page.slug} · {page.kind}</p>
        </div>
        <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase ${
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
      {route ? (
        <a href={route} target="_blank" rel="noopener noreferrer"
          className="mt-3 block min-h-[44px] rounded-lg border border-fire/40 bg-fire/10 px-3 py-2.5 text-center text-sm font-bold text-fire-light hover:bg-fire/20">
          Open {route} ↗
        </a>
      ) : (
        <p className="mt-3 text-center text-xs text-zinc-600">No public route yet</p>
      )}
    </div>
  );
}
