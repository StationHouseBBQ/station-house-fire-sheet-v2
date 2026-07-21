/**
 * Realistic BBQ demo seed data for the food-safety / ops kitchen tabs.
 * Timestamps are anchored to "today" via currentTime() so the demo always
 * shows fresh, same-day records regardless of the real calendar date.
 */
import { currentTime } from "../../../lib/clock";
import { uid } from "./opsState";
import type { HaccpEntry } from "../HaccpLog";
import type { WasteEntry } from "../FoodWasteLog";
import type { Cook } from "../FireLog";
import type { TaskCard } from "../KitchenTaskBoard";
import type { Seasoning } from "../SeasoningLibrary";

function atToday(hour: number, minute: number): string {
  const d = currentTime();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}
function daysAgo(n: number, hour: number, minute: number): string {
  const d = currentTime();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function seedHaccp(): HaccpEntry[] {
  return [
    { id: uid(), preset: "cold_hold", item: "Walk-In Cooler", tempF: 38, requiredMin: null, requiredMax: 41, result: "pass", correctiveAction: "", takenBy: "demo:kitchen", takenAt: atToday(7, 15) },
    { id: uid(), preset: "cold_hold", item: "Reach-In Cooler 1", tempF: 40, requiredMin: null, requiredMax: 41, result: "pass", correctiveAction: "", takenBy: "demo:kitchen", takenAt: atToday(7, 20) },
    { id: uid(), preset: "hot_hold", item: "Brisket (steam table)", tempF: 152, requiredMin: 135, requiredMax: null, result: "pass", correctiveAction: "", takenBy: "demo:kitchen", takenAt: atToday(11, 5) },
    { id: uid(), preset: "hot_hold", item: "Pulled Pork (steam table)", tempF: 128, requiredMin: 135, requiredMax: null, result: "fail", correctiveAction: "Reheated to 165°F, steam table thermostat bumped up.", takenBy: "demo:kitchen", takenAt: atToday(11, 8) },
    { id: uid(), preset: "cooking", item: "Chicken thighs", tempF: 172, requiredMin: 165, requiredMax: null, result: "pass", correctiveAction: "", takenBy: "demo:pit", takenAt: atToday(10, 40) },
    { id: uid(), preset: "cold_hold", item: "Walk-In Cooler", tempF: 37, requiredMin: null, requiredMax: 41, result: "pass", correctiveAction: "", takenBy: "demo:kitchen", takenAt: daysAgo(1, 7, 30) },
    { id: uid(), preset: "cooling", item: "Baked Beans (2hr)", tempF: 64, requiredMin: null, requiredMax: 70, result: "pass", correctiveAction: "", takenBy: "demo:kitchen", takenAt: daysAgo(1, 15, 0) },
  ];
}

export function seedWaste(): WasteEntry[] {
  return [
    { id: uid(), item: "Brisket (raw)", qty: 6, unit: "lbs", costPerUnit: 8, reason: "overcooked", preventable: "yes", notes: "Fat cap rendered too far on point end.", loggedBy: "demo:pit", loggedAt: atToday(13, 10) },
    { id: uid(), item: "Coleslaw", qty: 0.5, unit: "pans", costPerUnit: 30, reason: "held_too_long", preventable: "maybe", notes: "", loggedBy: "demo:kitchen", loggedAt: atToday(20, 30) },
    { id: uid(), item: "Cornbread", qty: 12, unit: "pieces", costPerUnit: 1.5, reason: "overproduction", preventable: "yes", notes: "Made two extra pans for a slow Tuesday.", loggedBy: "demo:kitchen", loggedAt: atToday(21, 0) },
    { id: uid(), item: "Chicken (raw)", qty: 3, unit: "lbs", costPerUnit: 3, reason: "spoiled", preventable: "no", notes: "Delivery temp abuse — vendor credit requested.", loggedBy: "demo:kitchen", loggedAt: daysAgo(1, 9, 45) },
    { id: uid(), item: "Mac & Cheese", qty: 0.25, unit: "pans", costPerUnit: 45, reason: "accident", preventable: "yes", notes: "Dropped pan during transfer.", loggedBy: "demo:kitchen", loggedAt: daysAgo(2, 18, 20) },
  ];
}

export function seedCooks(): Cook[] {
  return [
    {
      id: uid(),
      smoker: "Offset #1",
      protein: "Brisket",
      targetTempF: 225,
      startedAt: atToday(4, 30),
      finishedAt: null,
      readings: [
        { id: uid(), pitTempF: 232, actualTempF: 96, woodAdded: "Post oak split", note: "Wrapped when bark set.", takenBy: "demo:pit", takenAt: atToday(4, 35) },
        { id: uid(), pitTempF: 221, actualTempF: 148, woodAdded: "", note: "Stall.", takenBy: "demo:pit", takenAt: atToday(8, 15) },
        { id: uid(), pitTempF: 240, actualTempF: 168, woodAdded: "Post oak split", note: "Foil boat.", takenBy: "demo:pit", takenAt: atToday(10, 5) },
      ],
    },
    {
      id: uid(),
      smoker: "Pellet #2",
      protein: "Pork Butt",
      targetTempF: 250,
      startedAt: daysAgo(1, 5, 0),
      finishedAt: daysAgo(1, 17, 30),
      readings: [
        { id: uid(), pitTempF: 251, actualTempF: 88, woodAdded: "Hickory pellets", note: "", takenBy: "demo:pit", takenAt: daysAgo(1, 5, 10) },
        { id: uid(), pitTempF: 248, actualTempF: 203, woodAdded: "", note: "Probe tender — pulled to rest.", takenBy: "demo:pit", takenAt: daysAgo(1, 17, 25) },
      ],
    },
  ];
}

export function seedTasks(): TaskCard[] {
  return [
    { id: uid(), title: "Trim & season 6 briskets", status: "done", assignee: "Marcus", priority: "high", createdAt: atToday(4, 0), movedAt: atToday(5, 30) },
    { id: uid(), title: "Restock sauce line", status: "in_progress", assignee: "Dana", priority: "med", createdAt: atToday(9, 0), movedAt: atToday(10, 0) },
    { id: uid(), title: "Pull & portion pork for lunch", status: "in_progress", assignee: "Marcus", priority: "high", createdAt: atToday(9, 30), movedAt: atToday(10, 15) },
    { id: uid(), title: "Deep clean slicer", status: "todo", assignee: "Unassigned", priority: "med", createdAt: atToday(8, 0), movedAt: atToday(8, 0) },
    { id: uid(), title: "Break down & sanitize walk-in shelving", status: "todo", assignee: "Dana", priority: "low", createdAt: atToday(8, 5), movedAt: atToday(8, 5) },
    { id: uid(), title: "Prep coleslaw for weekend", status: "todo", assignee: "Unassigned", priority: "med", createdAt: atToday(8, 10), movedAt: atToday(8, 10) },
  ];
}

export function seedSeasonings(): Seasoning[] {
  return [
    {
      id: uid(),
      name: "Station House Brisket Rub",
      meatType: "brisket",
      description: "Coarse Texas-style pepper-forward rub. Post oak partner.",
      batchQty: 4,
      batchUnit: "cups",
      binder: "Yellow mustard",
      timing: "Season night before, let tack up in fridge",
      restTime: "Overnight (12 hr)",
      ingredients: [
        { id: uid(), name: "16-mesh black pepper", qty: 2, unit: "cups" },
        { id: uid(), name: "Kosher salt", qty: 1.5, unit: "cups" },
        { id: uid(), name: "Granulated garlic", qty: 0.25, unit: "cups" },
        { id: uid(), name: "Paprika", qty: 0.25, unit: "cups" },
      ],
    },
    {
      id: uid(),
      name: "Sweet Heat Pork Rub",
      meatType: "pork",
      description: "Sweet base with a chili kick for butts and ribs.",
      batchQty: 5,
      batchUnit: "cups",
      binder: "Olive oil",
      timing: "30 min before smoker",
      restTime: "None",
      ingredients: [
        { id: uid(), name: "Brown sugar", qty: 2, unit: "cups" },
        { id: uid(), name: "Paprika", qty: 1, unit: "cups" },
        { id: uid(), name: "Kosher salt", qty: 0.75, unit: "cups" },
        { id: uid(), name: "Chili powder", qty: 0.5, unit: "cups" },
        { id: uid(), name: "Granulated garlic", qty: 0.25, unit: "cups" },
        { id: uid(), name: "Cayenne", qty: 2, unit: "tbsp" },
      ],
    },
    {
      id: uid(),
      name: "Poultry Rub",
      meatType: "chicken",
      description: "Balanced savory rub that crisps skin without burning.",
      batchQty: 3,
      batchUnit: "cups",
      binder: "None (dry)",
      timing: "Right before smoker",
      restTime: "None",
      ingredients: [
        { id: uid(), name: "Kosher salt", qty: 1, unit: "cups" },
        { id: uid(), name: "Granulated garlic", qty: 0.5, unit: "cups" },
        { id: uid(), name: "Onion powder", qty: 0.5, unit: "cups" },
        { id: uid(), name: "Smoked paprika", qty: 0.5, unit: "cups" },
        { id: uid(), name: "Black pepper", qty: 0.5, unit: "cups" },
      ],
    },
  ];
}
