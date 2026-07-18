# Station House Fire Sheet V2 — Parity Matrix

**Source of truth:** `station-house-fire-sheet.zip` (Manus source snapshot, received 2026-07-17).
**Reference deployment (read-only):** https://stationfire-dtlkjbnk.manus.space
**Scale of source:** 247 routes · 356 page/components · 62 tRPC routers · 292 database tables.

Status legend: **NS** Not Started · **IP** In Progress · **BL** Blocked · **V** Verified.
Every row must reach **V** with test evidence before cutover. A tab is not complete merely because it renders.

Definition-of-done columns per row: source component/route · expected behaviors & data dependencies · new implementation location · role coverage · persistence · mobile/tablet · test evidence · status. "New impl" and evidence columns are filled in as work proceeds; all rows start **NS** except where noted.

---

## Kitchen — `/kitchen-workspace` (9 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 1 | Weekly Board | `WeeklyMasterBoard` — `client/src/pages/WeeklyMasterBoard.tsx` | 441 | weeklyUnified.getUnifiedBoard, orders.getWeeklyProductionBoard | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 2 | Fire Sheets | `ProductionBoard` — `client/src/pages/ProductionBoard.tsx` | 1476 | orders.list, handoff.getBulkKitchenProgress, proteinConversions.list, orders.getDailyAllTotalsV2, orders.getDailyAllTotals, prepCheck.getChecks, prepCheck.toggleCheck, prepCheck.clearDay, orders.updateStatus, orders.updateNotes, orders.createTestOrder, orders.updateFull, cateringLifecycle.hub | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 3 | Calendar | `MasterCalendarPage` — `client/src/pages/MasterCalendarPage.tsx` | 10 | — | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 4 | Expo KDS | `ExpoKDS` — `client/src/pages/ExpoKDS.tsx` | 876 | kds.getProductionTotals, kds.toggleKitchenCheck, kds.toggleExpoCheck, kds.bumpToExpo, kds.signOff, kds.reopenTicket, kds.markReady, kds.markHandedOff, kds.getAllDayItemTotals, kds.getTickets | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 5 | Meat Calc | `MeatCalculator` — `client/src/pages/MeatCalculator.tsx` | 302 | proteinConversions.list | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 6 | Prep | `DynamicPrepBoard` — `client/src/pages/DynamicPrepBoard.tsx` | 321 | prepBoard.getActiveSession, prepBoard.updateEntryStatus, prepBoard.addEntry | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 7 | Order History | `KitchenOrderHistory` — `client/src/pages/KitchenOrderHistory.tsx` | 196 | orders.list, orders.updateStatus | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 8 | Morning Checklist | `KitchenChecklist` — `client/src/pages/KitchenChecklist.tsx` | 517 | checklist.listTemplates, checklist.getTodayRun, checklist.toggleItem, checklist.managerSignOff, checklist.setNotificationEmail | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 9 | Prep Recipes | `PrepRecipeAdmin` — `client/src/pages/PrepRecipeAdmin.tsx` | 568 | inventoryOrder.listPrepIngredients, inventoryOrder.upsertPrepIngredient, inventoryOrder.deletePrepIngredient, inventoryOrder.listPrepRecipes, inventoryOrder.createPrepRecipe, inventoryOrder.updatePrepRecipe, inventoryOrder.deletePrepRecipe | editRecipe ? | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |

## Seminole Heights / Retail — `/retail-workspace` (7 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 10 | Dashboard | `RetailDashboard` — `client/src/pages/RetailDashboard.tsx` | 458 | retailDashboard.calendar, retailDashboard.dailyProduction, retailDashboard.stats, retailPreorders.list | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 11 | 🔥 Fire Sheet | `RetailFireSheet` — `client/src/pages/RetailFireSheet.tsx` | 734 | retailDaily.getSession, retailDaily.createSession, retailDaily.addItem, retailDaily.updateItemStatus, retailDaily.updateItemQty, retailDaily.removeItem, retailDaily.submitToKitchen, retailDaily.syncFromPar | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 12 | 📺 KDS | `SeminoleKDS` — `client/src/pages/SeminoleKDS.tsx` | 278 | kds.getSeminoleKDS | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 13 | Preorders | `RetailPreorders` — `client/src/pages/RetailPreorders.tsx` | 1592 | fireDrop.getCustomerHistory, cubanThursday.listOrders, cubanThursday.updateStatus, cubanThursday.refundOrder, cubanThursday.hideOrder, cubanThursday.unhideOrder, fireDrop.getAllDropOrdersWithItems, fireDrop.updateOrderStatus, fireDrop.updateOrderItems, fireDrop.updateOrderCustomer, fireDrop.createManualOrder, fireDrop.refundOrder, fireDrop.hideOrder, fireDrop.unhideOrder (+4 more) | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 14 | FOH Checklist | `RetailChecklist` — `client/src/pages/RetailChecklist.tsx` | 552 | checklist.listTemplates, checklist.getTodayRun, checklist.toggleItem, checklist.managerSignOff, checklist.setNotificationEmail | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 15 | Temp Log | `FoodTempLog` — `client/src/pages/FoodTempLog.tsx` | 308 | foodTemp.submitCheck, foodTemp.getTodayChecks, foodTemp.getRecent | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 16 | Fire Drop | `FireDropAdmin` — `client/src/pages/FireDropAdmin.tsx` | 794 | fireDrop.listDrops, fireDrop.createDrop, fireDrop.updateDrop, fireDrop.deleteDrop, fireDrop.getDrop, fireDrop.addProduct, fireDrop.updateProduct, fireDrop.deleteProduct, fireDrop.addSlot, fireDrop.deleteSlot, fireDrop.listOrdersWithItems, fireDrop.updateOrderStatus, fireDrop.deleteOrder, fireDrop.exportOrdersCSV (+6 more) | Create New Drop; Add Product; Edit Order Items; Manual Order Entry | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |

## Pit — `/pit-workspace` (5 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 17 | Pit Dashboard | `PitDashboard` — `client/src/pages/PitDashboard.tsx` | 1008 | pitChecklist.listSessions, pitChecklist.getOrCreateSession, forecast.getSmokerSchedule, pitChecklist.listItems, pitChecklist.syncFromSchedule, pitChecklist.updateItem, pitChecklist.deleteItem, pitChecklist.addItem | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 18 | Smoked Inventory | `SmokedInventory` — `client/src/pages/SmokedInventory.tsx` | 346 | smokedInventory.getSummary, smokedInventory.logBatch | Log Smoke Batch | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 19 | Smoker Forecast | `SmokerForecast` — `client/src/pages/SmokerForecast.tsx` | 965 | forecast.getSmokerSchedule, forecast.getForecast, forecast.getProteinConfigs, seasoning.list, forecast.getSeasoningSchedule, forecast.upsertSmokerDay, forecast.deleteSmokerEntry, forecast.upsertSeasoningEntry, forecast.deleteSeasoningEntry, forecast.copySmokerWeek, forecast.autoFillWeek, forecast.lockWeek | 🧂 Add Seasoning —; Manage Smoke Schedule | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 20 | Pitmaster Guide | `PitmasterGuide` — `client/src/pages/PitmasterGuide.tsx` | 517 | pitmaster.upsertGuide, pitmaster.addStep, pitmaster.updateStep, pitmaster.removeStep, pitmaster.getProtein, pitmaster.listProteins, pitmaster.createProtein | Edit; Add Step; Edit Step; Add Protein | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |
| 21 | Meat Cost Guide | `PitMeatCostGuide` — `client/src/pages/PitMeatCostGuide.tsx` | 337 | meatCosts.list, meatCosts.upsert, meatCosts.delete | — | — | IP — implemented in app/src/modules (demo DAL); pending role/mobile/QA verification |

## Packing — `/packing-workspace` (7 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 22 | Pack Queue | `PackingQueue` — `client/src/pages/PackingQueue.tsx` | 640 | handoff.getPackingQueue, handoff.getUpcomingQueue, handoff.getPackingChecklist, handoff.toggleChecklistItem, handoff.confirmPacked | — | — | NS |
| 23 | Packing Board | `PackingBoard` — `client/src/pages/PackingBoard.tsx` | 348 | packingSheetV2.list, packingSheetV2.updateSheet, packingSheetV2.syncFromOrders | — | — | NS |
| 24 | Expo View | `ExpoKDS` — `client/src/pages/ExpoKDS.tsx` | 876 | kds.getProductionTotals, kds.toggleKitchenCheck, kds.toggleExpoCheck, kds.bumpToExpo, kds.signOff, kds.reopenTicket, kds.markReady, kds.markHandedOff, kds.getAllDayItemTotals, kds.getTickets | — | — | NS |
| 25 | Deliveries | `DeliveriesTab` — `client/src/pages/DeliveriesTab.tsx` | 297 | handoff.getDrivers, handoff.updateDeliveryDetails, handoff.advanceStatus, handoff.getDeliveryOrders | — | — | NS |
| 26 | Dashboard | `PackingStationDashboard` — `client/src/pages/PackingStationDashboard.tsx` | 289 | packingSheetV2.list, packingSheetV2.syncFromOrders | sub-tabs: Today / Tomorrow / This Week / All Upcoming / Past / All / Not Ready / In Progress | — | NS |
| 27 | Inventory | `PackingInventory` — `client/src/pages/PackingInventory.tsx` | 351 | supply.list, supply.adjust, supply.upsert | Adjust Stock —; editModal?.id ? | — | NS |
| 28 | Supply Forecast | `SupplyForecast` — `client/src/pages/SupplyForecast.tsx` | 182 | supply.forecast | — | — | NS |

## Catering / Sales — `/sales-workspace` (12 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 29 | Director Cockpit | `DirectorCockpit` — `client/src/pages/catering/DirectorCockpit.tsx` | 877 | sales.invoices, portalV2.adminPendingCount, portalV2.adminListOrders, directorCockpit.kpis, directorCockpit.pipeline, directorCockpit.upcoming, directorCockpit.beosPendingSignoff, directorCockpit.todaysPlan, directorCockpit.redZone, directorCockpit.winsThisWeek, directorCockpit.morningBrief, directorCockpit.topSpenders, directorCockpit.upcomingSquare, directorCockpit.recurringClients (+1 more) | — | — | NS |
| 30 | Leads Pipeline | `CateringLeadPipeline` — `client/src/pages/catering/CateringLeadPipeline.tsx` | 632 | cateringLeads.getLead, cateringLeads.getActivity, cateringLeads.logActivity, cateringLeads.sendLeadEmail, cateringLeads.updateStageWithLog, cateringLeads.updatePriority, cateringLeads.listAllLeads | sub-tabs: New / Contacted / Needs Quote / Quote Sent / Booked 🎉 / Follow Up / Lost | — | NS |
| 31 | Lead Intake | `LeadIntakeForm` — `client/src/pages/LeadIntakeForm.tsx` | 759 | leadCommand.syncLeads, cateringLeads.createLead | — | — | NS |
| 32 | Calendar | `SalesCalendar` — `client/src/pages/sales/SalesCalendar.tsx` | 472 | sales.calendar | — | — | NS |
| 33 | Quotes & Invoices | `CateringQuoteBuilder` — `client/src/pages/CateringQuoteBuilder.tsx` | 1192 | finance.createQuote, finance.createInvoice | — | — | NS |
| 34 | Contacts | `SalesContacts` — `client/src/pages/sales/SalesContacts.tsx` | 592 | sales.contacts | editContact ? | — | NS |
| 35 | Venue Library | `SalesVenues` — `client/src/pages/sales/SalesVenues.tsx` | 265 | sales.venues | editVenue ? | — | NS |
| 36 | Red Zone | `RedZone` — `client/src/pages/sales/RedZone.tsx` | 260 | sales.redZone | — | — | NS |
| 37 | Approval Queue | `ApprovalQueue` — `client/src/pages/catering/ApprovalQueue.tsx` | 412 | portalV2.adminPendingCount, portalV2.adminListOrders, portalV2.adminGetOrder, portalV2.adminApproveOrder, portalV2.adminRejectOrder, portalV2.adminToggleMenuAccess, portalV2.adminRequestChanges, portalV2.adminMarkPaid | — | — | NS |
| 38 | Client Portal Admin | `ClientPortalAdmin` — `client/src/pages/ClientPortalAdmin.tsx` | 914 | clientPortal.admin_listCompanies, clientPortal.admin_listOrders, clientPortal.admin_stats, clientPortal.admin_listMenuItems, clientPortal.getMenus, clientPortal.admin_getPricing, clientPortal.admin_getBudget, clientPortal.admin_upsertCompany, clientPortal.admin_upsertUser, clientPortal.admin_approveOrder, clientPortal.admin_updateOrderStatus, clientPortal.admin_generateInvoice, clientPortal.admin_upsertMenuItem, clientPortal.admin_deleteMenuItem (+8 more) | — | — | NS |
| 39 | Equipment Catalog | `EquipmentCatalog` — `client/src/pages/catering/EquipmentCatalog.tsx` | 188 | cateringLifecycle.equipment | — | — | NS |
| 40 | Companies | `CompaniesTab` — `client/src/pages/catering/CompaniesTab.tsx` | 458 | companies.create, companies.get, companies.update, companies.list | — | — | NS |

## Marketing — `/marketing-workspace` (11 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 41 | Landing Page Hub | `MarketingHub` — `client/src/pages/marketing/MarketingHub.tsx` | 495 | marketing.getLandingPageMetrics | sub-tabs: Overview / Top Products / Customers / Weekly | — | NS |
| 42 | Command Center | `MarketingCommandCenter` — `client/src/pages/marketing/MarketingCommandCenter.tsx` | 480 | marketingCC.getDashboardSummary, marketingCC.getIgSnapshot, ghl.getDashboardSummary, marketingCC.generateDailyBriefing, marketingCC.saveIgSnapshot, marketingCC.updateTaskStatus | — | — | NS |
| 43 | Lead Analysis | `LeadAnalysis` — `client/src/pages/marketing/LeadAnalysis.tsx` | 431 | ghl.getLeadIntelligence, ghl.getPipelines, ghl.searchContacts, ghl.getOpportunities, marketingCC.runLeadAnalysis, ghl.sendSms, ghl.sendEmail | sub-tabs: New This Week / Inactive 30d+ / VIP / Catering / Pipeline / Search | — | NS |
| 44 | Content Agent | `ContentAgent` — `client/src/pages/marketing/ContentAgent.tsx` | 1283 | marketingCC.saveToMediaLibrary, marketingCC.generateHooks, marketingCC.generateScript, marketingCC.generateCaptions, marketingCC.generateStrategy, marketingCC.listVideoUploads, marketingCC.listVideoClips, marketingCC.uploadVideo, marketingCC.analyzeVideo, marketingCC.updateVideoClip, marketingCC.renderVideoClip, marketingCC.deleteVideoUpload, marketingCC.listContentIdeas, marketingCC.getIgSnapshot (+7 more) | Add Clip Idea; sub-tabs: Hook Generator / Script Generator / Caption Generator / AI Strategy / Video Clips | — | NS |
| 45 | Content Calendar | `ContentCalendar` — `client/src/pages/marketing/ContentCalendar.tsx` | 355 | marketingCC.listContentCalendar, marketingCC.saveContentCalendar, marketingCC.deleteContentCalendar, marketingCC.updateContentCalendarStatus | editing ? | — | NS |
| 46 | Media Library | `MediaLibrary` — `client/src/pages/marketing/MediaLibrary.tsx` | 268 | marketingCC.listMediaLibrary, marketingCC.saveToMediaLibrary, marketingCC.deleteFromMediaLibrary | editing ? | — | NS |
| 47 | Video Studio | `VideoStudio` — `client/src/pages/VideoStudio.tsx` | 1763 | marketingCC.renderVideoClip, marketingCC.trimClip, marketingCC.generateSubtitles, marketingCC.listVideoUploads, marketingCC.analyzeVideo, marketingCC.deleteVideoUpload, marketingCC.listVideoClips, marketingCC.updateVideoClip, marketingCC.bulkUpdateClipStatus, marketingCC.regenerateCaptions, marketingCC.splitClip, marketingCC.listAllClips, marketingCC.getDistributionSummary, marketingCC.getUploadStatus (+1 more) | sub-tabs: Upload / Clip Suggestions / Content Library / Distribution | — | NS |
| 48 | Outreach Agent | `OutreachAgent` — `client/src/pages/marketing/OutreachAgent.tsx` | 494 | marketingCC.listOutreachQueue, marketingCC.runOutreachAgent, marketingCC.saveOutreachItem, marketingCC.markOutreachSent, marketingCC.markOutreachSkipped, marketingCC.deleteOutreachItem | Add Outreach Item | — | NS |
| 49 | Performance | `PerformanceAgent` — `client/src/pages/marketing/PerformanceAgent.tsx` | 281 | marketingCC.getIgSnapshot, marketingCC.saveIgSnapshot, marketingCC.runPerformanceAnalysis | — | — | NS |
| 50 | AI Ads Center | `AdsCommandCenter` — `client/src/pages/AdsCommandCenter.tsx` | 876 | ads.getDashboard, ads.analyzeAds, ads.updateAdStatus, ads.updateCampaignBudget, ads.updateRecommendation, ads.updateDraftStatus, ads.generateCampaignDraft | Adjust Daily Budget; Fix Creative — AI Guidance | — | NS |
| 51 | Design Agent | `DesignAgent` — `client/src/pages/marketing/DesignAgent.tsx` | 703 | designAgent.getOptions, designAgent.listDesigns, designAgent.generateDesign, designAgent.toggleFavorite, designAgent.deleteDesign | selectedAsset.title} | — | NS |

## Admin — `/admin-workspace` (21 tabs)

| # | Tab | Source component | LOC | Data dependencies (tRPC) | Key nested views / dialogs | Local persistence | Status |
|---|-----|-----------------|-----|--------------------------|---------------------------|-------------------|--------|
| 52 | Menu Editor | `AdminMenuEditor` — `client/src/pages/AdminMenuEditor.tsx` | 325 | menu.list, menu.upsert, menu.hardDelete, menu.reorder | — | — | NS |
| 53 | Walk-In Samplers | `WalkInSamplerEditor` — `client/src/pages/WalkInSamplerEditor.tsx` | 320 | walkInSampler.upsert, walkInSampler.delete, walkInSampler.list | existing ? | — | NS |
| 54 | Prep Master | `AdminPrepMaster` — `client/src/pages/AdminPrepMaster.tsx` | 511 | prepBoard.listAllItems, prepBoard.getActiveSession, prepBoard.upsertItem, prepBoard.deleteItem, prepBoard.startNewWeek, prepBoard.generateFromSelection | form.id ? | — | NS |
| 55 | Father | `FathersDayAdmin` — `client/src/pages/FathersDayAdmin.tsx` | 193 | fathersDay.listOrders, fathersDay.updateStatus | — | — | NS |
| 56 | Cuban Thursday | `CubanThursdayAdmin` — `client/src/pages/CubanThursdayAdmin.tsx` | 276 | cubanThursday.listOrders, cubanThursday.updateStatus | — | — | NS |
| 57 | 4th of July | `July4Admin` — `client/src/pages/July4Admin.tsx` | 242 | july4.listOrders, july4.getDiamondAvailability, july4.updateOrderStatus | — | — | NS |
| 58 | Catering Pre-Orders | `CateringDropAdmin` — `client/src/pages/CateringDropAdmin.tsx` | 247 | cateringDrop.listOrders, cateringDrop.updateOrderStatus, cateringDrop.clearTestOrders | — | — | NS |
| 59 | Weekend Pre-Orders | `(inline)` | — | — | — | — | NS |
| 60 | Preorder Inventory Caps | `PreorderInventoryDashboard` — `client/src/pages/admin/PreorderInventoryDashboard.tsx` | 463 | preorderInventory.adminListPages, preorderInventory.adminGetPageInventory, preorderInventory.adminUpsertProduct, preorderInventory.adminAdjustSold, preorderInventory.adminResetPage | — | — | NS |
| 61 | Order Guide Setup | `OrderGuideSetup` — `client/src/pages/OrderGuideSetup.tsx` | 617 | orderGuide.getVendors, orderGuide.updateItemMeta, orderGuide.updatePar, orderGuide.upsertVendor, orderGuide.deleteVendor, orderGuide.list, orderGuide.categories | vendor ? | — | NS |
| 62 | Protein Conversions | `ProteinConversionTable` — `client/src/pages/ProteinConversionTable.tsx` | 360 | proteinConversions.list, proteinConversions.upsert | editing ? `Edit — $ | — | NS |
| 63 | Users | `UsersAdmin` — `client/src/pages/UsersAdmin.tsx` | 418 | users.list, users.listInvites, users.updateRole, users.updateName, users.deleteUser, users.createInvite, users.revokeInvite | — | — | NS |
| 64 | Team Access | `TeamManagement` — `client/src/pages/TeamManagement.tsx` | 537 | teamAuth.listTeamMembers, users.listInvites, teamAuth.adminResetPassword, users.createInvite, teamAuth.suspendMember, teamAuth.reactivateMember, teamAuth.resetAndReinvite, users.revokeInvite, users.regenerateInvite, users.extendInvite | — | — | NS |
| 65 | Express Menu | `ExpressMenuAdmin` — `client/src/pages/ExpressMenuAdmin.tsx` | 129 | expressMenu.adminListMenu, expressMenu.adminUpsertItem, expressMenu.adminDeleteItem | — | — | NS |
| 66 | Discount Codes | `DiscountCodesAdmin` — `client/src/pages/DiscountCodesAdmin.tsx` | 270 | expressMenu.adminCreateDiscountCode, expressMenu.adminListDiscountCodes, expressMenu.adminToggleDiscountCode, expressMenu.adminDeleteDiscountCode | — | — | NS |
| 67 | Events Manager | `EventsAdmin` — `client/src/pages/EventsAdmin.tsx` | 241 | publicApp.events | editing ? | — | NS |
| 68 | Brand Setup | `BrandSetup` — `client/src/pages/BrandSetup.tsx` | 551 | brand.getConfig, brand.updateConfig | — | — | NS |
| 69 | Brand Studio | `BrandStudio` — `client/src/pages/admin/BrandStudio.tsx` | 342 | tenant.listTenants, tenant.updateTenant | — | — | NS |
| 70 | License Manager | `LicensingDashboard` — `client/src/pages/admin/LicensingDashboard.tsx` | 476 | tenant.createTenant, tenant.setLicenseStatus, tenant.getTenant, tenant.getStats, tenant.listTenants | — | — | NS |
| 71 | AI Import Hub | `AIImportHub` — `client/src/pages/AIImportHub.tsx` | 423 | import.upload, import.process, import.list, import.delete | — | — | NS |
| 72 | Customer App | `CustomerHome` — `client/src/pages/public/CustomerHome.tsx` | 139 | — | — | — | NS |

## Public & landing routes (no employee login) (38 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 73 | `/orders/new` | `NewOrder` | 1926 | menu.list, walkInSampler.list, orders.checkDuplicate, orders.create | — | NS |
| 74 | `/orders/:id` | `TicketDetail` | 955 | menu.list, orders.get, orders.updateItemStatus, orders.updateStatus, orders.updateNotes, orders.softDelete, orders.cancelOrder, orders.restoreOrder | — | NS |
| 75 | `/orders/:id/edit` | `EditOrder` | 1607 | orders.get, menu.list, orders.updateFull, orders.updateItems | — | NS |
| 76 | `/orders/:id/pack` | `PackingScreen` | 209 | orders.get, orders.updateStatus | — | NS |
| 77 | `/orders/:id/packing` | `PackingSheet` | 777 | packing.getSheet, orders.get, venues.list, packing.toggleItem, packing.toggleAddon, packing.addCustomItem, packing.removeItem, packing.updateQty, packing.complete, packing.regenerate | — | NS |
| 78 | `/fire-drop` | `FireDropPage` | 907 | fireDrop.placeOrder, attribution.record, fireDrop.processPayment, fireDrop.getActiveDrop | — | NS |
| 79 | `/fire-drop/confirmation` | `FireDropConfirmation` | 130 | fireDrop.getOrderConfirmation | — | NS |
| 80 | `/fathers-day` | `FathersDayLanding` | 708 | fathersDay.getProducts, fathersDay.getDinoAvailability, fathersDay.placeOrder, attribution.record | — | NS |
| 81 | `/fathers-day/confirmation` | `FathersDayConfirmation` | 104 | — | — | NS |
| 82 | `/c/:slug` | `CampaignLanding` | 105 | attribution.getCampaign | — | NS |
| 83 | `/cuban-thursday` | `CubanThursdayLanding` | 801 | cubanThursday.getProducts, cubanThursday.placeOrder, attribution.record | — | NS |
| 84 | `/cuban-thursday/confirmation` | `CubanThursdayConfirmation` | 83 | — | — | NS |
| 85 | `/catering-request` | `CateringRequestForm` | 351 | publicCateringForm.submitLead | — | NS |
| 86 | `/catering-landing` | `PublicCateringLanding` | 587 | publicCateringForm.submitLead | — | NS |
| 87 | `/july4` | `July4Landing` | 183 | — | — | NS |
| 88 | `/july4-drop` | `July4DropPage` | 857 | july4.getProducts, july4.getDiamondAvailability, july4.placeOrder, attribution.record | — | NS |
| 89 | `/july4-drop/confirmation` | `July4DropConfirmation` | — | — | — | NS |
| 90 | `/football-sunday` | `FootballSundayPage` | 785 | footballSunday.getProducts, fireDrop.placeOrder, attribution.record | — | NS |
| 91 | `/catering-drop` | `CateringDropPage` | 650 | cateringDrop.getProducts, cateringDrop.placeOrder, attribution.record, cateringDrop.validateDiscountCode | — | NS |
| 92 | `/catering-drop/confirmation` | `CateringDropConfirmation` | — | — | — | NS |
| 93 | `/order` | `CateringOrder` | 1030 | expressMenu.list, expressMenu.placeOrder, attribution.record, expressMenu.processPayment, expressMenu.getDeliveryFee, expressMenu.validateDiscountCode | sub-tabs: Feeds 10 / Feeds 20 / Feeds 30 / Feeds 50 | NS |
| 94 | `/order/confirmation` | `CateringOrderConfirmation` | 136 | expressMenu.getConfirmation | — | NS |
| 95 | `/app` | `CustomerAppLayout` | 229 | — | — | NS |
| 96 | `/app/catering` | `CustomerAppLayout` | 229 | — | — | NS |
| 97 | `/app/order` | `CustomerAppLayout` | 229 | — | — | NS |
| 98 | `/app/events` | `CustomerAppLayout` | 229 | — | — | NS |
| 99 | `/app/about` | `CustomerAppLayout` | 229 | — | — | NS |
| 100 | `/app/serve` | `CustomerAppLayout` | 229 | — | — | NS |
| 101 | `/app/fire-drop` | `CustomerAppLayout` | 229 | — | — | NS |
| 102 | `/shop` | `CustomerAppLayout` | 229 | — | — | NS |
| 103 | `/shop/checkout` | `CustomerAppLayout` | 229 | — | — | NS |
| 104 | `/shop/confirmed` | `CustomerAppLayout` | 229 | — | — | NS |
| 105 | `/track` | `CustomerAppLayout` | 229 | — | — | NS |
| 106 | `/order-tracker` | `CustomerAppLayout` | 229 | — | — | NS |
| 107 | `/app/book` | `CateringExperience` | 1442 | eventVisualizer.uploadVenuePhoto, eventVisualizer.generateVisualization, booking.startSession, booking.saveProgress, booking.submit | sub-tabs: Mini Vegetable Spring Rolls / Mini Beef Empanadas / Bruschetta / Coconut Shrimp Skewers / Chicken Skewers / Caprese Skewers / Bite-Size Chicken & Waffles / Mini Cubanitos / Pretzel Sliders / Smoked Wings | NS |
| 108 | `/quote/:token` | `QuoteAccept` | 344 | quotes.getByToken, quotes.accept, quotes.generateDepositPaymentLink | — | NS |
| 109 | `/invoice/checkout/:token` | `InvoiceCheckout` | 475 | finance.getInvoiceByToken, finance.createInvoicePaymentLink | — | NS |
| 110 | `/sales-quote/:token` | `SalesQuotePage` | 570 | sales.quotes | — | NS |

## Client Portal (7 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 111 | `/portal` | `PortalLandingPage` | — | — | — | NS |
| 112 | `/portal/order` | `PortalLandingPage` | — | — | — | NS |
| 113 | `/portal/sign-in` | `PortalSignInPage` | — | — | — | NS |
| 114 | `/portal/account` | `PortalAccountPage` | — | — | — | NS |
| 115 | `/portal/auth` | `PortalAuthPage` | — | — | — | NS |
| 116 | `/portal/beo/:orderId` | `PortalBEOPage` | — | — | — | NS |
| 117 | `/invite/:token` | `InviteAccept` | 221 | users.getInvite, users.acceptInvite | — | NS |

## Auth & access (3 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 118 | `/login` | `LoginPage` | 65 | — | — | NS |
| 119 | `/team-login` | `TeamLogin` | 161 | teamAuth.teamLogin | — | NS |
| 120 | `/accept-invite` | `AcceptInvite` | 261 | users.getInvite, teamAuth.acceptInviteWithPassword | — | NS |

## Orders & tickets (nested order lifecycle) (5 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 121 | `/kitchen/fire/:id` | `TicketDetail` | 955 | menu.list, orders.get, orders.updateItemStatus, orders.updateStatus, orders.updateNotes, orders.softDelete, orders.cancelOrder, orders.restoreOrder | — | NS |
| 122 | `/history` | `OrderHistory` | 167 | orders.list, orders.updateStatus | — | NS |
| 123 | `/invoice-builder` | `InvoiceBuilder` | 1496 | invoiceCatalog.listCatalog, invoicePackingList.getMasterItems, finance.getInvoice, finance.createInvoice, finance.updateInvoice, packingSheetV2.generateFromInvoice, invoicePackingList.saveSelections, finance.sendInvoiceQuote, invoiceCatalog.calcProfitability | — | NS |
| 124 | `/invoice-builder/:id` | `InvoiceBuilder` | 1496 | invoiceCatalog.listCatalog, invoicePackingList.getMasterItems, finance.getInvoice, finance.createInvoice, finance.updateInvoice, packingSheetV2.generateFromInvoice, invoicePackingList.saveSelections, finance.sendInvoiceQuote, invoiceCatalog.calcProfitability | — | NS |
| 125 | `/expedite` | `ExpediteCarering` | 885 | expedite.getOrders, expedite.getLog, expedite.getSession, expedite.updateSession, expedite.toggleChecklistItem, expedite.addChecklistItem, expedite.saveSignature, expedite.uploadPhoto, expedite.completeExpo | — | NS |

## Kitchen-ops standalone (beyond workspace tabs) (44 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 126 | `/master-prep-engine` | `MasterPrepEngine` | 1073 | mpe.getPrepCountForm, mpe.submitPrepCount, mpe.getIngredientCountForm, mpe.submitIngredientCount, mpe.getPrepList, mpe.generateOrderGuide, mpe.generatePrepList, mpe.markPrepItemDone, mpe.getOrderGuide, mpe.approveOrderGuide, weeklyUnified.getUnifiedBoard | sub-tabs: Inventory / Raw Count / Wkly Board / Prep List / Order Guide | NS |
| 127 | `/master-prep-engine/admin` | `MasterPrepEngineAdmin` | 721 | mpe.getPrepItems, mpe.upsertPrepItem, mpe.deletePrepItem, mpe.getIngredients, mpe.upsertIngredient, mpe.deleteIngredient, mpe.getDishLinks, mpe.upsertDishLink, mpe.deleteDishLink, mpe.getSauceLinks, mpe.upsertSauceLink, mpe.deleteSauceLink (+3 more) | editing ?; Add Dish → Sub-Sauce Link; Add Sub-Sauce → Ingredient Link; sub-tabs: Prep Items / Ingredients / Dish → Sauce / Sauce → Raw / Vendor Items | NS |
| 128 | `/weekly-board` | `WeeklyMasterBoard` | 441 | weeklyUnified.getUnifiedBoard, orders.getWeeklyProductionBoard | — | NS |
| 129 | `/kitchen/command` | `KitchenCommandBoard` | 344 | expo.getDayView, handoff.getPipelineOrders, handoff.getReadyToPackOrders, handoff.getDeliveryOrders | — | NS |
| 130 | `/kitchen/expo` | `ExpoKDS` | 876 | kds.getProductionTotals, kds.toggleKitchenCheck, kds.toggleExpoCheck, kds.bumpToExpo, kds.signOff, kds.reopenTicket, kds.markReady, kds.markHandedOff, kds.getAllDayItemTotals, kds.getTickets | — | NS |
| 131 | `/kitchen/fire-log` | `FireLog` | 212 | expo.fireLog | — | NS |
| 132 | `/kitchen/packing` | `PackingWorkspace` | 69 | — | sub-tabs: Pack Queue / Packing Board / Expo View / Deliveries / Dashboard / Inventory / Supply Forecast | NS |
| 133 | `/kitchen/handoff` | `HandoffDashboard` | 476 | handoff.getPackingChecklist, handoff.toggleChecklistItem, handoff.advanceStatus, handoff.getPipelineOrders | — | NS |
| 134 | `/kitchen/checklist` | `KitchenChecklist` | 517 | checklist.listTemplates, checklist.getTodayRun, checklist.toggleItem, checklist.managerSignOff, checklist.setNotificationEmail | — | NS |
| 135 | `/kitchen/inventory` | `KitchenInventory` | 416 | kitchen.listInventory, kitchen.addInventoryItem, kitchen.updateInventoryItem, kitchen.deleteInventoryItem, kitchen.adjustQty | Add Inventory Item; Edit; Adjust Quantity — | NS |
| 136 | `/kitchen/recipes` | `KitchenRecipes` | 594 | kitchen.getRecipe, kitchen.addIngredient, kitchen.removeIngredient, kitchen.addPhoto, kitchen.removePhoto, kitchen.updateRecipe, kitchen.listRecipes, kitchen.addRecipe | Add Ingredient; Add Photo; Edit Recipe; New Build Card | NS |
| 137 | `/kitchen/prep` | `KitchenPrepList` | 439 | prep.getOrCreateSheet, users.list, prep.addTask, prep.toggleTask, prep.updateTask, prep.removeTask, prep.signOff | Add Prep Task; Manager Sign-Off | NS |
| 138 | `/kitchen/purchase-order` | `PurchaseOrder` | 650 | kitchen.getOrderGuide, kitchen.listInventory, kitchen.updateInventoryPriority | — | NS |
| 139 | `/kitchen/seasonings` | `SeasoningLibrary` | 316 | seasoning.list, seasoning.create | New Seasoning / Rub | NS |
| 140 | `/kitchen/seasonings/:slug` | `SeasoningDetail` | 962 | seasoning.getBySlug, seasoning.getIngredients, seasoning.getImages, seasoning.getBatchLog, seasoning.update, seasoning.addIngredient, seasoning.updateIngredient, seasoning.removeIngredient, seasoning.addImage, seasoning.removeImage, seasoning.makeBatch | Edit —; Add Ingredient; Edit Ingredient; Add Image; sub-tabs: Recipe / Application / Prep Flow | NS |
| 141 | `/kitchen/pitmaster` | `PitmasterGuide` | 517 | pitmaster.upsertGuide, pitmaster.addStep, pitmaster.updateStep, pitmaster.removeStep, pitmaster.getProtein, pitmaster.listProteins, pitmaster.createProtein | Edit; Add Step; Edit Step; Add Protein | NS |
| 142 | `/kitchen/pitmaster/:slug` | `PitmasterGuide` | 517 | pitmaster.upsertGuide, pitmaster.addStep, pitmaster.updateStep, pitmaster.removeStep, pitmaster.getProtein, pitmaster.listProteins, pitmaster.createProtein | Edit; Add Step; Edit Step; Add Protein | NS |
| 143 | `/kitchen/forecast` | `SmokerForecast` | 965 | forecast.getSmokerSchedule, forecast.getForecast, forecast.getProteinConfigs, seasoning.list, forecast.getSeasoningSchedule, forecast.upsertSmokerDay, forecast.deleteSmokerEntry, forecast.upsertSeasoningEntry, forecast.deleteSeasoningEntry, forecast.copySmokerWeek, forecast.autoFillWeek, forecast.lockWeek | 🧂 Add Seasoning —; Manage Smoke Schedule | NS |
| 144 | `/kitchen/prep-board` | `MorningPrepBoard` | 390 | prepBoard.getSession, prepBoard.updateEntry, prepBoard.addEntry, prepBoard.completeSession, prepBoard.regenerateEntries | Add Prep Item | NS |
| 145 | `/kitchen/inventory-board` | `InventoryBoard` | 404 | prepBoard.getSession, prepBoard.updateEntry, prepBoard.addEntry, prepBoard.completeSession | Add Inventory Item | NS |
| 146 | `/kitchen/prep-list` | `PrepList` | 210 | prepBoard.getSession, prepBoard.updateEntry | — | NS |
| 147 | `/kitchen/order-guide` | `OrderGuide` | 1150 | foodCost.updateOrderGuideItemUnits, meatCosts.list, meatCosts.upsert, meatCosts.delete, orderGuide.upsert, orderGuide.categories, orderGuide.list, orderGuide.delete, orderGuide.updateOnHand, orderGuide.updatePar, foodCost.validateRecipes | Remove Item? | NS |
| 148 | `/kitchen/supply-orders` | `WeeklySupplyOrders` | 501 | weeklyAggregator.getLowStock, weeklyAggregator.getSupplyOrders, weeklyAggregator.getPrepSchedule, weeklyAggregator.generate, weeklyAggregator.approveOrder | — | NS |
| 149 | `/kitchen/weekly-order` | `WeeklyOrderForecast` | 864 | weeklyForecast.getWednesdayCheckin, weeklyForecast.getStandingBuffers, weeklyForecast.updateStandingBuffer, weeklyForecast.getVendorClosures, weeklyForecast.addVendorClosure, weeklyForecast.deleteVendorClosure, weeklyForecast.getOrderHistory, weeklyForecast.cancelOrder, weeklyForecast.getDefaultWeek, weeklyForecast.getMainOrder, weeklyForecast.generateMainOrder, weeklyForecast.approveOrder | sub-tabs: This Week / Standing Buffers / Vendor Closures / Order History | NS |
| 150 | `/inventory/count` | `InventoryCount` | 295 | weeklyAggregator.getInventory, weeklyAggregator.submitCount | — | NS |
| 151 | `/kitchen/vendors` | `VendorCosts` | 714 | vendors.listVendors, vendors.createVendor, vendors.updateVendor, vendors.deleteVendor, vendors.listIngredients, vendors.createIngredient, vendors.updateIngredient, vendors.deleteIngredient, vendors.importFromOrderGuide, orderGuide.list, vendors.getPriceHistory, invoiceCatalog.listCatalog (+4 more) | editing ? | NS |
| 152 | `/kitchen/food-cost` | `FoodCost` | 1559 | foodCost.syncOrderGuideFromRecipes, foodCost.listRecipes, foodCost.getRecipe, foodCost.getCateringProfitability, foodCost.createRecipe, foodCost.updateRecipe, foodCost.deleteRecipe, foodCost.addIngredient, foodCost.updateIngredient, foodCost.removeIngredient, foodCost.calculateCost, foodCost.autoMatchAndCalculate (+4 more) | New Recipe; 🤖 AI Recipe Parser | NS |
| 153 | `/kitchen/ai-food-cost` | `AiFoodCost` | 820 | aiFoodCost.listAiRecipes, aiFoodCost.getAiRecipe, aiFoodCost.calculateWithAI, aiFoodCost.saveAiRecipe, aiFoodCost.updateAiRecipeLine, aiFoodCost.updateAiRecipe, aiFoodCost.recalculateAiRecipe, aiFoodCost.deleteAiRecipe | — | NS |
| 154 | `/kitchen/food-cost-dashboard` | `FoodCostDashboard` | 190 | laborBreakEven.foodCostDashboard | — | NS |
| 155 | `/kitchen/labor-cost` | `LaborCostTracker` | 231 | laborBreakEven.upsertLaborEntry, laborBreakEven.listLaborEntries, laborBreakEven.deleteLaborEntry | — | NS |
| 156 | `/kitchen/break-even` | `BreakEvenCalculator` | 300 | laborBreakEven.upsertBreakEven, laborBreakEven.listBreakEvens, laborBreakEven.deleteBreakEven | — | NS |
| 157 | `/kitchen/ai-prep-list` | `AiPrepList` | 148 | aiPrepList.generateWeeklyPrepList | — | NS |
| 158 | `/kitchen/yield` | `YieldSystem` | 815 | yieldSystem.getYieldConfigs, yieldSystem.updateYieldConfig, yieldSystem.getDashboard, yieldSystem.updateRawInventory, yieldSystem.updateCookedInventory, yieldSystem.getCookingPlan, yieldSystem.upsertCookingPlan, yieldSystem.deleteCookingPlan | sub-tabs: Dashboard / Order Guide / Cooking Plan | NS |
| 159 | `/kitchen/tasks` | `KitchenTaskBoard` | 572 | taskBoard.createListWithItems, taskBoard.autoSeedFromRecurring, taskBoard.toggleRecurring, taskBoard.getForDate, taskBoard.getMyTasks, taskBoard.listTeamMembers, taskBoard.completeItem, taskBoard.uncompleteItem, taskBoard.deleteList | — | NS |
| 160 | `/kitchen/haccp` | `HACCPLog` | 654 | haccp.logEntry, haccp.getRecent, haccp.getTodaySummary, haccp.getCalendarData | — | NS |
| 161 | `/kitchen/food-temp` | `FoodTempLog` | 308 | foodTemp.submitCheck, foodTemp.getTodayChecks, foodTemp.getRecent | — | NS |
| 162 | `/kitchen/food-waste` | `FoodWasteLog` | 336 | foodWaste.logWaste, foodWaste.getTodaySummary, foodWaste.getWeeklySummary, foodWaste.getRecent | — | NS |
| 163 | `/kitchen/weekly-board` | `KitchenWeeklyBoard` | 471 | weeklyUnified.getUnifiedBoard, orders.getWeeklyProductionBoard | — | NS |
| 164 | `/catering/weekly-board` | `CateringWeeklyBoard` | 470 | weeklyUnified.getUnifiedBoard, orders.getWeeklyProductionBoard | — | NS |
| 165 | `/kitchen/receive` | `ReceiveShipment` | 405 | inventory.lookupBarcode, inventory.receiveShipment, inventory.receiveHistory, inventory.createItem | — | NS |
| 166 | `/kitchen/seminole-order-guide` | `SeminoleOrderGuide` | 423 | weeklyPar.get, weeklyUnified.getUnifiedBoard, weeklyAggregator.getSeminoleOrder, weeklyAggregator.submitSeminoleOrder | — | NS |
| 167 | `/kitchen/pitmaster-ai` | `PitmasterAI` | 689 | pitmasterAgent.getTodayPlan, pitmasterAgent.getCookLogs, pitmasterAgent.getAllSmokeGuides, pitmasterAgent.generateDailyPlan, pitmasterAgent.completeTask, pitmasterAgent.logCook, pitmasterAgent.chat | sub-tabs: Daily Plan / Ask AI / Cook Logs / Smoke Guide | NS |
| 168 | `/kitchen/rib-mop-forecast` | `RibMopForecast` | 312 | prepForecast.getRibRackForecast, prepForecast.getRibMopOnHand, prepForecast.setRibMopOnHand | — | NS |
| 169 | `/kitchen/brain` | `KitchenBrain` | 10 | — | — | NS |

## Pit standalone (2 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 170 | `/pit/meat-cost` | `PitMeatCostGuide` | 337 | meatCosts.list, meatCosts.upsert, meatCosts.delete | — | NS |
| 171 | `/pit/dashboard` | REDIRECT → /kitchen/forecast | — | — | — | NS |

## Packing & delivery standalone (11 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 172 | `/packing/inventory` | `PackingInventory` | 351 | supply.list, supply.adjust, supply.upsert | Adjust Stock —; editModal?.id ? | NS |
| 173 | `/packing/supply-forecast` | `SupplyForecast` | 182 | supply.forecast | — | NS |
| 174 | `/handoff` | `HandoffDashboard` | 476 | handoff.getPackingChecklist, handoff.toggleChecklistItem, handoff.advanceStatus, handoff.getPipelineOrders | — | NS |
| 175 | `/handoff/drivers` | `HandoffDashboard` | 476 | handoff.getPackingChecklist, handoff.toggleChecklistItem, handoff.advanceStatus, handoff.getPipelineOrders | — | NS |
| 176 | `/packing` | `PackingWorkspace` | 69 | — | sub-tabs: Pack Queue / Packing Board / Expo View / Deliveries / Dashboard / Inventory / Supply Forecast | NS |
| 177 | `/packing/legacy` | `PackingStation` | 272 | handoff.getReadyToPackOrders, handoff.getPackingChecklist, handoff.toggleChecklistItem, handoff.advanceStatus | — | NS |
| 178 | `/packing/dashboard` | `PackingStationDashboard` | 289 | packingSheetV2.list, packingSheetV2.syncFromOrders | sub-tabs: Today / Tomorrow / This Week / All Upcoming / Past / All / Not Ready / In Progress / Ready / Submitted | NS |
| 179 | `/packing-sheets` | `PackingSheets` | 380 | packingSheetV2.create, packingSheetV2.list, packingSheetV2.delete | — | NS |
| 180 | `/packing-sheets/:id` | `PackingSheetEditor` | 866 | packingSheetV2.get, packingSheetV2.updateItem, packingSheetV2.addItem, packingSheetV2.removeItem, packingSheetV2.updateSection, packingSheetV2.saveHeader, packingSheetV2.submit, packingSheetV2.regenerate | — | NS |
| 181 | `/delivery` | `DeliveryBoard` | 370 | handoff.getDrivers, handoff.updateDeliveryDetails, handoff.advanceStatus, handoff.getDeliveryOrders | — | NS |
| 182 | `/driver` | `DriverView` | 197 | handoff.getDriverOrders, handoff.advanceStatus | — | NS |

## Catering / Sales / CRM standalone (57 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 183 | `/sales-workspace` | `SalesWorkspace` | 113 | portalV2.adminPendingCount, cateringLeads.listAllLeads | sub-tabs: Director Cockpit / Leads Pipeline / Lead Intake / Calendar / Quotes & Invoices / Contacts / Venue Library / Red Zone / Approval Queue / Client Portal Admin | NS |
| 184 | `/catering-hub` | `CateringHub` | 934 | cateringLifecycle.pullSheet, orderFireSheets.getByOrder, orderFireSheets.update, cateringLifecycle.eventAssignments, cateringLifecycle.staffRoster, cateringLifecycle.invoicePayment, cateringLifecycle.hub | Generate Pull Sheet; Assign Staff or Driver | NS |
| 185 | `/sales/follow-up` | `FollowUpReminders` | 212 | sales.followUp | — | NS |
| 186 | `/coordinator/calendar` | `CoordinatorCalendar` | 423 | orders.list | — | NS |
| 187 | `/coordinator/leads` | `CoordinatorLeads` | 12 | — | — | NS |
| 188 | `/coordinator/quotes` | `CoordinatorQuotes` | 12 | — | — | NS |
| 189 | `/coordinator/invoices` | `CoordinatorInvoices` | 12 | — | — | NS |
| 190 | `/coordinator/packing` | `CoordinatorPacking` | 12 | — | — | NS |
| 191 | `/coordinator/clients` | `CoordinatorClients` | 12 | — | — | NS |
| 192 | `/coordinator/venues` | `CoordinatorVenues` | 583 | venues.list, venues.create, venues.update, venues.delete | editingId ?; Remove Venue? | NS |
| 193 | `/finance` | `FinanceDashboard` | 651 | finance.getSummary, finance.getForecastSettings, finance.saveForecastSettings | — | NS |
| 194 | `/finance/customers` | `FinanceCustomers` | 477 | finance.listCustomers, finance.getRedZone, finance.createCustomer, finance.updateCustomer, finance.deleteCustomer, finance.updateCustomerSegment | editId ?; sub-tabs: All Clients / VIP / Active / Inactive / Red Zone | NS |
| 195 | `/finance/quotes` | `FinanceQuotes` | 1524 | finance.listQuotes, finance.listCustomers, finance.listQuoteTemplates, finance.createQuote, finance.updateQuote, finance.deleteQuote, finance.duplicateQuote, finance.convertQuoteToInvoice | form.quickTemplateId ? form.quickTemplateName : editingId ?; sub-tabs: Brisket / Pulled Pork / Sausage / Chicken Quarters / Ribs / Smoked Turkey / Mac & Cheese – Pint / Mac & Cheese – Half Pan / Mac & Cheese – Full Pan / Beans – Pint | NS |
| 196 | `/finance/invoices` | `FinanceInvoices` | 1104 | finance.listInvoicesWithOverdue, finance.listCustomers, finance.listQuotes, packingSheetV2.previewFromInvoice, packingSheetV2.generateFromInvoice, invoicePackingList.getMasterItems, invoicePackingList.saveSelections, finance.createInvoice, finance.updateInvoice, finance.deleteInvoice, finance.recordPayment, finance.markInvoicePaid (+2 more) | editId ? | NS |
| 197 | `/finance/payments` | `FinancePayments` | 224 | finance.listPayments, finance.listCustomers, finance.listInvoices, finance.recordPayment, finance.deletePayment | Record Payment | NS |
| 198 | `/finance/payroll` | `FinancePayroll` | 284 | finance.listPayroll, finance.addPayrollEntry, finance.deletePayrollEntry | Add Payroll Entry | NS |
| 199 | `/finance/forecast` | `FinanceForecast` | 833 | finance.getForecastSettings, finance.saveForecastSettings | sub-tabs: Overview / Adjust / Scenarios / Revenue Mix / Goals | NS |
| 200 | `/finance/bank` | `BankStatements` | 690 | bank.upload, bank.uploadPdf, bank.updateTransaction, bank.transactions, bank.summary, bank.get, bank.list, bank.delete | — | NS |
| 201 | `/finance/weekly-forecast` | `WeeklyForecast` | 439 | orders.upcoming, finance.getSummary, finance.listInvoices, aiBrain.departmentChat | — | NS |
| 202 | `/crm` | `CrmDashboard` | 234 | crm.getDashboard, crmDashboard.stats | — | NS |
| 203 | `/crm/leads` | `CrmLeads` | 277 | crm.listLeads, crm.createLead, crm.updateLead, crm.deleteLead | editId ? | NS |
| 204 | `/crm/pipeline` | `CrmPipeline` | 118 | crm.listLeads, crm.updateLead | — | NS |
| 205 | `/crm/contacts` | `CrmContacts` | 333 | crm.listContacts, crm.getContact, crm.createContact, crm.updateContact, crm.deleteContact | editId ? | NS |
| 206 | `/crm/messaging` | `CrmMessaging` | 315 | crm.listTemplates, crm.listCampaigns, crm.createTemplate, crm.updateTemplate, crm.deleteTemplate, crm.createCampaign, crm.updateCampaign, crm.deleteCampaign | editTemplateId ?; editCampaignId ? | NS |
| 207 | `/crm/opportunities` | `CrmOpportunities` | 320 | crmOpportunities.create, crmOpportunities.update, crmSettings.getPipelineStages, crmOpportunities.list, crmOpportunities.moveStage, crmOpportunities.delete | editOpp ? | NS |
| 208 | `/crm/conversations` | `CrmConversations` | 279 | crmConversations.get, crmConversations.sendMessage, crmConversations.updateStatus, crmConversations.create, crmConversations.list | New Conversation | NS |
| 209 | `/crm/events` | `CrmEvents` | 282 | crmEvents.create, crmEvents.update, crmEvents.list, crmEvents.delete | editEvent ? | NS |
| 210 | `/crm/tasks` | `CrmTasks` | 248 | crmTasks.create, crmTasks.update, crmTasks.list, crmTasks.delete | editTask ? | NS |
| 211 | `/crm/social` | `CrmSocialPlanner` | 325 | socialPlanner.create, socialPlanner.update, socialPlanner.list, socialPlanner.delete, socialPlanner.updateApproval | editPost ? | NS |
| 212 | `/crm/automations` | `CrmAutomations` | 238 | crmAutomations.create, crmAutomations.update, crmAutomations.list, crmAutomations.delete | editAutomation ? | NS |
| 213 | `/crm/settings` | `CrmSettings` | 189 | crmSettings.getPipelineStages, crmSettings.upsertPipelineStage, crmSettings.deletePipelineStage, crmSettings.getTags, crmSettings.upsertTag, crmSettings.deleteTag | — | NS |
| 214 | `/crm/ai-brain` | `AIBrain` | 631 | aiBrain.generateMessage, aiBrain.logOutreach, aiBrain.clientSegments, aiBrain.chat, aiBrain.commandPanel | — | NS |
| 215 | `/finance/brain` | `FinanceBrain` | 10 | — | — | NS |
| 216 | `/catering/brain` | `CateringBrain` | 10 | — | — | NS |
| 217 | `/crm/marketing/brain` | `MarketingBrain` | 10 | — | — | NS |
| 218 | `/crm/marketing` | `MarketingDashboard` | 925 | marketing.overview, marketing.listAccounts, marketing.upsertAccount, marketing.deleteAccount, marketing.listMetrics, marketing.addMetric, marketing.deleteMetric, marketing.listPosts, marketing.addPost, marketing.deletePost, marketing.funnelSummary, marketing.listFunnelEvents (+4 more) | sub-tabs: OVERVIEW / ACCOUNTS / METRICS / POSTS / FUNNEL / CSV IMPORT | NS |
| 219 | `/crm/marketing/playbook` | `MarketingPlaybook` | 760 | — | — | NS |
| 220 | `/catering/quote` | `CateringQuotePage` | 257 | leadCapture.submitLead | — | NS |
| 221 | `/catering/quotes` | `CateringQuoteBuilder` | 1192 | finance.createQuote, finance.createInvoice | — | NS |
| 222 | `/messages` | `MessageBoard` | 472 | messaging.createChannel, messaging.listChannels, messaging.getMessages, messaging.sendMessage, messaging.markRead, messaging.deleteMessage | — | NS |
| 223 | `/events/command` | `EventCommandBoard` | 769 | handoff.getDrivers, handoff.addDriver, handoff.advanceStatus, handoff.getEventCommandData | — | NS |
| 224 | `/sales/agent` | `SalesAgent` | 222 | sales.agent, sales.stats | — | NS |
| 225 | `/sales/lead-command` | `LeadCommandBoard` | 562 | leadCommand.sendSms, leadCommand.sendEmail, leadCommand.addNote, leadCommand.setFollowUp, leadCommand.logCall, leadCommand.claimLead, leadCommand.updateStatus, leadCommand.listLeads, leadCommand.getAlerts, leadCommand.syncLeads | — | NS |
| 226 | `/catering/lead-intake` | `LeadIntakeForm` | 759 | leadCommand.syncLeads, cateringLeads.createLead | — | NS |
| 227 | `/sales/lead-intake` | `LeadIntakeForm` | 759 | leadCommand.syncLeads, cateringLeads.createLead | — | NS |
| 228 | `/catering/lead-dashboard` | `LeadDashboard` | 455 | cateringLeads.updateStatus, cateringLeads.updatePriority, cateringLeads.updateNotes, cateringLeads.listLeads, cateringLeads.getStats | lead.customerName} | NS |
| 229 | `/sales/lead-dashboard` | `LeadDashboard` | 455 | cateringLeads.updateStatus, cateringLeads.updatePriority, cateringLeads.updateNotes, cateringLeads.listLeads, cateringLeads.getStats | lead.customerName} | NS |
| 230 | `/sales/client-portal-admin` | `ClientPortalAdmin` | 914 | clientPortal.admin_listCompanies, clientPortal.admin_listOrders, clientPortal.admin_stats, clientPortal.admin_listMenuItems, clientPortal.getMenus, clientPortal.admin_getPricing, clientPortal.admin_getBudget, clientPortal.admin_upsertCompany, clientPortal.admin_upsertUser, clientPortal.admin_approveOrder, clientPortal.admin_updateOrderStatus, clientPortal.admin_generateInvoice (+10 more) | — | NS |
| 231 | `/sales/calendar` | `SalesCalendar` | 472 | sales.calendar | — | NS |
| 232 | `/master-calendar` | `MasterCalendarPage` | 10 | — | — | NS |
| 233 | `/sales/quotes` | `SalesQuotes` | 1129 | sales.quotes, sales.invoices | sub-tabs: Party Sampler – Feeds 10 / Party Sampler – Feeds 20 / Party Sampler – Feeds 30 / Party Sampler – Feeds 50 / 5-Alarm Tailgate (8-12) / 1 Alarm Classic Box / 1 Alarm Premium Box / 2 Alarm Classic Buffet / 2 Alarm Premium Buffet / 3 Alarm Classic Buffet | NS |
| 234 | `/sales/contacts` | `SalesContacts` | 592 | sales.contacts | editContact ? | NS |
| 235 | `/sales/venues` | `SalesVenues` | 265 | sales.venues | editVenue ? | NS |
| 236 | `/sales/red-zone` | `RedZone` | 260 | sales.redZone | — | NS |
| 237 | `/sales/packing/:orderId` | `SalesPackingBuilder` | 577 | handoff.getPackingChecklist, handoff.toggleChecklistItem, handoff.addChecklistItem, handoff.removeChecklistItem, handoff.advanceStatus | — | NS |
| 238 | `/catering` | REDIRECT → /kitchen-workspace | — | — | — | NS |
| 239 | `/finance/dashboard` | REDIRECT → /finance | — | — | — | NS |

## Marketing standalone (13 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 240 | `/marketing-workspace` | `MarketingWorkspace` | 63 | — | sub-tabs: Landing Page Hub / Command Center / Lead Analysis / Content Agent / Content Calendar / Media Library / Video Studio / Outreach Agent / Performance / AI Ads Center | NS |
| 241 | `/marketing/attribution` | `AttributionDashboard` | 645 | attribution.dashboard, attribution.listCampaigns, attribution.exportCsv | — | NS |
| 242 | `/ad-creation` | `AdCreationPage` | 657 | adCreation.listJobs, adCreation.createJob, adCreation.updateJobResult, adCreation.deleteJob | — | NS |
| 243 | `/marketing` | `MarketingCommandCenter` | 480 | marketingCC.getDashboardSummary, marketingCC.getIgSnapshot, ghl.getDashboardSummary, marketingCC.generateDailyBriefing, marketingCC.saveIgSnapshot, marketingCC.updateTaskStatus | — | NS |
| 244 | `/marketing/content` | `ContentAgent` | 1283 | marketingCC.saveToMediaLibrary, marketingCC.generateHooks, marketingCC.generateScript, marketingCC.generateCaptions, marketingCC.generateStrategy, marketingCC.listVideoUploads, marketingCC.listVideoClips, marketingCC.uploadVideo, marketingCC.analyzeVideo, marketingCC.updateVideoClip, marketingCC.renderVideoClip, marketingCC.deleteVideoUpload (+9 more) | Add Clip Idea; sub-tabs: Hook Generator / Script Generator / Caption Generator / AI Strategy / Video Clips | NS |
| 245 | `/marketing/content-calendar` | `ContentCalendar` | 355 | marketingCC.listContentCalendar, marketingCC.saveContentCalendar, marketingCC.deleteContentCalendar, marketingCC.updateContentCalendarStatus | editing ? | NS |
| 246 | `/marketing/media-library` | `MediaLibrary` | 268 | marketingCC.listMediaLibrary, marketingCC.saveToMediaLibrary, marketingCC.deleteFromMediaLibrary | editing ? | NS |
| 247 | `/marketing/video-studio` | `VideoStudio` | 1763 | marketingCC.renderVideoClip, marketingCC.trimClip, marketingCC.generateSubtitles, marketingCC.listVideoUploads, marketingCC.analyzeVideo, marketingCC.deleteVideoUpload, marketingCC.listVideoClips, marketingCC.updateVideoClip, marketingCC.bulkUpdateClipStatus, marketingCC.regenerateCaptions, marketingCC.splitClip, marketingCC.listAllClips (+3 more) | sub-tabs: Upload / Clip Suggestions / Content Library / Distribution | NS |
| 248 | `/marketing/design-agent` | `DesignAgent` | 703 | designAgent.getOptions, designAgent.listDesigns, designAgent.generateDesign, designAgent.toggleFavorite, designAgent.deleteDesign | selectedAsset.title} | NS |
| 249 | `/marketing/outreach` | `OutreachAgent` | 494 | marketingCC.listOutreachQueue, marketingCC.runOutreachAgent, marketingCC.saveOutreachItem, marketingCC.markOutreachSent, marketingCC.markOutreachSkipped, marketingCC.deleteOutreachItem | Add Outreach Item | NS |
| 250 | `/marketing/performance` | `PerformanceAgent` | 281 | marketingCC.getIgSnapshot, marketingCC.saveIgSnapshot, marketingCC.runPerformanceAnalysis | — | NS |
| 251 | `/marketing/leads` | `LeadAnalysis` | 431 | ghl.getLeadIntelligence, ghl.getPipelines, ghl.searchContacts, ghl.getOpportunities, marketingCC.runLeadAnalysis, ghl.sendSms, ghl.sendEmail | sub-tabs: New This Week / Inactive 30d+ / VIP / Catering / Pipeline / Search | NS |
| 252 | `/marketing/ads` | `AdsCommandCenter` | 876 | ads.getDashboard, ads.analyzeAds, ads.updateAdStatus, ads.updateCampaignBudget, ads.updateRecommendation, ads.updateDraftStatus, ads.generateCampaignDraft | Adjust Daily Budget; Fix Creative — AI Guidance | NS |

## Admin standalone (17 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 253 | `/admin/menu` | `AdminMenuEditor` | 325 | menu.list, menu.upsert, menu.hardDelete, menu.reorder | — | NS |
| 254 | `/admin/walk-in-sampler` | `WalkInSamplerEditor` | 320 | walkInSampler.upsert, walkInSampler.delete, walkInSampler.list | existing ? | NS |
| 255 | `/admin/users` | `UsersAdmin` | 418 | users.list, users.listInvites, users.updateRole, users.updateName, users.deleteUser, users.createInvite, users.revokeInvite | — | NS |
| 256 | `/admin/team` | `TeamManagement` | 537 | teamAuth.listTeamMembers, users.listInvites, teamAuth.adminResetPassword, users.createInvite, teamAuth.suspendMember, teamAuth.reactivateMember, teamAuth.resetAndReinvite, users.revokeInvite, users.regenerateInvite, users.extendInvite | — | NS |
| 257 | `/admin/prep-template` | `PrepTemplateEditor` | 504 | prep.listTemplates, prep.addTemplate, prep.updateTemplate, prep.deleteTemplate | Add Prep Task to Template; Edit Prep Task | NS |
| 258 | `/admin/catering-inquiries` | `CateringInquiryLeads` | 421 | publicCateringForm.listLeads, publicCateringForm.updateStage, publicCateringForm.updateNotes, publicCateringForm.deleteLead | — | NS |
| 259 | `/admin/online-orders` | `OnlineOrdersAdmin` | 133 | expressMenu.listOrders, expressMenu.updateOrderStatus | — | NS |
| 260 | `/admin/express-menu` | `ExpressMenuAdmin` | 129 | expressMenu.adminListMenu, expressMenu.adminUpsertItem, expressMenu.adminDeleteItem | — | NS |
| 261 | `/admin/discount-codes` | `DiscountCodesAdmin` | 270 | expressMenu.adminCreateDiscountCode, expressMenu.adminListDiscountCodes, expressMenu.adminToggleDiscountCode, expressMenu.adminDeleteDiscountCode | — | NS |
| 262 | `/admin/events` | `EventsAdmin` | 241 | publicApp.events | editing ? | NS |
| 263 | `/admin/shop/orders` | `ShopAdmin` | 140 | shop.orders | — | NS |
| 264 | `/admin/shop/products` | `ShopProductManager` | 298 | shop.products | — | NS |
| 265 | `/admin/brand-setup` | `BrandSetup` | 551 | brand.getConfig, brand.updateConfig | — | NS |
| 266 | `/admin/licensing` | `LicensingDashboard` | 476 | tenant.createTenant, tenant.setLicenseStatus, tenant.getTenant, tenant.getStats, tenant.listTenants | — | NS |
| 267 | `/admin/brand-studio` | `BrandStudio` | 342 | tenant.listTenants, tenant.updateTenant | — | NS |
| 268 | `/admin/preorder-inventory` | `PreorderInventoryDashboard` | 463 | preorderInventory.adminListPages, preorderInventory.adminGetPageInventory, preorderInventory.adminUpsertProduct, preorderInventory.adminAdjustSold, preorderInventory.adminResetPage | — | NS |
| 269 | `/admin/ai-import` | `AIImportHub` | 423 | import.upload, import.process, import.list, import.delete | — | NS |

## Agents & operations (24 routes)

| # | Route | Component | LOC | Data dependencies (tRPC) | Nested views / dialogs | Status |
|---|-------|-----------|-----|--------------------------|------------------------|--------|
| 270 | `/dashboard` | `CommandCenter` | 642 | dashboard.commandCenter, finance.getSummary, vendorOrdering.listDrafts | — | NS |
| 271 | `/dashboard/legacy` | `ManagerDashboard` | 452 | dashboard.calendar, dashboard.stats, dashboard.glance, orders.upcoming | — | NS |
| 272 | `/ops/accountability` | `AccountabilityBoard` | 195 | accountability.getDailyStatus | — | NS |
| 273 | `/ops/accountability/:slug` | `AccountabilityChecklist` | 408 | accountability.getOrCreateSubmission, accountability.toggleItem, accountability.updateItemValue, accountability.submitChecklist, accountability.getHistory | — | NS |
| 274 | `/ops/vendor-orders` | `VendorOrderDashboard` | 382 | vendorOrdering.listDrafts, vendorOrderingAgent.getAgentContext, vendors.listVendors, vendorOrderingAgent.runAgent, vendorOrdering.createDraft | Create Manual Draft | NS |
| 275 | `/ops/vendor-orders/:id` | `VendorOrderDetail` | 810 | vendorOrdering.getDraft, vendorOrdering.submitForApproval, vendorOrdering.approveDraft, vendorOrdering.rejectDraft, vendorOrdering.markOrdered, vendorOrdering.markReceived, vendorOrdering.addLine, vendorOrdering.updateLine, vendorOrdering.removeLine, vendorOrdering.deleteDraft, vendorOrdering.upsertSpendLimit, cheneyOrdering.queueOrder (+1 more) | Add Item to Order | NS |
| 276 | `/ops/vendor-price-agent` | `VendorPriceAgent` | 1054 | vendorAgent.getPriceComparison, vendorAgent.listVendors, vendorAgent.listPullRuns, vendorAgent.getReviewQueue, vendorAgent.getOrderGuide, vendorAgent.triggerPullRun, vendorAgent.hasCredentials, vendorAgent.upsertVendor, vendorAgent.setCredentials | — | NS |
| 277 | `/operations/staff` | `StaffSchedule` | 412 | operations.manpower, operations.staff | existing ? | NS |
| 278 | `/operations/timeclock` | `TimeClock` | 292 | operations.timeClock, operations.staff | — | NS |
| 279 | `/operations/tasks` | `TaskBoard` | 1104 | operations.tasks, operations.staff | Edit Task; 📋 Load Prep List; New Task; 👥 Manage Crew | NS |
| 280 | `/operations/briefing` | `DailyBriefing` | 141 | operations.briefings | — | NS |
| 281 | `/operations/prep-lists` | `PrepListManager` | 259 | operations.prepLists | ✦ Generate AI Prep List | NS |
| 282 | `/agents` | `AgentCommandCenter` | — | — | — | NS |
| 283 | `/agents/cfo` | `CfoAgent` | 76 | agents.cfo | — | NS |
| 284 | `/agents/catering` | `CateringAgent` | 71 | agents.catering | — | NS |
| 285 | `/agents/kitchen` | `KitchenAgent` | 83 | pitmasterAgent.chat, agents.catering | — | NS |
| 286 | `/agents/operations` | `OperationsAgent` | 72 | agents.operations | — | NS |
| 287 | `/agents/marketing` | `MarketingAgent` | 69 | agents.marketing | — | NS |
| 288 | `/agents/payroll` | `PayrollAgent` | 73 | agents.payroll | — | NS |
| 289 | `/ops` | `KitchenOpsHome` | 103 | — | sub-tabs: Kitchen / Seminole Heights / Catering / Pitmaster | NS |
| 290 | `/ops/kitchen` | `KitchenSection` | 159 | — | — | NS |
| 291 | `/ops/retail` | `RetailSection` | 143 | — | — | NS |
| 292 | `/ops/catering` | `CateringSection` | 151 | — | — | NS |
| 293 | `/ops/pitmaster` | `PitmasterSection` | 151 | — | — | NS |

## Remaining routes (20)

| # | Route | Component | LOC | Data dependencies (tRPC) | Status |
|---|-------|-----------|-----|--------------------------|--------|
| 294 | `/` | `Home` | 317 |  | NS |
| 295 | `/home` | `Home` | 317 |  | NS |
| 296 | `/board` | `REDIRECT → /kitchen-workspace#fire-sheets` | — | — | NS |
| 297 | `/production` | `REDIRECT → /kitchen-workspace#fire-sheets` | — | — | NS |
| 298 | `/retail` | `REDIRECT → /retail-workspace` | — | — | NS |
| 299 | `/retail/fire-sheet` | `REDIRECT → /retail-workspace` | — | — | NS |
| 300 | `/retail/dashboard` | `REDIRECT → /retail-workspace` | — | — | NS |
| 301 | `/retail/weekly-par` | `REDIRECT → /retail-workspace` | — | — | NS |
| 302 | `/retail/weekly-board` | `REDIRECT → /retail-workspace` | — | — | NS |
| 303 | `/retail/checklist` | `REDIRECT → /retail-workspace` | — | — | NS |
| 304 | `/retail/preorders/new` | `NewRetailPreorder` | 520 | menu.list, retailPreorders.get, retailPreorders.create, retailPreorders.updateFull | NS |
| 305 | `/retail/preorders/:id/edit` | `NewRetailPreorder` | 520 | menu.list, retailPreorders.get, retailPreorders.create, retailPreorders.updateFull | NS |
| 306 | `/retail/preorders/:id` | `RetailPreorderDetail` | 364 | retailPreorders.get, retailPreorders.updateStatus, retailPreorders.updateItemStatus | NS |
| 307 | `/retail/preorders` | `REDIRECT → /retail-workspace` | — | — | NS |
| 308 | `/kitchen` | `REDIRECT → /kitchen/expo` | — | — | NS |
| 309 | `/retail/brain` | `RetailBrain` | 10 |  | NS |
| 310 | `/client-portal` | `REDIRECT → /portal/sign-in` | — | — | NS |
| 311 | `/ai-brain` | `REDIRECT → /crm/ai-brain` | — | — | NS |
| 312 | `/admin` | `REDIRECT → /admin/users` | — | — | NS |
| 313 | `/404` | `NotFound` | 53 |  | NS |

---

## Backend dependency inventory — tRPC routers (62)

| Router | Queries | Mutations | LOC |
|--------|---------|-----------|-----|
| `accountability` | 4 | 7 | 671 |
| `ads` | 1 | 7 | 684 |
| `agents` | 6 | 6 | 599 |
| `aiFoodCost` | 2 | 6 | 615 |
| `aiPrepList` | 0 | 1 | 70 |
| `attribution` | 4 | 2 | 342 |
| `bank` | 4 | 4 | 318 |
| `booking` | 2 | 3 | 462 |
| `brand` | 1 | 1 | 100 |
| `cateringLeads` | 5 | 7 | 374 |
| `cateringLifecycle` | 33 | 22 | 840 |
| `cheneyOrdering` | 2 | 3 | 431 |
| `clientPortal` | 18 | 21 | 934 |
| `companies` | 5 | 3 | 201 |
| `compliance` | 10 | 3 | 294 |
| `crmPlatform` | 13 | 27 | 753 |
| `designAgent` | 2 | 5 | 312 |
| `directorCockpit` | 11 | 1 | 516 |
| `eventVisualizer` | 2 | 2 | 135 |
| `expedite` | 3 | 6 | 372 |
| `foodCost` | 6 | 16 | 1284 |
| `ghl` | 9 | 7 | 257 |
| `globalSearch` | 1 | 0 | 613 |
| `handoff` | 12 | 8 | 831 |
| `import` | 1 | 3 | 463 |
| `inventory` | 5 | 11 | 345 |
| `inventoryOrder` | 6 | 8 | 267 |
| `invoiceCatalog` | 2 | 2 | 209 |
| `invoicePackingList` | 3 | 6 | 217 |
| `laborBreakEven` | 5 | 4 | 183 |
| `leadCapture` | 3 | 3 | 200 |
| `leadCommand` | 3 | 8 | 256 |
| `marketing` | 12 | 9 | 605 |
| `marketingCC` | 14 | 39 | 1573 |
| `masterCalendar` | 1 | 0 | 325 |
| `meatCosts` | 1 | 2 | 61 |
| `messaging` | 3 | 4 | 217 |
| `mpe` | 11 | 16 | 1205 |
| `multiChannelDemand` | 0 | 0 | 351 |
| `nanoBanana` | 3 | 3 | 289 |
| `operations` | 16 | 31 | 867 |
| `orderFireSheets` | 4 | 1 | 205 |
| `packages` | 4 | 0 | 99 |
| `packingEngine` | 3 | 4 | 756 |
| `packingSheetV2` | 4 | 11 | 766 |
| `pitChecklist` | 2 | 6 | 286 |
| `pitmasterAgent` | 6 | 4 | 569 |
| `portalV2` | 9 | 12 | 805 |
| `preorderInventory` | 3 | 5 | 360 |
| `prepForecast` | 3 | 1 | 187 |
| `publicApp` | 6 | 9 | 295 |
| `publicCateringForm` | 1 | 4 | 400 |
| `quotes` | 3 | 6 | 374 |
| `sales` | 20 | 26 | 1432 |
| `shop` | 6 | 8 | 362 |
| `vendorAgent` | 11 | 11 | 803 |
| `vendorInvoices` | 3 | 6 | 360 |
| `vendorOrdering` | 5 | 13 | 819 |
| `vendors` | 6 | 11 | 443 |
| `weeklyAggregator` | 7 | 4 | 690 |
| `weeklyForecast` | 6 | 6 | 784 |
| `yieldSystem` | 6 | 5 | 398 |

## Database inventory — 292 tables (MySQL/Drizzle source → Supabase Postgres target)

<details><summary>Full table list</summary>

`users` · `menu_items` · `companies` · `catering_orders` · `order_items` · `retail_daily_sessions` · `retail_daily_items` · `retail_preorders` · `retail_preorder_items` · `retail_weekly_par_sheets` · `retail_weekly_par_items` · `checklist_templates` · `checklist_template_items` · `checklist_runs` · `checklist_run_items` · `packing_sheets` · `packing_items` · `invite_tokens` · `prep_task_templates` · `daily_prep_sheets` · `daily_prep_tasks` · `inventory_items` · `inventory_log` · `recipes` · `recipe_ingredients` · `recipe_photos` · `seasonings` · `seasoning_ingredients` · `seasoning_images` · `seasoning_batch_log` · `pitmaster_proteins` · `pitmaster_guides` · `pitmaster_steps` · `smoker_schedule` · `seasoning_schedule` · `forecast_protein_config` · `smoker_sessions` · `smoker_temp_readings` · `smoke_log` · `finance_customers` · `finance_quotes` · `finance_quote_items` · `finance_quote_templates` · `finance_invoices` · `finance_invoice_items` · `finance_payments` · `finance_payroll` · `crm_contacts` · `crm_leads` · `crm_lead_notes` · `crm_message_templates` · `crm_campaigns` · `crm_outreach_log` · `fire_drops` · `fire_drop_products` · `fire_drop_slots` · `fire_drop_orders` · `fire_drop_order_items` · `fd_pending_checkouts` · `square_webhook_event_log` · `express_menu_items` · `online_catering_orders` · `online_catering_order_items` · `prep_board_items` · `prep_board_sessions` · `prep_board_entries` · `order_guide_items` · `social_accounts` · `metric_snapshots` · `post_insights` · `funnel_events` · `csv_imports` · `financial_settings` · `public_events` · `nonprofit_opportunities` · `catering_inquiries` · `catering_quotes` · `quote_line_items` · `fire_drop_signups` · `catering_booking_sessions` · `shop_products` · `shop_carts` · `shop_orders` · `drivers` · `handoff_events` · `packing_checklist_items` · `delivery_details` · `brand_config` · `upload_imports` · `message_channels` · `messages` · `message_reads` · `staff_members` · `shifts` · `prep_lists` · `task_assignments` · `daily_briefings` · `event_visualizations` · `discount_codes` · `bank_statements` · `bank_transactions` · `protein_raw_inventory` · `protein_cooked_inventory` · `cooking_plan_entries` · `crm_opportunities` · `crm_opportunity_notes` · `crm_conversations` · `crm_conversation_messages` · `crm_tasks` · `crm_events` · `crm_social_posts` · `crm_automations` · `crm_automation_logs` · `crm_tag_definitions` · `crm_pipeline_stages` · `packing_sheets_v2` · `packing_sheet_sections` · `packing_sheet_section_items` · `packing_master_items` · `invoice_packing_selections` · `invoice_menu_catalog` · `tenants` · `tenant_users` · `tenant_audit_log` · `tenant_billing_events` · `tenant_onboarding` · `vendors` · `ingredients` · `ingredient_price_history` · `catalog_item_ingredients` · `vendor_invoices` · `vendor_invoice_lines` · `supply_inventory` · `supply_transactions` · `task_lists` · `task_items` · `venues` · `pitmaster_daily_plans` · `pitmaster_task_completions` · `smoker_cook_logs` · `pitmaster_conversations` · `sales_contacts` · `sales_venues` · `sales_quotes` · `sales_invoices` · `red_zone_clients` · `sales_agent_conversations` · `sales_morning_briefs` · `accountability_roles` · `accountability_checklist_items` · `accountability_submissions` · `accountability_submission_items` · `packing_lists` · `driver_assignments` · `staff_assignments` · `quote_handoff_statuses` · `vendor_order_drafts` · `vendor_order_draft_lines` · `vendor_spend_limits` · `vendor_order_audit_log` · `marketing_content_ideas` · `marketing_outreach_queue` · `marketing_daily_tasks` · `marketing_ig_cache` · `ad_campaigns` · `ads` · `ad_recommendations` · `ad_campaign_drafts` · `video_uploads` · `video_clips` · `video_timelines` · `ai_recipes` · `ai_recipe_lines` · `meat_costs` · `labor_entries` · `event_break_evens` · `pit_cook_sessions` · `pit_checklist_items` · `ghl_leads` · `lead_activity_log` · `client_companies` · `client_users` · `client_orders` · `client_order_items` · `client_portal_sessions` · `portal_menu_items` · `portal_order_templates` · `portal_budget_settings` · `portal_pricing_config` · `client_invoices` · `employee_votes` · `vendor_credentials` · `vendor_items` · `vendor_price_history` · `vendor_pull_runs` · `vendor_audit_log` · `catering_leads` · `staff_availability` · `time_clock` · `payroll_exports` · `manpower_schedules` · `manpower_assignments` · `content_calendar` · `media_library` · `design_assets` · `expo_sessions` · `expo_checklist_items` · `expo_signatures` · `nano_banana_decks` · `nano_banana_slides` · `catering_packages` · `package_line_items` · `smoked_inventory_batches` · `fathers_day_orders` · `fathers_day_order_items` · `cuban_thursday_products` · `cuban_thursday_orders` · `cuban_thursday_order_items` · `equipment_items` · `equipment_attachments` · `pull_sheets` · `pull_sheet_lines` · `invoice_payment_links` · `staff_roster` · `event_assignments` · `sales_contact_files` · `portal_accounts` · `portal_account_menu_access` · `portal_orders` · `portal_order_items` · `portal_magic_links` · `portal_packing_sheets` · `portal_packing_sheet_items` · `deliveries` · `order_fire_sheets` · `packing_catalog_items` · `packing_scaling_rules` · `packing_engine_lines` · `locations` · `suppliers` · `ingredient_yield` · `inventory_count_logs` · `weekly_supply_orders` · `weekly_prep_schedules` · `delivery_photos` · `lead_captures` · `lead_webhook_configs` · `kds_tickets` · `kds_kitchen_checks` · `kds_expo_checks` · `kds_signoffs` · `july4_orders` · `july4_order_items` · `order_guide_vendors` · `order_guide_drafts` · `catering_prep_tasks` · `protein_conversions` · `catering_drop_orders` · `catering_drop_order_items` · `standing_buffers` · `vendor_closures` · `weekly_order_run_meta` · `prep_recipe_items` · `prep_recipe_ingredients` · `prep_on_hand` · `inventory_submissions` · `inventory_order_drafts` · `drop_weeks` · `public_catering_leads` · `prep_usage_rules` · `preorder_products` · `preorder_reservations` · `mpe_locations` · `mpe_prep_items` · `mpe_ingredients` · `mpe_vendor_items` · `mpe_dish_to_subsauce` · `mpe_subsauce_to_ingredient` · `mpe_on_hand_prep` · `mpe_on_hand_ingredients` · `mpe_prep_runs` · `mpe_prep_run_items` · `mpe_order_guide_runs` · `mpe_order_guide_run_items` · `order_attributions` · `campaign_landing_pages` · `ad_creation_jobs` · `walk_in_sampler_items` · `product_build_map` · `unified_orders` · `sh_commissary_submissions` · `sh_par_config`

</details>

## Known business rules to preserve (authoritative per owner handoff)

- Fire Drop: Friday ordering closes Thu 5:00 PM ET; Saturday ordering opens Thu 5:00 PM ET and closes Fri 3:00 PM ET; 7.5% fixed sales tax; weekly auto-advance every Monday (resets slots + owner notification); public pages never require employee login; sold-out enforced server-side.
- Menu truths: Cubans & Brisket Smash Burgers Thursday-only; Fri/Sat are BBQ preorder days; Walk-In Sampler = pulled pork, brisket, sausage, ribs, chicken quarters only; preserve complete Manus catalog and category order.
- Native attribution: UTM, gclid, fbclid, referrer, landing page on all public lead/order routes; no GoHighLevel dependency.
- Payment/webhook security fixes are mandatory deltas from the Manus implementation (see ARCHITECTURE.md §Security): server-side price/tax recalculation, checkout-attempt UUID, Square signature verification on raw body, idempotent retry-safe webhook processing, one-time order recovery on payment.completed, no client-trusted payment IDs, no hardcoded test discount codes.
