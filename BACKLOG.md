# Backlog

This app is a working MVP (Phases 0–5 of the phased plan in the original
brief), plus several follow-up passes closing gaps that were flagged either
by an internal audit or pointed out directly while using the app. The
biggest fixes this round: customers can now actually discover and order
from any approved restaurant (previously hardcoded to the first one),
coupons are real and tenant-isolated (previously a single hardcoded
"WELCOME10" check that ignored the database and leaked across restaurants),
staff get their own distinct logins with automatic waiter assignment
(previously one shared waiter account), and reservations/inventory got real
table auto-assignment and supplier tracking.

It is **not** the full enterprise spec — per the project's own working
agreement ("no feature invention beyond scope, note gaps here instead"),
everything below is deliberately left out rather than half-built.

## Real payment processing
Cash/UPI/card are captured and recorded, but there's no live Razorpay/Stripe
integration — no hosted checkout, no webhook-verified capture, no gateway
refund API call. `paymentStatus` and the `refund` object are internal
bookkeeping only.

## Multi-tenant / multi-restaurant
The schema and every route are restaurant/branch-scoped. Super Admin can now
provision new restaurants directly or approve self-registrations, each
getting its own branch, starter tables/categories, and admin login. One
deliberate simplification: every new admin account uses the platform's
shared demo password (`password`) rather than a real invite/reset-email
flow — there's no email sending in this build, so a temporary-password or
magic-link flow would be unverifiable theatre. Subscription billing per
restaurant is still not built.

## Staff performance depth
Attendance (clock in/out, now with a personal history view) is in. Tip
tracking, waiter service-time averages, and chef throughput reports are not.
Waiter auto-assignment picks the least-busy on-shift waiter for a newly
occupied table, but doesn't hard-block other waiters from acting on someone
else's table — real restaurants need coverage flexibility, so it's advisory
(an "assigned to" tag + an "assign to me" override) rather than an access
lock. If you want a hard lock instead, say so and it can be changed.

## Inventory depth
Suppliers, stock-in/out with batch/expiry, and purchase history are in.
Barcode/QR stock scanning, stock transfers between branches, and food-cost
analysis are not. Recipe-based auto-deduction and low-stock alerts were
already implemented and remain unchanged.

## Menu depth
Time windows, seasonal tagging, and limited-quantity caps are in. Item
addons/customization options, calorie/allergen fields, and multiple
images/videos per item are not.

## AI features
Demand forecasting, personalized recommendations, review sentiment analysis,
chat assistant, fraud detection.

## Platform hardening
2FA, full audit-log trail, production rate limiting, CSRF protection beyond
the defaults, PWA/offline support, push/SMS/WhatsApp notifications.

## Infra
No Docker/Kubernetes/CI-CD/monitoring — this is a single Node process against
a JSON file (`lowdb`); swapping `db.js` for a Postgres/Prisma adapter is the
documented path to production but hasn't been done.

## Automated tests
No test suite yet. Each phase's "done when" criteria, and this round's new
features, were verified manually via scripted API calls rather than a
CI-runnable suite.
