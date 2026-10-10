# Changelog

## 5.4.0
No database change — `schema_fresh.sql` is unchanged and is still the full schema for a new deploy. API files: still 12 (no new function; extra fields were added inside existing ones).

### Memos → 50 mm thermal paper
- Every memo / slip / receipt now renders as one narrow thermal receipt (50 mm wide, black on white, no page breaks): give, return, damage, buy, return-to-company, point sale / return, SO order memo, DSR cash memo, due-collection receipt, day-end settlement memo, online deposit slip, salary slip.
- **No "প্যাক সাইজ" column** any more (thermal and A4). Each item prints as: name, "৫ কেস ২ পিস × ৳দর/কেস", amount.
- Download PDF (page = 50 mm × receipt length), JPG, Print (`@page` 50 mm) and WhatsApp all work from the same receipt. To change the roll width edit `THM.mm` at the top of the memo engine (e.g. 58).
- Reports stay A4: the SO daily report and the business report.

### Quantities in cases everywhere
- Swap product picker (damage collection → বদলে কোন পণ্য): shows only the product name, no car stock.
- Shop delivery list: no unit price; shows the product and how much is on the van (cases + pcs).
- Damage / swap / sale / return warnings, stock lists (total stock), catalog and picker prices (now ৳ per case), SO sales split, DSR month, dashboard today strip, analytics report, damage report, bonus report, DSR history now show "X কেস Y পিস" instead of total pieces.
- Totals are exact: units are summed per product and split with that product's own case size (new fields `givenCP / returnCP / dmgCP / soldCP / totalCP / shopSalesCP` in dashboard, report, transactions, claims APIs).

### Layout
- The sliding shortcut strip at the top (home / products / transactions / attendance / shops) is removed for all roles; everything remains in ☰ and the quick-action panel.
- Owner/Manager home: the money numbers (মোট বাকি, পেমেন্ট আদায় …) scale to the screen so the full amount is always visible.
- Shop delivery / sale screen, shop registration and damage collection: the on-page "◀ ফিরুন" button is gone; the phone back button does the same job as on other pages.

### Return (ফেরত) flow
- After choosing DSR + date, step 2 has two tabs: **🚚 <DSR name>** (default — only the products still on that DSR's van that day, pre-selected, quantities pre-filled in cases/pcs) and **✏️ কাস্টম** (pick any products manually).

## 5.3.0
No database change. API files: still 12 (no new function added).

### DSR লেনদেন — ৮টি বক্স, প্রতিটি আলাদা লাইনে
- বক্সগুলো (উপর থেকে নিচে): **দেওয়া · ফেরত · ড্যামেজ · কমিশন · ছাড় · আজকের বাকি · আগের বাকি · ম্যানেজার/মালিককে জমা দিতে হবে**.
- যেকোনো বক্সে ট্যাপ করলে ঠিক তার নিচেই সম্পূর্ণ বিস্তারিত (কোন পণ্য / কোন দোকান / কত টাকা) খোলে; আবার ট্যাপ, ✕ বা ব্যাক বাটনে বন্ধ হয়।
- **আজকের বাকি** = এই সময়ে এই DSR-এর দেওয়া এখনো-অনাদায়ী বাকি; **আগের বাকি** = এর আগের তারিখের অনাদায়ী বাকি (DSR-এর নিজের + তার দোকানের)। হিসাবটা বাকি-রিপোর্টের আজকের/পূর্বের বাকির সাথে একই নিয়মে।
- একই বোর্ড DSR (নিজের হোম), **মালিক ও ম্যানেজার** (নতুন মেনু/দ্রুত-একশন "📝 DSR লেনদেন") এবং **SO** (হোমের "📝 DSR লেনদেন" ট্যাব) — সবাই DSR বেছে নিয়ে আজ / তারিখ / রেঞ্জ দেখতে পারেন।
- API: `GET /api/sr-payments?action=dsr-my-day` এখন `todayDue` ও `prevDue` (মোট + দোকান-ভিত্তিক লাইন) ফেরত দেয়; প্রতিটি লাইনে `cases`/`pcs` আছে।

### ব্যাক বাটন
- **DSR হোম**: শপ ডেলিভারির স্লিপ/বিক্রয় → দোকানের বিবরণ → তালিকা; ড্যামেজ কালেকশনে দোকান-তালিকা; বাকি/পেমেন্ট, বাকি আদায়, শপ নিবন্ধন, ক্যাটালগ → DSR হোম। এরপর আগের মতোই অ্যাপের ব্যাক-স্ট্যাক।
- **SO হোম**: যেকোনো ট্যাব → সারসংক্ষেপ।
- **মালিক/ম্যানেজার DSR লেনদেন**: খোলা বক্স বন্ধ।

### পরিমাণ — শুধু কেস ও খুচরা পিস
- মেমো, স্লিপ, অর্ডার মেমো, রুট রিপোর্ট, লেনদেন উইজার্ড (দেওয়া/ফেরত/ড্যামেজ/কেনা/পয়েন্ট সেল/অর্ডার), স্টক তালিকা ও অনুমোদন বিবরণে এখন "৫ কেস ২ পিস" দেখায়; আর মোট-পিস সংখ্যা ("১২২ পিস") দেখানো হয় না। একাধিক পণ্যের মোটে কেস ও খুচরা পিস আলাদা করে যোগ হয়।
- ড্যাশবোর্ডের সারসংক্ষেপ কার্ড/রিপোর্টের অ্যাগ্রিগেট সংখ্যা (সব পণ্য মিলিয়ে মোট পিস) আগের মতোই আছে।

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
