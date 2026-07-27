-- ════════════════════════════════════════════════════════════════════════
-- Dokandar v3 — Shop location + working GPS punch system
-- Additive/non-destructive — safe to run once on a live Supabase project.
-- Run this INSTEAD of schema.sql if you already have real data.
-- ════════════════════════════════════════════════════════════════════════

alter table tenants add column if not exists lat numeric;
alter table tenants add column if not exists lng numeric;
alter table tenants add column if not exists geo_radius_m int not null default 150;
alter table tenants add column if not exists punch_ontime_hour int not null default 10;

alter table attendance add column if not exists in_lat numeric;
alter table attendance add column if not exists in_lng numeric;
alter table attendance add column if not exists out_lat numeric;
alter table attendance add column if not exists out_lng numeric;

-- Nothing else changes. Existing tenants simply have lat/lng = null, which
-- api/staff.js's punch action treats as "no geofence configured yet" — the
-- punch button keeps working exactly as before until an owner sets a
-- location from স্টাফ ও উপস্থিতি → শপ লোকেশন সেট করুন.
