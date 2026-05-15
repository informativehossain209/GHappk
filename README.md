# 🏠 ঘর খরচ — Ghar Khoroch

বাংলাদেশের পরিবারের জন্য বিনামূল্যে ঘরোয়া খরচ ট্র্যাকার।  
Free household expense tracker for Bangladeshi families.

**Tech Stack:** Next.js 14 · Supabase (Email Auth + Postgres) · Tailwind CSS · Vercel

---

## 🚀 সম্পূর্ণ ডিপ্লয় গাইড (ধাপে ধাপে)

### ধাপ ১ — Supabase প্রজেক্ট তৈরি করুন

1. [supabase.com](https://supabase.com) যান → **Start your project** ক্লিক করুন
2. GitHub দিয়ে সাইন আপ করুন (বিনামূল্যে)
3. **New project** ক্লিক করুন
4. নাম দিন: `gharkhoroch` · একটি শক্তিশালী Database Password দিন · Region: `Southeast Asia (Singapore)` বেছে নিন
5. **Create new project** — ৩০–৬০ সেকেন্ড অপেক্ষা করুন

---

### ধাপ ২ — Email Auth চালু করুন (বিনামূল্যে, কোনো SMS দরকার নেই)

1. Supabase Dashboard → বাম মেনু থেকে **Authentication** → **Providers** যান
2. **Email** provider দেখবেন — এটি ডিফল্টে **চালু** থাকে ✅
3. নিচের সেটিংস নিশ্চিত করুন:
   - ✅ **Enable Email provider** — চালু আছে
   - ✅ **Confirm email** — চালু রাখুন (নিরাপত্তার জন্য)
   - ❌ Phone provider → বন্ধ থাকলেই ভালো (আমরা ব্যবহার করছি না)
4. **Save** ক্লিক করুন

> 💡 Email auth সম্পূর্ণ বিনামূল্যে। Supabase নিজেই confirmation email পাঠাবে।

---

### ধাপ ৩ — Database তৈরি করুন (Migration চালান)

1. Supabase Dashboard → **SQL Editor** যান
2. **New query** ক্লিক করুন
3. `supabase/migrations/001_initial.sql` ফাইলের সব কোড কপি করুন → paste করুন → **Run** চাপুন
4. সাফল্যের বার্তা দেখলে আবার **New query** করুন
5. `supabase/migrations/002_pg_cron.sql` ফাইলের কোডও একইভাবে চালান

---

### ধাপ ৪ — API Keys সংগ্রহ করুন

1. Supabase Dashboard → **Project Settings** (⚙️ আইকন) → **API** যান
2. এই তিনটি ভ্যালু কপি করুন:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY` *(গোপন রাখুন)*

---

### ধাপ ৫ — Vercel-এ ডিপ্লয় করুন

1. এই প্রজেক্টটি GitHub-এ push করুন (private repo হলেও চলবে)
2. [vercel.com](https://vercel.com) যান → **Add New Project**
3. আপনার GitHub repo import করুন
4. **Environment Variables** সেকশনে নিচের ভ্যালুগুলো যোগ করুন:

```
NEXT_PUBLIC_SUPABASE_URL       = https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY      = eyJhbGciOiJIUzI1NiIs...
NEXT_PUBLIC_APP_URL            = https://your-app.vercel.app
```

5. **Deploy** ক্লিক করুন → ৩–৫ মিনিট অপেক্ষা করুন
6. ডিপ্লয় হলে আপনার Vercel URL কপি করুন (যেমন: `https://gharkhoroch.vercel.app`)

---

### ধাপ ৬ — Supabase-এ App URL আপডেট করুন

1. Supabase Dashboard → **Authentication** → **URL Configuration** যান
2. **Site URL** → আপনার Vercel URL দিন: `https://gharkhoroch.vercel.app`
3. **Redirect URLs** → যোগ করুন:
   ```
   https://gharkhoroch.vercel.app/**
   ```
4. **Save** করুন

---

### ধাপ ৭ — Vercel-এ App URL আপডেট করুন

1. Vercel Dashboard → আপনার project → **Settings** → **Environment Variables**
2. `NEXT_PUBLIC_APP_URL` → আপনার actual Vercel URL দিয়ে আপডেট করুন
3. **Redeploy** করুন: Deployments → সর্বশেষ deployment → **Redeploy**

---

## ✅ টেস্ট করুন

1. আপনার Vercel URL-এ যান
2. **নতুন অ্যাকাউন্ট** ট্যাবে ক্লিক করুন
3. একটি real email দিন + পাসওয়ার্ড দিন → **অ্যাকাউন্ট তৈরি করুন**
4. আপনার email inbox চেক করুন → Supabase-এর confirmation email আসবে
5. লিংকে ক্লিক করুন → ড্যাশবোর্ডে redirect হবে ✅

---

## 🔐 Auth Features

| ফিচার | বিবরণ |
|--------|--------|
| Email + Password লগইন | বিনামূল্যে, SMS দরকার নেই |
| Email verification | Supabase নিজেই পাঠায় |
| পাসওয়ার্ড ভুলে গেলে | Reset email পাঠানো হয় |
| নতুন অ্যাকাউন্ট | একই পেজ থেকে signup |
| Auto logout | Supabase session management |

---

## 📁 প্রজেক্ট স্ট্রাকচার

```
gharkhoroch-v2/
├── app/
│   ├── (auth)/login/       # Login + Signup + Forgot password
│   ├── (main)/
│   │   ├── dashboard/      # হোম ড্যাশবোর্ড
│   │   ├── add/            # নতুন লেনদেন
│   │   ├── reports/        # রিপোর্ট
│   │   ├── budget/         # বাজেট
│   │   └── settings/       # সেটিংস
├── components/             # Reusable components
├── lib/                    # Supabase clients
├── supabase/
│   ├── migrations/         # SQL migration files
│   └── functions/          # Edge functions
└── store/                  # Zustand state
```

---

## 🆓 সম্পূর্ণ বিনামূল্যে

- **Supabase Free Tier:** 500MB DB · 50K auth users · Edge functions
- **Vercel Free Tier:** Unlimited deployments · Custom domain
- **Email Auth:** বিনামূল্যে, কোনো SMS বা Twilio দরকার নেই

---

Made with ❤️ for Bangladesh 🇧🇩
