// GENERATED from the Manus source snapshot — single source of truth for workspace navigation.
// Regenerate with scripts/gen-nav.mjs against the source zip. Do not hand-edit tab ids.
export type RoleId = "owner_admin" | "catering_director" | "kitchen" | "counter_foh" | "packing";

export interface TabDef {
  id: string;
  label: string;
  /** Row number in docs/PARITY_MATRIX.md */
  parityRow: number;
  /** Component name in the Manus source (parity reference) */
  sourceComponent: string;
  sourceFile: string | null;
  /** Set when the V2 implementation lands */
  implemented?: boolean;
}

export interface WorkspaceDef {
  id: string;
  label: string;
  base: string;
  roles: RoleId[];
  tabs: TabDef[];
}

const R = {
  all: ["owner_admin", "catering_director", "kitchen", "counter_foh", "packing"] as RoleId[],
  admin: ["owner_admin"] as RoleId[],
  kitchenOps: ["owner_admin", "kitchen"] as RoleId[],
  foh: ["owner_admin", "counter_foh"] as RoleId[],
  cat: ["owner_admin", "catering_director"] as RoleId[],
  pack: ["owner_admin", "kitchen", "packing"] as RoleId[],
};

export const WORKSPACES: WorkspaceDef[] = [
  {
    id: "kitchen", label: "Kitchen", base: "/kitchen", roles: R.kitchenOps,
    tabs: [
      { implemented: true, id: "weekly", label: "Weekly Board", parityRow: 1, sourceComponent: "WeeklyMasterBoard", sourceFile: "client/src/pages/WeeklyMasterBoard.tsx" },
      { implemented: true, id: "fire-sheets", label: "Fire Sheets", parityRow: 2, sourceComponent: "ProductionBoard", sourceFile: "client/src/pages/ProductionBoard.tsx" },
      { implemented: true, id: "calendar", label: "Calendar", parityRow: 3, sourceComponent: "MasterCalendarPage", sourceFile: "client/src/pages/MasterCalendarPage.tsx" },
      { implemented: true, id: "expo", label: "Expo KDS", parityRow: 4, sourceComponent: "ExpoKDS", sourceFile: "client/src/pages/ExpoKDS.tsx" },
      { implemented: true, id: "calculator", label: "Meat Calc", parityRow: 5, sourceComponent: "MeatCalculator", sourceFile: "client/src/pages/MeatCalculator.tsx" },
      { implemented: true, id: "prep", label: "Prep", parityRow: 6, sourceComponent: "DynamicPrepBoard", sourceFile: "client/src/pages/DynamicPrepBoard.tsx" },
      { implemented: true, id: "order-history", label: "Order History", parityRow: 7, sourceComponent: "KitchenOrderHistory", sourceFile: "client/src/pages/KitchenOrderHistory.tsx" },
      { implemented: true, id: "morning-checklist", label: "Morning Checklist", parityRow: 8, sourceComponent: "KitchenChecklist", sourceFile: "client/src/pages/KitchenChecklist.tsx" },
      { implemented: true, id: "prep-recipes", label: "Prep Recipes", parityRow: 9, sourceComponent: "PrepRecipeAdmin", sourceFile: "client/src/pages/PrepRecipeAdmin.tsx" },
      { implemented: true, id: "haccp", label: "HACCP Log", parityRow: 91, sourceComponent: "HACCPLog", sourceFile: "client/src/pages/HACCPLog.tsx" },
      { implemented: true, id: "waste", label: "Waste Log", parityRow: 92, sourceComponent: "FoodWasteLog", sourceFile: "client/src/pages/FoodWasteLog.tsx" },
      { implemented: true, id: "fire-log", label: "Fire Log", parityRow: 93, sourceComponent: "FireLog", sourceFile: "client/src/pages/FireLog.tsx" },
      { implemented: true, id: "task-board", label: "Task Board", parityRow: 94, sourceComponent: "KitchenTaskBoard", sourceFile: "client/src/pages/KitchenTaskBoard.tsx" },
      { implemented: true, id: "seasonings", label: "Seasoning Library", parityRow: 95, sourceComponent: "SeasoningLibrary", sourceFile: "client/src/pages/SeasoningLibrary.tsx" },
    ],
  },
  {
    id: "seminole", label: "Seminole Heights", base: "/seminole", roles: R.foh,
    tabs: [
      { implemented: true, id: "dashboard", label: "Dashboard", parityRow: 10, sourceComponent: "RetailDashboard", sourceFile: "client/src/pages/RetailDashboard.tsx" },
      { implemented: true, id: "fire-sheet", label: "Fire Sheet", parityRow: 11, sourceComponent: "RetailFireSheet", sourceFile: "client/src/pages/RetailFireSheet.tsx" },
      { implemented: true, id: "kds", label: "KDS", parityRow: 12, sourceComponent: "SeminoleKDS", sourceFile: "client/src/pages/SeminoleKDS.tsx" },
      { implemented: true, id: "preorders", label: "Preorders", parityRow: 13, sourceComponent: "RetailPreorders", sourceFile: "client/src/pages/RetailPreorders.tsx" },
      { implemented: true, id: "checklist", label: "FOH Checklist", parityRow: 14, sourceComponent: "RetailChecklist", sourceFile: "client/src/pages/RetailChecklist.tsx" },
      { implemented: true, id: "temp-log", label: "Temp Log", parityRow: 15, sourceComponent: "FoodTempLog", sourceFile: "client/src/pages/FoodTempLog.tsx" },
      { implemented: true, id: "fire-drop", label: "Weekend Pre-Order Setup", parityRow: 16, sourceComponent: "FireDropAdmin", sourceFile: "client/src/pages/FireDropAdmin.tsx" },
    ],
  },
  {
    id: "pit", label: "Pit", base: "/pit", roles: R.kitchenOps,
    tabs: [
      { implemented: true, id: "dashboard", label: "Pit Dashboard", parityRow: 17, sourceComponent: "PitDashboard", sourceFile: "client/src/pages/PitDashboard.tsx" },
      { implemented: true, id: "inventory", label: "Smoked Inventory", parityRow: 18, sourceComponent: "SmokedInventory", sourceFile: "client/src/pages/SmokedInventory.tsx" },
      { implemented: true, id: "forecast", label: "Smoker Forecast", parityRow: 19, sourceComponent: "SmokerForecast", sourceFile: "client/src/pages/SmokerForecast.tsx" },
      { implemented: true, id: "guide", label: "Pitmaster Guide", parityRow: 20, sourceComponent: "PitmasterGuide", sourceFile: "client/src/pages/PitmasterGuide.tsx" },
      { implemented: true, id: "cost", label: "Meat Cost Guide", parityRow: 21, sourceComponent: "PitMeatCostGuide", sourceFile: "client/src/pages/PitMeatCostGuide.tsx" },
    ],
  },
  {
    id: "packing", label: "Packing", base: "/packing", roles: R.pack,
    tabs: [
      { implemented: true, id: "queue", label: "Pack Queue", parityRow: 22, sourceComponent: "PackingQueue", sourceFile: "client/src/pages/PackingQueue.tsx" },
      { implemented: true, id: "board", label: "Packing Board", parityRow: 23, sourceComponent: "PackingBoard", sourceFile: "client/src/pages/PackingBoard.tsx" },
      { implemented: true, id: "expo", label: "Expo View", parityRow: 24, sourceComponent: "ExpoKDS", sourceFile: "client/src/pages/ExpoKDS.tsx" },
      { implemented: true, id: "deliveries", label: "Deliveries", parityRow: 25, sourceComponent: "DeliveriesTab", sourceFile: "client/src/pages/DeliveriesTab.tsx" },
      { implemented: true, id: "dashboard", label: "Dashboard", parityRow: 26, sourceComponent: "PackingStationDashboard", sourceFile: "client/src/pages/PackingStationDashboard.tsx" },
      { implemented: true, id: "inventory", label: "Inventory", parityRow: 27, sourceComponent: "PackingInventory", sourceFile: "client/src/pages/PackingInventory.tsx" },
      { implemented: true, id: "forecast", label: "Supply Forecast", parityRow: 28, sourceComponent: "SupplyForecast", sourceFile: "client/src/pages/SupplyForecast.tsx" },
    ],
  },
  {
    id: "catering", label: "Catering / Sales", base: "/catering", roles: R.cat,
    tabs: [
      { implemented: true, id: "cockpit", label: "Director Cockpit", parityRow: 29, sourceComponent: "DirectorCockpit", sourceFile: "client/src/pages/catering/DirectorCockpit.tsx" },
      { implemented: true, id: "pipeline", label: "Leads Pipeline", parityRow: 30, sourceComponent: "CateringLeadPipeline", sourceFile: "client/src/pages/catering/CateringLeadPipeline.tsx" },
      { implemented: true, id: "intake", label: "Lead Intake", parityRow: 31, sourceComponent: "LeadIntakeForm", sourceFile: "client/src/pages/LeadIntakeForm.tsx" },
      { implemented: true, id: "calendar", label: "Calendar", parityRow: 32, sourceComponent: "SalesCalendar", sourceFile: "client/src/pages/sales/SalesCalendar.tsx" },
      { implemented: true, id: "quotes", label: "Quotes & Invoices", parityRow: 33, sourceComponent: "CateringQuoteBuilder", sourceFile: "client/src/pages/CateringQuoteBuilder.tsx" },
      { implemented: true, id: "contacts", label: "Contacts", parityRow: 34, sourceComponent: "SalesContacts", sourceFile: "client/src/pages/sales/SalesContacts.tsx" },
      { implemented: true, id: "venues", label: "Venue Library", parityRow: 35, sourceComponent: "SalesVenues", sourceFile: "client/src/pages/sales/SalesVenues.tsx" },
      { implemented: true, id: "red-zone", label: "Red Zone", parityRow: 36, sourceComponent: "RedZone", sourceFile: "client/src/pages/sales/RedZone.tsx" },
      { implemented: true, id: "approval", label: "Approval Queue", parityRow: 37, sourceComponent: "ApprovalQueue", sourceFile: "client/src/pages/catering/ApprovalQueue.tsx" },
      { implemented: true, id: "portal", label: "Client Portal Admin", parityRow: 38, sourceComponent: "ClientPortalAdmin", sourceFile: "client/src/pages/ClientPortalAdmin.tsx" },
      { implemented: true, id: "equipment", label: "Equipment Catalog", parityRow: 39, sourceComponent: "EquipmentCatalog", sourceFile: "client/src/pages/catering/EquipmentCatalog.tsx" },
      { implemented: true, id: "companies", label: "Companies", parityRow: 40, sourceComponent: "CompaniesTab", sourceFile: "client/src/pages/catering/CompaniesTab.tsx" },
      { implemented: true, id: "prep-list", label: "Catering Prep", parityRow: 74, sourceComponent: "CateringPrepList", sourceFile: "client/src/pages/CateringPrepList.tsx" },
      { implemented: true, id: "order-guide", label: "Order Guide", parityRow: 75, sourceComponent: "CateringOrderGuide", sourceFile: "client/src/pages/CateringOrderGuide.tsx" },
      { implemented: true, id: "weekly", label: "Weekly Board", parityRow: 76, sourceComponent: "CateringWeeklyBoard", sourceFile: "client/src/pages/CateringWeeklyBoard.tsx" },
    ],
  },
  {
    id: "crm", label: "CRM", base: "/crm", roles: R.cat,
    tabs: [
      { implemented: true, id: "dashboard", label: "Dashboard", parityRow: 84, sourceComponent: "CrmDashboard", sourceFile: "client/src/pages/CrmDashboard.tsx" },
      { implemented: true, id: "opportunities", label: "Opportunities", parityRow: 85, sourceComponent: "CrmOpportunities", sourceFile: "client/src/pages/CrmOpportunities.tsx" },
      { implemented: true, id: "tasks", label: "Tasks", parityRow: 86, sourceComponent: "CrmTasks", sourceFile: "client/src/pages/CrmTasks.tsx" },
      { implemented: true, id: "conversations", label: "Conversations", parityRow: 87, sourceComponent: "CrmConversations", sourceFile: "client/src/pages/CrmConversations.tsx" },
      { implemented: true, id: "automations", label: "Automations", parityRow: 88, sourceComponent: "CrmAutomations", sourceFile: "client/src/pages/CrmAutomations.tsx" },
      { implemented: true, id: "events", label: "Events", parityRow: 89, sourceComponent: "CrmEvents", sourceFile: "client/src/pages/CrmEvents.tsx" },
      { implemented: true, id: "social", label: "Social Planner", parityRow: 90, sourceComponent: "CrmSocialPlanner", sourceFile: "client/src/pages/CrmSocialPlanner.tsx" },
    ],
  },
  {
    id: "marketing", label: "Marketing", base: "/marketing", roles: R.cat,
    tabs: [
      { implemented: true, id: "hub", label: "Landing Page Hub", parityRow: 41, sourceComponent: "MarketingHub", sourceFile: "client/src/pages/marketing/MarketingHub.tsx" },
      { implemented: true, id: "command", label: "Command Center", parityRow: 42, sourceComponent: "MarketingCommandCenter", sourceFile: "client/src/pages/marketing/MarketingCommandCenter.tsx" },
      { implemented: true, id: "leads", label: "Lead Analysis", parityRow: 43, sourceComponent: "LeadAnalysis", sourceFile: "client/src/pages/marketing/LeadAnalysis.tsx" },
      { implemented: true, id: "content-agent", label: "Content Agent", parityRow: 44, sourceComponent: "ContentAgent", sourceFile: "client/src/pages/marketing/ContentAgent.tsx" },
      { implemented: true, id: "calendar", label: "Content Calendar", parityRow: 45, sourceComponent: "ContentCalendar", sourceFile: "client/src/pages/marketing/ContentCalendar.tsx" },
      { implemented: true, id: "media", label: "Media Library", parityRow: 46, sourceComponent: "MediaLibrary", sourceFile: "client/src/pages/marketing/MediaLibrary.tsx" },
      { implemented: true, id: "video", label: "Video Studio", parityRow: 47, sourceComponent: "VideoStudio", sourceFile: "client/src/pages/VideoStudio.tsx" },
      { implemented: true, id: "outreach", label: "Outreach Agent", parityRow: 48, sourceComponent: "OutreachAgent", sourceFile: "client/src/pages/marketing/OutreachAgent.tsx" },
      { implemented: true, id: "performance", label: "Performance", parityRow: 49, sourceComponent: "PerformanceAgent", sourceFile: "client/src/pages/marketing/PerformanceAgent.tsx" },
      { implemented: true, id: "ads", label: "AI Ads Center", parityRow: 50, sourceComponent: "AdsCommandCenter", sourceFile: "client/src/pages/AdsCommandCenter.tsx" },
      { implemented: true, id: "design", label: "Design Agent", parityRow: 51, sourceComponent: "DesignAgent", sourceFile: "client/src/pages/marketing/DesignAgent.tsx" },
    ],
  },
  {
    id: "finance", label: "Finance", base: "/finance", roles: R.admin,
    tabs: [
      { implemented: true, id: "dashboard", label: "Dashboard", parityRow: 77, sourceComponent: "FinanceDashboard", sourceFile: "client/src/pages/FinanceDashboard.tsx" },
      { implemented: true, id: "invoices", label: "Invoices", parityRow: 78, sourceComponent: "FinanceInvoices", sourceFile: "client/src/pages/FinanceInvoices.tsx" },
      { implemented: true, id: "payments", label: "Payments", parityRow: 79, sourceComponent: "FinancePayments", sourceFile: "client/src/pages/FinancePayments.tsx" },
      { implemented: true, id: "quotes", label: "Quotes", parityRow: 80, sourceComponent: "FinanceQuotes", sourceFile: "client/src/pages/FinanceQuotes.tsx" },
      { implemented: true, id: "customers", label: "Customers", parityRow: 81, sourceComponent: "FinanceCustomers", sourceFile: "client/src/pages/FinanceCustomers.tsx" },
      { implemented: true, id: "payroll", label: "Payroll", parityRow: 82, sourceComponent: "FinancePayroll", sourceFile: "client/src/pages/FinancePayroll.tsx" },
      { implemented: true, id: "forecast", label: "Forecast", parityRow: 83, sourceComponent: "FinanceForecast", sourceFile: "client/src/pages/FinanceForecast.tsx" },
    ],
  },
  {
    id: "inventory", label: "Inventory", base: "/inventory", roles: R.kitchenOps,
    tabs: [
      { implemented: true, id: "board", label: "Inventory Board", parityRow: 96, sourceComponent: "InventoryBoard", sourceFile: "client/src/pages/InventoryBoard.tsx" },
      { implemented: true, id: "count", label: "Count Sheet", parityRow: 97, sourceComponent: "InventoryCount", sourceFile: "client/src/pages/InventoryCountSheet.tsx" },
      { implemented: true, id: "receive", label: "Receive Shipment", parityRow: 98, sourceComponent: "ReceiveShipment", sourceFile: "client/src/pages/ReceiveShipment.tsx" },
      { implemented: true, id: "purchase-orders", label: "Purchase Orders", parityRow: 99, sourceComponent: "PurchaseOrder", sourceFile: "client/src/pages/PurchaseOrder.tsx" },
      { implemented: true, id: "vendors", label: "Vendors", parityRow: 100, sourceComponent: "VendorCosts", sourceFile: "client/src/pages/VendorCosts.tsx" },
    ],
  },
  {
    id: "costing", label: "Costing", base: "/costing", roles: R.admin,
    tabs: [
      { implemented: true, id: "food-cost", label: "Food Cost", parityRow: 101, sourceComponent: "FoodCostDashboard", sourceFile: "client/src/pages/FoodCostDashboard.tsx" },
      { implemented: true, id: "break-even", label: "Break-Even", parityRow: 102, sourceComponent: "BreakEvenCalculator", sourceFile: "client/src/pages/BreakEvenCalculator.tsx" },
      { implemented: true, id: "recipe-costing", label: "Recipe Costing", parityRow: 103, sourceComponent: "YieldSystem", sourceFile: "client/src/pages/YieldSystem.tsx" },
    ],
  },
  {
    id: "team", label: "Team", base: "/team", roles: R.admin,
    tabs: [
      { implemented: true, id: "time-clock", label: "Time Clock", parityRow: 104, sourceComponent: "TimeClock", sourceFile: "client/src/pages/TimeClock.tsx" },
      { implemented: true, id: "schedule", label: "Staff Schedule", parityRow: 105, sourceComponent: "StaffSchedule", sourceFile: "client/src/pages/StaffSchedule.tsx" },
      { implemented: true, id: "labor-cost", label: "Labor Cost", parityRow: 106, sourceComponent: "LaborCostTracker", sourceFile: "client/src/pages/LaborCostTracker.tsx" },
      { implemented: true, id: "message-board", label: "Message Board", parityRow: 107, sourceComponent: "MessageBoard", sourceFile: "client/src/pages/MessageBoard.tsx" },
    ],
  },
  {
    id: "admin", label: "Admin", base: "/admin", roles: R.admin,
    tabs: [
      { implemented: true, id: "menu", label: "Menu Editor", parityRow: 52, sourceComponent: "AdminMenuEditor", sourceFile: "client/src/pages/AdminMenuEditor.tsx" },
      { implemented: true, id: "catering-menu", label: "Catering Menu", parityRow: 73, sourceComponent: "CateringCatalog", sourceFile: "menu_reference.md" },
      { implemented: true, id: "walk-in-sampler", label: "Walk-In Samplers", parityRow: 53, sourceComponent: "WalkInSamplerEditor", sourceFile: "client/src/pages/WalkInSamplerEditor.tsx" },
      { implemented: true, id: "prep-master", label: "Prep Master", parityRow: 54, sourceComponent: "AdminPrepMaster", sourceFile: "client/src/pages/AdminPrepMaster.tsx" },
      { implemented: true, id: "fathers-day", label: "Father's Day", parityRow: 55, sourceComponent: "FathersDayAdmin", sourceFile: "client/src/pages/FathersDayAdmin.tsx" },
      { implemented: true, id: "cuban-thursday", label: "Cuban Thursday", parityRow: 56, sourceComponent: "CubanThursdayAdmin", sourceFile: "client/src/pages/CubanThursdayAdmin.tsx" },
      { implemented: true, id: "4th-of-july", label: "4th of July", parityRow: 57, sourceComponent: "July4Admin", sourceFile: "client/src/pages/July4Admin.tsx" },
      { implemented: true, id: "catering-drop", label: "Catering Pre-Orders", parityRow: 58, sourceComponent: "CateringDropAdmin", sourceFile: "client/src/pages/CateringDropAdmin.tsx" },
      { implemented: true, id: "weekend-preorder", label: "Weekend Pre-Orders", parityRow: 59, sourceComponent: "inline", sourceFile: null },
      { implemented: true, id: "preorder-inventory", label: "Preorder Inventory Caps", parityRow: 60, sourceComponent: "PreorderInventoryDashboard", sourceFile: "client/src/pages/admin/PreorderInventoryDashboard.tsx" },
      { implemented: true, id: "order-guide-setup", label: "Order Guide Setup", parityRow: 61, sourceComponent: "OrderGuideSetup", sourceFile: "client/src/pages/OrderGuideSetup.tsx" },
      { implemented: true, id: "protein-conversions", label: "Protein Conversions", parityRow: 62, sourceComponent: "ProteinConversionTable", sourceFile: "client/src/pages/ProteinConversionTable.tsx" },
      { implemented: true, id: "users", label: "Users", parityRow: 63, sourceComponent: "UsersAdmin", sourceFile: "client/src/pages/UsersAdmin.tsx" },
      { implemented: true, id: "team", label: "Team Access", parityRow: 64, sourceComponent: "TeamManagement", sourceFile: "client/src/pages/TeamManagement.tsx" },
      { implemented: true, id: "express-menu", label: "Express Menu", parityRow: 65, sourceComponent: "ExpressMenuAdmin", sourceFile: "client/src/pages/ExpressMenuAdmin.tsx" },
      { implemented: true, id: "discounts", label: "Discount Codes", parityRow: 66, sourceComponent: "DiscountCodesAdmin", sourceFile: "client/src/pages/DiscountCodesAdmin.tsx" },
      { implemented: true, id: "events", label: "Events Manager", parityRow: 67, sourceComponent: "EventsAdmin", sourceFile: "client/src/pages/EventsAdmin.tsx" },
      { implemented: true, id: "brand-setup", label: "Brand Setup", parityRow: 68, sourceComponent: "BrandSetup", sourceFile: "client/src/pages/BrandSetup.tsx" },
      { implemented: true, id: "brand-studio", label: "Brand Studio", parityRow: 69, sourceComponent: "BrandStudio", sourceFile: "client/src/pages/admin/BrandStudio.tsx" },
      { implemented: true, id: "license", label: "License Manager", parityRow: 70, sourceComponent: "LicensingDashboard", sourceFile: "client/src/pages/admin/LicensingDashboard.tsx" },
      { implemented: true, id: "ai-import", label: "AI Import Hub", parityRow: 71, sourceComponent: "AIImportHub", sourceFile: "client/src/pages/AIImportHub.tsx" },
      { implemented: true, id: "customer-app", label: "Customer App", parityRow: 72, sourceComponent: "CustomerHome", sourceFile: "client/src/pages/public/CustomerHome.tsx" },
    ],
  },
];

export const findWorkspace = (id: string) => WORKSPACES.find(w => w.id === id);
