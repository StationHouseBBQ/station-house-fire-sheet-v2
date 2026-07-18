/** Central registry of implemented workspace tab views — lazy-loaded per module for code-splitting. */
import { lazy } from "react";
import type { ComponentType } from "react";

const PrepBoard = lazy(() => import("../modules/kitchen/PrepBoard").then(m => ({ default: m.PrepBoard })));
const WeeklyBoard = lazy(() => import("../modules/kitchen/WeeklyBoard").then(m => ({ default: m.WeeklyBoard })));
const FireSheets = lazy(() => import("../modules/kitchen/FireSheets").then(m => ({ default: m.FireSheets })));
const KitchenCalendar = lazy(() => import("../modules/kitchen/KitchenCalendar").then(m => ({ default: m.KitchenCalendar })));
const ExpoKds = lazy(() => import("../modules/kitchen/ExpoKds").then(m => ({ default: m.ExpoKds })));
const MeatCalc = lazy(() => import("../modules/kitchen/MeatCalc").then(m => ({ default: m.MeatCalc })));
const OrderHistoryView = lazy(() => import("../modules/kitchen/OrderHistory").then(m => ({ default: m.OrderHistoryView })));
const MorningChecklist = lazy(() => import("../modules/kitchen/MorningChecklist").then(m => ({ default: m.MorningChecklist })));
const PrepRecipesView = lazy(() => import("../modules/kitchen/PrepRecipes").then(m => ({ default: m.PrepRecipesView })));
const PitDashboard = lazy(() => import("../modules/pit/PitDashboard").then(m => ({ default: m.PitDashboard })));
const SmokedInventoryView = lazy(() => import("../modules/pit/SmokedInventoryView").then(m => ({ default: m.SmokedInventoryView })));
const SmokerForecastView = lazy(() => import("../modules/pit/SmokerForecastView").then(m => ({ default: m.SmokerForecastView })));
const PitmasterGuideView = lazy(() => import("../modules/pit/PitmasterGuideView").then(m => ({ default: m.PitmasterGuideView })));
const MeatCostGuide = lazy(() => import("../modules/pit/MeatCostGuide").then(m => ({ default: m.MeatCostGuide })));
const RetailDashboard = lazy(() => import("../modules/seminole/RetailDashboard").then(m => ({ default: m.RetailDashboard })));
const RetailFireSheetView = lazy(() => import("../modules/seminole/RetailFireSheetView").then(m => ({ default: m.RetailFireSheetView })));
const SeminoleKds = lazy(() => import("../modules/seminole/SeminoleKds").then(m => ({ default: m.SeminoleKds })));
const PreordersView = lazy(() => import("../modules/seminole/PreordersView").then(m => ({ default: m.PreordersView })));
const FohChecklist = lazy(() => import("../modules/seminole/FohChecklist").then(m => ({ default: m.FohChecklist })));
const TempLogView = lazy(() => import("../modules/seminole/TempLogView").then(m => ({ default: m.TempLogView })));
const FireDropAdminView = lazy(() => import("../modules/seminole/FireDropAdmin").then(m => ({ default: m.FireDropAdminView })));
const PackQueue = lazy(() => import("../modules/packing/PackQueue").then(m => ({ default: m.PackQueue })));
const PackingBoardView = lazy(() => import("../modules/packing/PackingBoard").then(m => ({ default: m.PackingBoardView })));
const DeliveriesView = lazy(() => import("../modules/packing/DeliveriesView").then(m => ({ default: m.DeliveriesView })));
const PackingDashboard = lazy(() => import("../modules/packing/PackingDashboard").then(m => ({ default: m.PackingDashboard })));
const PackingInventoryView = lazy(() => import("../modules/packing/PackingInventoryView").then(m => ({ default: m.PackingInventoryView })));
const SupplyForecastView = lazy(() => import("../modules/packing/SupplyForecastView").then(m => ({ default: m.SupplyForecastView })));
const DirectorCockpit = lazy(() => import("../modules/catering/DirectorCockpit").then(m => ({ default: m.DirectorCockpit })));
const LeadsPipeline = lazy(() => import("../modules/catering/LeadsPipeline").then(m => ({ default: m.LeadsPipeline })));
const LeadIntake = lazy(() => import("../modules/catering/LeadIntake").then(m => ({ default: m.LeadIntake })));
const SalesCalendarView = lazy(() => import("../modules/catering/SalesCalendarView").then(m => ({ default: m.SalesCalendarView })));
const QuotesInvoices = lazy(() => import("../modules/catering/QuotesInvoices").then(m => ({ default: m.QuotesInvoices })));
const ContactsView = lazy(() => import("../modules/catering/ContactsView").then(m => ({ default: m.ContactsView })));
const VenuesView = lazy(() => import("../modules/catering/VenuesView").then(m => ({ default: m.VenuesView })));
const RedZoneView = lazy(() => import("../modules/catering/RedZoneView").then(m => ({ default: m.RedZoneView })));
const ApprovalQueueView = lazy(() => import("../modules/catering/ApprovalQueue").then(m => ({ default: m.ApprovalQueueView })));
const PortalAdminView = lazy(() => import("../modules/catering/PortalAdmin").then(m => ({ default: m.PortalAdminView })));
const EquipmentCatalogView = lazy(() => import("../modules/catering/EquipmentCatalog").then(m => ({ default: m.EquipmentCatalogView })));
const CompaniesView = lazy(() => import("../modules/catering/CompaniesView").then(m => ({ default: m.CompaniesView })));
const LandingHub = lazy(() => import("../modules/marketing/LandingHub").then(m => ({ default: m.LandingHub })));
const MarketingCommandCenter = lazy(() => import("../modules/marketing/CommandCenter").then(m => ({ default: m.MarketingCommandCenter })));
const LeadAnalysisView = lazy(() => import("../modules/marketing/LeadAnalysis").then(m => ({ default: m.LeadAnalysisView })));
const ContentAgentView = lazy(() => import("../modules/marketing/ContentAgent").then(m => ({ default: m.ContentAgentView })));
const ContentCalendarView = lazy(() => import("../modules/marketing/ContentCalendar").then(m => ({ default: m.ContentCalendarView })));
const MediaLibraryView = lazy(() => import("../modules/marketing/MediaLibrary").then(m => ({ default: m.MediaLibraryView })));
const VideoStudioView = lazy(() => import("../modules/marketing/VideoStudio").then(m => ({ default: m.VideoStudioView })));
const OutreachAgentView = lazy(() => import("../modules/marketing/OutreachAgent").then(m => ({ default: m.OutreachAgentView })));
const PerformanceView = lazy(() => import("../modules/marketing/Performance").then(m => ({ default: m.PerformanceView })));
const AdsCenterView = lazy(() => import("../modules/marketing/AdsCenter").then(m => ({ default: m.AdsCenterView })));
const DesignAgentView = lazy(() => import("../modules/marketing/DesignAgent").then(m => ({ default: m.DesignAgentView })));
const MenuEditor = lazy(() => import("../modules/admin").then(m => ({ default: m.MenuEditor })));
const SamplerEditor = lazy(() => import("../modules/admin").then(m => ({ default: m.SamplerEditor })));
const PrepMaster = lazy(() => import("../modules/admin").then(m => ({ default: m.PrepMaster })));
const EventAdmin = lazy(() => import("../modules/admin").then(m => ({ default: m.EventAdmin })));
const PreorderChannelAdmin = lazy(() => import("../modules/admin").then(m => ({ default: m.PreorderChannelAdmin })));
const PreorderCaps = lazy(() => import("../modules/admin").then(m => ({ default: m.PreorderCaps })));
const OrderGuideSetup = lazy(() => import("../modules/admin").then(m => ({ default: m.OrderGuideSetup })));
const ProteinConversionsView = lazy(() => import("../modules/admin").then(m => ({ default: m.ProteinConversionsView })));
const UsersAdmin = lazy(() => import("../modules/admin").then(m => ({ default: m.UsersAdmin })));
const TeamAccess = lazy(() => import("../modules/admin").then(m => ({ default: m.TeamAccess })));
const DiscountCodes = lazy(() => import("../modules/admin").then(m => ({ default: m.DiscountCodes })));
const BrandSetup = lazy(() => import("../modules/admin").then(m => ({ default: m.BrandSetup })));
const BrandStudio = lazy(() => import("../modules/admin").then(m => ({ default: m.BrandStudio })));
const LicenseManager = lazy(() => import("../modules/admin").then(m => ({ default: m.LicenseManager })));
const CustomerApp = lazy(() => import("../modules/admin").then(m => ({ default: m.CustomerApp })));
const AiImportHub = lazy(() => import("../modules/admin").then(m => ({ default: m.AiImportHub })));
const ExpressMenu = lazy(() => import("../modules/admin").then(m => ({ default: m.ExpressMenu })));
const EventsManager = lazy(() => import("../modules/admin").then(m => ({ default: m.EventsManager })));

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
  "catering/cockpit": DirectorCockpit,
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
