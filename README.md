# 🏠 ঘর খরচ — V2

**আপনার ঘরের হিসাব, আপনার হাতে**

বাংলা হাউস এক্সপেন্স ট্র্যাকার — Next.js 14 + Supabase

---

## ✅ V2 এ যা নতুন যোগ হয়েছে

| ফিচার | স্ট্যাটাস |
|---|---|
| `middleware.ts` — Auth route protection | ✅ নতুন |
| `store/useAppStore.ts` — Zustand state management | ✅ নতুন |
| `lib/smartNotices.ts` — Client-side rule engine | ✅ নতুন |
| `components/TransactionForm.tsx` — Standalone form | ✅ নতুন |
| `components/AddTodoModal.tsx` — Todo যোগ করার UI | ✅ নতুন |
| `supabase/functions/generate-notices/index.ts` | ✅ নতুন |
| `supabase/migrations/002_pg_cron.sql` — Cron job | ✅ নতুন |
| `TodoReminders.tsx` — "যোগ করুন" বাটন সহ | ✅ ঠিক করা |
| `reports/page.tsx` — PDF Export (browser print) | ✅ ঠিক করা |
| `dashboard/page.tsx` — Smart notice integration | ✅ ঠিক করা |
| `add/page.tsx` — TransactionForm ব্যবহার | ✅ Refactored |

---

## 🚀 Quick Start

### 1. Dependencies install করুন
```bash
npm install
```

### 2. Environment variables সেট করুন
```bash
cp .env.local.example .env.local
# .env.local ফাইলে আপনার Supabase credentials দিন
```

### 3. Supabase setup

**Database migrations চালান:**
```bash
# Supabase Dashboard → SQL Editor
# supabase/migrations/001_initial.sql রান করুন
```

**Edge Functions deploy করুন:**
```bash
supabase functions deploy generate-notices
supabase functions deploy daily-notifications
```

**pg_cron setup (optional):**
```bash
# supabase/migrations/002_pg_cron.sql রান করুন
# YOUR_PROJECT_REF এবং YOUR_ANON_KEY পরিবর্তন করতে হবে
```

### 4. Development server চালান
```bash
npm run dev
```

---

## 📁 প্রজেক্ট স্ট্রাকচার

```
gharkhoroch/
├── middleware.ts              ← 🆕 Auth protection
├── store/
│   └── useAppStore.ts        ← 🆕 Zustand global state
├── lib/
│   ├── smartNotices.ts       ← 🆕 Client-side rule engine
│   ├── notify.ts             ← Android bridge utility
│   ├── utils.ts              ← Bengali date/taka format
│   ├── supabase-browser.ts
│   └── supabase-server.ts
├── components/
│   ├── TransactionForm.tsx   ← 🆕 Reusable form
│   ├── AddTodoModal.tsx      ← 🆕 Todo add modal
│   ├── TodoReminders.tsx     ← ✅ Fixed (add button)
│   ├── SmartNoticeCard.tsx
│   ├── BalanceHeader.tsx
│   ├── SummaryCards.tsx
│   ├── ExpenseBarChart.tsx
│   ├── RecentTransactions.tsx
│   ├── ReportList.tsx
│   ├── CategoryGrid.tsx
│   └── BottomNav.tsx
├── app/
│   ├── (auth)/login/         ← Phone OTP login
│   └── (main)/
│       ├── dashboard/        ← ✅ Fixed (smart notices)
│       ├── add/              ← ✅ Refactored
│       ├── reports/          ← ✅ Fixed (PDF export)
│       ├── budget/
│       └── settings/
└── supabase/
    ├── functions/
    │   ├── generate-notices/ ← 🆕 Edge function
    │   └── daily-notifications/
    └── migrations/
        ├── 001_initial.sql
        └── 002_pg_cron.sql   ← 🆕 Cron job setup
```

---

## 🔐 Auth Flow

`middleware.ts` স্বয়ংক্রিয়ভাবে:
- Login না করলে → `/login` এ redirect
- Login করা থাকলে → `/login` এ গেলে `/dashboard` এ redirect

---

## 📄 PDF Export

Reports পেজে **PDF** বাটন চাপুন।  
Browser-এর print dialog খুলবে — **"Save as PDF"** বেছে নিন।  
সম্পূর্ণ বাংলায় রিপোর্ট তৈরি হবে।

---

## 🔔 Smart Notice System

### Client-side (lib/smartNotices.ts)
Dashboard load হলে automatically run হয়। Rules:
1. কোনো ক্যাটাগরি ২০%+ বেশি হলে সতর্কতা
2. সাশ্রয় বাড়লে অভিনন্দন
3. আয়ের ৯০%+ খরচ হলে সতর্কতা
4. সবচেয়ে বড় খরচ category info
5. ৩+ দিন এন্ট্রি নেই → reminder

### Server-side (Edge Function)
রাত ১২টায় (BD time) pg_cron run করে।

---

## 📱 Android Notification

`lib/notify.ts` → `window.Android.showNotification()` call করে।  
APK-এ `MainActivity.kt` তে JavaScript Bridge add করতে হবে।  
বিস্তারিত: `GharKhoroch_Full_Plan_v2.md` দেখুন।

---

*ঘর খরচ V2 | সমস্ত ফিচার সম্পূর্ণ*
