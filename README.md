# ঘর খরচ — Ghar Khoroch

একটি সহজ বাংলা পারিবারিক খরচ ট্র্যাকিং অ্যাপ।

**Developed by Sakib Hossain**

---

## 🚀 Quick Setup (Step by Step)

### Step 1 — Supabase Setup

1. Go to [supabase.com](https://supabase.com) → Create a new project
2. Go to **SQL Editor** in your project
3. Open the file `supabase/migrations/001_initial_schema.sql`
4. Copy the entire contents and paste into the SQL Editor
5. Click **Run**
6. Go to **Project Settings → API**
7. Copy your **Project URL** and **anon public** key

---

### Step 2 — Environment Variables

Create a `.env.local` file in the root of the project:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

---

### Step 3 — Install & Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

### Step 4 — Deploy to Vercel

1. Push this project to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project
3. Import your GitHub repository
4. Add your environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy**

---

## 📱 Features

- ✅ PIN-based login (4-digit, ultra fast)
- ✅ Income & expense tracking
- ✅ Category-wise breakdown
- ✅ Monthly budget management
- ✅ Pie & bar charts (Recharts)
- ✅ Smart notices/alerts
- ✅ To-do reminders
- ✅ Viewer sharing (wife/husband can view)
- ✅ Bengali UI with Hind Siliguri font
- ✅ Mobile-first design
- ✅ PWA (installable as app)
- ✅ Dark mode ready

---

## 🔐 PIN System

- Users register with name, phone, and 4-digit PIN
- Login requires ONLY the 4-digit PIN
- PINs are hashed before storage
- Each PIN must be unique across all users

---

## 🗂️ Project Structure

```
ghar-khoroch/
├── app/
│   ├── auth/
│   │   ├── login/       # PIN login screen
│   │   └── register/    # New user registration
│   ├── (app)/
│   │   ├── home/        # Dashboard
│   │   ├── add/         # Add transaction
│   │   ├── reports/     # Charts & transaction list
│   │   ├── budget/      # Budget management
│   │   └── settings/    # Profile, PIN, viewer
│   └── layout.tsx
├── lib/
│   ├── supabase.ts      # Supabase client
│   ├── utils.ts         # Bengali helpers, formatters
│   └── categories.ts    # Default categories
├── store/
│   └── auth.ts          # Zustand auth store
├── types/
│   └── index.ts         # TypeScript types
└── supabase/
    └── migrations/
        └── 001_initial_schema.sql  # Run this in Supabase!
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Charts | Recharts |
| Backend | Supabase (PostgreSQL) |
| Auth | Custom PIN-based |
| Deploy | Vercel |

---

## 📋 Default Categories

**Expense:** খাবার, বাজার, যাতায়াত, বিল/ইউটিলিটি, শিক্ষা, স্বাস্থ্য, কাপড়, বিনোদন, বাড়ি ভাড়া, মোবাইল রিচার্জ, সঞ্চয়, অন্যান্য

**Income:** বেতন, ব্যবসা, ফ্রিল্যান্স, বোনাস, বিনিয়োগ, অন্যান্য

---

## 🔮 Future Features (Architecture Ready)

- Push notifications (Supabase Edge Functions)
- Voice expense entry
- OCR receipt scanner
- Family shared wallet
- Bengali AI assistant

---

## 💡 Tips

- **First time setup:** Register a new user, then share the PIN-login URL with family members
- **Viewer access:** Go to Settings → Viewer to share read-only access
- **Install as app:** Open in mobile browser → Add to Home Screen
- **Budget alerts:** Set budgets in the Budget tab; you'll see alerts when 80%+ is spent

---

*Developed with ❤️ by Sakib Hossain*
