# SpeakFix AI — Deployment Guide

This is a **Next.js 16 full-stack app** (frontend + API routes in one project). You have three free deployment options. Pick the one that fits you best.

---

## Option A — Vercel + Supabase Postgres  ⭐ RECOMMENDED

**Best for:** production-ready, no cold starts, free, what Next.js is designed for.

**Free tier limits:**
- Vercel Hobby: 100 GB bandwidth, unlimited static requests, 100 GB-Hours serverless function execution per month
- Supabase Free: 500 MB database, 50,000 monthly active auth users, 1 GB file storage

### Steps

1. **Push to GitHub**
   ```bash
   git init && git add . && git commit -m "SpeakFix AI"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/speakfix-ai.git
   git push -u origin main
   ```

2. **Deploy the Next.js app to Vercel**
   - Go to https://vercel.com → Sign up with GitHub
   - Click "Add New…" → Project → import your `speakfix-ai` repo
   - Framework Preset: **Next.js** (auto-detected)
   - Build command: `next build` (default)
   - Output directory: `.next` (default)
   - Click "Environment Variables" and add ALL the variables from your `.env` file (Supabase URL/keys/JWKS, NVIDIA_API_KEY, NVIDIA_BASE_URL, NVIDIA_MODEL, SPEAKFIX_TTS_VOICE). Set `DATABASE_URL` to the Supabase Postgres connection string from step 3 below.
   - Click "Deploy"

3. **Set up Supabase Postgres** (you already have a Supabase project for auth)
   - Go to your Supabase dashboard → your project
   - Click "Project Settings" → "Database"
   - Under "Connection string", choose "URI" → copy it (looks like `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`)
   - Set this as `DATABASE_URL` in Vercel's env vars

4. **Switch Prisma from SQLite to Postgres**
   - Open `prisma/schema.prisma`
   - Change `provider = "sqlite"` to `provider = "postgresql"`
   - Commit + push to GitHub → Vercel will auto-redeploy

5. **Create the database tables**
   - On your local machine, set `DATABASE_URL` in `.env` to the Supabase Postgres connection string
   - Run:
     ```bash
     npx prisma db push
     ```
   - This creates all the tables (User, PasswordResetToken, Ticket, AuditEntry) in your Supabase Postgres.

6. **Seed demo data + your admin/technician accounts**
   - Update `scripts/seed-supabase.ts` with your own emails + passwords (the file currently has `hlomlandzendze@gmail.com` as ADMIN and `cjayasonele@gmail.com` as TECHNICIAN)
   - Run:
     ```bash
     bun scripts/seed-supabase.ts
     ```
   - This creates the 3 demo accounts (demo@speakfix.ai, tech@speakfix.ai, admin@speakfix.ai) + your admin + technician accounts in Supabase Auth + the local Postgres tables.

7. **Done!** Your app is live at `https://speakfix-ai.vercel.app` (or whatever name Vercel assigns).

---

## Option B — Render (simplest, keeps SQLite)

**Best for:** if you don't want to migrate to Postgres. Render gives you a persistent disk so SQLite works as-is.

**Free tier limits:**
- Render Free Web Service: 512 MB RAM, 400 hours/month (sleeps after 15 min inactivity, takes ~30s to wake on first request)

### Steps

1. **Push to GitHub** (same as Option A step 1)

2. **Create a Web Service on Render**
   - Go to https://render.com → Sign up with GitHub
   - Click "New +" → "Web Service" → connect your `speakfix-ai` repo
   - Name: `speakfix-ai`
   - Runtime: **Node** (or "Docker" if you prefer)
   - Build Command: `npm install && npx prisma generate && npm run build`
   - Start Command: `npm run start`
   - Click "Advanced" → "Add Environment Variable" and add ALL the variables from your `.env` file
   - For `DATABASE_URL`, set it to `file:/var/data/custom.db` (the persistent disk path)
   - Click "Create Web Service"

3. **Add a persistent disk** (required for SQLite to survive redeployments)
   - In your Render service → "Disks" tab → "Add Disk"
   - Mount path: `/var/data`
   - Size: 1 GB (free)
   - Set `DATABASE_URL=file:/var/data/custom.db` in env vars

4. **Initialize the database**
   - Render → your service → "Shell" tab → run:
     ```bash
     npx prisma db push
     bun scripts/seed-supabase.ts
     ```

5. **Done!** Your app is live at `https://speakfix-ai.onrender.com`. Note: the free tier sleeps after 15 min of inactivity — first request after sleep takes ~30 seconds to wake up.

---

## Option C — Fly.io (true free tier, always-on)

**Best for:** if you want always-on hosting with persistent SQLite.

**Free tier limits:**
- 3 shared-cpu-1x VMs (256 MB RAM each)
- 3 GB persistent storage
- No cold starts (always running)

### Steps

1. **Install flyctl** + create an account:
   ```bash
   curl -L https://fly.io/install.sh | sh
   flyctl auth login
   ```

2. **Create a Fly app + persistent volume:**
   ```bash
   flyctl launch  # generates fly.toml + Dockerfile
   flyctl volumes create speakfix_data
   flyctl secrets set DATABASE_URL="file:/var/data/custom.db"
   flyctl secrets set SUPABASE_URL=...  # add all env vars
   # ... repeat for every env var from .env
   flyctl deploy
   ```

3. **Initialize the database:**
   ```bash
   flyctl ssh console
   # inside the VM:
   npx prisma db push
   bun scripts/seed-supabase.ts
   ```

4. **Done!** Your app is live at `https://speakfix-ai.fly.dev`.

---

## Which one should I pick?

| | Vercel + Supabase | Render | Fly.io |
|---|---|---|---|
| **Free tier** | Yes (generous) | Yes (sleeps after 15 min) | Yes (always-on) |
| **Cold starts** | No | Yes (30s wake) | No |
| **Database** | Postgres (free 500MB) | SQLite on disk | SQLite on volume |
| **Migration needed** | Yes (SQLite → Postgres, 1 line) | No | No |
| **Setup time** | ~10 min | ~5 min | ~15 min |
| **Best for** | Production | Simple prototypes | Always-on free |

**My recommendation:** **Vercel + Supabase Postgres** (Option A) because it's the cleanest, fastest, no-cold-starts, and you already have a Supabase project for auth — you just enable Postgres (which is included for free).

---

## After deployment: verify it works

1. Visit your deployed URL
2. Click "Log In"
3. Sign in with your admin account (e.g. `hlomlandzendze@gmail.com` / `Aa199777$`)
4. You should see 5 tabs (Report / My Tickets / Maintenance Queue / All Tickets / Insights)
5. Click the mic → speak a problem → Iris should respond in 3-10s with a natural female voice

If anything fails, check the hosting provider's logs (Vercel: "Logs" tab; Render: "Logs" tab; Fly: `flyctl logs`).

---

## Need help?

The full worklog of every change made during development is in `worklog.md` (380 lines, covers all 11 development tasks). The architecture is documented in `download/diagrams/speakfix-use-case-diagram.png` and `download/diagrams/speakfix-system-flow-diagram.png`.
