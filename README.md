# দোকানদার (Dokandar) — Shop Management ERP

Multi-tenant shop management system, built per `DOKANDAR-BUILD-SPEC.md`,
reusing proven patterns from AXIION V57 (schema style, pagination-safe
fetch, PIN auth, photo storage, stock triggers) and extending them for
many independent shops on one deployment.

## What's new in v4

This pass was entirely about **fixing real problems reported from daily
use**, not adding new modules:

- **Home dashboard trimmed to two options.** The 4-across icon grid is
  gone from the home screen — it now shows only **বিক্রি (Sale/POS)** and
  **খুঁজুন (Search)**, as two larger buttons with no leftover empty white
  space above the KPI card. Every other module (স্টক/পণ্য, ক্রয়,
  সরবরাহকারী, কাস্টমার, স্টাফ, হাজিরা, বেতন, খরচ, ক্লোজিং, রিপোর্ট,
  সেটিংস) is still exactly one tap away — it just lives in the **☰ side
  menu** now instead of being duplicated on the home screen too.
- **Header made narrower.** The top bar's padding/avatar/button sizes were
  reduced so it takes up noticeably less vertical space, and the
  date/time strip under it was tightened to match.
- **Shop picture.** Settings (owner-only) now has a **শপের ছবি** upload —
  it replaces the initial-letter avatar in the header and side menu, and
  also appears at the top of the printed/shared receipt. Product photos
  already existed in the product form and continue to work the same way;
  if what you actually meant by "picture of the water" was something more
  specific than the shop's own picture, tell me exactly where it should
  show and I'll wire it in.
- **The QR-code bug is fixed.** Tapping "পণ্য যোগ করুন" (Add product) and
  having the QR code silently fail to appear — no download, no share, no
  print — was caused by the app's bottom-sheet modal stacking multiple
  copies of itself on top of each other when a tap was repeated (each
  copy reused the same `#label-qr` element id, so the QR code got drawn
  into a hidden sheet underneath the one you could actually see). Modals
  now always close any previous one before opening, which eliminates the
  duplicate-id clash everywhere in the app, not just on this screen.
- **No more duplicate products.** Two things were combined to stop "same
  product saved 2, 3, 4 times": (1) the Save button now locks itself
  (shows "সংরক্ষণ হচ্ছে...") the instant it's tapped and ignores repeat
  taps while the request is in flight, and (2) `api/products.js` now
  rejects a create/update with a name that already exists for that shop
  (case-insensitive), with a matching unique database index as a final
  backstop against a genuine same-instant race.
- **General UI lag.** The three third-party script tags (QR generation,
  image capture, camera scanner) were blocking the page from rendering
  until fully downloaded — they're now loaded with `defer` so the app
  becomes interactive faster. Product search (POS, catalog, customer
  picker, global search) now tags each request with a sequence number and
  discards any response that arrives after a newer one — previously a
  slow reply to an old keystroke could overwrite the results of what
  you'd already typed next, which is what a lot of "laggy/stuck" feeling
  actually was.
- **Reports and stock search now take a date range**, not just
  daily/weekly/monthly/yearly. Reports has a "নির্দিষ্ট তারিখ / রেঞ্জ"
  period option with a from/to date pair; the search screen (reached from
  home or the side menu) shows each matching product's live stock count
  and an "in stock / out of stock" badge as you type.
- **`schema.sql` is now the one and only schema file.** The old
  `migration_v3_location_punch.sql` has been folded directly into it —
  there is nothing partial to run separately anymore. For a **brand-new
  Supabase project**, run `schema.sql` once and you're fully current
  (tenants, staff, sessions, products with `category_fields` JSONB and
  the new `shop_logo` column, suppliers, purchases, customers,
  due_calendar, transactions, pending_approvals, attendance, salary
  (settings/ledger/day-override), advances, expenses, daily closing,
  report snapshots with custom-range support, the stock-delta trigger,
  and Row-Level Security policies on every tenant table). If you're
  migrating an **existing** v1/v2/v3 database, every statement in the
  file is written to be safe to re-run against live data (`create table
  if not exists`, `add column if not exists`) with one exception: the new
  `uniq_products_tenant_name` index will fail to create if your data
  already contains duplicate product names (exactly the bug this version
  fixes) — clean those up first, then re-run the file.

## What's included in this build

- **`schema.sql`** — the complete multi-tenant Postgres schema described
  above, plus the storage bucket setup and every trigger/RLS policy the
  app depends on.
- **`api/`** — the 10 consolidated serverless functions, each routed by
  `?action=` exactly like AXIION: `auth.js` (login/registration/sessions/
  platform-admin/shop-logo upload), `products.js`, `pos.js`,
  `purchases.js`, `customers.js`, `staff.js`, `expenses.js`,
  `dashboard.js`, `report.js` (now with custom date-range support),
  `search.js`. `pos.js` also exposes a public, no-login `verify` action
  for the QR code printed on receipts.
- **`public/index.html`** — single-page vanilla-JS frontend: login,
  registration, platform-admin screen, the trimmed 2-button home
  dashboard, POS with cart + custom-price approval flow + camera scan,
  product catalog with category-driven fields + barcode scan + printable
  QR labels (now reliably showing/downloading/sharing), a full
  printable/shareable receipt screen with the shop's own picture on it, a
  public invoice-verification page, suppliers/purchases, customers,
  staff/attendance/salary (owner-only settings editor), expenses, daily
  closing, reports with date-range search, global/stock search, and
  settings (now including shop picture upload).
- **`public/manifest.json` + `public/sw.js`** — PWA install support.

## What you need to finish before this runs live

1. **Supabase project.** Create one, enable `pgcrypto` and `pg_trgm` (the
   schema does this itself), then run `schema.sql` once against it in the
   SQL editor.
2. **Storage bucket.** `schema.sql` creates the public `thumbs` bucket
   itself (used for product/staff photos and the shop picture, namespaced
   `thumbs/<tenant_id>/...`) — nothing to create by hand in the Supabase
   dashboard.
3. **Environment variables** (Vercel project settings):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (the service-role key — API routes bypass RLS
     by design, same as AXIION; RLS policies exist as a defense-in-depth
     safety net, not the primary access control)
   - `CRON_SECRET` (optional — protects the `report.js?action=cron-daily`
     endpoint; if set, Vercel's cron must send it as
     `Authorization: Bearer <value>`, configurable in `vercel.json`)
4. **First platform admin.** There's no self-serve signup for this
   account by design — a default one is seeded directly by `schema.sql`
   (see the comment above that `insert` for the login and a reminder to
   change the password). The platform-admin screen is reachable from the
   shop login screen's small "প্ল্যাটফর্ম অ্যাডমিন" link — move/hide that
   link once you're live; it's left visible here only to make this build
   testable end-to-end.
5. **Set each shop's address** (used on the receipt header) and **upload
   a shop picture** — both are now available directly from the app:
   address on the `tenants` row (still no settings-screen field for
   address itself), and the shop picture from **সেটিংস → শপের ছবি**
   (owner login required).
6. **Camera permissions.** The barcode/QR scanner needs HTTPS (Vercel
   gives you this by default) and the browser will prompt for camera
   access on first use — no extra setup needed, but test it on the actual
   phones staff will use before relying on it at the counter.
7. **Deploy.** `vercel --prod` (or connect the repo in the Vercel
   dashboard). `vercel.json` already points the daily report cron at 8pm
   UTC — adjust the schedule to match Asia/Dhaka if you want a different
   local time.
8. **Android wrapper** — the web app's `window.__onAndroidBack` hook and
   modal-stack chain are in place and ready for it, no changes needed on
   this side unless the shell expects additional bridge methods this
   build doesn't call yet.

## Design decisions made on your behalf

- **Frontend approach:** single `index.html`, vanilla JS — matches
  AXIION, fastest to ship. As this app grows past MVP, the file will get
  large; consider a componentized rewrite once the feature set
  stabilizes.
- **VAT:** stored as a configurable `tenants.vat_percent` (default 0),
  not hardcoded — adjust per shop from Supabase directly for now; a
  settings-screen control is the natural next addition. The receipt
  already reads and displays it correctly once set.
- **Thermal printer width:** `tenants.receipt_width_mm` (default 80) —
  both 58mm and 80mm are supported and the receipt screen picks the right
  CSS automatically; there's no settings-screen toggle for it yet either,
  same as VAT above.
- **Duplicate-name check is exact-name, case-insensitive**, not a fuzzy
  match — "Coca Cola 500ml" and "Coca Cola 500 ml" are still treated as
  different products on purpose, since the shop may genuinely stock
  both. If you'd rather this be stricter (or looser, e.g. also comparing
  SKU/barcode), that's a one-line change in `api/products.js`.

## Remaining honest gaps

- **Salary cycle** still uses plain calendar months, not a 26th–25th
  pay-cycle — flagged as a deliberate simplification, not an oversight;
  swapping it in is a pure application-logic change later.
- **VAT % and receipt width** aren't editable from the settings screen
  yet (set them directly in Supabase for now) — small, contained
  additions when you're ready.
- **Bulk/multi-select label printing** — today it's one QR label per tap;
  printing a whole sheet at once for a batch of new stock is a natural
  next step.
- Fine-grained UI hiding beyond the existing permission matrix (e.g.
  exactly which report types each partial-access role sees) can keep
  getting tuned as real staff use it and you see what they actually try
  to tap.
