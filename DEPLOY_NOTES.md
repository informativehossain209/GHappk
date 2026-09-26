# AXIION DMS — deployment notes for this package

This zip is a full, ready-to-deploy copy of the app — everything you need
is in here (Vercel functions, frontend, schema).

## 1. Database — run once in Supabase's SQL editor
Run `AXIION_V58_partial_migration.sql`. This is the ONLY schema change in
this release (adds `app_settings`, a single-row table holding your shop
name). It's additive and safe on a live database — no data loss, no
downtime. `AXIION_V57_partial_migration.sql` is included for history only
(V57 had no schema change).

`schema.sql` is the FULL schema, kept in sync for reference and for
spinning up a brand-new database from scratch — don't re-run it against
your existing live database.

## 2. Code — replace/redeploy
Either push this whole folder to your GitHub repo (replacing the old one)
and let Vercel auto-deploy, or drag-and-drop deploy it directly on Vercel.
No environment variable or vercel.json changes are needed.

## What changed in this release

**Pagination bug fix** (`api/dashboard.js`)
"This month" / date-range revenue, profit and sales queries were bare
Supabase queries, silently capped at PostgREST's default 1000 rows once
a month's transaction count passed that mark. Now paginated via the
existing `fetchAll()` helper, matching how lifetime totals were already
handled.

**Rebrand** (`public/index.html`, `api/settings.js`, `api/dashboard.js`,
`schema.sql` / migration)
- App name/chrome: "Miron Electronics" → "AXIION DMS" everywhere in the UI.
- New: your own business name is now a setting, not a hardcoded string —
  set it from Owner → Attendance tab → "🏪 দোকান/প্রতিষ্ঠানের নাম" card.
  Every printed challan/report/slip/due-notice uses this name; the app
  itself stays branded "AXIION DMS" underneath it ("Powered by AXIION DMS").

**Visual theme** (`public/index.html`)
- New color palette across both dark and light mode, based on the new
  logo: charcoal/black chrome with a gold/brass accent (previously navy
  blue), while status colors (green=success, red=danger, amber=warning,
  etc.) are kept as-is so they still read correctly.
- Rounder corners app-wide (cards, buttons, inputs, segmented controls,
  the branded header/punch-card banners) for the softer, "premium" look
  you asked for.
- A premium display typeface (Poppins) on the app wordmark, section
  header bar, and side-menu header, layered on top of the existing
  Bengali-safe font stack — no Bengali text anywhere was touched.
- Side menu reorganized into labelled sections (the "tree" nav you
  asked for) — Products & Sales, Team & Attendance, Shops & Field,
  Reports & Finance, System — instead of one long flat list, without
  changing what any button does or which role sees what.

## Still to come (say the word and I'll do the next one)
- Icon set upgrade (replacing emoji icons with a consistent premium icon
  set) — this touches a very large number of individual lines across the
  whole file, so I held it back from this pass to keep this release safe
  and testable first.
- A deeper per-page layout cleanup/restructure beyond the side-menu
  grouping done here (the "some pages are not managed well" part of your
  original ask) — best done page-by-page once you've confirmed this pass
  works well on your phone/site, so nothing breaks in one big change.
