# AXIION DMS — Setup

## 1. Supabase — database
Create a project, open the SQL editor, and run `schema.sql` once. It is the complete schema for a fresh deployment: all tables, indexes, functions, triggers, security policies, seed data and the photo bucket.

## 2. Supabase — Storage (product/staff photos)
**Update (Glass Frosted Animation Beta 1):** `schema.sql` now creates the public `thumbs` bucket automatically. The manual steps below are only needed if that statement fails on your project.

The app uploads product and staff profile photos to Supabase Storage, not
the database. Create the bucket manually — `schema.sql` can't do this part:

1. Supabase dashboard → **Storage** → **New bucket**
2. Name it exactly `thumbs` (the code has this name hardcoded)
3. Toggle **Public bucket** ON — photos are served as plain public URLs,
   no signed-URL logic exists in this codebase
4. Nothing else to configure — no folders or policies needed beyond
   "Public"

## 3. Vercel — environment variables
The build succeeding does not mean the app can reach the database — the API
needs two environment variables set in Vercel (Project → Settings →
Environment Variables), not a "password":

| Name                   | Where to find it in Supabase                          |
|------------------------|---------------------------------------------------------|
| `SUPABASE_URL`         | Project Settings → API → Project URL                    |
| `SUPABASE_SERVICE_KEY` | Project Settings → API → Project API keys → `service_role` |

Add both, then redeploy (env var changes don't apply to a build already in
progress).

## 4. GitHub / Vercel deploy
Push this folder to your repo and let Vercel auto-deploy, or drag-and-drop
the folder directly on Vercel. No other config changes are needed.

## 5. Serverless function limit (Vercel Hobby plan)
Hobby caps a deployment at 12 Serverless Functions. This project has
exactly 12 route files under `api/` (helper files under `api/_lib/` don't
count — Vercel excludes underscore-prefixed folders). If you add a new
`api/*.js` route later, merge it into an existing file (dispatch on
`?action=`) instead of adding a 13th file, or upgrade to a Pro/team plan.

## 6. First login
The schema seeds one login:

- Username: `owner`
- Password: `12345`

You'll be forced to set a new password on first login.
