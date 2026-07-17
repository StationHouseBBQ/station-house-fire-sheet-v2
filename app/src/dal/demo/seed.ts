import type { PrepSession } from "../types";

/**
 * Seeded demo data mirroring the Manus prep-board shapes. Demo mode remains
 * the default until production data migration is approved by the owner.
 * Menu truths respected: Cubans / Brisket Smash Burgers are Thursday-only
 * and therefore appear on prep only for Thursday service dates.
 */
export function seedPrepSession(serviceDate: string, isThursday: boolean): PrepSession {
  const base = [
    { name: "Pulled Pork", category: "meats", unit: "pans", parQty: 6 },
    { name: "Brisket (sliced)", category: "meats", unit: "pans", parQty: 4 },
    { name: "Smoked Sausage", category: "meats", unit: "each", parQty: 40 },
    { name: "St. Louis Ribs", category: "meats", unit: "racks", parQty: 12 },
    { name: "Chicken Quarters", category: "meats", unit: "each", parQty: 24 },
    { name: "House BBQ Sauce", category: "sauces", unit: "quarts", parQty: 8 },
    { name: "Alabama White", category: "sauces", unit: "quarts", parQty: 3 },
    { name: "Guava Glaze", category: "sauces", unit: "pints", parQty: 4 },
    { name: "Mac & Cheese", category: "sides", unit: "pans", parQty: 5 },
    { name: "Collard Greens", category: "sides", unit: "pans", parQty: 3 },
    { name: "Smoked Corn Casserole", category: "sides", unit: "pans", parQty: 2 },
    { name: "Coleslaw", category: "sides", unit: "quarts", parQty: 10 },
    { name: "Banana Pudding", category: "desserts", unit: "each", parQty: 24 },
    { name: "Retail Rub Jars", category: "retail_prep", unit: "each", parQty: 12 },
  ] as const;
  const thursdayOnly = [
    { name: "Cuban Roast Pork (mojo)", category: "meats", unit: "pans", parQty: 3 },
    { name: "Cuban Bread Order", category: "misc", unit: "loaves", parQty: 30 },
    { name: "Smash Burger Patties", category: "meats", unit: "each", parQty: 60 },
  ] as const;
  const rows = [...base, ...(isThursday ? thursdayOnly : [])];
  const now = new Date().toISOString();
  return {
    id: `demo-session-${serviceDate}`,
    serviceDate,
    generatedAt: now,
    generatedBy: "demo-admin",
    entries: rows.map((r, i) => ({
      id: `demo-entry-${serviceDate}-${i}`,
      sessionId: `demo-session-${serviceDate}`,
      name: r.name,
      category: r.category,
      unit: r.unit,
      parQty: r.parQty,
      onHandQty: null,
      prepQty: r.parQty,
      status: "not_started" as const,
      notes: null,
      updatedAt: now,
      updatedBy: "demo-admin",
    })),
  };
}
