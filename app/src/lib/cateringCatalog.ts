/**
 * CANONICAL CATERING CATALOG — transcribed verbatim from the Station House BBQ
 * "The House Catering Collection" (menu_reference.md, extracted from
 * SHTheHouseCateringCollectionOCT25cf(1).pdf). Authoritative for full-service
 * catering verbiage AND numbers.
 *
 * Money is integer cents. All values are the real published Station House
 * prices/rules; the admin Catering settings panel treats these as editable
 * defaults (pricing can change), stored under CATERING_CATALOG_KEY.
 */

export const CATERING_CATALOG_KEY = "cateringCatalog";

export interface PackageDef {
  id: string; name: string; group: string; pricePerGuestCents: number; includes: string;
}
export interface ProteinDef { id: string; name: string; tier: "classic" | "premium"; line: "smoked" | "beyond_pit"; description: string; }
export interface SideDef { id: string; name: string; shift: "A" | "B"; description?: string; }
export interface BiteDef { id: string; name: string; description: string; }
export interface PricedItem { id: string; name: string; priceCents: number; unit?: string; note?: string; }
export interface StaffRoleRate { id: string; role: string; baseCents: number; minHours: number; addlHourCents: number | null; note?: string; }

/** ── ALARM PACKAGES · Smoked Proteins (per guest) ── */
export const SMOKED_ALARM_PACKAGES: PackageDef[] = [
  { id: "sm-1-classic", group: "Smoked · Alarm", name: "1 Alarm Classic Sandwich Box", pricePerGuestCents: 2195, includes: "(1) BBQ sauce · (1) A-Shift side · (1) Classic Smoked protein" },
  { id: "sm-1-premium", group: "Smoked · Alarm", name: "1 Alarm Premium Sandwich Box", pricePerGuestCents: 2495, includes: "(1) BBQ sauce · (1) A-Shift side · (1) Premium Smoked protein" },
  { id: "sm-2-classic", group: "Smoked · Alarm", name: "2 Alarm Classic Buffet", pricePerGuestCents: 2395, includes: "Rolls · (2) BBQ sauces · (2) A-Shift sides · (2) Classic Smoked proteins" },
  { id: "sm-2-premium", group: "Smoked · Alarm", name: "2 Alarm Premium Buffet", pricePerGuestCents: 2695, includes: "Rolls · (2) BBQ sauces · (2) A-Shift sides · (1) Classic + (1) Premium Smoked protein" },
  { id: "sm-3-classic", group: "Smoked · Alarm", name: "3 Alarm Classic Buffet", pricePerGuestCents: 2595, includes: "Rolls · (2) BBQ sauces · (2) A-Shift sides · (3) Classic Smoked proteins" },
  { id: "sm-3-premium", group: "Smoked · Alarm", name: "3 Alarm Premium Buffet", pricePerGuestCents: 2895, includes: "Rolls · (2) BBQ sauces · (1) A-Shift + (1) B-Shift side · (2) Classic + (1) Premium Smoked protein" },
];

/** ── SMOKE & FIRE EVENT PACKAGES · Beyond the Pit (per guest) ── */
export const SMOKE_FIRE_PACKAGES: PackageDef[] = [
  { id: "sf-smoke", group: "Smoke & Fire", name: "Smoke Package", pricePerGuestCents: 2895, includes: "Salad w/ bread & butter · (2) BBQ sauces · (2) sides · (1) Classic + (1) Premium Smoked protein" },
  { id: "sf-fire", group: "Smoke & Fire", name: "Fire Package", pricePerGuestCents: 3595, includes: "Salad w/ bread & butter · (2) BBQ sauces · (2) sides · (2) Classic + (1) Premium Smoked protein" },
  { id: "sf-blaze", group: "Smoke & Fire", name: "Blaze Package", pricePerGuestCents: 3895, includes: "(2) starter bites · Salad w/ bread & butter · (2) BBQ sauces · (2) sides · (1) Classic + (1) Premium Smoked protein" },
  { id: "sf-inferno", group: "Smoke & Fire", name: "Inferno Package", pricePerGuestCents: 4595, includes: "(3) starter bites · Salad w/ bread & butter · (2) BBQ sauces · (3) sides · (2) Classic + (1) Premium Smoked protein" },
];

/** ── BEYOND THE PIT PACKAGES (per guest) ── */
export const BEYOND_PIT_PACKAGES: PackageDef[] = [
  { id: "bp-1-classic", group: "Beyond the Pit", name: "1 Alarm Classic Sandwich Box", pricePerGuestCents: 2195, includes: "(1) A or B Shift side · (1) Classic selection" },
  { id: "bp-1-premium", group: "Beyond the Pit", name: "1 Alarm Premium Sandwich Box", pricePerGuestCents: 2495, includes: "(1) A or B Shift side · (1) Premium selection" },
  { id: "bp-2-classic", group: "Beyond the Pit", name: "2 Alarm Classic Buffet", pricePerGuestCents: 2395, includes: "Rolls w/ butter · (2) A or B Shift sides · (2) Classic selections" },
  { id: "bp-2-premium", group: "Beyond the Pit", name: "2 Alarm Premium Buffet", pricePerGuestCents: 2695, includes: "Rolls w/ butter · (2) A or B Shift sides · (1) Classic + (1) Premium selection" },
  { id: "bp-3-classic", group: "Beyond the Pit", name: "3 Alarm Classic Buffet", pricePerGuestCents: 3895, includes: "Rolls w/ butter · Salad · (2) Station Bites · (2) A or B Shift sides · (3) Classic selections" },
  { id: "bp-3-premium", group: "Beyond the Pit", name: "3 Alarm Premium Buffet", pricePerGuestCents: 4595, includes: "Rolls w/ butter · Salad · (3) Station Bites · (2) A or B Shift sides · (1) Starch · (2) Classic + (1) Premium selection" },
];

export const ALL_PACKAGES: PackageDef[] = [...SMOKED_ALARM_PACKAGES, ...SMOKE_FIRE_PACKAGES, ...BEYOND_PIT_PACKAGES];

/** Premium protein upgrade surcharges (per guest, per option). */
export const PREMIUM_UPGRADE_SMOKED_CENTS = 495;
export const PREMIUM_UPGRADE_BEYOND_PIT_CENTS = 595;

export const PROTEINS: ProteinDef[] = [
  // Smoked — Classics (included)
  { id: "p-pulled-pork", name: "Pulled Pork", tier: "classic", line: "smoked", description: "Tender hand-pulled pork with signature rub" },
  { id: "p-pulled-chicken", name: "Pulled Chicken", tier: "classic", line: "smoked", description: "Juicy, smoked chicken, hand-pulled" },
  { id: "p-bone-in-chicken", name: "Bone-In Chicken", tier: "classic", line: "smoked", description: "Perfectly smoked bone-in quarters" },
  { id: "p-sliced-turkey", name: "Sliced Turkey Breast", tier: "classic", line: "smoked", description: "Tender, juicy smoked turkey breast" },
  { id: "p-jal-sausage", name: "Jalapeño Cheddar Sausage", tier: "classic", line: "smoked", description: "Premium smoked sausage with a spicy kick" },
  // Smoked — Premium (+$4.95/pp/option)
  { id: "p-brisket", name: "Texas Style Brisket", tier: "premium", line: "smoked", description: "Slow-smoked 14 hours with signature rub" },
  { id: "p-burnt-ends", name: "Burnt Ends", tier: "premium", line: "smoked", description: "Prized ends of smoked brisket (buffets only, minimum order may apply)" },
  { id: "p-spare-ribs", name: "Spare Ribs", tier: "premium", line: "smoked", description: "Fall-off-the-bone tender with dry rub" },
  // Beyond the Pit — Classics (included)
  { id: "p-island-herb", name: "Island Herb Chicken", tier: "classic", line: "beyond_pit", description: "Marinated in Caribbean spices, grilled" },
  { id: "p-guava-roasted", name: "Guava Roasted Chicken", tier: "classic", line: "beyond_pit", description: "Guava tropical twist" },
  { id: "p-citrus-chicken", name: "Caribbean Citrus Chicken", tier: "classic", line: "beyond_pit", description: "Zesty garlic-citrus mojo sauce" },
  { id: "p-chicken-piccata", name: "Chicken Piccata", tier: "classic", line: "beyond_pit", description: "Pan-seared, lemon-butter sauce with capers & herbs" },
  { id: "p-mojo-pork", name: "Mojo Pork", tier: "classic", line: "beyond_pit", description: "Slow-roasted, classic Cuban mojo (garlic, citrus, herbs)" },
  { id: "p-roasted-turkey", name: "Sliced Turkey Breast", tier: "classic", line: "beyond_pit", description: "Slow-roasted, garlic & fresh herbs" },
  // Beyond the Pit — Premium (+$5.95/pp/option)
  { id: "p-guava-ribs", name: "Guava Glazed Spare Ribs", tier: "premium", line: "beyond_pit", description: "Fall-off-the-bone with sweet & tangy guava glaze" },
  { id: "p-beef-tenderloin", name: "Sliced Beef Tenderloin", tier: "premium", line: "beyond_pit", description: "Juicy, tender, sliced with au jus" },
  { id: "p-sirloin", name: "Sirloin Steak", tier: "premium", line: "beyond_pit", description: "Seasoned sirloin, medium, garlic herb sauce" },
  { id: "p-salmon", name: "Salmon", tier: "premium", line: "beyond_pit", description: "Oven roasted, lemon butter sauce" },
  { id: "p-shrimp", name: "Shrimp", tier: "premium", line: "beyond_pit", description: "Sautéed in butter garlic & herb blend" },
];

export const SIDES: SideDef[] = [
  { id: "s-apple-slaw", name: "Apple Coleslaw", shift: "A", description: "Crisp cabbage & fresh apple in creamy dressing" },
  { id: "s-smoked-mac", name: "Smoked Mac & Cheese", shift: "A", description: "Creamy blend with rich smoked cheese and breadcrumbs" },
  { id: "s-brisket-beans", name: "Brisket Baked Beans", shift: "A", description: "Slow-cooked with smoked brisket (contains pork)" },
  { id: "s-green-beans-almandine", name: "Green Beans Almandine", shift: "B", description: "Seasoned fresh green beans with almonds" },
  { id: "s-veg-medley", name: "Vegetable Medley", shift: "B", description: "Seasonal grilled vegetables" },
  { id: "s-broccoli-salad", name: "Broccoli Salad", shift: "B", description: "Fresh broccoli with craisins, sunflower seeds, red onions & creamy dressing" },
  { id: "s-collards", name: "Spicy Collard Greens", shift: "B", description: "Spicy, southern-style with bacon & smoked pork" },
  { id: "s-southern-green-beans", name: "Southern Style Green Beans", shift: "B", description: "Seasoned fresh green beans with bacon" },
  { id: "s-street-corn", name: "Mexican Street Corn", shift: "B", description: "Grilled corn off the cob, chili-lime sauce, cotija & cilantro" },
  { id: "s-mashed-potatoes", name: "Mashed Potatoes", shift: "B", description: "Homestyle mashed potatoes & gravy" },
  { id: "s-rice", name: "White or Yellow Rice", shift: "B" },
  { id: "s-beans", name: "Black or Red Beans", shift: "B" },
  { id: "s-loaded-potato-salad", name: "Loaded Potato Salad", shift: "B", description: "Smoked tallow-loaded potato salad" },
  { id: "s-cornbread-pudding", name: "Cornbread Pudding", shift: "B", description: "Sweet & savory southern classic" },
  { id: "s-macaroni-salad", name: "Macaroni Salad", shift: "B", description: "Chilled pasta salad with creamy dressing, crisp veggies & seasoning" },
  { id: "s-plantain-salad", name: "Plantain Salad", shift: "B", description: "Fried plantains with peppers, onions, cilantro & lime, topped with plantain chips" },
];

export const STARTER_BITES: BiteDef[] = [
  { id: "b-spring-rolls", name: "Mini Vegetable Spring Rolls", description: "With sweet chili sauce" },
  { id: "b-empanadas", name: "Mini Beef Empanadas", description: "With chimichurri aioli" },
  { id: "b-bruschetta", name: "Bruschetta", description: "Tomato & mozzarella on toasted baguette, balsamic glaze" },
  { id: "b-coconut-shrimp", name: "Coconut Shrimp Skewers", description: "With sweet chili sauce" },
  { id: "b-chicken-skewers", name: "Chicken Skewers", description: "With honey glaze" },
  { id: "b-caprese", name: "Caprese Skewers", description: "Drizzled with balsamic" },
  { id: "b-chicken-waffles", name: "Bite-Size Chicken & Waffles", description: "Fried chicken bites & belgian waffle squares, maple BBQ" },
  { id: "b-cubanitos", name: "Mini Cubanitos", description: "Award-winning Cuban sandwich bites with guava sauce" },
  { id: "b-pretzel-sliders", name: "Pretzel Sliders", description: "Choice of smoked pulled pork or chicken" },
  { id: "b-smoked-wings", name: "Smoked Wings", description: "House-smoked naked wings, choice of BBQ sauce" },
  { id: "b-sausage-bites", name: "Smoked Sausage Bites", description: "Jalapeño cheddar sausage with Eddie's House BBQ" },
  { id: "b-meatballs", name: "Smoked Meatballs", description: "All-beef meatballs with STATION 40 SPICY white sauce" },
  { id: "b-bbq-sliders", name: "BBQ Sliders", description: "Pulled pork or chicken (upgrade to brisket available)" },
  { id: "b-pork-belly", name: "Pork Belly Bites", description: "Guava glazed pork belly burnt ends" },
];

export const DESSERTS: PricedItem[] = [
  { id: "d-banana-pudding", name: "Banana Pudding", priceCents: 450, unit: "pp", note: "Classic southern style with vanilla wafers" },
  { id: "d-peach-cobbler", name: "Peach Cobbler", priceCents: 450, unit: "pp", note: "Warm spiced peaches with a buttery crust" },
  { id: "d-cookies", name: "Chocolate Chip Cookies", priceCents: 450, unit: "pp", note: "Fresh baked homestyle cookies" },
  { id: "d-brownies", name: "Brownies", priceCents: 450, unit: "pp", note: "Rich chocolate brownie" },
];

export const BEVERAGES: PricedItem[] = [
  { id: "bev-station", name: "Beverage Station (choose 2)", priceCents: 450, unit: "pp", note: "Unsweet Tea · Sweet Tea · Lemonade · Water" },
  { id: "bev-juice", name: "Juice Dispenser Station (choose 2)", priceCents: 550, unit: "pp", note: "Orange · Cranberry · Pineapple" },
  { id: "bev-coffee", name: "Coffee Station", priceCents: 650, unit: "pp", note: "Regular & Decaf, sugar, creamer, cups, stirrers" },
  { id: "bev-gallon", name: "Gallon (Tea / Lemonade)", priceCents: 899, unit: "gallon", note: "Deliveries & pickups" },
  { id: "bev-can", name: "Assorted Sodas / Water", priceCents: 299, unit: "each" },
];

/** ── STAFFING (full-service) ── */
export const STAFF_RATES: StaffRoleRate[] = [
  { id: "st-captain", role: "Banquet Captain", baseCents: 25000, minHours: 4, addlHourCents: 5000, note: "$250 (4-hr min); +$50/hr" },
  { id: "st-server", role: "Server / Staff", baseCents: 20000, minHours: 4, addlHourCents: 5000, note: "$200 (4-hr min); +$50/hr" },
  { id: "st-action", role: "Action Station Staff", baseCents: 27500, minHours: 0, addlHourCents: null, note: "$275 per station" },
];

export interface CateringFees {
  operationsFeePct: number; operationsFeeMinCents: number; gratuityFullServicePct: number;
  gratuityDeliveryPct: number; gratuityDeliveryMinCents: number; deliveryBaseCents: number;
  deliveryPerMileCents: number; deliveryRadiusMiles: number; boxedSurchargePerGuestCents: number;
  cakeCuttingPerGuestCents: number; sternoSetupCents: number; depositOver6moPct: number;
  depositWithin6moPct: number; depositWithin30daysPct: number; minGuestsBuffet: number;
  minGuestsBoxed: number; minGuestsBreakfast: number; planningNoticeDays: number; captainPerGuests: number;
}

/** ── FEES & RULES (editable) ── */
export const CATERING_FEES: CateringFees = {
  operationsFeePct: 12,            // full-service; applies at $3,500+ f&b minimum
  operationsFeeMinCents: 350000,   // $3,500 food/beverage minimum
  gratuityFullServicePct: 18,
  gratuityDeliveryPct: 5,
  gratuityDeliveryMinCents: 4000,  // $40 minimum
  deliveryBaseCents: 5000,         // $50 minimum
  deliveryPerMileCents: 200,       // + $2/mile
  deliveryRadiusMiles: 50,
  boxedSurchargePerGuestCents: 150,
  cakeCuttingPerGuestCents: 150,
  sternoSetupCents: 2000,          // wire rack + 2 sternos + water pan
  depositOver6moPct: 30,
  depositWithin6moPct: 50,
  depositWithin30daysPct: 100,
  minGuestsBuffet: 25,
  minGuestsBoxed: 10,
  minGuestsBreakfast: 30,
  planningNoticeDays: 25,
  captainPerGuests: 50,            // 1 captain + 1 server per 50 guests (non-negotiable)
};

/** ── À LA CARTE / TAILGATE ── */
export const ALA_CARTE: PricedItem[] = [
  { id: "ac-pork-lb", name: "Slow-Smoked Pulled Pork", priceCents: 1899, unit: "lb", note: "$9.99 / ½ lb" },
  { id: "ac-chicken-lb", name: "Smoked Pulled Chicken", priceCents: 1999, unit: "lb", note: "$9.99 / ½ lb" },
  { id: "ac-chicken-quarter", name: "Smoked Chicken Leg Quarter", priceCents: 599, unit: "each" },
  { id: "ac-sausage", name: "Jalapeño Cheddar Sausage", priceCents: 599, unit: "link" },
  { id: "ac-brisket-lb", name: "Slow-Smoked Brisket", priceCents: 3299, unit: "lb", note: "$16.99 / ½ lb" },
  { id: "ac-rib-rack", name: "Slow-Smoked Rib Rack", priceCents: 4299, unit: "rack", note: "$21.99 / ½ rack" },
  { id: "ac-side-half", name: "Classic Side — Half Pan", priceCents: 6000, unit: "half pan", note: "Feeds 15-20" },
  { id: "ac-side-full", name: "Classic Side — Full Pan", priceCents: 12000, unit: "full pan", note: "Feeds 20-30" },
  { id: "ac-side-pint", name: "Classic Side — Pint", priceCents: 1200, unit: "pint", note: "Feeds 3-4" },
  { id: "ac-sauce-pint", name: "BBQ Sauce Pint", priceCents: 999, unit: "pint", note: "Carolina Gold · Sweet Eddie's · Spicy Eddie's" },
  { id: "ac-sliders-18", name: "18-Pack Brioche Sliders", priceCents: 999, unit: "pack" },
  { id: "ac-cobbler-half", name: "Peach Cobbler — Half Pan", priceCents: 4500, unit: "half pan", note: "Full pan $90" },
  { id: "ac-pudding-half", name: "Banana Pudding — Half Pan", priceCents: 6000, unit: "half pan", note: "Full pan $120" },
  { id: "ac-cookie-tray", name: "Cookie Tray (10)", priceCents: 2500, unit: "tray" },
  { id: "ac-tailgate", name: "5-Alarm Tailgate Package", priceCents: 20999, unit: "package", note: "Feeds 8-12 · pork, brisket, rib rack, chicken quarters, sausage + 5 pints + sliders & sauces" },
];

/** ── BREAKFAST (30-guest minimum) ── */
export const BREAKFAST: PricedItem[] = [
  { id: "bk-display", name: "Assorted Breakfast Display", priceCents: 850, unit: "pp" },
  { id: "bk-burritos", name: "Assorted Breakfast Burritos", priceCents: 850, unit: "pp" },
  { id: "bk-fruit-sliced", name: "Seasonal Sliced Fruit Display", priceCents: 750, unit: "pp" },
  { id: "bk-fruit-whole", name: "Seasonal Whole Fruit Display", priceCents: 650, unit: "pp" },
  { id: "bk-station-1", name: "Breakfast Buffet Station #1", priceCents: 2395, unit: "pp", note: "Pastries, fruit, bacon/sausage, grits, scrambled eggs" },
  { id: "bk-station-2", name: "Breakfast Buffet Station #2", priceCents: 3000, unit: "pp", note: "Adds chicken & waffles with jalapeño bacon jam" },
  { id: "bk-station-3", name: "Breakfast Buffet Station #3", priceCents: 4400, unit: "pp", note: "Adds brisket over biscuits w/ gravy + beverage station" },
];

export interface CateringCatalog {
  packages: PackageDef[];
  proteins: ProteinDef[];
  sides: SideDef[];
  starterBites: BiteDef[];
  desserts: PricedItem[];
  beverages: PricedItem[];
  staffRates: StaffRoleRate[];
  alaCarte: PricedItem[];
  breakfast: PricedItem[];
  fees: CateringFees;
}

export const CATERING_CATALOG_DEFAULTS: CateringCatalog = {
  packages: ALL_PACKAGES,
  proteins: PROTEINS,
  sides: SIDES,
  starterBites: STARTER_BITES,
  desserts: DESSERTS,
  beverages: BEVERAGES,
  staffRates: STAFF_RATES,
  alaCarte: ALA_CARTE,
  breakfast: BREAKFAST,
  fees: CATERING_FEES,
};
