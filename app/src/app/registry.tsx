/** Central registry of implemented workspace tab views — lazy-loaded per module for code-splitting. */
import { lazyWithRetry } from "./lazyWithRetry";
import type { ComponentType } from "react";

const PrepBoard = lazyWithRetry(() => import("../modules/kitchen/PrepBoard").then(m => ({ default: m.PrepBoard })), "PrepBoard");
const WeeklyBoard = lazyWithRetry(() => import("../modules/kitchen/WeeklyBoard").then(m => ({ default: m.WeeklyBoard })), "WeeklyBoard");
const FireSheets = lazyWithRetry(() => import("../modules/kitchen/FireSheets").then(m => ({ default: m.FireSheets })), "FireSheets");
const KitchenCalendar = lazyWithRetry(() => import("../modules/kitchen/KitchenCalendar").then(m => ({ default: m.KitchenCalendar })), "KitchenCalendar");
const ExpoKds = lazyWithRetry(() => import("../modules/kitchen/ExpoKds").then(m => ({ default: m.ExpoKds })), "ExpoKds");
const MeatCalc = lazyWithRetry(() => import("../modules/kitchen/MeatCalc").then(m => ({ default: m.MeatCalc })), "MeatCalc");
const OrderHistoryView = lazyWithRetry(() => import("../modules/kitchen/OrderHistory").then(m => ({ default: m.OrderHistoryView })), "OrderHistoryView");
const MorningChecklist = lazyWithRetry(() => import("../modules/kitchen/MorningChecklist").then(m => ({ default: m.MorningChecklist })), "MorningChecklist");
const PrepRecipesView = lazyWithRetry(() => import("../modules/kitchen/PrepRecipes").then(m => ({ default: m.PrepRecipesView })), "PrepRecipesView");
const PitDashboard = lazyWithRetry(() => import("../modules/pit/PitDashboard").then(m => ({ default: m.PitDashboard })), "PitDashboard");
const SmokedInventoryView = lazyWithRetry(() => import("../modules/pit/SmokedInventoryView").then(m => ({ default: m.SmokedInventoryView })), "SmokedInventoryView");
const SmokerForecastView = lazyWithRetry(() => import("../modules/pit/SmokerForecastView").then(m => ({ default: m.SmokerForecastView })), "SmokerForecastView");
const PitmasterGuideView = lazyWithRetry(() => import("../modules/pit/PitmasterGuideView").then(m => ({ default: m.PitmasterGuideView })), "PitmasterGuideView");
const MeatCostGuide = lazyWithRetry(() => import("../modules/pit/MeatCostGuide").then(m => ({ default: m.MeatCostGuide })), "MeatCostGuide");
const RetailDashboard = lazyWithRetry(() => import("../modules/seminole/RetailDashboard").then(m => ({ default: m.RetailDashboard })), "RetailDashboard");
const RetailFireSheetView = lazyWithRetry(() => import("../modules/seminole/RetailFireSheetView").then(m => ({ default: m.RetailFireSheetView })), "RetailFireSheetView");
const SeminoleKds = lazyWithRetry(() => import("../modules/seminole/SeminoleKds").then(m => ({ default: m.SeminoleKds })), "SeminoleKds");
const PreordersView = lazyWithRetry(() => import("../modules/seminole/PreordersView").then(m => ({ default: m.PreordersView })), "PreordersView");
const FohChecklist = lazyWithRetry(() => import("../modules/seminole/FohChecklist").then(m => ({ default: m.FohChecklist })), "FohChecklist");
const TempLogView = lazyWithRetry(() => import("../modules/seminole/TempLogView").then(m => ({ default: m.TempLogView })), "TempLogView");
const FireDropAdminView = lazyWithRetry(() => import("../modules/seminole/FireDropAdmin").then(m => ({ default: m.FireDropAdminView })), "FireDropAdminView");
const PackQueue = lazyWithRetry(() => import("../modules/packing/PackQueue").then(m => ({ default: m.PackQueue })), "PackQueue");
const PackingBoardView = lazyWithRetry(() => import("../modules/packing/PackingBoard").then(m => ({ default: m.PackingBoardView })), "PackingBoardView");
const DeliveriesView = lazyWithRetry(() => import("../modules/packing/DeliveriesView").then(m => ({ default: m.DeliveriesView })), "DeliveriesView");
const PackingDashboard = lazyWithRetry(() => import("../modules/packing/PackingDashboard").then(m => ({ default: m.PackingDashboard })), "PackingDashboard");
const PackingInventoryView = lazyWithRetry(() => import("../modules/packing/PackingInventoryView").then(m => ({ default: m.PackingInventoryView })), "PackingInventoryView");
const SupplyForecastView = lazyWithRetry(() => import("../modules/packing/SupplyForecastView").then(m => ({ default: m.SupplyForecastView })), "SupplyForecastView");
const CockpitHome = lazyWithRetry(() => import("../modules/catering/CockpitHome").then(m => ({ default: m.CockpitHome })), "CockpitHome");
const LeadsPipeline = lazyWithRetry(() => import("../modules/catering/LeadsPipeline").then(m => ({ default: m.LeadsPipeline })), "LeadsPipeline");
const LeadIntake = lazyWithRetry(() => import("../modules/catering/LeadIntake").then(m => ({ default: m.LeadIntake })), "LeadIntake");
const SalesCalendarView = lazyWithRetry(() => import("../modules/catering/SalesCalendarView").then(m => ({ default: m.SalesCalendarView })), "SalesCalendarView");
const QuotesInvoices = lazyWithRetry(() => import("../modules/catering/QuotesInvoices").then(m => ({ default: m.QuotesInvoices })), "QuotesInvoices");
const ContactsView = lazyWithRetry(() => import("../modules/catering/ContactsView").then(m => ({ default: m.ContactsView })), "ContactsView");
const VenuesView = lazyWithRetry(() => import("../modules/catering/VenuesView").then(m => ({ default: m.VenuesView })), "VenuesView");
const RedZoneView = lazyWithRetry(() => import("../modules/catering/RedZoneView").then(m => ({ default: m.RedZoneView })), "RedZoneView");
const ApprovalQueueView = lazyWithRetry(() => import("../modules/catering/ApprovalQueue").then(m => ({ default: m.ApprovalQueueView })), "ApprovalQueueView");
const PortalAdminView = lazyWithRetry(() => import("../modules/catering/PortalAdmin").then(m => ({ default: m.PortalAdminView })), "PortalAdminView");
const EquipmentCatalogView = lazyWithRetry(() => import("../modules/catering/EquipmentCatalog").then(m => ({ default: m.EquipmentCatalogView })), "EquipmentCatalogView");
const CompaniesView = lazyWithRetry(() => import("../modules/catering/CompaniesView").then(m => ({ default: m.CompaniesView })), "CompaniesView");
const CateringPrepList = lazyWithRetry(() => import("../modules/catering/CateringPrepList").then(m => ({ default: m.CateringPrepList })), "CateringPrepList");
const CateringOrderGuideView = lazyWithRetry(() => import("../modules/catering/CateringOrderGuideView").then(m => ({ default: m.CateringOrderGuideView })), "CateringOrderGuideView");
const CateringWeeklyBoard = lazyWithRetry(() => import("../modules/catering/CateringWeeklyBoard").then(m => ({ default: m.CateringWeeklyBoard })), "CateringWeeklyBoard");
const FinanceDashboard = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinanceDashboard })), "FinanceDashboard");
const FinanceInvoices = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinanceInvoices })), "FinanceInvoices");
const FinancePayments = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinancePayments })), "FinancePayments");
const FinanceQuotes = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinanceQuotes })), "FinanceQuotes");
const FinanceCustomers = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinanceCustomers })), "FinanceCustomers");
const FinancePayroll = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinancePayroll })), "FinancePayroll");
const FinanceForecast = lazyWithRetry(() => import("../modules/finance").then(m => ({ default: m.FinanceForecast })), "FinanceForecast");
const LandingHub = lazyWithRetry(() => import("../modules/marketing/LandingHub").then(m => ({ default: m.LandingHub })), "LandingHub");
const MarketingCommandCenter = lazyWithRetry(() => import("../modules/marketing/CommandCenter").then(m => ({ default: m.MarketingCommandCenter })), "MarketingCommandCenter");
const LeadAnalysisView = lazyWithRetry(() => import("../modules/marketing/LeadAnalysis").then(m => ({ default: m.LeadAnalysisView })), "LeadAnalysisView");
const ContentAgentView = lazyWithRetry(() => import("../modules/marketing/ContentAgent").then(m => ({ default: m.ContentAgentView })), "ContentAgentView");
const ContentCalendarView = lazyWithRetry(() => import("../modules/marketing/ContentCalendar").then(m => ({ default: m.ContentCalendarView })), "ContentCalendarView");
const MediaLibraryView = lazyWithRetry(() => import("../modules/marketing/MediaLibrary").then(m => ({ default: m.MediaLibraryView })), "MediaLibraryView");
const VideoStudioView = lazyWithRetry(() => import("../modules/marketing/VideoStudio").then(m => ({ default: m.VideoStudioView })), "VideoStudioView");
const OutreachAgentView = lazyWithRetry(() => import("../modules/marketing/OutreachAgent").then(m => ({ default: m.OutreachAgentView })), "OutreachAgentView");
const PerformanceView = lazyWithRetry(() => import("../modules/marketing/Performance").then(m => ({ default: m.PerformanceView })), "PerformanceView");
const AdsCenterView = lazyWithRetry(() => import("../modules/marketing/AdsCenter").then(m => ({ default: m.AdsCenterView })), "AdsCenterView");
const DesignAgentView = lazyWithRetry(() => import("../modules/marketing/DesignAgent").then(m => ({ default: m.DesignAgentView })), "DesignAgentView");
const MenuEditor = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.MenuEditor })), "MenuEditor");
const CateringMenu = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.CateringMenu })), "CateringMenu");
const SamplerEditor = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.SamplerEditor })), "SamplerEditor");
const PrepMaster = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.PrepMaster })), "PrepMaster");
const EventAdmin = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.EventAdmin })), "EventAdmin");
const PreorderChannelAdmin = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.PreorderChannelAdmin })), "PreorderChannelAdmin");
const PreorderCaps = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.PreorderCaps })), "PreorderCaps");
const OrderGuideSetup = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.OrderGuideSetup })), "OrderGuideSetup");
const ProteinConversionsView = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.ProteinConversionsView })), "ProteinConversionsView");
const UsersAdmin = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.UsersAdmin })), "UsersAdmin");
const TeamAccess = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.TeamAccess })), "TeamAccess");
const DiscountCodes = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.DiscountCodes })), "DiscountCodes");
const BrandSetup = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.BrandSetup })), "BrandSetup");
const BrandStudio = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.BrandStudio })), "BrandStudio");
const LicenseManager = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.LicenseManager })), "LicenseManager");
const CustomerApp = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.CustomerApp })), "CustomerApp");
const AiImportHub = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.AiImportHub })), "AiImportHub");
const ExpressMenu = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.ExpressMenu })), "ExpressMenu");
const EventsManager = lazyWithRetry(() => import("../modules/admin").then(m => ({ default: m.EventsManager })), "EventsManager");

const FathersDayAdmin = () => <EventAdmin slug="fathers-day" title="Father's Day" />;
const CubanThursdayAdmin = () => <EventAdmin slug="cuban-thursday" title="Cuban Thursday" />;
const July4Admin = () => <EventAdmin slug="july4" title="4th of July" />;
/** Catering drops ride the fire_drop channel until the channel enum expands in Supabase (noted in matrix). */
const CateringPreordersAdmin = () => <PreorderChannelAdmin channel="fire_drop" title="Catering Pre-Orders" />;
const WeekendPreordersAdmin = () => <PreorderChannelAdmin channel="fire_drop" title="Weekend Pre-Orders" />;

export const IMPLEMENTED: Record<string, ComponentType> = {
  "kitchen/weekly": WeeklyBoard,
  "kitchen/fire-sheets": FireSheets,
  "kitchen/calendar": KitchenCalendar,
  "kitchen/expo": ExpoKds,
  "kitchen/calculator": MeatCalc,
  "kitchen/prep": PrepBoard,
  "kitchen/order-history": OrderHistoryView,
  "kitchen/morning-checklist": MorningChecklist,
  "kitchen/prep-recipes": PrepRecipesView,
  "seminole/dashboard": RetailDashboard,
  "seminole/fire-sheet": RetailFireSheetView,
  "seminole/kds": SeminoleKds,
  "seminole/preorders": PreordersView,
  "seminole/checklist": FohChecklist,
  "seminole/temp-log": TempLogView,
  "seminole/fire-drop": FireDropAdminView,
  "pit/dashboard": PitDashboard,
  "pit/inventory": SmokedInventoryView,
  "pit/forecast": SmokerForecastView,
  "pit/guide": PitmasterGuideView,
  "pit/cost": MeatCostGuide,
  "packing/queue": PackQueue,
  "packing/board": PackingBoardView,
  "packing/expo": ExpoKds,
  "packing/deliveries": DeliveriesView,
  "packing/dashboard": PackingDashboard,
  "packing/inventory": PackingInventoryView,
  "packing/forecast": SupplyForecastView,
  "catering/cockpit": CockpitHome,
  "catering/pipeline": LeadsPipeline,
  "catering/intake": LeadIntake,
  "catering/calendar": SalesCalendarView,
  "catering/quotes": QuotesInvoices,
  "catering/contacts": ContactsView,
  "catering/venues": VenuesView,
  "catering/red-zone": RedZoneView,
  "catering/approval": ApprovalQueueView,
  "catering/portal": PortalAdminView,
  "catering/equipment": EquipmentCatalogView,
  "catering/companies": CompaniesView,
  "catering/prep-list": CateringPrepList,
  "catering/order-guide": CateringOrderGuideView,
  "catering/weekly": CateringWeeklyBoard,
  "finance/dashboard": FinanceDashboard,
  "finance/invoices": FinanceInvoices,
  "finance/payments": FinancePayments,
  "finance/quotes": FinanceQuotes,
  "finance/customers": FinanceCustomers,
  "finance/payroll": FinancePayroll,
  "finance/forecast": FinanceForecast,
  "marketing/hub": LandingHub,
  "marketing/command": MarketingCommandCenter,
  "marketing/leads": LeadAnalysisView,
  "marketing/content-agent": ContentAgentView,
  "marketing/calendar": ContentCalendarView,
  "marketing/media": MediaLibraryView,
  "marketing/video": VideoStudioView,
  "marketing/outreach": OutreachAgentView,
  "marketing/performance": PerformanceView,
  "marketing/ads": AdsCenterView,
  "marketing/design": DesignAgentView,
  "admin/menu": MenuEditor,
  "admin/catering-menu": CateringMenu,
  "admin/walk-in-sampler": SamplerEditor,
  "admin/prep-master": PrepMaster,
  "admin/fathers-day": FathersDayAdmin,
  "admin/cuban-thursday": CubanThursdayAdmin,
  "admin/4th-of-july": July4Admin,
  "admin/catering-drop": CateringPreordersAdmin,
  "admin/weekend-preorder": WeekendPreordersAdmin,
  "admin/preorder-inventory": PreorderCaps,
  "admin/order-guide-setup": OrderGuideSetup,
  "admin/protein-conversions": ProteinConversionsView,
  "admin/users": UsersAdmin,
  "admin/team": TeamAccess,
  "admin/express-menu": ExpressMenu,
  "admin/discounts": DiscountCodes,
  "admin/events": EventsManager,
  "admin/brand-setup": BrandSetup,
  "admin/brand-studio": BrandStudio,
  "admin/license": LicenseManager,
  "admin/ai-import": AiImportHub,
  "admin/customer-app": CustomerApp,
};
