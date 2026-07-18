/** Central registry of implemented workspace tab views (workspaceId/tabId → component). */
import type { ComponentType } from "react";
import { PrepBoard } from "../modules/kitchen/PrepBoard";
import { WeeklyBoard } from "../modules/kitchen/WeeklyBoard";
import { FireSheets } from "../modules/kitchen/FireSheets";
import { KitchenCalendar } from "../modules/kitchen/KitchenCalendar";
import { ExpoKds } from "../modules/kitchen/ExpoKds";
import { MeatCalc } from "../modules/kitchen/MeatCalc";
import { OrderHistoryView } from "../modules/kitchen/OrderHistory";
import { MorningChecklist } from "../modules/kitchen/MorningChecklist";
import { PrepRecipesView } from "../modules/kitchen/PrepRecipes";
import { PitDashboard } from "../modules/pit/PitDashboard";
import { SmokedInventoryView } from "../modules/pit/SmokedInventoryView";
import { SmokerForecastView } from "../modules/pit/SmokerForecastView";
import { PitmasterGuideView } from "../modules/pit/PitmasterGuideView";
import { MeatCostGuide } from "../modules/pit/MeatCostGuide";
import { RetailDashboard } from "../modules/seminole/RetailDashboard";
import { RetailFireSheetView } from "../modules/seminole/RetailFireSheetView";
import { SeminoleKds } from "../modules/seminole/SeminoleKds";
import { PreordersView } from "../modules/seminole/PreordersView";
import { FohChecklist } from "../modules/seminole/FohChecklist";
import { TempLogView } from "../modules/seminole/TempLogView";
import { FireDropAdminView } from "../modules/seminole/FireDropAdmin";
import { PackQueue } from "../modules/packing/PackQueue";
import { PackingBoardView } from "../modules/packing/PackingBoard";
import { DeliveriesView } from "../modules/packing/DeliveriesView";
import { PackingDashboard } from "../modules/packing/PackingDashboard";
import { PackingInventoryView } from "../modules/packing/PackingInventoryView";
import { SupplyForecastView } from "../modules/packing/SupplyForecastView";
import { DirectorCockpit } from "../modules/catering/DirectorCockpit";
import { LeadsPipeline } from "../modules/catering/LeadsPipeline";
import { LeadIntake } from "../modules/catering/LeadIntake";
import { SalesCalendarView } from "../modules/catering/SalesCalendarView";
import { QuotesInvoices } from "../modules/catering/QuotesInvoices";
import { ContactsView } from "../modules/catering/ContactsView";
import { VenuesView } from "../modules/catering/VenuesView";
import { RedZoneView } from "../modules/catering/RedZoneView";
import { ApprovalQueueView } from "../modules/catering/ApprovalQueue";
import { PortalAdminView } from "../modules/catering/PortalAdmin";
import { EquipmentCatalogView } from "../modules/catering/EquipmentCatalog";
import { CompaniesView } from "../modules/catering/CompaniesView";
import { LandingHub } from "../modules/marketing/LandingHub";
import { MarketingCommandCenter } from "../modules/marketing/CommandCenter";
import { LeadAnalysisView } from "../modules/marketing/LeadAnalysis";
import { ContentAgentView } from "../modules/marketing/ContentAgent";
import { ContentCalendarView } from "../modules/marketing/ContentCalendar";
import { MediaLibraryView } from "../modules/marketing/MediaLibrary";
import { VideoStudioView } from "../modules/marketing/VideoStudio";
import { OutreachAgentView } from "../modules/marketing/OutreachAgent";
import { PerformanceView } from "../modules/marketing/Performance";
import { AdsCenterView } from "../modules/marketing/AdsCenter";
import { DesignAgentView } from "../modules/marketing/DesignAgent";
import {
  MenuEditor, SamplerEditor, PrepMaster, EventAdmin, PreorderChannelAdmin, PreorderCaps,
  OrderGuideSetup, ProteinConversionsView, UsersAdmin, TeamAccess, DiscountCodes,
  BrandSetup, BrandStudio, LicenseManager, CustomerApp, AiImportHub, ExpressMenu, EventsManager,
} from "../modules/admin";

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
