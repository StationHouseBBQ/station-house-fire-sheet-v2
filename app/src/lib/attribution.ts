/**
 * Native attribution capture for public lead/order routes.
 * No GoHighLevel dependency. Captured once per session, preserved through
 * checkout and lead submission.
 */
export interface Attribution {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  gclid: string | null;
  fbclid: string | null;
  referrer: string | null;
  landing_page: string | null;
  captured_at: string;
}

const KEY = "shbbq.attribution.v1";

export function captureAttribution(loc: Location = window.location, ref: string = document.referrer): Attribution {
  const existing = sessionStorage.getItem(KEY);
  if (existing) return JSON.parse(existing) as Attribution;
  const q = new URLSearchParams(loc.search);
  const attr: Attribution = {
    utm_source: q.get("utm_source"), utm_medium: q.get("utm_medium"),
    utm_campaign: q.get("utm_campaign"), utm_term: q.get("utm_term"),
    utm_content: q.get("utm_content"),
    gclid: q.get("gclid"), fbclid: q.get("fbclid"),
    referrer: ref || null,
    landing_page: loc.pathname + loc.search,
    captured_at: new Date().toISOString(),
  };
  sessionStorage.setItem(KEY, JSON.stringify(attr));
  return attr;
}

export function getAttribution(): Attribution | null {
  const raw = sessionStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Attribution) : null;
}
