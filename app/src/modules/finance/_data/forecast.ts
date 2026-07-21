/**
 * Finance · Forecast assumptions. Persisted through dal.settings under
 * FINANCE_FORECAST_KEY. Projected revenue combines booked/upcoming catering
 * orders (real data) with a weighted expectation on outstanding quotes using
 * the editable close rate below.
 */
export const FINANCE_FORECAST_KEY = "finance.forecast";

export interface ForecastAssumptions {
  /** Expected close rate on outstanding quotes, 0..100 (percent). */
  quoteCloseRatePct: number;
  /** Baseline monthly retail + walk-in revenue in integer cents, added to each month. */
  baselineMonthlyCents: number;
  /** Months to project forward (including the current month). */
  horizonMonths: number;
}

export const DEFAULT_FORECAST: ForecastAssumptions = {
  quoteCloseRatePct: 40,
  baselineMonthlyCents: 1_800_000, // $18,000 baseline non-catering revenue
  horizonMonths: 6,
};
