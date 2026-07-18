import type { ReactNode } from "react";
import { Link } from "wouter";
import { NavControls } from "../../app/NavControls";
import { ADDRESS_LINE, INSTAGRAM, NONPROFIT, PHONE } from "../../config/brand";

/**
 * Public-facing chrome shared by every customer page (Fire Drop, Cuban
 * Thursday, Catering, Tracker, Events). No roles, no login — this is the
 * storefront. Visual language follows the live prototype: near-black ink,
 * fire-orange gradient accents, big uppercase display type.
 */

const NAV = [
  { href: "/fire-drop", label: "Fire Drop" },
  { href: "/cuban-thursday", label: "Cuban Thursday" },
  { href: "/catering", label: "Catering" },
  { href: "/track", label: "Track Order" },
];

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 text-zinc-200">
      <header className="sticky top-0 z-40 border-b border-ink-700 bg-ink-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
          <Link href="/" className="flex min-h-[44px] items-center gap-3">
            <span aria-hidden className="grid h-9 w-9 rotate-45 place-items-center rounded-md bg-gradient-to-br from-fire to-fire-light shadow-lg shadow-fire/30">
              <span className="-rotate-45 text-sm font-black tracking-tight text-white">SH</span>
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-black uppercase tracking-widest text-zinc-100">Station House BBQ</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-fire-light">Seminole Heights</span>
            </span>
          </Link>
          <div className="ml-auto"><NavControls compact /></div>
          <nav aria-label="Public pages" className="flex flex-wrap items-center gap-1">
            {NAV.map(n => (
              <Link key={n.href} href={n.href}
                className="flex min-h-[44px] items-center rounded-lg px-3 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:bg-ink-800 hover:text-fire-light">
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16">{children}</main>

      <footer className="border-t border-ink-700 bg-ink-900">
        <div className="mx-auto max-w-5xl space-y-2 px-4 py-8 text-sm text-zinc-500">
          <p className="font-bold uppercase tracking-widest text-zinc-300">Station House BBQ</p>
          <p>{ADDRESS_LINE}</p>
          <p>{PHONE} · Instagram {INSTAGRAM}</p>
          <p>Thursday: Cubans &amp; Smash Burgers · Fri–Sat: BBQ preorders</p>
          <p>{NONPROFIT}</p>
          <p className="pt-2 text-xs text-zinc-600">Demo preview — no live payments.</p>
        </div>
      </footer>
    </div>
  );
}

/** Small amber banner shown next to any simulated checkout. */
export function DemoPaymentNotice() {
  return (
    <p className="rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-400">
      Demo checkout — payment is simulated; Square sandbox connects in the payments phase.
    </p>
  );
}
