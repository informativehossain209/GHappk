# Changelog

## 5.7.0
No database change — `schema_fresh.sql` is unchanged and is still the full schema for a new deploy. API files: still **12**.

### Screens
- Removed the top-left "◀ ফিরুন / ◀ তালিকায় ফিরুন" buttons (attendance person page, shop register/detail, shop ledger). The phone's back gesture already steps out of these pages. The step buttons inside the give/return/damage/point-sale wizards ("← পণ্য বদলান") are kept — they are wizard steps, not menu buttons.

### বিক্রয় প্যানেল (Owner · Manager · DSR · SO)
- One simple box: tap it and choose **whose sale** to see — any single SO (his DSRs + his own point sale, free/bonus pieces NOT counted) or **🏪 মোট দোকান** (whole shop, free/bonus pieces counted).
- Products are listed in the same order as the product/inventory page; a product with no sale shows 0. Columns: গতকালের স্টক · আজকের বিক্রয় · বর্তমান স্টক.
- Where: SO → "আজকের মোট বিক্রয়" tab · DSR → new "📦 বিক্রয় প্যানেল" tab · Owner/Manager → "বিক্রয় প্যানেল" box on the home page.
- API: `GET /api/dashboard?action=sales-panel&scope=so|total&soId=`.

### কম স্টক সতর্কতা
- Now shown to every SO and DSR (was Owner/Manager only). API: `GET /api/dashboard?action=low-stock`.

### Payments — password, no double taking, no over-paying
- Manual cash-in (জমা) and the day-end settlement now ask for the logged-in user's own password; the server checks it again (`actorId` + `pin`). A manager's request is checked when it is submitted.
- A payment can never be larger than the person's current due, and the same amount for the same person cannot be saved twice within 2 minutes. Day-end settlement can no longer exceed the DSR's due.
- One money action at a time on screen (a second tap while one is running is ignored).
- DSR collecting due from a shop already needed the DSR password and could not exceed the shop's due (v5.6) — unchanged.

### Owner — DSR লেনদেন
- New option **👥 সব DSR একসাথে**: every DSR's transactions combined, each entry tagged with the DSR's name. (`dsr-my-day?dsrId=all`)

### Roads
- One SO (with his paired DSR) can now be assigned to **many roads** — the old code un-assigned his previous road.
- The paired-DSR lookup no longer fails when an SO has more than one DSR.
- An SO cannot be given two different roads on the same weekday (clear message); different weekdays for different roads work.
- DSR road duty ("the day after the SO") is resolved through the DSR's SO, so it no longer depends on a possibly stale DSR id stored on the weekly rule.

### Net profit
- NET profit = gross profit − **commission only**. Discount, damage, bonus and expenses are no longer deducted (they are still shown as separate figures). The Settings screen explains this and the old per-item switches are gone; an old saved setting can no longer switch them back on.

## 5.6.0
No database change. API files: still **12** (extra fields / one extra check added inside existing files — no new route).

### DSR লেনদেন boxes (DSR · Owner · Manager · SO — one shared board)
- Every detail list now shows the **date once as a header**, with that day's total as a filled, labelled pill (**মোট কমিশন / মোট ছাড় / মোট ড্যামেজ / মোট দেওয়া / মোট ফেরত / মোট বাকি**). Individual shop amounts stay plain coloured numbers, so the total can no longer be confused with a single shop's amount.
- Rows under a date show only the **time** (and the shop name). Applies to: দেওয়া, ফেরত, ড্যামেজ (van + from shops), কমিশন, ছাড়, আজকের বাকি, আগের বাকি and the "জমা দিতে হবে" box (cash at sale / old due collected / money paid for damage).
- The auto-generated text "দোকান বিক্রয় বাকি" is no longer printed in these lists.
- **লেনদেনের বিস্তারিত** (bottom of the DSR home) is now one collapsible box in the same style: product totals (দেওয়া / ফেরত / দোকানে / ড্যামেজ in cases + pcs), then date → slips with time. Shop sales now show the **shop name** (tap to call).
- API `dsr-my-day`: due / cash lines now carry `createdAt`, `shopId`, `shopPhone`; new `txShops` map (shopId → name/phone).

### বাকি আদায় — DSR password
- Every collection, **full or partial**, asks for the DSR's own password before saving. The check is also done on the server (`sr-payments?action=due-collect` needs `pin`), so it cannot be skipped. A wrong password saves nothing.

### Damage panel fix
- Damage a DSR collects **from shops** (ড্যামেজ কালেকশন) is stored in `damage_collections`, not in `transactions`, so the SO home "ড্যামেজ" card never counted it. It now does (purchase-price basis, shown with a "দোকান থেকে ৳…" line).
- Owner / Manager home damage alert now also shows **আজকের ড্যামেজ** (before it only showed pending claims, so a claim that was already cleared — or one dated today — was invisible).

### ডিউ ক্যালেন্ডার
- No more "দোকান বিক্রয় বাকি" text beside the DSR / SO name. List and day pop-up show: name, **date + time of the entry**, and the **total amount**.
- Tap an entry → full detail: shop, keeper, phone, date + time, status, what was sold (items, commission, discount), and a **📞 call shopkeeper** button. A call button is also on each entry in the day view.
- API `GET /api/due-calendar` rows now include `shopPhone` and `keeperName`.

### সেরা ৫০ দোকান
- New **🛣️ রোড** filter: choose a road and only the shops of that road *within the top 50* are shown (rank numbers are kept; shops with no road are under "রোড দেওয়া নেই").

## 5.5.1
No database change. API: `dsr-my-day` commission / discount / shop-damage lines now also return `createdAt`, `shopId`, `shopPhone`.
- DSR লেনদেন → কমিশন / ছাড় / ড্যামেজ boxes: the date is shown once as a header (with that day's total); each row shows only the time.
- Shop name is tappable (📞) when the shop has a saved phone number: asks to confirm, then calls so the owner can verify the entry.

## 5.5.0
No database change. API files: still 12 (small additions inside `due-calendar.js` and `sr-payments.js`).

### Memo / receipt clarity (thermal)
- Long receipts are no longer drawn as ONE very tall image (phone browsers cap canvas size and silently shrink it → blurry text). The receipt is now cut between rows into parts of at most ~275 mm and each part is drawn at a fixed ~385 dpi. Preview, PDF (one page per part, 50 mm wide), JPG and WhatsApp use the sharp parts.
- **Direct Bluetooth print** button (🔵 ব্লুটুথ প্রিন্ট) in the memo panel: converts the sharp image to a 1-bit bitmap at the printer's dot width (58 mm = 384 dots, 80 mm = 576 dots — selectable) and sends ESC/POS raster over BLE. Needs Chrome/Edge on Android (HTTPS). Not available in iOS Safari. Classic-only (non-BLE) printers cannot be used from a web page — use the normal "প্রিন্ট" button or the RawBT app for those.

### Digit "1" / fonts
- `--font-ui`, `--font-num`, `--font-disp` still listed Hind Siliguri / Inter first, so digits (especially 1) used their odd shapes. Noto Sans is now first everywhere; Bengali letters still fall through to Hind Siliguri.

### Product settings
- অফার fields (ফ্রি পিস, প্রতি কত কেস, ফ্রি টাকা, লো স্টক অ্যালার্ট) now accept decimals (0.5 etc.) with a decimal keypad.

### Calendar
- Due calendar now follows the pay cycle like salary/targets: 26th of the previous month → 25th of the month (screen + `GET /api/due-calendar?month=YYYY-MM`). Expense report "এই মাসের খরচ" uses the same cycle.

### Owner home — profit panel
- The 2nd panel already was the profit panel (label flips নীট লাভ ↔ নীট ক্ষতি). It now shows a − sign for a loss and a line explaining the figure: মোট লাভ − (কমিশন/ছাড়/ড্যামেজ/বোনাস/খরচ).

### DSR লেনদেন → দেওয়া / ফেরত / ড্যামেজ বিস্তারিত
- Each slip: DSR name on top → items → straight line → total + the time the slip was saved (Bangladesh time). `dsr-my-day` now returns `dsrName` and `createdAt` per slip.

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
