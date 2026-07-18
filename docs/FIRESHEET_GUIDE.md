# Station House BBQ — Fire Sheet V2 Operating Guide

Fire Sheet V2 is the whole restaurant on one screen: kitchen production, the Seminole Heights counter, the pit, packing, catering sales, marketing, and admin — plus the customer-facing ordering pages (Fire Drop, Cuban Thursday, catering requests, order tracking, quotes, and the client portal). It runs in two modes: **demo mode** keeps all data in your browser with realistic seed data, a simulated clock, and a role switcher so anyone can walk every flow safely. **Supabase mode** is the same app pointed at the shared database — real clock, real sign-in, roles come from your staff profile, and the server enforces every rule. Try it here: <https://stationhousebbq.github.io/station-house-fire-sheet-v2/v2/>. For a 10-minute walkthrough to show someone, see [DEMO_SCRIPT.md](DEMO_SCRIPT.md).

---

## Works everywhere

These behaviors are the same on every screen.

**Back / Forward / Home.** The top bar always has `← Back`, `→ Forward`, and `⌂ Home` buttons. They work with the hash-based routing on the preview site, so you can always retrace your steps or bail out to the Hub in one tap.

**12-second Undo.** Every forward action — bumping a ticket, marking a pickup, advancing an order — pops a snackbar at the bottom with an `↩ Undo` button. You have 12 seconds; tap it and the action is reverted through the same data layer that made it. A new action replaces the previous offer. The KDS lanes additionally have a per-ticket `↩` back-step button that moves a ticket back a stage at any time (back-steps are their own undo, so they don't get a snackbar).

**Autosave with sync badges.** There is no Save button anywhere. Edits write through immediately and the screen shows a small badge: `Saving…` (amber) then `Saved ✓` (green), or an error state if a write fails. Refresh the page mid-task — checked prep items, quantities, notes — nothing is lost.

**Roles.** In demo mode the Hub has a **Demo role** dropdown with five roles. Workspaces you can't use are dimmed with "Not available to current role."

| Role | Sees |
|---|---|
| Owner / Admin | Everything, including Admin |
| Catering Director | Catering/Sales, Marketing, plus operational views |
| Kitchen | Kitchen, Pit, Packing — no pricing, no admin |
| Counter / FOH | Seminole Heights (orders, KDS, pickups, checklist, temp log) |
| Packing | Packing views and read-only order details |

In Supabase mode there is no switcher — your role derives from your signed-in staff profile, and the database's row-level security is the real boundary (the UI gating is just convenience).

**Demo controls.** At the bottom of the Hub (demo mode only, never rendered live) is an amber panel with a simulated clock so you can demo any ordering window on any real day. Presets: `Tue 10:00 AM` (Friday ordering OPEN), `Thu 11:30 AM` (Cuban Thursday service), `Thu 6:00 PM` (Saturday window OPEN), `Fri 2:00 PM` (Saturday last call), `Fri 11:30 AM` (Friday pickups live), plus `● Live clock` to go back to real time. A "Simulating:" badge shows whenever an override is active. **Reset demo data** (two-tap confirm) wipes the browser data and reloads with fresh seeds.

**Printing.** Kitchen → Fire Sheets has a `🖨 Print` button that produces a clean black-and-white production sheet — the print stylesheet strips the navigation and dark theme automatically.

**CSV exports.** Seminole → Preorders has `⬇ Export CSV` (exports exactly the filtered list you're looking at) and Seminole → Fire Drop has `⬇ Export orders CSV` — both produce the same standard preorder CSV format.

**Mobile.** Every button is at least 44px tall for gloved/greasy fingers, navigation collapses to icons on narrow screens, and the whole app works from a phone on the same URLs.

---

## Kitchen workspace

*Visible to: Owner/Admin, Kitchen.*

### Weekly Board
What it's for: one look at the whole week's orders. Read-only.
1. Open Kitchen → Weekly Board. You get a Mon–Sun grid built from the live order list.
2. Each day shows order cards with channel badges (Catering, Fire Drop, Cuban Thu, Retail, Walk-in) and status badges.
3. Tap a card to expand its items inline.
4. Each day's footer totals up items so you can eyeball volume per day. No mutations here — work the orders from Fire Sheets.

### Fire Sheets
What it's for: run today's production, order by order.
1. Pick a day from the date chips across the top of the week (today is preselected).
2. Each ticket shows customer, channel, items, and status. Tap the notes area to edit kitchen notes inline — autosaves.
3. Advance status with one button that changes as you go: `🔥 Start Prep` → `✅ Mark Ready` → `📦 Picked Up`. Every advance offers the 12-second Undo.
4. The Daily Totals panel sums every item across the day's tickets — that's your fire sheet.
5. `🖨 Print` gives the clean paper version for the line.
Improvements over the old build: status advances are one-tap with undo, notes autosave with a sync badge, and print is built in.

### Calendar
What it's for: month view of everything scheduled. Read-only.
1. Use ‹ / › to move months. Today (ET) is highlighted.
2. Events are color-coded by kind: Catering (purple), Fire Drop (orange), Cuban Thursday (green), Retail (blue), Holiday (gray).

### Expo KDS
What it's for: the ticket screen from cook to handoff.
1. Three lanes: **Kitchen** ("Check items as cooked, then bump"), **Expo** ("Check items as packed"), **Ready**, plus a collapsed Handed-off count. Auto-refreshes every 15 seconds.
2. In Kitchen, check off items as they're cooked, then `⬆ Bump to Expo`.
3. In Expo, check items as packed, then `✅ Mark Ready`.
4. In Ready, `🤝 Hand Off` when the customer has it.
5. Made a mistake? Every forward bump gets a 12-second Undo snackbar, and each ticket has a `↩` back-step button to walk it back a lane.
6. The all-day totals panel shows checked/total progress across every open ticket.
Improvements: one-tap bumps with undo AND back-steps — the old build had no way to walk a ticket backward.

### Meat Calc
What it's for: how much to order for a crowd. Pure calculator, changes nothing.
1. Enter guest count or tap a preset (25–300).
2. Pick appetite: Light (⅓ lb/guest), Regular (½ lb), Hearty (¾ lb).
3. Set the protein mix percentages.
4. Read the results: cooked lbs needed, raw units to order (rounded up), and portion counts — all computed from the same protein-conversion table Admin maintains, so the math matches the rest of the app.

### Prep
What it's for: the morning prep list, generated automatically.
1. Today's session is built from the Prep Master PAR templates (Thursday-only rows join on Thursdays). Entries are grouped by category.
2. Tap an item to advance it: not started → in progress → complete (tap again to reset).
3. Tap a quantity to edit it — quantities display as kitchen fractions (1/2, 1 1/2, 2 3/4).
4. Add ad-hoc items with the add-entry form; use "hide done" to shrink the list as you go.
5. Progress stats sit at the top; everything autosaves and survives a refresh.
Improvements: the list generates itself from PARs (demand auto-fill), and mid-shift input can't be lost.

### Order History
What it's for: find any order, ever, and see its full trail.
1. Search by customer name or order ref; filter with status chips and the channel dropdown.
2. Tap a row to expand: full item list plus the status timeline — every change records who, what, and when (from → to, timestamp, actor).
3. Fix a status with the per-order status dropdown.
Improvements: a real audit trail on every order — nothing changes status silently.

### Morning Checklist
What it's for: opening the kitchen the same way every day.
1. Items are grouped by section with big tap targets; per-section and overall progress bars fill as you check.
2. When everything is done, **Manager Sign-Off** (Owner/Admin or Kitchen role) locks the run for the day.
Improvements: sign-off gating — the checklist can't be quietly half-finished and forgotten.

### Prep Recipes
What it's for: the recipe book behind the prep list.
1. Tap a recipe card to open the detail dialog: ingredients table plus numbered steps.
2. **New/Edit** opens a form with dynamic ingredient rows and one-step-per-line instructions.
3. Delete is two-tap (tap once, confirm) so nothing vanishes by accident.

---

## Seminole Heights workspace

*Visible to: Owner/Admin, Counter/FOH.*

### Dashboard
What it's for: the counter's at-a-glance morning read.
1. Open it and you see preorder pickup counts and revenue for the weekend, today's fire-sheet case status, and whether the Fire Drop ordering window is currently OPEN or CLOSED — computed from the same authoritative ET rules the checkout uses.

### Fire Sheet
What it's for: what's in the hot case right now.
1. Tap an item to cycle its status: queued → firing → in case → 86'd → back to queued.
2. Tap quantities to edit inline; add or remove items as the day demands.
3. **PAR sync** pulls the standard case quantities in.
4. **Submit to Kitchen** is a one-way handoff — once sent, the kitchen owns it.

### KDS
What it's for: the counter's view of the kitchen's ticket flow.
1. Today's tickets appear in Kitchen / Expo / Ready groups with big floor-visible type. Item checkmarks mirror the kitchen screen read-only.
2. Your two actions: hand off a Ready ticket to the customer, and bump today's preorder pickups off the **PICKUPS** board below the lanes.

### Preorders
What it's for: working the pickup line on Friday/Saturday (and Cuban Thursday).
1. Pickup-day tabs (Friday / Saturday of the active drop weekend, Thursday for Cuban) sit on top, with order counts on each tab.
2. Orders group under sticky day + pickup-window subheaders, so the 11:30 window's orders are together.
3. Customer arrives → tap the big `PICKED UP ✓` button. It clears instantly, with the 12-second Undo if you grabbed the wrong one.
4. The default view shows only active orders (pending/paid/ready). Everything else — other statuses, hide/unhide, history — lives behind the `⋯` menu, so the screen stays clean but nothing is lost.
5. Search by name or phone; `⬇ Export CSV` exports exactly what's filtered.
Improvements: day-grouped pickups with one-tap bump + undo (the old build was a flat list), plus the CSV export.

### FOH Checklist
What it's for: front-of-house daily open, same engine as the kitchen checklist.
1. Check items by section; progress fills; **Manager Sign-Off** (Owner/Admin or Counter/FOH) locks the completed run.

### Temp Log
What it's for: food-safety temperature checks with a verdict.
1. One card per station showing its required range.
2. Type the temp and log it — you get an instant pass/**FAIL** verdict from the data layer, not your own mental math.
3. Today's checks stream below, newest first, refreshing every 30 seconds.

### Fire Drop
What it's for: managing this weekend's drop — the merchant side of the public page.
1. Edit the drop title; flip the drop-level **sold-out kill switch** to close the whole weekend at once.
2. Ordering-window badges show what's open right now.
3. The product catalog manages price, per-item cap, 86 toggle, and sort order — caps and 86s are enforced by the data layer at customer checkout, not just hidden on the page.
4. Pickup slots show capacity fill (booked of capacity) and can be added or edited.
5. `⬇ Export orders CSV` dumps every order on the drop.
Improvements: caps/86s/windows enforced at the data layer, live slot fill, and a real kill switch.

---

## Pit workspace

*Visible to: Owner/Admin, Kitchen.*

### Pit Dashboard
What it's for: the pitmaster's fire sheet for today.
1. Today's pit checklist tasks sit on top — check them off as you go.
2. Today's smoker schedule shows below.
3. **Sync from schedule** pulls Load tasks straight from today's Smoker Forecast entries so the checklist matches the plan.

### Smoked Inventory
What it's for: what cooked meat is actually on hand.
1. Summary cards per protein: cooked lbs on hand, batch count, last batch.
2. The batch history table shows every smoke.
3. **Log Smoke Batch** opens a dialog with a live yield preview; it rejects impossible entries (cooked more than raw, zero/negative weights) both in the form and again in the data layer.

### Smoker Forecast
What it's for: planning the week's smokes against real demand.
1. Navigate weeks (Monday-based); entries group by day.
2. Add, edit, or remove entries per day.
3. **Auto-fill from demand** builds entries from confirmed order volume — no guessing.
4. Lock a day when the plan is final (two-tap confirm). Locked entries dim with a lock badge and can't be edited until unlocked.
Improvements: demand auto-fill and per-day locking are new.

### Pitmaster Guide
What it's for: the house method for each protein.
1. Tap a protein chip to load its guide.
2. The spec header shows target internal °F, smoker °F, estimated hrs/lb, rest minutes, and woods.
3. Ordered step cards below; add/edit steps via dialogs, remove with a two-tap confirm.

### Meat Cost Guide
What it's for: what a cooked pound actually costs.
1. The table's key number is **effective cooked cost/lb** = raw cost ÷ yield, computed for you.
2. Edit costs in the dialog — you type dollars, the app stores integer cents and rejects negatives/garbage.

---

## Packing workspace

*Visible to: Owner/Admin, Kitchen, Packing.*

### Pack Queue
What it's for: packing each job completely, with proof.
1. Each job card carries its own per-item packing checklist and a progress ring.
2. Check items off as they go in the box.
3. **Confirm Packed** stays disabled until every item is checked — no half-packed "done" jobs.

### Packing Board
What it's for: the same queue as a kanban wall.
1. Columns are derived from checklist progress: Not started → In progress → Ready to confirm. Work the checklists in Pack Queue; the board moves itself.

### Expo View
The exact same Expo KDS screen as Kitchen → Expo KDS (lanes, bumps, back-steps, undo) — surfaced here so packers don't have to switch workspaces.

### Deliveries
What it's for: getting orders on trucks and tracking them out.
1. Assign a driver on each delivery.
2. One-tap status advancement: assigned → loaded → en route → delivered.
3. Add inline delivery notes (gate codes, dock instructions) that autosave.

### Dashboard
Read-only station overview: headline stats plus a date-filtered summary of upcoming pack jobs. All numbers come from the same queue the Pack Queue and Board work from — one source of truth.

### Inventory
What it's for: boxes, bags, cutlery — never run out mid-rush.
1. On-hand vs PAR per item, with low-stock rows highlighted.
2. Quick ±1 buttons for counts as you use stock; a bulk-adjust dialog for receiving day.
3. Add new supply items with the form at the bottom.

### Supply Forecast
Read-only: projects this week's supply need from per-order usage and flags any item whose on-hand won't cover it. Order before it flags red.

---

## Catering / Sales workspace

*Visible to: Owner/Admin, Catering Director.*

### Director Cockpit
What it's for: the one screen the director opens first.
KPI cards (pipeline value, bookings), the Red Zone panel (near-term events with open issues), upcoming booked events, and wins this week — all pulled live from the same data the other tabs edit.

### Leads Pipeline
What it's for: every catering lead, from first call to booked.
1. Seven-stage kanban; each column shows its lead count and total budget.
2. Tap a lead to open the drawer: full details, the attribution block (where the lead came from), and the activity timeline.
3. Log calls/emails as activities; change stage and priority from the drawer.
Improvements: native attribution capture and an activity trail on every lead.

### Lead Intake
What it's for: entering a lead while they're on the phone.
1. Fill the form; attribution (source/UTM/landing page) is captured automatically when the form loads.
2. Budget is entered in dollars, stored as integer cents.
3. Submit → success screen offers "add another" so back-to-back calls flow.

### Calendar
Month grid merging catering calendar events with booked leads by event date. Tap a lead pill for an inline detail panel.

### Quotes & Invoices
What it's for: money paperwork, start to finish.
1. Switch between the Quote and Invoice tabs.
2. **New Quote** opens a dialog with dynamic line rows and a live totals preview — display only; the data layer recomputes the authoritative totals with 7.5% tax on save, so the preview can never disagree with the record.
3. Walk a quote through its status dropdown: draft → sent → accepted/declined.
4. An accepted quote gets a **convert-to-invoice** action; invoices flow invoiced → paid.
5. Each quote has a public accept link (`/quote/…`) you can send the customer — see Quote Accept below.

### Contacts
Search bar, contact cards, an upsert dialog (tags entered comma-separated), and two-tap delete.

### Venue Library
Venue cards with capacity and load-in notes — the stuff you need before quoting a site. Upsert dialog, two-tap delete.

### Red Zone
The expanded version of the cockpit's Red Zone feed: booked events inside the 7-day horizon that still have open issues, sorted soonest-first. ≤2 days out is red, ≤7 days is amber. Fix the issue, it drops off.

### Approval Queue
What it's for: reviewing B2B portal orders before the kitchen sees them.
1. Filter with status chips; a badge shows the pending count.
2. On pending orders: **approve**, **request changes**, or **reject**.
3. On approved/invoiced orders: **mark paid**.

### Client Portal Admin
Companies table with a per-company portal enable toggle, plus a portal-order summary by status. This is the admin side of the public Client Portal.

### Equipment Catalog
Items grouped by category with owned quantity, a per-guest ratio ("1 per N guests") for sizing an event, and notes. Add/edit via the upsert dialog.

### Companies
Company cards with industry, a portal badge, and notes; the upsert dialog includes the portal-enabled checkbox.

---

## Marketing workspace

*Visible to: Owner/Admin, Catering Director.*

A straight rule across this workspace: **V2 never fakes AI output.** Where the old build called external AI services, V2 runs the real workflow (briefs, queues, statuses) and says plainly that AI generation connects in the integrations phase.

### Landing Page Hub
Read-only status and conversion tracking per landing page. The public-facing pages themselves are listed in the Public pages section below.

### Command Center
Read-only rollup across the marketing surface: landing-page traffic, lead attribution, ad spend, and the content pipeline. Every number is an aggregate over real data — nothing is invented client-side.

### Lead Analysis
Attribution summary by source (leads, booked revenue, share of leads) plus a per-lead list with UTM campaign and landing page.

### Content Agent
The real content-brief workflow: create briefs, edit them, move them through statuses in the queue. AI copy generation connects in the integrations phase — the screen says so instead of pretending.

### Content Calendar
Month grid with platform color dots and a per-day post list. Full post add/edit/delete, with a two-tap delete guard.

### Media Library
Catalog of assets (name, kind, tags) with a kind filter and tag search. Real file upload/preview arrives with the Supabase Storage phase; until then this tracks catalog metadata.

### Video Studio
Video brief queue with the same honest CRUD + status workflow; analysis/rendering AI connects in the integrations phase.

### Outreach Agent
Real B2B outreach pipeline: stage columns with editable target cards. AI-drafted sequences come with integrations.

### Performance
Client-side sub-tabs over real data: platform stat cards, the raw metric table, posted content, and an attribution funnel. The **CSV Import** tab is an honest placeholder — imports connect in the integrations phase.

### AI Ads Center
Campaign table with real spend/lead/CPL numbers and an active ↔ paused toggle (ended campaigns are immutable), plus the ad-creative brief queue.

### Design Agent
Design-brief queue (CRUD + statuses); image generation connects in the integrations phase.

---

## Admin workspace

*Visible to: Owner/Admin only.*

### Menu Editor
What it's for: the single source of truth for everything sellable.
1. Categories sidebar on the left with active toggles; pick one to see its items table.
2. Add or edit items in the upsert dialog: name, price, category, flags.
3. Menu truth enforced: every item in the "Thursday Only" category is Thursday-only — the checkbox locks on, and the data layer enforces it even if the UI didn't.
4. The full 112-item real catalog is loaded; 70 items whose prices never appeared in the old data are flagged `⚠ Estimated price — owner to confirm` (see [PRICES_TO_CONFIRM.md](PRICES_TO_CONFIRM.md)). Fix them right here.
Improvements: DB-accurate menu with estimates clearly flagged instead of invented prices passing as real.

### Walk-In Samplers
What it's for: the walk-in sampler configuration.
The sampler may only contain the five approved proteins — pulled pork, brisket, sausage, ribs, chicken quarters. The UI only offers those five, and the data layer rejects anything else with a prominent error. This is a menu truth, not a suggestion.

### Prep Master
Master PAR template rows that drive the daily prep engine: each morning's Kitchen → Prep list is generated from the active rows here, and Thursday-only rows join the list on Thursdays. Edit a PAR here today, tomorrow's prep list reflects it.

### Father's Day / Cuban Thursday / 4th of July
One generic special-event admin serving all three tabs.
1. Toggle the public landing page on/off; toggle ordering on/off (ordering is a two-tap confirm — it's a revenue switch).
2. Set the event date and notes.
3. Pick the event menu with the multi-select. Menu truth: Thursday-only items are only selectable for the Cuban Thursday event.

### Catering Pre-Orders / Weekend Pre-Orders
The same per-channel preorder manager on two tabs: status filter chips, text search, a per-row status dropdown, hide/unhide, and a totals summary. (Catering drops currently ride the fire_drop channel until the channel enum expands in Supabase — noted in the parity matrix.)

### Preorder Inventory Caps
Per-product caps on the current Fire Drop with inline cap editing and 86 toggles. This screen only sets the numbers — the caps are enforced at customer checkout by the data layer.

### Order Guide Setup
Vendor order guide with inline on-hand entry. Order quantity is computed for you — PAR minus on-hand, floored at zero — and highlighted whenever it's above zero. Walk the shelves, type counts, read the order.

### Protein Conversions
Read-only yield reference (the table behind Meat Calc), plus a worked-example calculator: raw quantity → cooked lbs → portions for a selected protein.

### Users
1. `+ Invite user` opens the dialog: name, email, role, active flag.
2. Toggle a user's active switch, or edit them.
3. **Last-admin guard:** the app refuses to deactivate the last active Owner/Admin ("Cannot deactivate the last active owner admin") — you cannot lock yourself out.

### Team Access
Read-only workspace × role matrix derived straight from the navigation config — who sees what, at a glance. Remember: in Supabase mode, row-level security is the real enforcement; this is the map of it.

### Express Menu / Events Manager / Brand Setup / Brand Studio / License Manager / AI Import Hub / Customer App
Settings-backed panels: simple key/value configuration persisted through the settings store, plus read-only integration placeholders where an outside service will plug in later. Events Manager drives the public event landing pages (slug, landing kill switch, menu preview items).

### Discount Codes
1. Create codes in the dialog: uppercase letters and numbers only ("Code must be uppercase letters and numbers only (no spaces)"); percent codes must be 1–100.
2. Codes validate server-side at checkout — there is no client-side path to a free order.
3. The seed data ships only real-looking codes (WELCOME10, PICKUP5) — no test/free codes exist, ever.

---

## Public pages (the customer's seat)

All reachable from the Hub's "Public pages (no login)" row. No login, no roles — this is the storefront.

### Fire Drop ordering (/fire-drop)
1. The page opens with a live per-second countdown: "Friday ordering closes" (until Thu 5:00 PM ET) or "Saturday ordering closes" (until Fri 3:00 PM ET). Outside a window the day shows **Closed** with the exact hours and a note: you can browse, but checkout for that day is closed.
2. Pick your pickup day (Friday or Saturday), then add items. Scarcity is real: items show **Sold out** or `🔥 Only N left` from live cap math.
3. Choose a pickup window — each option shows fill, e.g. "11:00–11:30 — 3 of 8 booked", with "(full)" appended when it's done.
4. Enter name and phone, place the order, and land on the confirmation page with your order ref (FD-…) and a total that includes 7.5% tax.
5. If something changed while you shopped, the data layer refuses the order with a plain message: "This week's Fire Drop is sold out." / "Choose a pickup window" / "That pickup window is full — choose another." / "Brisket is sold out (86'd)." / "Only 2 left of Tampa Diamonds." Prices on the page are display-only — the authoritative totals and every enforcement rule come from the checkout data layer.

### Cuban Thursday (/cuban-thursday)
1. Thursday-only menu (Cubans and brisket smash burgers) pulled from the admin menu — these items never appear anywhere else in the app on other days.
2. Pickup is Thursday 11 AM–2 PM. Order the same way as Fire Drop.
3. After the cutoff, a proactive closed banner keeps you from building a doomed cart, and the data layer enforces it regardless: "Cuban Thursday ordering for this week has closed (Thu 2:00 PM ET). Check back Monday."

### Catering landing (/catering) and Catering Request (/catering-request)
The landing page is pure content with CTAs into the request form — no pricing engine, no login, no dead ends. The request form creates a lead (with attribution captured automatically); tap **Send my request** and the catering team follows up with a real quote. No prices, no checkout.

### Order Tracker (/track)
Type your order ref (e.g. `FD-0717-1042`) and tap **Track**. You get exactly what a customer at a shared kiosk should see: first name, masked contact, pickup details, and the status trail — nothing else.

### Event landings
Driven entirely by the admin Events config: the page looks up its slug, honors the landing kill switch, previews the event menu, and offers an interest form that creates a lead. Never a checkout.

### Quote accept (/quote/…)
The link from Quotes & Invoices opens the quote — token-addressed, no login — with two buttons: **Accept quote** and **Decline**. The response lands back on the sales side instantly.

### Client Portal (/portal)
1. "Sign in" is a company pick plus your name (no credentials in the demo phase).
2. Two tabs: **New Request** to build an order request, **My Orders** to watch status.
3. Submitted requests land in pending approval for the catering team's Approval Queue — nothing reaches the kitchen unreviewed.

---

## Appendix A — Business rules the app enforces

All business time is **America/New_York (ET)**, everywhere, always.

**Fire Drop ordering windows**
- Friday-pickup ordering: opens with the Monday advance (Mon 12:00 AM ET), closes **Thursday 5:00 PM ET**.
- Saturday-pickup ordering: opens **Thursday 5:00 PM ET**, closes **Friday 3:00 PM ET**.
- Cuban Thursday ordering: closes **Thursday 2:00 PM ET**; reopens Monday.
- Weekend dates auto-advance **only on Monday** (owner rule). All of Mon–Sat belongs to the current week's Fri/Sat; Sunday still shows the weekend just past until the Monday advance.
- The same windows are enforced in the data layer (and by server-side SQL in Supabase mode) — the UI countdowns are a courtesy, not the lock.

**Menu truths**
- Thursday-only items (Cubans, smash burgers) exist only on Cuban Thursday — enforced by the data layer, locked in the Menu Editor, and only selectable for the Cuban Thursday event.
- The Walk-In Sampler contains only the five approved proteins: pulled pork, brisket, sausage, ribs, chicken quarters. The data layer rejects anything else.

**Money**
- Money is integer cents everywhere; floating point never touches a total.
- Sales tax is fixed at **7.5%** (750 basis points) per owner directive, rounded half-up to match Square. Changing it requires explicit owner approval.
- Tips are added after tax: total = subtotal + tax + tip.

**Orders and accountability**
- Every status change is recorded in the order's status history: from, to, timestamp, and actor. Order History shows the full trail.
- Caps, 86s, sold-out switches, ordering windows, and slot capacity are all enforced at checkout by the data layer — never just hidden in the UI.
- Discount codes validate server-side; no test or free codes exist in any seed data.
- The last active Owner/Admin account cannot be deactivated.

---

## Appendix B — What's next

**Prices to confirm.** 70 menu items had no price anywhere in the old data snapshot. The demo shows category-typical estimates flagged `⚠ Estimated price — owner to confirm`. The full list is in [PRICES_TO_CONFIRM.md](PRICES_TO_CONFIRM.md); correct them in Admin → Menu Editor or send corrections.

**Supabase staging.** The shared-database version is staged and waiting on the owner's go-ahead: the schema, row-level security policies, seeds, and tests are already written, the data layer already speaks both modes behind one switch, and the transactional checkout guards and auth layer are prepared. Flipping to Supabase mode gives every device the same live data, real sign-in with profile-derived roles, and server-enforced business rules — no UI rework required.

**Square payments.** Online payment is gated behind Square **sandbox** testing first — no real card processing turns on until sandbox runs are verified and the owner approves go-live.
