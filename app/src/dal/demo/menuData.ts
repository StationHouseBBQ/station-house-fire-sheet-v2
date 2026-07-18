/**
 * GENERATED from the Manus DB snapshot (menu_items + fire_drop_products).
 * Names, categories, ordering, and active flags are verbatim; null prices need owner confirmation.
 *
 * Price sources (all from the same snapshot): fire_drop_products (latest drop-1 state),
 * invoice_menu_catalog (per-pound / per-piece unit prices), catering_packages (Party Samplers)
 * and the cuban_thursday_products seed (Cuban / Smash Burger). Items whose only known prices
 * are size-dependent (half/full pans) are left null rather than guessing a single price.
 */

export interface MenuCategorySeed { id: string; name: string; sortOrder: number; active: boolean; }
export interface MenuItemSeed {
  name: string; categoryId: string; unit: string | null; sizeOptions: string | null;
  sortOrder: number; active: boolean; priceCents: number | null; thursdayOnly: boolean;
}
export interface FireDropProductSeed {
  name: string; category: string; priceCents: number; capQty: number | null;
  unit: string | null; sortOrder: number; active: boolean;
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
  { name: "Walk-In Sampler (2-3 lb)", categoryId: "retail_meat", unit: "pkg", sizeOptions: null, sortOrder: 10, active: true, priceCents: 5999, thursdayOnly: false },
  { name: "Walk-In Sampler (5-6 lb)", categoryId: "retail_meat", unit: "pkg", sizeOptions: null, sortOrder: 11, active: true, priceCents: 11999, thursdayOnly: false },
  { name: "Cuban Sandwich", categoryId: "retail_meat", unit: "pc", sizeOptions: null, sortOrder: 60, active: false, priceCents: 1299, thursdayOnly: true },
  { name: "Cuban Sandwich", categoryId: "retail_meat", unit: "pc", sizeOptions: null, sortOrder: 60, active: true, priceCents: 1299, thursdayOnly: true },
  { name: "Smash Burger", categoryId: "retail_meat", unit: "pc", sizeOptions: null, sortOrder: 65, active: true, priceCents: 1299, thursdayOnly: true },
  { name: "Brisket", categoryId: "retail_meat", unit: "lbs", sizeOptions: null, sortOrder: 100, active: true, priceCents: 3699, thursdayOnly: false },
  { name: "Pork", categoryId: "retail_meat", unit: "lbs", sizeOptions: null, sortOrder: 101, active: true, priceCents: 1999, thursdayOnly: false },
  { name: "Ribs", categoryId: "retail_meat", unit: "racks", sizeOptions: null, sortOrder: 102, active: true, priceCents: 4699, thursdayOnly: false },
  { name: "Sausage", categoryId: "retail_meat", unit: "links", sizeOptions: null, sortOrder: 103, active: true, priceCents: 599, thursdayOnly: false },
  { name: "Chicken Quarters", categoryId: "retail_meat", unit: "pc", sizeOptions: null, sortOrder: 104, active: true, priceCents: 799, thursdayOnly: false },
  { name: "Beef Ribs", categoryId: "retail_meat", unit: "bone", sizeOptions: null, sortOrder: 105, active: true, priceCents: 5999, thursdayOnly: false },
  // ── retail_side ───────────────────────────────────────────────────────
  { name: "Mac & Cheese", categoryId: "retail_side", unit: "pans", sizeOptions: null, sortOrder: 110, active: true, priceCents: null, thursdayOnly: false },
  { name: "Baked Beans", categoryId: "retail_side", unit: "pans", sizeOptions: null, sortOrder: 111, active: true, priceCents: null, thursdayOnly: false },
  { name: "Free Simple Slaw", categoryId: "retail_side", unit: "pans", sizeOptions: null, sortOrder: 112, active: true, priceCents: null, thursdayOnly: false },
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
  // ── thursday_only ─────────────────────────────────────────────────────────
  // "Brisket Smash Burger" is not in the 111-row menu_items snapshot; the closest real item is
  // cuban_thursday_products "Brisket Tallow Smash Burger" ($12.99), added here so the Cuban
  // Thursday channel always carries it.
  { name: "Brisket Smash Burger", categoryId: "thursday_only", unit: "pc", sizeOptions: null, sortOrder: 1, active: true, priceCents: 1299, thursdayOnly: true },
];

// Fire drop products — drop 1, latest snapshot state (29 unique products; the raw 35-row dump
// was two concatenated SELECTs: 22 product rows + a header + 12 pickup-slot rows). capQty comes
// from totalQuantity where captured; 0/absent means uncapped (null).
export const FIRE_DROP_PRODUCTS: Array<FireDropProductSeed> = [
  { name: "Walk-In Sampler (2-3 People)", category: "platters", priceCents: 5999, capQty: 50, unit: "each", sortOrder: 1, active: true },
  { name: "Walk-In Sampler (5-6 People)", category: "platters", priceCents: 11999, capQty: 50, unit: "each", sortOrder: 2, active: true },
  { name: "Brisket (1 lb)", category: "meats", priceCents: 3699, capQty: 30, unit: "lb", sortOrder: 10, active: true },
  { name: "Brisket (½ lb)", category: "meats", priceCents: 1850, capQty: null, unit: "½ lb", sortOrder: 11, active: true },
  { name: "Mac & Cheese (Pint)", category: "sides", priceCents: 1199, capQty: 40, unit: "pint", sortOrder: 12, active: true },
  { name: "Mac & Cheese (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 12, active: true },
  { name: "Baked Beans (Pint)", category: "sides", priceCents: 1199, capQty: 40, unit: "pint", sortOrder: 13, active: true },
  { name: "Baked Beans (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 13, active: true },
  { name: "Apple Slaw (Pint)", category: "sides", priceCents: 1199, capQty: 40, unit: "pint", sortOrder: 14, active: true },
  { name: "Apple Slaw (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 14, active: true },
  { name: "Pork Belly Fried Rice (Pint)", category: "sides", priceCents: 1299, capQty: null, unit: "pint", sortOrder: 15, active: true },
  { name: "Rookie Cookie", category: "desserts", priceCents: 599, capQty: 30, unit: "each", sortOrder: 16, active: true },
  { name: "Pork Belly Fried Rice (6oz)", category: "sides", priceCents: 599, capQty: null, unit: "each", sortOrder: 16, active: true },
  { name: "Banana Pudding", category: "desserts", priceCents: 599, capQty: null, unit: "each", sortOrder: 17, active: true },
  { name: "Pulled Pork (1 lb)", category: "meats", priceCents: 1999, capQty: 25, unit: "lb", sortOrder: 20, active: true },
  { name: "Pulled Pork (½ lb)", category: "meats", priceCents: 999, capQty: null, unit: "each", sortOrder: 21, active: true },
  { name: "Ribs (Half Rack)", category: "meats", priceCents: 2399, capQty: 20, unit: "half rack", sortOrder: 30, active: true },
  { name: "Ribs (Full Rack)", category: "meats", priceCents: 4699, capQty: 20, unit: "full rack", sortOrder: 31, active: true },
  { name: "Chicken Leg Quarter", category: "meats", priceCents: 799, capQty: 30, unit: "each", sortOrder: 40, active: true },
  { name: "Jalapeño Cheddar Sausage Link", category: "meats", priceCents: 599, capQty: 25, unit: "link", sortOrder: 50, active: true },
  { name: "The Rescue – Sweet Guava BBQ Sauce", category: "extras", priceCents: 999, capQty: null, unit: "jar", sortOrder: 50, active: true },
  { name: "The Flashover – Spicy Guava BBQ Sauce", category: "extras", priceCents: 999, capQty: null, unit: "jar", sortOrder: 51, active: true },
  { name: "The Golden Alarm – Carolina Gold BBQ Sauce", category: "extras", priceCents: 999, capQty: null, unit: "jar", sortOrder: 52, active: true },
  { name: "The Ember Watch – Maple Cayenne BBQ Sauce", category: "extras", priceCents: 999, capQty: null, unit: "jar", sortOrder: 53, active: true },
  { name: "The Brotherhood – Sweet Eddie's BBQ Sauce", category: "extras", priceCents: 999, capQty: null, unit: "jar", sortOrder: 54, active: true },
  { name: "Engine 40 – Station 40 White Alabama BBQ Sauce", category: "extras", priceCents: 999, capQty: null, unit: "jar", sortOrder: 55, active: true },
  { name: "Pork Belly Burnt Ends (½ lb)", category: "meats", priceCents: 1899, capQty: 15, unit: "½ lb", sortOrder: 60, active: true },
  { name: "Pork Belly Burnt Ends (1 lb)", category: "meats", priceCents: 3699, capQty: 20, unit: "1 lb", sortOrder: 61, active: true },
  { name: "Beef Dino Bone (1 Bone)", category: "meats", priceCents: 5999, capQty: null, unit: "order", sortOrder: 70, active: true },
];
