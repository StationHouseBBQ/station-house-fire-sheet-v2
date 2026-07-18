# Phase 1 Inspection Brief (pre-implementation)

Delivered to the owner before any file edits, per the Phase 1 handoff.
Summary: the repo contains (1) the root LocalStorage prototype this brief
inspects and (2) the V2 React app under app/ whose typed DAL was built for
this conversion. Phase 1 is implemented on the V2 branch.

## Root prototype findings
- Routes (hash): #home, #drop, #checkout, #confirmation, #seminole, #catering.
- State: single global `state` (route, cart, orders, leads, orderTab,
  orderSearch, dayFilter, sourceFilter).
- LocalStorage keys: `firesheet.orders`, `firesheet.leads`; session key `lastOrder`.
- Order shape: FD-MMDD-<random 1000-8999> id (collision-prone), flattened
  items STRING, float-dollar total incl. tax+tip, paid bool, status active|complete.
- Cart: { menuItemId: qty }. Menu: 8 items, float prices (e.g. 45.99).
- Lead shape: int id (max+1), display-string stages, float value.
- Checkout: placeOrder() computes float sub/tip/tax, marks paid:true
  unconditionally, no cutoff/capacity checks.
- Dashboard: seminole() filters in memory, completeOrder()/reopenOrder()
  flip status; full innerHTML re-render per keystroke.
- Mobile: table overflow, HTML5 drag-drop unusable on touch, re-render focus loss.
- Data-writing functions: save, placeOrder, completeOrder, reopenOrder,
  addLead, dropLead, changeQty.
- Supabase replacements: menu→getProducts; placeOrder→createOrder;
  completeOrder/reopenOrder→updateOrderStatus; reads→getOrders/getCateringLeads;
  addLead→createCateringLead; dropLead→updateCateringLeadStage; save→removed.
- Risks of fast replacement: RLS blocks writes pre-auth; float→cents drift;
  random ids collide with DB uniqueness; items string can't round-trip to
  order_items; per-keystroke re-render would hammer the network; losing the
  working demo before its replacement is proven. Hence the two-mode contract.
