/**
 * Express Catering menu defaults — mirrors the LIVE express funnel captured
 * 2026-07-18. Stored under the "expressCatering" settings key so the admin
 * Express Menu panel can edit packages and à la carte pricing; the demo
 * checkout reads prices from settings ONLY (never from the client).
 */

export type ExpressCategory = "proteins" | "sides" | "extras";

export interface ExpressPackage {
  id: string;
  name: string;
  feeds: number;
  priceCents: number;
  contents: string;
  note: string;
}

export interface ExpressAlaCarteItem {
  id: string;
  category: ExpressCategory;
  name: string;
  unit: string;
  priceCents: number;
  description?: string;
}

export interface ExpressCateringSettings {
  packages: ExpressPackage[];
  alaCarte: ExpressAlaCarteItem[];
}

export const EXPRESS_SETTINGS_KEY = "expressCatering";

const PACKAGE_NOTE = "All 5 meats · 3 sides · bread & fixings. Not available for full service.";

export const EXPRESS_DEFAULTS: ExpressCateringSettings = {
  packages: [
    {
      id: "pkg-feeds-10", name: "Party Sampler — Feeds 10", feeds: 10, priceCents: 26900,
      contents: "1 lb Brisket · 2½ lb Pulled Pork · 4 links Sausage · 3 Chicken Quarters · ½ rack Ribs + ½ pan Mac & Cheese · 2 pints Beans · 2 pints Apple Slaw · 1 loaf Bread · Pickles (8 oz) · Pickled Onions (8 oz) · Gold Sauce (8 oz) · Sweet Sauce (8 oz)",
      note: PACKAGE_NOTE,
    },
    {
      id: "pkg-feeds-20", name: "Party Sampler — Feeds 20", feeds: 20, priceCents: 56900,
      contents: "2 lb Brisket · 5 lb Pulled Pork · 8 links Sausage · 6 Chicken Quarters · 1 rack Ribs + 1 full pan Mac & Cheese · ½ pan Beans · ½ pan Apple Slaw · 2 loaves Bread · Pickles (1 pint) · Pickled Onions (1 pint) · Gold Sauce (1 pint) · Sweet Sauce (1 pint)",
      note: PACKAGE_NOTE,
    },
    {
      id: "pkg-feeds-30", name: "Party Sampler — Feeds 30", feeds: 30, priceCents: 76900,
      contents: "3 lb Brisket · 7½ lb Pulled Pork · 12 links Sausage · 9 Chicken Quarters · 1½ racks Ribs + 1 full pan Mac & Cheese · 1 full pan Beans · ½ pan Apple Slaw · 3 loaves Bread · Pickles (1 pint) · Pickled Onions (1 pint) · Gold Sauce (1 pint) · Sweet Sauce (1 pint)",
      note: PACKAGE_NOTE,
    },
    {
      id: "pkg-feeds-50", name: "Party Sampler — Feeds 50", feeds: 50, priceCents: 132900,
      contents: "5 lb Brisket · 12½ lb Pulled Pork · 20 links Sausage · 15 Chicken Quarters · 2 racks Ribs + 2 full pans Mac & Cheese · 1 full pan Beans · 1 full pan Apple Slaw · 5 loaves Bread · Pickles (2 pints) · Pickled Onions (2 pints) · Gold Sauce (2 pints) · Sweet Sauce (2 pints)",
      note: PACKAGE_NOTE,
    },
  ],
  alaCarte: [
    // 🥩 Proteins
    { id: "alc-brisket", category: "proteins", name: "Brisket", unit: "lb", priceCents: 3299, description: "Texas-style smoked brisket, premium quality." },
    { id: "alc-pulled-pork", category: "proteins", name: "Pulled Pork", unit: "lb", priceCents: 1899 },
    { id: "alc-sausage", category: "proteins", name: "Sausage", unit: "link", priceCents: 599 },
    { id: "alc-chicken-quarters", category: "proteins", name: "Chicken Quarters", unit: "each", priceCents: 799 },
    { id: "alc-ribs-half", category: "proteins", name: "Ribs – Half Rack", unit: "rack", priceCents: 2199 },
    { id: "alc-ribs-full", category: "proteins", name: "Ribs – Full Rack", unit: "rack", priceCents: 4299 },
    // 🥗 Sides
    { id: "alc-mac-pint", category: "sides", name: "Mac & Cheese (Pint)", unit: "pint", priceCents: 699 },
    { id: "alc-mac-half-pan", category: "sides", name: "Mac & Cheese (Half Pan)", unit: "half pan", priceCents: 6000 },
    { id: "alc-mac-full-pan", category: "sides", name: "Mac & Cheese (Full Pan)", unit: "full pan", priceCents: 12000 },
    // 🍞 Extras
    { id: "alc-bread", category: "extras", name: "Texas White Bread", unit: "loaf", priceCents: 999 },
    { id: "alc-sauce-pint", category: "extras", name: "Sauce Pint", unit: "pint", priceCents: 999 },
    { id: "alc-pickles", category: "extras", name: "Pickles", unit: "pint", priceCents: 699 },
    { id: "alc-pickled-onions", category: "extras", name: "Pickled Onions", unit: "pint", priceCents: 699 },
  ],
};

/** Express business rules (demo analogs of the live funnel's constraints). */
export const EXPRESS_PICKUP_MIN_CENTS = 25000;   // $250 minimum for pickup
export const EXPRESS_DELIVERY_MIN_CENTS = 50000; // $500 minimum for delivery
export const EXPRESS_DELIVERY_FEE_CENTS = 5000;  // flat demo estimate ($35–$80 live range)
export const EXPRESS_DELIVERY_FEE_LABEL = "Delivery fee (estimate — confirmed by distance)";
export const EXPRESS_MIN_NOTICE_HOURS = 24;

/** Package the funnel recommends for a guest count — nearest feeds ≥ guests (largest if none). */
export function recommendedPackageId(packages: ExpressPackage[], guests: number): string | null {
  if (!packages.length) return null;
  const sorted = [...packages].sort((a, b) => a.feeds - b.feeds);
  return (sorted.find(p => p.feeds >= guests) ?? sorted[sorted.length - 1]).id;
}
