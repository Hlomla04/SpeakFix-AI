# SpeakFix AI

Voice-first maintenance & incident reporting. Speak naturally, Iris (your AI assistant) listens, classifies, and files a structured ticket. Technicians repair, document, and submit for verification. The original reporter confirms the fix is real — only then is the ticket closed as **Resolved — User Confirmed**.

## What's inside

- **Frontend + Backend**: Next.js 16 (App Router) + React 19 + Tailwind CSS 4 + shadcn/ui
- **Auth**: Supabase Auth (managed sessions, JWT in httpOnly cookies, JWKS verification via jose)
- **Database**: Prisma ORM — works with SQLite (local dev) OR Postgres (production). One line in `prisma/schema.prisma` switches the provider.
- **Voice in**: Browser Web Speech API (live interim transcripts) with automatic fallback to MediaRecorder → `/api/transcribe` (z-ai ASR) when the browser's speech service is unreachable.
- **Voice out**: Cloud neural TTS via `/api/tts` (z-ai-web-dev-sdk's "tongtong" voice — a warm, natural female voice). Falls back to browser speechSynthesis if the cloud is down.
- **Agent brain**: NVIDIA Integrate API (`z-ai/glm-5.3-flash`) with automatic fallback to z-ai-web-dev-sdk when NVIDIA is unavailable.

## Quick start

```bash
# 1. Install
bun install   # or: npm install

# 2. Configure env vars — copy the template and fill in your keys
cp .env.example .env
# Edit .env: set DATABASE_URL, SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
#           SUPABASE_SECRET_KEY, SUPABASE_JWKS_URL, NVIDIA_API_KEY

# 3. Create the database
bunx prisma db push

# 4. Seed demo accounts + your admin/technician accounts
# Edit scripts/seed-supabase.ts with your own emails first
bun scripts/seed-supabase.ts

# 5. Run
bun run dev   # → http://localhost:3000
```

## Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Reporter | demo@speakfix.ai | demo1234 |
| Maintenance | tech@speakfix.ai | tech1234 |
| Administrator | admin@speakfix.ai | admin1234 |

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for step-by-step free deployment options:
- **Vercel + Supabase Postgres** (recommended — no cold starts, free tier)
- **Render** (keeps SQLite, sleeps after 15 min)
- **Fly.io** (always-on, persistent volume)

## Architecture

- **Use case diagram**: `download/diagrams/speakfix-use-case-diagram.png`
- **System flow diagram**: `download/diagrams/speakfix-system-flow-diagram.png`
- **Full worklog**: `worklog.md` (380 lines covering all 11 development tasks)

## The closed-loop lifecycle

```
VOICE → UNDERSTAND → CLASSIFY → CREATE → REPAIR → DOCUMENT → VERIFY → CONFIRM
                                                                    ↓
                                                          YES → RESOLVED
                                                          NO  → REOPENED → REPAIR AGAIN
```

A ticket is "Resolved" only when the original reporter confirms the fix. A technician submitting a resolution does NOT close the ticket — it goes to `AWAITING_VERIFICATION` and only `reporter_confirm` can transition it to `RESOLVED`.
