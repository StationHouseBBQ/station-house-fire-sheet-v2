/**
 * Manus route parity: every legacy path resolves to its V2 destination.
 * Generated from the source route table (247 routes) — aliases map legacy
 * standalone pages onto the V2 workspace tabs that absorbed them.
 */
export const ROUTE_ALIASES: Record<string, string> = {
  // home & auth
  "/home": "/", "/login": "/", "/team-login": "/",
  // workspaces
  "/kitchen-workspace": "/kitchen", "/retail-workspace": "/seminole", "/pit-workspace": "/pit",
  "/sales-workspace": "/catering", "/marketing-workspace": "/marketing", "/admin-workspace": "/admin",
  "/catering-hub": "/catering/cockpit", "/dashboard": "/catering/cockpit", "/dashboard/legacy": "/catering/cockpit",
  // kitchen legacy
  "/board": "/kitchen/fire-sheets", "/production": "/kitchen/fire-sheets", "/weekly-board": "/kitchen/weekly",
  "/kitchen/expo": "/kitchen/expo", "/kitchen/command": "/kitchen/fire-sheets", "/kitchen/checklist": "/kitchen/morning-checklist",
  "/kitchen/recipes": "/kitchen/prep-recipes", "/kitchen/prep": "/kitchen/prep", "/kitchen/prep-board": "/kitchen/prep",
  "/kitchen/prep-list": "/kitchen/prep", "/kitchen/forecast": "/pit/forecast", "/kitchen/pitmaster": "/pit/guide",
  "/kitchen/pitmaster-ai": "/pit/guide", "/kitchen/order-guide": "/admin/order-guide-setup",
  "/kitchen/seminole-order-guide": "/admin/order-guide-setup", "/kitchen/weekly-board": "/kitchen/weekly",
  "/kitchen/inventory": "/packing/inventory", "/kitchen/inventory-board": "/packing/inventory",
  "/kitchen/food-temp": "/seminole/temp-log", "/kitchen/haccp": "/seminole/temp-log",
  "/kitchen/tasks": "/kitchen/prep", "/history": "/kitchen/order-history", "/calculator": "/kitchen/calculator",
  "/master-prep-engine": "/kitchen/prep", "/master-prep-engine/admin": "/admin/prep-master",
  "/admin/prep-template": "/admin/prep-master",
  // pit
  "/pit/meat-cost": "/pit/cost", "/pit/dashboard": "/pit/dashboard",
  // retail legacy
  "/retail": "/seminole", "/retail/fire-sheet": "/seminole/fire-sheet", "/retail/dashboard": "/seminole/dashboard",
  "/retail/weekly-par": "/seminole/fire-sheet", "/retail/weekly-board": "/seminole/dashboard",
  "/retail/checklist": "/seminole/checklist", "/retail/preorders": "/seminole/preorders",
  "/retail/fire-drop-admin": "/seminole/fire-drop",
  // packing & delivery
  "/packing": "/packing/queue", "/packing/legacy": "/packing/queue", "/packing/dashboard": "/packing/dashboard",
  "/packing-sheets": "/packing/board", "/kitchen/packing": "/packing/queue",
  "/delivery": "/packing/deliveries", "/driver": "/packing/deliveries", "/handoff": "/packing/queue",
  "/handoff/drivers": "/packing/deliveries", "/packing/inventory": "/packing/inventory",
  "/packing/supply-forecast": "/packing/forecast",
  // catering / sales / crm / coordinator / finance
  "/crm": "/catering/cockpit", "/crm/leads": "/catering/pipeline", "/crm/pipeline": "/catering/pipeline",
  "/crm/contacts": "/catering/contacts", "/crm/opportunities": "/catering/pipeline", "/crm/events": "/catering/calendar",
  "/crm/tasks": "/catering/cockpit", "/crm/settings": "/admin/brand-setup", "/crm/social": "/marketing/calendar",
  "/crm/automations": "/marketing/outreach", "/crm/messaging": "/marketing/outreach", "/crm/conversations": "/marketing/outreach",
  "/crm/marketing": "/marketing/command", "/crm/marketing/playbook": "/marketing/command",
  "/coordinator/calendar": "/catering/calendar", "/coordinator/leads": "/catering/pipeline",
  "/coordinator/quotes": "/catering/quotes", "/coordinator/invoices": "/catering/quotes",
  "/coordinator/packing": "/packing/queue", "/coordinator/clients": "/catering/contacts",
  "/coordinator/venues": "/catering/venues",
  "/sales/agent": "/catering/cockpit", "/sales/lead-command": "/catering/pipeline",
  "/sales/lead-intake": "/catering/intake", "/catering/lead-intake": "/catering/intake",
  "/sales/lead-dashboard": "/catering/pipeline", "/catering/lead-dashboard": "/catering/pipeline",
  "/sales/client-portal-admin": "/catering/portal", "/sales/calendar": "/catering/calendar",
  "/master-calendar": "/catering/calendar", "/sales/quotes": "/catering/quotes", "/sales/contacts": "/catering/contacts",
  "/sales/venues": "/catering/venues", "/sales/red-zone": "/catering/red-zone", "/sales/follow-up": "/catering/pipeline",
  "/catering/quotes": "/catering/quotes", "/catering/weekly-board": "/kitchen/weekly",
  "/finance": "/catering/quotes", "/finance/quotes": "/catering/quotes", "/finance/invoices": "/catering/quotes",
  "/finance/customers": "/catering/contacts", "/invoice-builder": "/catering/quotes",
  "/admin/catering-inquiries": "/catering/pipeline", "/expedite": "/packing/queue",
  // marketing
  "/marketing": "/marketing/command", "/marketing/content": "/marketing/content-agent",
  "/marketing/content-calendar": "/marketing/calendar", "/marketing/media-library": "/marketing/media",
  "/marketing/video-studio": "/marketing/video", "/marketing/design-agent": "/marketing/design",
  "/marketing/outreach": "/marketing/outreach", "/marketing/performance": "/marketing/performance",
  "/marketing/leads": "/marketing/leads", "/marketing/ads": "/marketing/ads",
  "/marketing/attribution": "/marketing/leads", "/ad-creation": "/marketing/ads",
  // admin
  "/admin": "/admin/users", "/admin/menu": "/admin/menu", "/admin/walk-in-sampler": "/admin/walk-in-sampler",
  "/admin/users": "/admin/users", "/admin/team": "/admin/team", "/admin/online-orders": "/seminole/preorders",
  "/admin/express-menu": "/admin/express-menu", "/admin/discount-codes": "/admin/discounts",
  "/admin/events": "/admin/events", "/admin/brand-setup": "/admin/brand-setup",
  "/admin/brand-studio": "/admin/brand-studio", "/admin/licensing": "/admin/license",
  "/admin/preorder-inventory": "/admin/preorder-inventory", "/admin/ai-import": "/admin/ai-import",
  // public
  "/catering-landing": "/catering", "/catering-request": "/catering-request",
  "/order-tracker": "/track", "/client-portal": "/portal", "/portal/sign-in": "/portal",
  "/portal/order": "/portal", "/portal/account": "/portal",
  "/cuban-thursday/confirmation": "/cuban-thursday/confirmation",
  "/fire-drop/confirmation": "/fire-drop/confirmation",
  "/july4-drop": "/july4", "/weekend-preorder": "/fire-drop", "/weekend-preorders": "/fire-drop", "/catering-drop": "/fire-drop", "/app": "/fire-drop", "/shop": "/fire-drop",
  "/order": "/express", "/app/order": "/express",
};
