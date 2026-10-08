# Changelog

## 5.2.0
No database change — `schema_fresh.sql` is unchanged and still the full schema for a new deploy. API files: still 12 (no new function added).

### Back button
- **উপস্থিতি ও লোকেশন** (Owner: one person's attendance → staff list) and **দোকান ও লোকেশন** (register form, shop detail, edit mode, full-screen shop ledger) now step back one level with the phone's back button, exactly like the on-page "◀ ফিরুন" button. After that, back continues through the normal tab history like every other page.

### DSR → আমার লেনদেন
- Five boxes: **দেওয়া · ফেরত · ড্যামেজ · কমিশন · ছাড়** (all in ৳). Tap a box to open its detailed history (which product, which shop); tap again, ✕, or the back button to close.
- Last box: **ম্যানেজার/মালিককে জমা দিতে হবে** = cash shops paid at the sale + old dues collected − cash paid to shops for damaged goods (same formula as the end-of-day settlement). Shows how much was already handed over via settlement and how much is still due.
- New read-only endpoint `GET /api/sr-payments?action=dsr-my-day&dsrId=&from=&to=` (added inside the existing sr-payments function).

## 5.1.0
Scope: audit items CALC-1…10, PERF-1…8, SEC-5 (schema/migrations), OPS-1, setup docs. SEC-1…4 (PIN/auth) intentionally NOT changed.

### Calculations
- CALC-1 one net-profit definition (`computeProfit`) used by dashboard, sales-range, owner view, analytics report.
- CALC-2 van stock carries over (RPC `van_stock_totals`, JS fallback).
- CALC-3 bonus rule snapshot columns on `transactions`; bonus via RPC `bonus_net_units`.
- CALC-4 due balance rounded to 2dp; <0.01 counts as cleared; "mark cleared" pays the balance.
- CALC-5 server-side pricing (`api/_lib/money.js`).
- CALC-6 per-line 2dp rounding, case price for whole cases; `dmg_claims` amounts numeric(14,4).
- CALC-7 `audit_log` table + writes on due edit/delete.
- CALC-8 idempotency (`idempotency_keys`, `requestId`), client auto-attaches ids.
- CALC-9 stock guard trigger + pre-check + toggle (`app_settings.block_negative_stock`).
- CALC-10 Dhaka dates on server and client.

### Performance
- `fetchAll` single request when < 1000 rows; aggregate RPCs; explicit columns; paging; owner dashboard rebuilt on aggregates.
- Less polling (GPS, chat); cron batching + `cron_runs`.
- pg_trgm + extra indexes.

### Deploy / DB
- `schema_fresh.sql` (guarded) and `migrations/001_v5_1_fixes.sql` (idempotent). Old `schema.sql` removed.
- `vercel.json` routes → rewrites. `CRON_SECRET` header only.
