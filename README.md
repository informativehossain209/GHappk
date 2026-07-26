# দোকানদার (Dokandar) — Shop Management ERP

Multi-tenant shop management system, built per `DOKANDAR-BUILD-SPEC.md`,
reusing proven patterns from AXIION V57 (schema style, pagination-safe
fetch, PIN auth, photo storage, stock triggers) and extending them for
many independent shops on one deployment.

## What's included in this build (v2 — receipt, QR/scanner, permissions completed)

- **`schema.sql`** — full multi-tenant Postgres schema: tenants (now with
  `address` for receipts), staff, sessions, products (with
  `category_fields` JSONB), suppliers, purchases, customers, due_calendar,
  transactions, pending_approvals, attendance, salary (settings/ledger/
  day-override), advances, expenses, daily closing, report snapshots, the
  stock-delta trigger, and Row-Level Security policies on every tenant
  table.
- **`api/`** — the 10 consolidated serverless functions from the spec's
  Open Question #2 table: `auth.js`, `products.js`, `pos.js`,
  `purchases.js`, `customers.js`, `staff.js`, `expenses.js`,
  `dashboard.js`, `report.js`, `search.js` — each routed by `?action=`
  exactly like AXIION. `pos.js` now also exposes a **public, no-login
  `verify` action** for the QR code printed on receipts.
- **`public/index.html`** — single-page vanilla-JS frontend: login,
  registration, platform-admin screen, the 4-across icon-tile dashboard,
  POS with cart + custom-price approval flow + camera scan, product
  catalog with category-driven fields + barcode scan + printable QR
  labels, a full printable/shareable **receipt screen**, a public
  **invoice-verification page**, suppliers/purchases, customers,
  staff/attendance/salary (with an owner-only settings editor),
  expenses, daily closing, reports, global search, and settings.
- **`public/manifest.json` + `public/sw.js`** — PWA install support.

### Newly completed this pass

- **§7 Receipts** — a real printable/shareable invoice: shop name,
  address, phone, invoice #, cashier, itemized table, subtotal, VAT line
  (only shown if `vat_percent > 0`), grand total, and a QR code linking
  to a public verification page. Three actions: **Print** (uses
  `receipt_width_mm` — 58mm/80mm CSS variant automatically, or full-width
  for A4/normal printers), **Download** (PNG via `html2canvas`), and
  **Share** (native share sheet with the image file via
  `navigator.share`, falling back to a `wa.me` text link + image download
  on browsers without file-sharing support — same fallback AXIION's own
  slip panel relies on).
- **§6 Barcode/QR** — a shared camera-scanner modal (`html5-qrcode`,
  `getUserMedia`-based) used in two places: the POS search bar (scan →
  instant add-to-cart) and the product form's barcode field (scan →
  fills the field). QR codes are generated fully client-side
  (`qrcode` library, MIT-licensed, no server round-trip) — both on the
  receipt (verification link) and as a printable single-product label
  from the product list (🏷️ button). A batch/multi-select label sheet
  is a natural next step once this is in daily use.
- **§15 verification page** — `?verify=1&tenant=<id>&invoice=<no>` is
  checked *before* the normal login flow at boot, so a customer scanning
  a receipt's QR never needs to log in; it shows only shop name, invoice
  #, date, item count, and total — no cost/profit/customer data.
- **§16 Permission matrix** — tightened to match your table exactly,
  not just "roughly right":
  - **Staff management** → owner only (was owner+manager). Manager can
    still see the roster, just can't add/edit/reset others' PINs.
  - **Salary/HR** → owner edits pay rates and records payments; manager
    and accountant get read-only visibility (a "শুধু মালিক পরিবর্তন
    করতে পারবেন" note appears for them instead of edit fields); other
    roles see nothing beyond their own attendance.
  - **Expenses** → owner/manager/accountant only (removed cashier, per
    your table).
  - **Daily Closing approve** → owner/manager only (unchanged, now also
    hidden client-side, and an owner-only "reopen day" action was added
    since the spec explicitly calls for that escape hatch).
  - **Profit figures** → hidden from cashier/salesperson/inventory_manager
    in both the dashboard KPI and the POS cart's per-line profit display,
    not just left to chance in the UI.
  These are enforced on the backend (so a manipulated request still
  gets a 403) *and* hidden/adjusted in the UI so people aren't shown
  controls that will just error.

## What you need to finish before this runs live

1. **Supabase project.** Create one, enable `pgcrypto` and `pg_trgm`
   (the schema does this itself), then run `schema.sql` once against it
   in the SQL editor. If you already ran the v1 schema, add the one new
   column by hand: `alter table tenants add column address text default '';`
2. **Storage bucket.** Create a public bucket named `thumbs` in Supabase
   Storage (used for product/staff photos, namespaced
   `thumbs/<tenant_id>/...`).
3. **Environment variables** (Vercel project settings):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY` (the service-role key — API routes bypass RLS
     by design, same as AXIION; RLS policies exist as a defense-in-depth
     safety net, not the primary access control)
   - `CRON_SECRET` (optional — protects the `report.js?action=cron-daily`
     endpoint; if set, Vercel's cron must send it as
     `Authorization: Bearer <value>`, configurable in `vercel.json`)
4. **First platform admin.** There's no self-serve signup for this
   account by design (§2.1) — insert it directly in Supabase:
   ```sql
   -- Generate a hash from Node: 
   -- node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');console.log(s+':'+c.scryptSync('yourpassword',s,64).toString('hex'))"
   insert into platform_admins (name, username, password_hash)
   values ('Your Name', 'admin', '<paste the salt:hash string here>');
   ```
   The platform-admin screen is reachable from the shop login screen's
   small "প্ল্যাটফর্ম অ্যাডমিন" link — move/hide that link once you're
   live, per the spec's "never linked from the public site" note; it's
   left visible here only to make this build testable end-to-end.
5. **Set each shop's address** (used on the receipt header) — there's
   no settings-screen field for this yet; set it directly on the
   `tenants` row until that control is added.
6. **Camera permissions.** The barcode/QR scanner needs HTTPS (Vercel
   gives you this by default) and the browser will prompt for camera
   access on first use — no extra setup needed, but test it on the
   actual phones staff will use before relying on it at the counter.
7. **Deploy.** `vercel --prod` (or connect the repo in the Vercel
   dashboard). `vercel.json` already points the daily report cron at
   8pm UTC — adjust the schedule to match Asia/Dhaka if you want a
   different local time.
8. **Android wrapper** — you mentioned this is already built separately;
   the web app's `window.__onAndroidBack` hook and modal-stack chain
   are in place and ready for it (§19), no changes needed on this side
   unless the shell expects additional bridge methods this build
   doesn't call yet.

## Design decisions made on your behalf (§Open Questions)

- **Frontend approach:** single `index.html`, vanilla JS — matches
  AXIION, fastest to ship. As this app grows past MVP, the file will
  get large (AXIION's own reference is ~9,300 lines); consider a
  componentized rewrite once the feature set stabilizes.
- **VAT:** stored as a configurable `tenants.vat_percent` (default 0),
  not hardcoded — adjust per shop from Supabase directly for now; a
  settings-screen control is the natural next addition. The receipt
  already reads and displays it correctly once set.
- **Thermal printer width:** `tenants.receipt_width_mm` (default 80) —
  both 58mm and 80mm are supported and the receipt screen picks the
  right CSS automatically; there's no settings-screen toggle for it yet
  either, same as VAT above.

## Remaining honest gaps

- **Salary cycle** still uses plain calendar months, not AXIION's
  26th–25th pay-cycle — flagged as a deliberate simplification, not an
  oversight; swapping it in is a pure application-logic change later.
- **VAT % and receipt width** aren't editable from the settings screen
  yet (set them directly in Supabase for now) — small, contained
  additions when you're ready.
- **Bulk/multi-select label printing** — today it's one QR label per
  tap; printing a whole sheet at once for a batch of new stock is a
  natural next step.
- Fine-grained UI hiding beyond what's listed above (e.g. exactly which
  report types each partial-access role sees) can keep getting tuned as
  real staff use it and you see what they actually try to tap.

