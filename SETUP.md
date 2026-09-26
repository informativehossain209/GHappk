# AXIION DMS — Setup

## 1. Supabase
Create a project, open the SQL editor, and run `schema.sql` once.

## 2. Vercel — environment variables
The build succeeding does not mean the app can reach the database — the API
needs two environment variables set in Vercel (Project → Settings →
Environment Variables), not a "password":

| Name                   | Where to find it in Supabase                          |
|------------------------|---------------------------------------------------------|
| `SUPABASE_URL`         | Project Settings → API → Project URL                    |
| `SUPABASE_SERVICE_KEY` | Project Settings → API → Project API keys → `service_role` |

Add both, then redeploy (env var changes don't apply to a build already in
progress).

## 3. GitHub / Vercel deploy
Push this folder to your repo and let Vercel auto-deploy, or drag-and-drop
the folder directly on Vercel. No other config changes are needed.

## 4. Serverless function limit (Vercel Hobby plan)
Hobby caps a deployment at 12 Serverless Functions. This project has
exactly 12 route files under `api/` (helper files under `api/_lib/` don't
count — Vercel excludes underscore-prefixed folders). If you add a new
`api/*.js` route later, merge it into an existing file (dispatch on
`?action=`) instead of adding a 13th file, or upgrade to a Pro/team plan.

## 5. First login
The schema seeds one login:

- Username: `owner`
- Password: `12345`

You'll be forced to set a new password on first login.
