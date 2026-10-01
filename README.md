# Hot Streak Poker — Host Book

A phone-first web app two co-hosts use live during a home poker night: log buy-ins and
cash-outs (and whether the money has actually moved), log expenses, watch the book in real
time, and close the night with a P&L. Both hosts see and edit the same numbers at once.

- **Frontend:** Next.js (App Router, static export) + TypeScript + Tailwind
- **Backend:** Supabase — Postgres, magic-link auth, Realtime
- **Hosting:** any static host. This repo deploys to GitHub Pages from `.github/workflows/deploy.yml`

All money is integer cents. All maths lives in `lib/calc.ts` and is unit-tested; the UI never
calculates. Dates are Australia/Melbourne; a night keeps the date it started on.

## Two modes

| Mode | When | Data |
|---|---|---|
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set at build time | Shared Postgres, live sync between hosts |
| **Demo** | those variables are missing | Sample data in this browser's localStorage, syncs between tabs only. A gold banner says so. |

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Required | What |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | for real use | Project URL, e.g. `https://abcd1234.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | for real use | The project's anon / publishable key. Safe to ship to browsers: row-level security is what protects the data. **Never** put the `service_role` key anywhere in this repo. |
| `NEXT_PUBLIC_BASE_PATH` | only under a sub-path | e.g. `/hot-streak-poker` on GitHub Pages. Leave empty on Vercel or a custom domain. |
| `NEXT_PUBLIC_LARGE_AMOUNT_DOLLARS` | no | "Are you sure?" threshold for a single entry. Default `2000`. |

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000 (demo mode unless .env.local has the Supabase keys)
```

```bash
npm run verify     # typecheck + lint + tests + production build; must pass before deploying
```

`npm test` runs two suites:

- `lib/*.test.ts` — the maths, including Phase 1 acceptance tests 1–7.
- `tests/db.test.ts` — runs the real migration inside an in-process Postgres (PGlite) and proves
  the database itself enforces host-only access, the closed-night lock (acceptance 9), the
  cash-out book guard, soft-delete-only and the audit log.

## Set up Supabase (once)

1. Create a project at supabase.com (free tier is enough; pick the Sydney region).
2. **SQL Editor → New query**: paste the whole of
   `supabase/migrations/20261001000000_host_book.sql` and run it.
3. Add the hosts who may sign in (see below).
4. **Authentication → URL Configuration**: set **Site URL** to the deployed app URL (with the
   trailing slash) and add the same URL under **Redirect URLs**. Add `http://localhost:3000/`
   too if you develop locally. Without this the magic link sends people to the wrong place.
5. Recommended — **Authentication → Email Templates → Magic Link** (and **Confirm signup**): add
   `{{ .Token }}` to the body so the email also shows a 6-digit code. An app installed to the
   iPhone home screen has separate storage from Safari, so a link opened in Safari does not sign
   in the installed app; typing the code does.
6. **Project Settings → API**: copy the Project URL and the anon key into the environment
   variables above (for GitHub Pages: repo → Settings → Secrets and variables → Actions →
   **Variables**).

### Add or remove a host email

Only emails in `host_allowlist` can sign in; anyone else is refused at sign-up by a database
trigger. In the Supabase SQL Editor:

```sql
-- add (email must be lowercase)
insert into public.host_allowlist (email, display_name)
values ('new.host@example.com', 'Sam')
on conflict (email) do update set display_name = excluded.display_name;

-- remove: stops new sign-ins and revokes access immediately
delete from public.host_allowlist where email = 'old.host@example.com';
delete from public.hosts where email = 'old.host@example.com';
```

The display name is what shows on entries ("Added by Sam at 9:42pm").

## Deploy

### GitHub Pages (this repo)

Every push to `main` runs `npm run verify` and, only if it passes, publishes `out/` to Pages.
The Supabase URL and anon key come from the repository **Variables**
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; with neither set the site
builds in demo mode. After changing a variable, re-run the workflow (Actions → Deploy → Run
workflow).

### Vercel / Netlify

Import the repo, set the two Supabase variables, leave `NEXT_PUBLIC_BASE_PATH` empty. Build
command `npm run build`, output directory `out`.

### Rollback

Pages: Actions → pick the last good run → Re-run all jobs. Database: migrations are additive;
there is nothing to roll back in Phase 1 short of dropping the tables.

## Install on a phone

Open the URL → Share → **Add to Home Screen** (iOS Safari) or **Install app** (Android Chrome).

## How the rules are enforced

| Rule | Where |
|---|---|
| Only allow-listed hosts can read or write anything | RLS on every table + sign-up trigger |
| A closed night is read-only | RLS **and** a trigger that also stops the service role |
| A night closes only through `close_night()`, which refuses a negative book | trigger + function |
| Reopening needs a reason, which is logged | `reopen_night()` + audit trigger |
| A cash-out cannot take the book negative unless a host types a reason | trigger (and the same check in the UI) |
| Financial rows are never hard-deleted | `DELETE` revoked + trigger; the UI sets `deleted_at` |
| Every write is logged with who and when | `audit_log` trigger |

## Project layout

```
app/                 login, nights (list), night (live / closed night, ?id=…)
components/          ChipBadge, sheets, tabs, toasts
lib/calc.ts          all maths, pure functions      lib/calc.test.ts
lib/money.ts         cents <-> display              lib/dates.ts   Melbourne dates
lib/api/             one interface, two backends: supabase.ts and demo.ts
supabase/migrations  schema, RLS, triggers          supabase/seed.sql  sample night
tests/db.test.ts     database rules, run against the real migration
```

## Scope

Phase 1 (this build): everything above. Not built yet: the player roster with carry-over
balances and referral tracking (Phase 2), and reports / CSV export (Phase 3).

Known differences from the original spec, all deliberate:

- The night page is `/night?id=…` rather than `/nights/[id]`, so the app can be a static export
  and run on any host.
- One-tap buy-in records the buy-in as **unpaid**; mark it paid when the money lands. This way a
  buy-in is never silently assumed collected.
- Settling a player whose unpaid buy-in is netted against their payout marks the buy-in paid
  (method "Other") and the payout sent in one step.
