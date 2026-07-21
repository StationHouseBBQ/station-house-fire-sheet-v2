/**
 * Costing workspace — seed data for a fresh demo. These are the DEFAULT values
 * passed to dal.settings.get, so a fresh install shows a populated, realistic
 * Station House BBQ costing model. Everything here is editable and persisted
 * back under the "costing.recipes" / "costing.breakeven" settings keys; the
 * dashboard plate seeds are module-local (own key) and equally editable.
 *
 * Money is integer cents everywhere. Ingredient/plate costs are the estimated
 * food cost of ONE served portion; menu prices mirror the live menu where a
 * comparable item exists (see src/dal/demo/menuData.ts).
 */

// ── Plate cost model (Food Cost Dashboard) ─────────────────────────────────
export interface CostingPlate {
  id: string;
  name: string;
  category: "Plate" | "Sandwich" | "Ribs" | "Thursday" | "Side" | "Dessert";
  /** Estimated food cost of one served portion, in cents. */
  plateCostCents: number;
  /** Menu / sell price of one portion, in cents. */
  menuPriceCents: number;
}

export const COSTING_PLATES_KEY = "costing.plates";

/** ~10 real Station House items with realistic plate costs vs menu prices. */
export const COSTING_PLATES_SEED: CostingPlate[] = [
  { id: "brisket-plate",   name: "Sliced Brisket Plate (½ lb + 2 sides)", category: "Plate",    plateCostCents: 640, menuPriceCents: 1850 },
  { id: "pulled-pork-sand", name: "Pulled Pork Sandwich",                  category: "Sandwich", plateCostCents: 210, menuPriceCents: 999 },
  { id: "rib-plate",       name: "St. Louis Rib Plate (½ rack + 2 sides)", category: "Ribs",     plateCostCents: 780, menuPriceCents: 2350 },
  { id: "burnt-ends",      name: "Burnt Ends (½ lb)",                      category: "Plate",    plateCostCents: 590, menuPriceCents: 1699 },
  { id: "turkey-plate",    name: "Smoked Turkey Plate (½ lb + 2 sides)",   category: "Plate",    plateCostCents: 470, menuPriceCents: 1650 },
  { id: "smokin-cuban",    name: "Smokin' Cuban",                          category: "Thursday", plateCostCents: 380, menuPriceCents: 1299 },
  { id: "brisket-cuban",   name: "Brisket Cuban",                          category: "Thursday", plateCostCents: 470, menuPriceCents: 1499 },
  { id: "mac-cheese",      name: "Mac & Cheese (side)",                    category: "Side",     plateCostCents: 95,  menuPriceCents: 449 },
  { id: "collard-greens",  name: "Collard Greens (side)",                  category: "Side",     plateCostCents: 70,  menuPriceCents: 399 },
  { id: "banana-pudding",  name: "Banana Pudding (cup)",                   category: "Dessert",  plateCostCents: 120, menuPriceCents: 499 },
];

// ── Break-even model ────────────────────────────────────────────────────────
export interface BreakEvenFixedCost {
  id: string;
  label: string;
  /** Monthly amount, in cents. */
  amountCents: number;
}
export interface BreakEvenModel {
  fixedCosts: BreakEvenFixedCost[];
  /** Variable (food + variable labor + card fees) as a % of each sales dollar. */
  variableCostPct: number;
  /** Average guest check, in cents. */
  averageTicketCents: number;
  /** Operating days per month, for covers/day math. */
  operatingDaysPerMonth: number;
}

export const COSTING_BREAKEVEN_KEY = "costing.breakeven";

export const BREAKEVEN_SEED: BreakEvenModel = {
  fixedCosts: [
    { id: "rent",      label: "Rent & CAM",            amountCents: 850000 },
    { id: "salaries",  label: "Salaried labor",        amountCents: 1200000 },
    { id: "insurance", label: "Insurance",             amountCents: 145000 },
    { id: "utilities", label: "Utilities",             amountCents: 210000 },
    { id: "marketing", label: "Marketing & software",  amountCents: 95000 },
    { id: "other",     label: "Other fixed (loan, fees)", amountCents: 180000 },
  ],
  variableCostPct: 42, // ~30% food + ~9% variable labor + ~3% card fees
  averageTicketCents: 2400,
  operatingDaysPerMonth: 26,
};

// ── Recipe costing model ─────────────────────────────────────────────────────
export type RecipeUnit = "lb" | "oz" | "each" | "cup" | "qt" | "gal" | "dozen";

export interface RecipeIngredient {
  id: string;
  name: string;
  qty: number;
  unit: RecipeUnit;
  /** Purchase cost of ONE `unit` of this ingredient, in cents. */
  unitCostCents: number;
  /** Raw → cooked yield %, 1..100. 100 = no cook loss (e.g. sauces, sides). */
  yieldPct: number;
}
export interface Recipe {
  id: string;
  name: string;
  /** Number of finished portions this batch yields. */
  portions: number;
  /** Target food-cost % used to suggest a sell price, 1..100. */
  targetFoodCostPct: number;
  ingredients: RecipeIngredient[];
}

export const COSTING_RECIPES_KEY = "costing.recipes";

export const RECIPES_SEED: Recipe[] = [
  {
    id: "recipe-brisket",
    name: "Smoked Brisket (batch)",
    portions: 24,
    targetFoodCostPct: 30,
    ingredients: [
      { id: "i1", name: "Whole packer brisket", qty: 14, unit: "lb",   unitCostCents: 549, yieldPct: 55 },
      { id: "i2", name: "Beef rub",             qty: 8,  unit: "oz",   unitCostCents: 45,  yieldPct: 100 },
      { id: "i3", name: "Post oak (wood)",      qty: 1,  unit: "each", unitCostCents: 400, yieldPct: 100 },
      { id: "i4", name: "Butcher paper",        qty: 1,  unit: "each", unitCostCents: 120, yieldPct: 100 },
    ],
  },
  {
    id: "recipe-mac",
    name: "Mac & Cheese (full pan)",
    portions: 20,
    targetFoodCostPct: 25,
    ingredients: [
      { id: "m1", name: "Elbow macaroni",  qty: 3,  unit: "lb",  unitCostCents: 149, yieldPct: 100 },
      { id: "m2", name: "Cheddar blend",   qty: 2,  unit: "lb",  unitCostCents: 549, yieldPct: 100 },
      { id: "m3", name: "Heavy cream",     qty: 1,  unit: "qt",  unitCostCents: 399, yieldPct: 100 },
      { id: "m4", name: "Butter",          qty: 8,  unit: "oz",  unitCostCents: 35,  yieldPct: 100 },
    ],
  },
];
