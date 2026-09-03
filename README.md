# The Copper Fork — Restaurant Operations Platform

A working multi-role dine-in / take-away platform: customer ordering, table
reservations, QR-at-table ordering, a live kitchen display, waiter table
management, sub-admin menu/approval control, and revenue reporting — all
synced in real time over WebSockets.

This is a **functional MVP**, not the full enterprise spec (see "What's not
included" below) — but every flow in it is real: real auth, a real database,
real inventory deduction, real Socket.IO sync between roles. Nothing is
mocked screens with fake data.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000**. First run auto-seeds the database
(`data/db.json`) with one demo restaurant, a branch, 6 tables, a menu, and
one user per role.

Demo accounts (password for all: `password`):

| Role | Email |
|---|---|
| Super Admin | super@demo.com |
| Restaurant Admin | admin@demo.com |
| Sub-Admin | subadmin@demo.com |
| Waiter | waiter@demo.com |
| Chef | chef@demo.com |
| Inventory Manager | inventory@demo.com |
| Customer | customer@demo.com |

To reset all data back to the seeded starting point, stop the server,
delete `data/db.json`, and restart.

## Try the real-time sync

Open two browser windows side by side — e.g. `customer.html` (or the login
page → sign in as Cathy Customer) in one, and `chef.html` (sign in as Chen
Chef) in the other. Place an order as the customer; it appears on the
kitchen display within a second, with no refresh. Accept it as the chef and
watch the customer's order-tracking ticket update live. Do the same with
`waiter.html` to see table status and bill payment sync too.

To simulate a walk-in scanning a table QR code, open:
`http://localhost:3000/customer.html?table=3` — this skips login and links
the order straight to Table 3, the way a real QR code would.

## What's implemented

- **Auth & RBAC** for all 6 roles (JWT + role-gated API routes)
- **Customer app**: restaurant browsing, menu with veg/search/category
  filters, cart with coupon (`WELCOME10`) and tax/packing-charge math,
  dine-in table selection (manual or auto-assign) or take-away with
  "now" / scheduled pickup, order tracking with a live progress bar,
  cancellation (blocked once the kitchen accepts), table reservations
- **QR ordering**: guest checkout with no login, table auto-linked
- **Waiter**: live table map, per-table order panel, add items to an open
  order, take walk-in orders, mark served/complete, take payment
  (cash/UPI/card), shift performance stats
- **Chef / Kitchen Display**: incoming orders in real time, accept / reject
  (with reason), status pipeline (preparing → ready), propose new menu
  items for approval, low-stock banner
- **Sub-Admin**: live ops dashboard (orders, tables, low stock), approve or
  reject chef-submitted items, edit price/mode/visibility on any item
  instantly, ingredient stock view
- **Inventory**: recipe-based auto-deduction on every accepted order,
  low-stock alert broadcast, manual restock
- **Restaurant Admin / Super Admin**: revenue by day/week/month/year, top
  and least-selling items, cancelled/rejected counts, menu master view,
  branch management (list/create), coupon management (create/toggle/delete),
  (Super Admin) platform-wide restaurant list, user suspension, payment analytics
- **Real-time sync**: Socket.IO rooms per branch — order, table, menu, and
  inventory changes push to every connected dashboard instantly
- **Call waiter / request bill**: customer can ping the table's waiter from
  their order-tracking screen; it shows as a pulsing badge on the waiter's
  table map in real time and can be acknowledged from there
- **Split bill**: waiter can split a table's remaining balance evenly across
  N guests and take each guest's payment separately (cash/UPI/card), with a
  running per-payer receipt on the order
- **Merge tables**: waiter can move an in-progress order from one table to
  another, freeing the source table
- **Refund on pre-accept cancellation**: cancelling an order that already
  has a payment (full or partial) recorded automatically marks it refunded
- **Staff attendance**: waiters, chefs, sub-admins and inventory managers
  clock in/out from a shared widget in their topbar; Sub-Admin sees a
  full attendance log grouped by day, and Live Ops shows who's on shift
  right now
- **Menu scheduling**: Sub-Admin can set an item to a time window
  (breakfast/lunch/dinner/happy hour/all-day), mark it seasonal, and cap
  it to a limited quantity for the day. The customer-facing menu enforces
  all three live — items outside their window or sold out disappear
  automatically, and ordering more than what's left is rejected server-side
  (stock is restored if the order is later rejected or cancelled)
- **Inventory Manager overhaul**: suppliers directory, stock-in with
  supplier/batch/expiry tracking, stock-out for waste/spoilage/correction,
  and a full purchase-history ledger — replacing the old restock button,
  which was silently broken (wrong endpoint, and the stock list rendered
  from a field the API never returned)
- **Reservations**: customers can pre-order food and add special
  instructions/allergies when booking a table; waiters see both on the
  reservation card
- **Take-away pickup handoff**: chef stops at "ready" for take-away orders —
  a dedicated waiter/front-desk tab lists everything waiting for pickup and
  marks it "picked up" (with cash collection if unpaid). The status endpoint
  now enforces who can move what: chef owns preparing/ready, front-of-house
  owns served/completed, and take-away skips "served" entirely since there's
  no table to deliver to
- **Chef's kitchen-side inventory read**: chefs can flag any ingredient
  Heavy/Medium/Low from their own dashboard — a fast subjective read that
  shows up instantly next to the numeric count on Sub-Admin and Inventory
  Manager's screens
- **Ingredient detail drill-down**: clicking an ingredient on Sub-Admin's or
  Inventory Manager's inventory tab opens a panel with current stock,
  threshold, the chef's rating, and full batch/supplier/expiry history
- **Sub-Admin menu control**: can now add and delete menu items directly,
  not just edit existing ones
- **Super Admin restaurant onboarding**: two paths — Super Admin creates a
  restaurant directly (name, type, address, per-day operating hours, admin
  contact), or an owner self-registers from the login page and Super Admin
  approves/rejects the request. Either way, a starter branch, tables,
  categories, and a restaurant_admin login are provisioned automatically,
  and the new login appears on the sign-in page's demo-account list right
  away
- Fixed two real bugs in Super Admin's analytics: `orders`/`revenue` per
  restaurant were always zero (the code filtered by a `restaurantId` field
  that orders never had — fixed to join through branches), and the
  restaurant list was rendering an array of branch objects where the UI
  expected a count
- Sub-Admin's table map is now visibly compact — the tiles were stretching
  to fill unused grid space on wide screens regardless of table count
- **Real multi-restaurant discovery for customers** — this was the biggest
  gap: the customer app was hardcoded to always load the first seeded
  restaurant, so a newly-approved restaurant was invisible to customers no
  matter what Super Admin did. There's now an actual restaurant picker
  (search + veg filter) as the customer app's entry point, and approving a
  restaurant makes it appear there immediately
- **Real coupon system** — checkout used to hardcode a single "WELCOME10 =
  10% off" check and silently ignore the coupons database entirely; any
  admin-created or edited coupon had zero effect on an actual order. Coupon
  validation and application are now real, server-verified, and (new) scoped
  per restaurant — a coupon created by one restaurant could previously be
  redeemed at any other restaurant's checkout, which was a genuine
  multi-tenant data leak. Coupons are now also fully editable, not just
  toggleable
- **Distinct staff logins + waiter auto-assignment**: Restaurant Admin and
  Sub-Admin can add waiters/chefs/inventory managers/sub-admins with their
  own name+email (enable/disable without deleting history). When a table
  becomes occupied, it's auto-assigned to whichever on-shift waiter
  currently has the fewest tables — no more everyone sharing one login
- **Reservations auto-assign a table** sized to the party on booking, and
  the waiter's Reservations tab now flags anything "arriving now" (15 min
  before to 60 min after the slot) with a one-click "Seat now" that occupies
  the table and assigns a waiter
- **Ingredient → supplier linkage**: Sub-Admin/Inventory Manager can set a
  preferred supplier per ingredient and log a "send to supplier" purchase
  order from the same detail panel (this creates an internal, trackable
  record — there's no real email/SMS integration, stated plainly in the UI)
- **Staff attendance history** is now visible to the staff member
  themselves (waiter/chef "My Attendance" tab), not just Sub-Admin's
  branch-wide view
- **Restaurant Admin's Menu Master** now has the same real add/edit/delete
  capability as Sub-Admin's Menu Control, including actually-working
  category creation (used to be a toast placeholder). Super Admin has the
  same access
- **Branch creation** (Restaurant Admin or Super Admin) now includes a
  starter table count and a real per-day operating-hours editor, instead of
  just name/address/phone

## What's not included (by design — see the phased build plan)

This MVP covers Phases 0–5 of the phased plan. Deliberately left out so the
core product stays solid rather than spread thin:

- Payment gateway integration (Razorpay/Stripe) — payment capture is
  recorded but not processed through a real processor
- Multi-restaurant / multi-tenant isolation beyond the data model (only one
  restaurant is seeded; the schema supports more)
- Staff attendance, shift scheduling, tip tracking
- AI features (demand forecasting, recommendations, chat assistant)
- 2FA, full audit logging, production-grade rate limiting/hardening
- PWA/offline support, push notifications (FCM/SMS/WhatsApp)
- Automated test suite
- Kubernetes/Docker deployment, monitoring (Prometheus/Grafana)

## Architecture

- **Backend**: Node.js + Express, JWT auth, Socket.IO for real-time push
- **Data**: lowdb (JSON file at `data/db.json`) — swap the adapter for
  PostgreSQL/Prisma to go to production; the data-access calls are
  isolated in `db.js` and each route file, so the swap doesn't touch the
  frontend
- **Frontend**: plain HTML/CSS/JS per role (no build step required) —
  intentionally dependency-light so it runs anywhere `node` runs
- **Real-time model**: one Socket.IO room per branch (`branch:<id>`);
  every mutating API call emits an event scoped to that room, and every
  dashboard subscribes to it on load

## Project structure

```
restaurant-platform/
├── server.js              # entry point, Socket.IO wiring
├── db.js                  # lowdb setup + seed data
├── middleware/auth.js      # JWT verification + role guard
├── routes/                 # auth, menu, orders, tables, reservations, inventory, reports, restaurants
├── public/
│   ├── index.html          # login
│   ├── customer.html       # customer app
│   ├── waiter.html
│   ├── chef.html
│   ├── subadmin.html
│   ├── admin.html
│   ├── css/style.css       # shared design tokens
│   └── js/app.js           # shared API/auth/socket helpers
└── data/db.json            # auto-created on first run
```
