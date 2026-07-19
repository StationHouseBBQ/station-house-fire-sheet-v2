/**
 * Pit workspace static reference data — module-local knowledge base carried
 * over from the Manus reference (PROTEIN_KNOWLEDGE in pitmasterAgent.ts, the
 * SmokerForecast conversion tables, and the AI SYSTEM_PROMPT food-safety
 * rules). No DAL repo covers this reference layer, so it lives here as
 * realistic constants. Values match the Manus source verbatim where possible.
 */

// ── Smoker cook-hours + start times (from Manus DEFAULT_COOK_HOURS / DEFAULT_START_TIMES) ──
export const COOK_HOURS: Record<string, number> = {
  Brisket: 8, "Pork Butt": 8, Pork: 8, "Pulled Pork": 8, Ribs: 6, "Beef Ribs": 8,
  Chicken: 2, "Chicken Quarters": 2, "Pulled Chicken": 2, Sausage: 0.33,
  "Pork Belly": 6, "Pork Belly Burnt Ends": 1, Turkey: 6, Oxtail: 7,
  "Brisket (whole packer)": 8, "St. Louis Ribs": 6, "Oxtail (Tampa Diamonds)": 7,
};

export const START_TIMES: Record<string, string> = {
  Brisket: "06:00", "Pork Butt": "06:00", Pork: "06:00", "Pulled Pork": "06:00",
  Ribs: "06:00", "Beef Ribs": "06:00", "Pork Belly": "06:00", Turkey: "06:00",
  Chicken: "07:00", "Chicken Quarters": "07:00", "Pulled Chicken": "07:00",
  Sausage: "09:00", "Pork Belly Burnt Ends": "09:00", Oxtail: "05:00",
};

/** cook hours for a protein name, tolerant of exact + base names. Default 6h. */
export function cookHoursFor(protein: string): number {
  if (protein in COOK_HOURS) return COOK_HOURS[protein];
  const base = Object.keys(COOK_HOURS).find(k => protein.startsWith(k));
  return base ? COOK_HOURS[base] : 6;
}
export function startTimeFor(protein: string): string {
  if (protein in START_TIMES) return START_TIMES[protein];
  const base = Object.keys(START_TIMES).find(k => protein.startsWith(k));
  return base ? START_TIMES[base] : "06:00";
}

// ── Combi / trim / wrap / night-before flags (Manus PitDashboard) ──
const COMBI_MEATS = ["Brisket", "Pork Butt", "Pork", "Pulled Pork", "Pork Belly", "Oxtail"];
const NEEDS_TRIM = ["Brisket", "Pork Butt", "Pork", "Pulled Pork", "Pork Belly", "Beef Ribs", "Ribs", "Turkey"];
const SEASON_NIGHT_BEFORE = ["Brisket", "Pork Butt", "Pork", "Pulled Pork", "Pork Belly", "Beef Ribs", "Turkey"];
const GETS_WRAPPED = ["Brisket", "Pork Butt", "Pork", "Pulled Pork", "Pork Belly", "Beef Ribs", "Turkey", "Ribs"];
const startsWithAny = (name: string, list: string[]) => list.some(k => name.startsWith(k));
export const isCombi = (n: string) => startsWithAny(n, COMBI_MEATS);
export const needsTrim = (n: string) => startsWithAny(n, NEEDS_TRIM);
export const seasonNightBefore = (n: string) => startsWithAny(n, SEASON_NIGHT_BEFORE);
export const getsWrapped = (n: string) => startsWithAny(n, GETS_WRAPPED);

// ── Raw→units conversion factors (Manus DEFAULT_UNITS) ──
export interface UnitConfig { unit: string; lbsPerUnit: number; }
export const UNIT_CONFIG: Record<string, UnitConfig> = {
  Brisket: { unit: "each", lbsPerUnit: 7 },
  "Brisket (whole packer)": { unit: "each", lbsPerUnit: 7 },
  "Pork Butt": { unit: "each", lbsPerUnit: 6.5 },
  Pork: { unit: "each", lbsPerUnit: 6.5 },
  "Pulled Pork": { unit: "each", lbsPerUnit: 6.5 },
  Ribs: { unit: "rack", lbsPerUnit: 3.5 },
  "St. Louis Ribs": { unit: "rack", lbsPerUnit: 3.5 },
  Chicken: { unit: "case", lbsPerUnit: 40 },
  "Chicken Quarters": { unit: "pc", lbsPerUnit: 0.5 },
  "Pulled Chicken": { unit: "case", lbsPerUnit: 40 },
  Sausage: { unit: "lb", lbsPerUnit: 1 },
  "Smoked Sausage": { unit: "lb", lbsPerUnit: 1 },
  "Pork Belly": { unit: "each", lbsPerUnit: 5 },
  "Beef Ribs": { unit: "bone", lbsPerUnit: 1.5 },
  Oxtail: { unit: "lb", lbsPerUnit: 1 },
  "Oxtail (Tampa Diamonds)": { unit: "lb", lbsPerUnit: 1 },
};
export function unitConfigFor(protein: string): UnitConfig {
  if (protein in UNIT_CONFIG) return UNIT_CONFIG[protein];
  const base = Object.keys(UNIT_CONFIG).find(k => protein.startsWith(k));
  return base ? UNIT_CONFIG[base] : { unit: "lb", lbsPerUnit: 1 };
}
export function lbsToUnits(lbs: number, lbsPerUnit: number): number {
  return Math.ceil(lbs / Math.max(lbsPerUnit, 0.0001));
}
export function formatUnits(count: number, cfg: UnitConfig, protein: string): string {
  if (cfg.unit === "each") return `${count} ${protein.toLowerCase().split(" (")[0]}${count === 1 ? "" : "s"}`;
  return `${count} ${cfg.unit}${count === 1 ? "" : "s"}`;
}

// ── Canonical smoke guide (Manus PROTEIN_KNOWLEDGE) ──
export interface SmokeGuideRow {
  slug: string; name: string; emoji: string;
  smokerTemp: string; internalTemp: string; cookTime: string;
  yieldPct: number; wood: string; restTime: string; smoker: string; notes: string;
}
export const SMOKE_GUIDE: SmokeGuideRow[] = [
  { slug: "brisket", name: "Brisket", emoji: "🥩", smokerTemp: "225–250°F", internalTemp: "200–205°F", cookTime: "12–16 hours", yieldPct: 65, wood: "Post oak primary, small amount of pecan", restTime: "1–4 hours in Cambro", smoker: "Offset", notes: "Wrap in butcher paper at 165°F internal. Stall is normal at 155–165°F." },
  { slug: "pork-butt", name: "Pulled Pork", emoji: "🐷", smokerTemp: "225–250°F", internalTemp: "200–205°F", cookTime: "10–14 hours", yieldPct: 60, wood: "Apple + hickory mix", restTime: "30–60 min", smoker: "Offset", notes: "Pull when bone wiggles freely. Wrap at 165°F." },
  { slug: "ribs", name: "St. Louis Ribs", emoji: "🍖", smokerTemp: "225–250°F", internalTemp: "195–203°F", cookTime: "5–6 hours", yieldPct: 50, wood: "Cherry + hickory", restTime: "20–30 min", smoker: "Offset or Cabinet", notes: "3-2-1 method or unwrapped. Done when meat pulls back 1/4 inch from bone." },
  { slug: "chicken", name: "Chicken Quarters", emoji: "🍗", smokerTemp: "275–300°F", internalTemp: "165°F", cookTime: "2–3 hours", yieldPct: 70, wood: "Hickory", restTime: "10–15 min", smoker: "Cabinet", notes: "Higher temp for crispy skin. Baste with sauce last 30 min." },
  { slug: "sausage", name: "Smoked Sausage", emoji: "🌭", smokerTemp: "225–250°F", internalTemp: "165°F", cookTime: "1.5–2 hours", yieldPct: 85, wood: "Hickory or pecan", restTime: "5–10 min", smoker: "Cabinet", notes: "Watch for casing split — keep temp steady." },
  { slug: "turkey", name: "Turkey", emoji: "🦃", smokerTemp: "275–325°F", internalTemp: "165°F breast / 175°F thigh", cookTime: "4–6 hours (12–14 lb bird)", yieldPct: 55, wood: "Apple + cherry", restTime: "30–45 min", smoker: "Offset or Cabinet", notes: "Brine overnight. Spatchcock for even cooking." },
  { slug: "oxtail", name: "Oxtail (Tampa Diamonds)", emoji: "🔥", smokerTemp: "250°F", internalTemp: "205°F", cookTime: "6–8 hours", yieldPct: 45, wood: "Oak", restTime: "30 min", smoker: "Offset", notes: "Mojo marinade overnight. Braise covered with guava glaze to finish." },
];

// ── Food-safety cheat sheet (Manus AI SYSTEM_PROMPT operational rules) ──
export const SAFETY_RULES: Array<{ label: string; value: string; tone: "danger" | "warn" | "ok" }> = [
  { label: "Danger zone", value: "40°F–140°F · max 4 hours total", tone: "danger" },
  { label: "Hot-hold minimum", value: "135°F", tone: "warn" },
  { label: "Cooling rule", value: "140°→70°F within 2 hrs, →41°F within 6 hrs total", tone: "warn" },
  { label: "Cook buffer", value: "Always cook 10–15% extra", tone: "ok" },
  { label: "Quantity formula", value: "(guests × 6 oz) ÷ yield% = raw lbs, then +10%", tone: "ok" },
];

// ── Suggested pitmaster troubleshooting (Manus Ask-AI chips) ──
export const TROUBLESHOOTING: Array<{ q: string; a: string }> = [
  { q: "My brisket stalled at 155°F — what do I do?", a: "The stall is normal (155–165°F) from evaporative cooling. Wrap in butcher paper (Texas crutch) to push through, or hold steady and wait it out. Never raise pit temp above 275°F to force it." },
  { q: "What wood for pulled pork?", a: "Apple + hickory mix. Apple gives sweet mild smoke, hickory adds backbone. Keep a clean thin blue smoke — heavy white smoke makes it bitter." },
  { q: "How long to rest a 14 lb brisket?", a: "Rest 1–4 hours in a Cambro (holding at ≥140°F). Minimum 1 hour; longer holds only improve tenderness as juices redistribute." },
  { q: "How much brisket for 200 guests?", a: "200 guests × 6 oz = 1200 oz = 75 lbs cooked. At 65% yield: 75 ÷ 0.65 ≈ 116 raw lbs, +10% buffer ≈ 128 raw lbs (about 18 whole packers)." },
];

export const OZ_PER_PERSON = 6;
export const DAY_NAMES_FULL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Storage locations for smoked inventory (Manus SmokedInventory) ──
export const STORAGE_LOCATIONS = ["Walk-in Cooler", "Reach-in #1", "Reach-in #2", "Hot Hold"];

/** Cooked protein hold-time (hours) before use-by. Realistic house policy. */
export const HOLD_HOURS: Record<string, number> = {
  default: 96, "Hot Hold": 4,
};

export const SMOKERS = ["Ol' Smokey (offset)", "Rotisserie 1", "Cabinet 2"];

/** yield color thresholds (Manus: ≥65 green, ≥55 amber, <55 red) */
export function yieldTone(pct: number): "ok" | "warn" | "bad" {
  if (pct >= 65) return "ok";
  if (pct >= 55) return "warn";
  return "bad";
}

/** pit-temp badge tone vs target (Manus SmokerTempLog: ±10 green, over red, under orange) */
export function tempTone(temp: number, target: number): "ok" | "over" | "under" {
  const diff = temp - target;
  if (Math.abs(diff) <= 10) return "ok";
  return diff > 0 ? "over" : "under";
}
