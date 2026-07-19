/**
 * GENERATED from the Manus DB snapshot (menu_items + fire_drop_products),
 * then RECONCILED against the LIVE sales funnels (captured from the live
 * Manus app, 2026-07-18 — authoritative for names & prices).
 *
 * Price sources: the live Weekend Pre-Order funnel (26-product catalog below), the
 * live Cuban Thursday funnel + cuban_thursday_products dump, and the snapshot
 * tables (invoice_menu_catalog, catering_packages) for everything the funnels
 * don't sell. Items whose only known prices are size-dependent (half/full
 * pans) are left null rather than guessing a single price.
 */

export interface MenuCategorySeed { id: string; name: string; sortOrder: number; active: boolean; }
export interface MenuItemSeed {
  name: string; categoryId: string; unit: string | null; sizeOptions: string | null;
  sortOrder: number; active: boolean; priceCents: number | null; thursdayOnly: boolean;
}
export interface FireDropProductSeed {
  name: string; category: string; priceCents: number; capQty: number | null;
  unit: string | null; sortOrder: number; active: boolean; description: string | null;
}

export const MENU_CATEGORIES: Array<MenuCategorySeed> = [
  { id: "fs_meat", name: "Smoked Meats", sortOrder: 0, active: true },
  { id: "fs_side", name: "Sides", sortOrder: 1, active: true },
  { id: "fs_dessert", name: "Desserts", sortOrder: 2, active: true },
  { id: "appetizer", name: "Appetizers", sortOrder: 3, active: true },
  { id: "retail_meat", name: "Retail Meats", sortOrder: 4, active: true },
  { id: "retail_side", name: "Retail Sides", sortOrder: 5, active: true },
  { id: "retail_dessert", name: "Retail Desserts", sortOrder: 6, active: true },
  { id: "salad_misc", name: "Salads & Misc", sortOrder: 7, active: true },
  { id: "meat", name: "Legacy Meats", sortOrder: 8, active: false },
  { id: "side", name: "Legacy Sides", sortOrder: 9, active: false },
  { id: "dessert", name: "Legacy Desserts", sortOrder: 10, active: false },
  { id: "thursday_only", name: "Thursday Only", sortOrder: 11, active: true },
];

export const MENU_ITEMS: Array<MenuItemSeed> = [
  // ── fs_meat ───────────────────────────────────────────────────────────
  { name: "Brisket", categoryId: "fs_meat", unit: "lb", sizeOptions: null, sortOrder: 1, active: true, priceCents: 3699, thursdayOnly: false },
  { name: "Brisket", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 1, active: true, priceCents: 3699, thursdayOnly: false },
  { name: "Smoked Brisket", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 1, active: false, priceCents: 3699, thursdayOnly: false },
  { name: "Pulled Pork", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 2, active: true, priceCents: 1999, thursdayOnly: false },
  { name: "Bone-In Chicken", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "Ribs", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "Baby Back Ribs", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 4, active: false, priceCents: null, thursdayOnly: false },
  { name: "Chicken Quarters", categoryId: "fs_meat", unit: "pc", sizeOptions: null, sortOrder: 4, active: false, priceCents: 799, thursdayOnly: false },
  { name: "Burnt Ends", categoryId: "fs_meat", unit: "lb", sizeOptions: null, sortOrder: 5, active: true, priceCents: null, thursdayOnly: false },
  { name: "Pork Belly Burnt Ends", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 5, active: true, priceCents: 3699, thursdayOnly: false },
  { name: "Sausage", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 5, active: true, priceCents: null, thursdayOnly: false },
  { name: "Burnt Ends", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 6, active: true, priceCents: null, thursdayOnly: false },
  { name: "Smoked Turkey Breast", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 6, active: true, priceCents: null, thursdayOnly: false },
  { name: "Chicken Quarters", categoryId: "fs_meat", unit: "pc", sizeOptions: null, sortOrder: 7, active: true, priceCents: 799, thursdayOnly: false },
  { name: "Pulled Chicken", categoryId: "fs_meat", unit: "per person", sizeOptions: null, sortOrder: 7, active: true, priceCents: null, thursdayOnly: false },
  { name: "Smoked Sausage Links", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 7, active: false, priceCents: null, thursdayOnly: false },
  { name: "Beef Ribs", categoryId: "fs_meat", unit: "bone", sizeOptions: null, sortOrder: 8, active: true, priceCents: 5999, thursdayOnly: false },
  { name: "Beef Short Ribs", categoryId: "fs_meat", unit: "lbs", sizeOptions: null, sortOrder: 8, active: true, priceCents: null, thursdayOnly: false },
  { name: "Grilled Chicken", categoryId: "fs_meat", unit: "pc", sizeOptions: null, sortOrder: 9, active: true, priceCents: null, thursdayOnly: false },
  { name: "Hot Dogs", categoryId: "fs_meat", unit: "pc", sizeOptions: null, sortOrder: 10, active: true, priceCents: null, thursdayOnly: false },
  { name: "Brisket Burnt Ends", categoryId: "fs_meat", unit: "lb", sizeOptions: null, sortOrder: 11, active: true, priceCents: null, thursdayOnly: false },
  { name: "Beef Ribs", categoryId: "fs_meat", unit: "bone", sizeOptions: null, sortOrder: 12, active: true, priceCents: 5999, thursdayOnly: false },
  // ── fs_side ───────────────────────────────────────────────────────────
  { name: "Extra Sauce", categoryId: "fs_side", unit: null, sizeOptions: "[\"P\", \"Q\"]", sortOrder: 0, active: true, priceCents: 999, thursdayOnly: false },
  { name: "Pickled Onions", categoryId: "fs_side", unit: "Pint", sizeOptions: null, sortOrder: 0, active: true, priceCents: null, thursdayOnly: false },
  { name: "Pickles", categoryId: "fs_side", unit: "Pint", sizeOptions: null, sortOrder: 0, active: true, priceCents: null, thursdayOnly: false },
  { name: "Texas White Bread", categoryId: "fs_side", unit: null, sizeOptions: null, sortOrder: 0, active: true, priceCents: null, thursdayOnly: false },
  { name: "Mac & Cheese", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 1, active: true, priceCents: 1199, thursdayOnly: false },
  { name: "Baked Beans", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 2, active: true, priceCents: 1199, thursdayOnly: false },
  { name: "Coleslaw", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "Simple Slaw", categoryId: "fs_side", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 3, active: true, priceCents: 1199, thursdayOnly: false },
  { name: "Potato Salad", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 4, active: true, priceCents: null, thursdayOnly: false },
  { name: "Corn on the Cob", categoryId: "fs_side", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 5, active: true, priceCents: null, thursdayOnly: false },
  { name: "Street Corn", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 5, active: true, priceCents: null, thursdayOnly: false },
  { name: "Collard Greens", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 6, active: true, priceCents: null, thursdayOnly: false },
  { name: "Roasted Vegetables", categoryId: "fs_side", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 6, active: true, priceCents: null, thursdayOnly: false },
  { name: "Green Beans", categoryId: "fs_side", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 7, active: true, priceCents: null, thursdayOnly: false },
  { name: "Street Corn Salad", categoryId: "fs_side", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 7, active: true, priceCents: null, thursdayOnly: false },
  { name: "Broccoli Salad", categoryId: "fs_side", unit: null, sizeOptions: "[\"H\", \"F\"]", sortOrder: 8, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cornbread", categoryId: "fs_side", unit: "pc", sizeOptions: null, sortOrder: 9, active: true, priceCents: null, thursdayOnly: false },
  { name: "Smoked Jalapeño Cornbread", categoryId: "fs_side", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 9, active: true, priceCents: null, thursdayOnly: false },
  // ── fs_dessert ────────────────────────────────────────────────────────
  { name: "Late Night Brownies", categoryId: "fs_dessert", unit: "Dozen", sizeOptions: null, sortOrder: 0, active: true, priceCents: null, thursdayOnly: false },
  { name: "Rookies Cookies", categoryId: "fs_dessert", unit: "Dozen", sizeOptions: null, sortOrder: 0, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cobbler", categoryId: "fs_dessert", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 1, active: true, priceCents: null, thursdayOnly: false },
  { name: "Peach Cobbler", categoryId: "fs_dessert", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 1, active: true, priceCents: null, thursdayOnly: false },
  { name: "Banana Pudding", categoryId: "fs_dessert", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 2, active: true, priceCents: null, thursdayOnly: false },
  { name: "Brownie Bites", categoryId: "fs_dessert", unit: "H/F", sizeOptions: "[\"H\", \"F\"]", sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cookies", categoryId: "fs_dessert", unit: "pc", sizeOptions: null, sortOrder: 3, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Brownies", categoryId: "fs_dessert", unit: "pc", sizeOptions: null, sortOrder: 4, active: true, priceCents: null, thursdayOnly: false },
  // ── appetizer ─────────────────────────────────────────────────────────
  { name: "Smoked Wings", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 1, active: true, priceCents: null, thursdayOnly: false },
  { name: "Burnt End Bites", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 2, active: true, priceCents: null, thursdayOnly: false },
  { name: "Pulled Pork Sliders", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "Smoked Chicken Wings", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "Brisket Sliders", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 4, active: true, priceCents: null, thursdayOnly: false },
  { name: "Pork Belly Bites", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 4, active: true, priceCents: null, thursdayOnly: false },
  { name: "BBQ Nachos", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 5, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cuban Sliders", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 5, active: true, priceCents: null, thursdayOnly: true },
  { name: "Smoked Deviled Eggs", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 6, active: true, priceCents: null, thursdayOnly: false },
  { name: "Smoked Sausage Bites", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 6, active: true, priceCents: null, thursdayOnly: false },
  { name: "Jalapeño Poppers", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 7, active: true, priceCents: null, thursdayOnly: false },
  { name: "Loaded Fries", categoryId: "appetizer", unit: "pan", sizeOptions: "[\"H\", \"F\"]", sortOrder: 7, active: true, priceCents: null, thursdayOnly: false },
  { name: "Charcuterie Board", categoryId: "appetizer", unit: "each", sizeOptions: null, sortOrder: 8, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cuban Sandwich Bites", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 8, active: true, priceCents: null, thursdayOnly: true },
  { name: "Burnt End Skewers", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 9, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cuban Sandwich Platter", categoryId: "appetizer", unit: "platter (32 pc)", sizeOptions: null, sortOrder: 11, active: true, priceCents: null, thursdayOnly: true },
  { name: "Caprese Skewers", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 90, active: true, priceCents: null, thursdayOnly: false },
  { name: "Beef Empanadas", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 91, active: true, priceCents: null, thursdayOnly: false },
  { name: "Vegetable Spring Rolls", categoryId: "appetizer", unit: "pc", sizeOptions: null, sortOrder: 92, active: true, priceCents: null, thursdayOnly: false },
  // ── retail_meat ───────────────────────────────────────────────────────
  // Sampler names follow the LIVE Weekend Pre-Order funnel ("People", not "lb").
  { name: "Walk-In Sampler (2-3 People)", categoryId: "retail_meat", unit: "pkg", sizeOptions: null, sortOrder: 10, active: true, priceCents: 5999, thursdayOnly: false },
  { name: "Walk-In Sampler (5-6 People)", categoryId: "retail_meat", unit: "pkg", sizeOptions: null, sortOrder: 11, active: true, priceCents: 11999, thursdayOnly: false },
  // Legacy inactive duplicate, renamed to the live product name.
  { name: "Smokin Cuban", categoryId: "retail_meat", unit: "pc", sizeOptions: null, sortOrder: 60, active: false, priceCents: 1299, thursdayOnly: true },
  { name: "Brisket", categoryId: "retail_meat", unit: "lbs", sizeOptions: null, sortOrder: 100, active: true, priceCents: 3699, thursdayOnly: false },
  { name: "Brisket (½ lb)", categoryId: "retail_meat", unit: "½ lb", sizeOptions: null, sortOrder: 100, active: true, priceCents: 1850, thursdayOnly: false },
  { name: "Pork", categoryId: "retail_meat", unit: "lbs", sizeOptions: null, sortOrder: 101, active: true, priceCents: 1999, thursdayOnly: false },
  { name: "Pulled Pork (½ lb)", categoryId: "retail_meat", unit: "½ lb", sizeOptions: null, sortOrder: 101, active: true, priceCents: 999, thursdayOnly: false },
  { name: "Ribs", categoryId: "retail_meat", unit: "racks", sizeOptions: null, sortOrder: 102, active: true, priceCents: 4699, thursdayOnly: false },
  { name: "Ribs (Half Rack)", categoryId: "retail_meat", unit: "rack", sizeOptions: null, sortOrder: 102, active: true, priceCents: 2399, thursdayOnly: false },
  { name: "Sausage", categoryId: "retail_meat", unit: "links", sizeOptions: null, sortOrder: 103, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Chicken Quarters", categoryId: "retail_meat", unit: "pc", sizeOptions: null, sortOrder: 104, active: true, priceCents: 799, thursdayOnly: false },
  { name: "Pork Belly Burnt Ends (½ lb)", categoryId: "retail_meat", unit: "½ lb", sizeOptions: null, sortOrder: 105, active: true, priceCents: 1899, thursdayOnly: false },
  { name: "Beef Ribs", categoryId: "retail_meat", unit: "bone", sizeOptions: null, sortOrder: 105, active: true, priceCents: 5999, thursdayOnly: false },
  // ── retail_side ───────────────────────────────────────────────────────
  { name: "Mac & Cheese", categoryId: "retail_side", unit: "pans", sizeOptions: null, sortOrder: 110, active: true, priceCents: null, thursdayOnly: false },
  { name: "Baked Beans", categoryId: "retail_side", unit: "pans", sizeOptions: null, sortOrder: 111, active: true, priceCents: null, thursdayOnly: false },
  { name: "Free Simple Slaw", categoryId: "retail_side", unit: "pans", sizeOptions: null, sortOrder: 112, active: true, priceCents: null, thursdayOnly: false },
  // Live Weekend Pre-Order funnel side sizes (confirmed prices):
  { name: "Mac & Cheese (6oz)", categoryId: "retail_side", unit: "each", sizeOptions: null, sortOrder: 113, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Mac & Cheese (Pint)", categoryId: "retail_side", unit: "pint", sizeOptions: null, sortOrder: 113, active: true, priceCents: 1199, thursdayOnly: false },
  { name: "Baked Beans (6oz)", categoryId: "retail_side", unit: "each", sizeOptions: null, sortOrder: 114, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Baked Beans (Pint)", categoryId: "retail_side", unit: "pint", sizeOptions: null, sortOrder: 114, active: true, priceCents: 1199, thursdayOnly: false },
  { name: "Apple Slaw (6oz)", categoryId: "retail_side", unit: "each", sizeOptions: null, sortOrder: 115, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Apple Slaw (Pint)", categoryId: "retail_side", unit: "pint", sizeOptions: null, sortOrder: 115, active: true, priceCents: 1199, thursdayOnly: false },
  // ── retail_dessert ────────────────────────────────────────────────────
  { name: "Cookies", categoryId: "retail_dessert", unit: "piece", sizeOptions: null, sortOrder: 120, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Banana Pudding", categoryId: "retail_dessert", unit: "pint", sizeOptions: null, sortOrder: 121, active: true, priceCents: 599, thursdayOnly: false },
  // ── salad_misc ────────────────────────────────────────────────────────
  { name: "Salads", categoryId: "salad_misc", unit: null, sizeOptions: "[\"H\", \"F\"]", sortOrder: 1, active: true, priceCents: null, thursdayOnly: false },
  { name: "Other", categoryId: "salad_misc", unit: null, sizeOptions: "[\"H\", \"F\"]", sortOrder: 2, active: true, priceCents: null, thursdayOnly: false },
  { name: "Cuban Sandwich Platter", categoryId: "salad_misc", unit: "platter (32 pc)", sizeOptions: null, sortOrder: 3, active: false, priceCents: null, thursdayOnly: true },
  { name: "Special Item", categoryId: "salad_misc", unit: null, sizeOptions: null, sortOrder: 3, active: true, priceCents: null, thursdayOnly: false },
  { name: "BBQ Sauce (Bottle)", categoryId: "salad_misc", unit: "bottle", sizeOptions: null, sortOrder: 116, active: true, priceCents: 999, thursdayOnly: false },
  { name: "Bread (2 slices)", categoryId: "salad_misc", unit: "each", sizeOptions: null, sortOrder: 117, active: true, priceCents: null, thursdayOnly: false },
  // Live Weekend Pre-Order "Essentials" sauce jars ($9.99/jar each, confirmed):
  { name: "The Rescue – Sweet Guava BBQ Sauce", categoryId: "salad_misc", unit: "jar", sizeOptions: null, sortOrder: 118, active: true, priceCents: 999, thursdayOnly: false },
  { name: "The Flashover – Spicy Guava BBQ Sauce", categoryId: "salad_misc", unit: "jar", sizeOptions: null, sortOrder: 119, active: true, priceCents: 999, thursdayOnly: false },
  { name: "The Golden Alarm – Carolina Gold BBQ Sauce", categoryId: "salad_misc", unit: "jar", sizeOptions: null, sortOrder: 120, active: true, priceCents: 999, thursdayOnly: false },
  { name: "The Ember Watch – Maple Cayenne BBQ Sauce", categoryId: "salad_misc", unit: "jar", sizeOptions: null, sortOrder: 121, active: true, priceCents: 999, thursdayOnly: false },
  { name: "The Brotherhood – Sweet Eddie's BBQ Sauce", categoryId: "salad_misc", unit: "jar", sizeOptions: null, sortOrder: 122, active: true, priceCents: 999, thursdayOnly: false },
  { name: "Engine 40 – Station 40 White Alabama BBQ Sauce", categoryId: "salad_misc", unit: "jar", sizeOptions: null, sortOrder: 123, active: true, priceCents: 999, thursdayOnly: false },
  // ── meat ──────────────────────────────────────────────────────────────
  { name: "Ribs Full Rack", categoryId: "meat", unit: null, sizeOptions: null, sortOrder: 0, active: false, priceCents: 4699, thursdayOnly: false },
  { name: "Ribs Half Rack", categoryId: "meat", unit: null, sizeOptions: null, sortOrder: 0, active: false, priceCents: 2399, thursdayOnly: false },
  { name: "Station House Party Sampler - Feeds 10", categoryId: "meat", unit: null, sizeOptions: null, sortOrder: 0, active: false, priceCents: 26900, thursdayOnly: false },
  { name: "Station House Party Sampler - Feeds 20", categoryId: "meat", unit: null, sizeOptions: null, sortOrder: 0, active: false, priceCents: 56900, thursdayOnly: false },
  { name: "Station House Party Sampler - Feeds 30", categoryId: "meat", unit: null, sizeOptions: null, sortOrder: 0, active: false, priceCents: 76900, thursdayOnly: false },
  { name: "Station House Party Sampler - Feeds 50", categoryId: "meat", unit: null, sizeOptions: null, sortOrder: 0, active: false, priceCents: 132900, thursdayOnly: false },
  { name: "Pulled Pork", categoryId: "meat", unit: "lb", sizeOptions: null, sortOrder: 2, active: false, priceCents: 1999, thursdayOnly: false },
  { name: "Sausage", categoryId: "meat", unit: "lb", sizeOptions: null, sortOrder: 3, active: false, priceCents: null, thursdayOnly: false },
  { name: "Ribs", categoryId: "meat", unit: "rack", sizeOptions: null, sortOrder: 4, active: false, priceCents: 4699, thursdayOnly: false },
  { name: "Pulled Chicken", categoryId: "meat", unit: "lb", sizeOptions: null, sortOrder: 6, active: false, priceCents: 1999, thursdayOnly: false },
  // ── side ──────────────────────────────────────────────────────────────
  { name: "Mac & Cheese", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 1, active: false, priceCents: 1199, thursdayOnly: false },
  { name: "Beans", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 2, active: false, priceCents: 1199, thursdayOnly: false },
  { name: "Slaw", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 3, active: false, priceCents: 1199, thursdayOnly: false },
  { name: "Potato Salad", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 4, active: false, priceCents: null, thursdayOnly: false },
  { name: "Street Corn", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 5, active: false, priceCents: null, thursdayOnly: false },
  { name: "Collards", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 6, active: false, priceCents: null, thursdayOnly: false },
  { name: "Green Beans", categoryId: "side", unit: null, sizeOptions: "[\"P\", \"H\", \"F\"]", sortOrder: 7, active: false, priceCents: null, thursdayOnly: false },
  { name: "Broccoli Salad", categoryId: "side", unit: null, sizeOptions: "[\"H\", \"F\"]", sortOrder: 8, active: false, priceCents: null, thursdayOnly: false },
  // ── dessert ───────────────────────────────────────────────────────────
  { name: "Cookies", categoryId: "dessert", unit: "pc", sizeOptions: null, sortOrder: 1, active: false, priceCents: 599, thursdayOnly: false },
  { name: "Brownies", categoryId: "dessert", unit: "pc", sizeOptions: null, sortOrder: 2, active: false, priceCents: null, thursdayOnly: false },
  { name: "Peach Cobbler", categoryId: "dessert", unit: null, sizeOptions: "[\"H\", \"F\"]", sortOrder: 3, active: false, priceCents: null, thursdayOnly: false },
  { name: "Banana Pudding", categoryId: "dessert", unit: null, sizeOptions: "[\"H\", \"F\"]", sortOrder: 4, active: false, priceCents: null, thursdayOnly: false },
  // ── thursday_only ─────────────────────────────────────────────────────
  // LIVE Cuban Thursday menu, verbatim from the cuban_thursday_products dump
  // (names, prices, order). This category is the canonical Thursday channel;
  // the old retail_meat "Cuban Sandwich"/"Smash Burger" rows were folded in
  // here under their live names.
  { name: "Thursday Sampler", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 1, active: false, priceCents: 5499, thursdayOnly: true },
  { name: "Smokin Cuban", categoryId: "thursday_only", unit: "pc", sizeOptions: null, sortOrder: 10, active: true, priceCents: 1299, thursdayOnly: true },
  { name: "Brisket Cuban", categoryId: "thursday_only", unit: "pc", sizeOptions: null, sortOrder: 11, active: true, priceCents: 1799, thursdayOnly: true },
  { name: "Brisket Tallow Smash Burger", categoryId: "thursday_only", unit: "pc", sizeOptions: null, sortOrder: 12, active: false, priceCents: 1299, thursdayOnly: true },
  { name: "Smoked Gouda Mac and Cheese (Small)", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 20, active: true, priceCents: 599, thursdayOnly: true },
  { name: "Smoked Gouda Mac and Cheese (Large)", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 21, active: true, priceCents: 1199, thursdayOnly: true },
  { name: "Brisket Baked Beans (Small)", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 22, active: true, priceCents: 599, thursdayOnly: true },
  { name: "Brisket Baked Beans (Large)", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 23, active: true, priceCents: 1199, thursdayOnly: true },
  { name: "Station House T-Shirt", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 30, active: true, priceCents: 2499, thursdayOnly: true },
  { name: "Smoked Brisket Tallow", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 31, active: true, priceCents: 1899, thursdayOnly: true },
  { name: "BBQ Rub or BBQ Sauce Pint", categoryId: "thursday_only", unit: "pint", sizeOptions: null, sortOrder: 32, active: true, priceCents: 999, thursdayOnly: true },
  { name: "Drinks", categoryId: "thursday_only", unit: "each", sizeOptions: null, sortOrder: 33, active: true, priceCents: 200, thursdayOnly: true },
];

// Weekend Pre-Order products — LIVE funnel catalog (captured from the live Manus app,
// 2026-07-18). 26 products across five sections: platters / meats / sides /
// essentials / desserts. Names, prices and descriptions are verbatim from the
// live page. capQty mirrors the live "ONLY N LEFT" counters (soldQty seeds 0);
// everything else is uncapped (null).
export const FIRE_DROP_PRODUCTS: Array<FireDropProductSeed> = [
  // ── 🍽️ Platters (pre-order + walk-in) ──
  { name: "Walk-In Sampler (2-3 People)", category: "platters", priceCents: 5999, capQty: null, unit: "each", sortOrder: 1, active: true,
    description: "2-3 people · ¼ lb each: Brisket, Pulled Pork, Ribs, Chicken & Sausage · 2 sides (6oz each)" },
  { name: "Walk-In Sampler (5-6 People)", category: "platters", priceCents: 11999, capQty: null, unit: "each", sortOrder: 2, active: true,
    description: "5-6 people · ½ lb each: Brisket, Pulled Pork, Ribs, Chicken & Sausage · 3 large sides: 2 Mac & Cheese + 1 Baked Beans" },
  // ── 🥩 Meats (pre-order only) ──
  { name: "Brisket (1 lb)", category: "meats", priceCents: 3699, capQty: 10, unit: "lb", sortOrder: 10, active: true,
    description: "Texas-style smoked brisket. Strong bark, juicy center. Sliced to order." },
  { name: "Brisket (½ lb)", category: "meats", priceCents: 1850, capQty: null, unit: "½ lb", sortOrder: 11, active: true, description: null },
  { name: "Pulled Pork (1 lb)", category: "meats", priceCents: 1999, capQty: null, unit: "lb", sortOrder: 12, active: true,
    description: "Low and slow smoked pulled pork." },
  { name: "Pulled Pork (½ lb)", category: "meats", priceCents: 999, capQty: null, unit: "½ lb", sortOrder: 13, active: true, description: null },
  { name: "Ribs (Half Rack)", category: "meats", priceCents: 2399, capQty: null, unit: "half rack", sortOrder: 14, active: true,
    description: "Smoked spare ribs with our signature dry rub. Fall-off-the-bone tender." },
  { name: "Ribs (Full Rack)", category: "meats", priceCents: 4699, capQty: null, unit: "full rack", sortOrder: 15, active: true, description: null },
  { name: "Chicken Leg Quarter", category: "meats", priceCents: 799, capQty: null, unit: "each", sortOrder: 16, active: true, description: null },
  { name: "Jalapeño Cheddar Sausage Link", category: "meats", priceCents: 599, capQty: 8, unit: "link", sortOrder: 17, active: true, description: null },
  { name: "Pork Belly Burnt Ends (½ lb)", category: "meats", priceCents: 1899, capQty: 9, unit: "½ lb", sortOrder: 18, active: true, description: null },
  { name: "Pork Belly Burnt Ends (1 lb)", category: "meats", priceCents: 3699, capQty: null, unit: "lb", sortOrder: 19, active: true, description: null },
  // ── 🥗 Sides ──
  { name: "Mac & Cheese (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 20, active: true, description: null },
  { name: "Mac & Cheese (Pint)", category: "sides", priceCents: 1199, capQty: null, unit: "pint", sortOrder: 21, active: true, description: null },
  { name: "Baked Beans (Pint)", category: "sides", priceCents: 1199, capQty: null, unit: "pint", sortOrder: 22, active: true,
    description: "Slow-cooked baked beans with burnt ends mixed in." },
  { name: "Baked Beans (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 23, active: true, description: null },
  { name: "Apple Slaw (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 24, active: true, description: null },
  { name: "Apple Slaw (Pint)", category: "sides", priceCents: 1199, capQty: null, unit: "pint", sortOrder: 25, active: true, description: null },
  // ── ➕ Essentials (sauces, $9.99/jar) ──
  { name: "The Rescue – Sweet Guava BBQ Sauce", category: "essentials", priceCents: 999, capQty: null, unit: "jar", sortOrder: 30, active: true, description: null },
  { name: "The Flashover – Spicy Guava BBQ Sauce", category: "essentials", priceCents: 999, capQty: null, unit: "jar", sortOrder: 31, active: true, description: null },
  { name: "The Golden Alarm – Carolina Gold BBQ Sauce", category: "essentials", priceCents: 999, capQty: null, unit: "jar", sortOrder: 32, active: true, description: null },
  { name: "The Ember Watch – Maple Cayenne BBQ Sauce", category: "essentials", priceCents: 999, capQty: null, unit: "jar", sortOrder: 33, active: true, description: null },
  { name: "The Brotherhood – Sweet Eddie's BBQ Sauce", category: "essentials", priceCents: 999, capQty: null, unit: "jar", sortOrder: 34, active: true, description: null },
  { name: "Engine 40 – Station 40 White Alabama BBQ Sauce", category: "essentials", priceCents: 999, capQty: null, unit: "jar", sortOrder: 35, active: true, description: null },
  // ── 🍪 Desserts ──
  { name: "Rookie Cookie", category: "desserts", priceCents: 599, capQty: null, unit: "each", sortOrder: 40, active: true, description: null },
  { name: "Banana Pudding", category: "desserts", priceCents: 599, capQty: null, unit: "each", sortOrder: 41, active: true, description: null },
];
