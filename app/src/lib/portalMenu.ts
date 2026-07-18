/**
 * Portal catering menu — shared between the client portal (read side) and
 * Portal Admin (edit side). Stored in settings under the "portalMenu" key;
 * these defaults mirror the menu that used to be hardcoded in PortalApp so
 * companies see identical pricing until the owner edits it.
 */
export interface PortalMenuItem {
  id: string;
  name: string;
  priceCents: number;
}

export const PORTAL_MENU_KEY = "portalMenu";

export const PORTAL_MENU_DEFAULTS: PortalMenuItem[] = [
  { id: "pm-pulled-pork-tray", name: "Pulled Pork tray", priceCents: 9500 },
  { id: "pm-brisket-tray", name: "Brisket tray", priceCents: 14000 },
  { id: "pm-ribs-rack", name: "Ribs rack", priceCents: 2800 },
  { id: "pm-mac-cheese-pan", name: "Mac & Cheese pan", priceCents: 4500 },
  { id: "pm-collards-pan", name: "Collards pan", priceCents: 4000 },
  { id: "pm-banana-pudding-dozen", name: "Banana Pudding dozen", priceCents: 3600 },
];
