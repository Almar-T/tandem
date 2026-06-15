# Tandem

A shared, AI-powered productivity OS for two people — calendar dashboard, shared tasks,
AI planning assistant, goals, a work timer with productivity states, analytics, and push
notifications. Installable PWA, free to run, deployed from GitHub.

> **Working name.** Tandem = two people moving as one toward a shared goal.

## Stack (all free tier, no credit card)

| Layer | Tech |
| --- | --- |
| Frontend | React 18 + TypeScript + Vite, Tailwind CSS |
| PWA | vite-plugin-pwa (Workbox) |
| Data / state | TanStack Query + Supabase JS |
| Backend | Supabase (Postgres + Realtime + Auth + Edge Functions + Storage) |
| AI | Google Gemini 2.0 Flash via a Supabase Edge Function proxy (key swappable) |
| Push | Web Push (VAPID) via Edge Function + pg_cron |
| Hosting | GitHub Pages (frontend) + GitHub Actions |
| Desktop (later) | Tauri companion for silent screenshots / OS activity |

The AI API key and the VAPID private key **never** reach the browser — all AI calls and push
sends go through Supabase Edge Functions that read secrets from Supabase's encrypted store.

## Local development

```bash
npm install
cp /dev/null .env.local   # then add the vars below
npm run dev               # http://localhost:5173/tandem/
```

### Environment variables

These are **public** client values (the anon key is gated by Row Level Security and signups
are disabled). They are NOT committed. Create `.env.local` with:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VAPID_PUBLIC_KEY=        # added in Phase 8
```

Server-side secrets (`GEMINI_API_KEY`, `VAPID_PRIVATE_KEY`) are set with
`supabase secrets set ...` and never live in the frontend.

## One-time setup

1. **Create a Supabase project** (free, no card) at supabase.com.
2. In the SQL editor, run `supabase/migrations/0001_init.sql`.
3. **Disable public signups:** Authentication → Providers → Email → turn *off* "Allow new users to sign up".
4. Create the two user accounts manually (Authentication → Users → Add user) for you and Max.
5. Copy the project URL + anon key into `.env.local` (dev) and into GitHub repo **Variables**
   (Settings → Secrets and variables → Actions → Variables): `VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`.
6. Enable GitHub Pages: Settings → Pages → Source = GitHub Actions.
7. Push to `main` → Actions builds and deploys to `https://almar-t.github.io/tandem/`.

## Roadmap

| Phase | Deliverable |
| --- | --- |
| 0 | Scaffold, auth, schema + RLS, deploy ← **you are here** |
| 1 | Shared tasks + realtime sync |
| 2 | Calendar dashboard + pinned goals |
| 3 | AI task creation (Edge Function + tool-calling) |
| 4 | Goals + AI goal breakdown |
| 5 | AI day planner |
| 6 | Timer + productivity states + estimate-learning loop |
| 7 | Analytics |
| 8 | Notifications, daily check-in, log off summary |
| 9 | (Optional) consent-based screen-share snapshots |
| 10 | (Optional) Tauri desktop companion |
