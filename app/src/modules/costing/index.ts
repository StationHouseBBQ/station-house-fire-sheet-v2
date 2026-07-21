/**
 * Costing workspace — barrel. Three tabs matching the Manus food-cost pages,
 * layered on dal.settings for editable, persisted models:
 *   • FoodCostDashboard — per-plate cost vs price → food-cost % + margins   ("costing.plates")
 *   • BreakEven         — fixed costs + variable % + ticket → break-even    ("costing.breakeven")
 *   • RecipeCosting     — batch recipe cost, cost/portion, suggested price  ("costing.recipes")
 */
export { FoodCostDashboard } from "./FoodCostDashboard";
export { BreakEven } from "./BreakEven";
export { RecipeCosting } from "./RecipeCosting";
