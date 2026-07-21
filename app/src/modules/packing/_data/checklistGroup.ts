/**
 * Module-local checklist categorisation for the Packing Queue.
 * The Manus packing checklist groups items by protein / side / sauce /
 * equipment / marketing / other. The shared PackItem carries only a label,
 * so we infer a category from the label text for presentation grouping.
 */
export type ChecklistCategory = "protein" | "side" | "sauce" | "equipment" | "marketing" | "other";

export const CHECKLIST_CATEGORY_ORDER: ChecklistCategory[] = ["protein", "side", "sauce", "equipment", "marketing", "other"];

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  protein: "Proteins",
  side: "Sides & Desserts",
  sauce: "Sauces",
  equipment: "Equipment & Packaging",
  marketing: "Marketing & Docs",
  other: "Other",
};

export function categorizeChecklistItem(label: string): ChecklistCategory {
  const n = label.toLowerCase();
  if (/brisket|pork|rib|chicken|turkey|sausage|meat|protein|pulled|smoked/.test(n)) return "protein";
  if (/slaw|bean|mac|corn|green|potato|side|dessert|pudding|cobbler|bread|roll|salad/.test(n)) return "side";
  if (/sauce|rub|dressing|vinegar|mustard|bbq/.test(n)) return "sauce";
  if (/pan|lid|sterno|chafer|utensil|plate|cup|bag|box|napkin|tray|rack|equipment|serving/.test(n)) return "equipment";
  if (/menu|card|flyer|label|receipt|invoice|sign|marketing|business/.test(n)) return "marketing";
  return "other";
}
