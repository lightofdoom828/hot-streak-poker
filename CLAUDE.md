@AGENTS.md

# CLAUDE.md — Hot Streak Poker Host Book

Read `HANDOFF.md` first (current state and next action), then `docs/milestones.md`.
Workflow: `CLAUDE_WORKFLOW.md`. Spec: `docs/project-spec.md` (**local only, gitignored** — the
repo is public; do not commit the spec, host emails, or anything from `private/`).

## Commands (run from the repo root)

| What | Command |
|---|---|
| Everything, terminates | `npm run verify` (typecheck → lint → tests → build) |
| Tests only | `npm test` |
| Dev server | `npm run dev` (demo mode unless `.env.local` has Supabase keys) |
| Regenerate PNG icons from `public/brand/icon.svg` | `npm run icons` |

## Architecture

- Static export (`output: "export"`). Everything is a client component talking to Supabase from
  the browser. No server code, no API routes. The night page is `/night?id=`, not a dynamic route.
- `lib/calc.ts` is the only place maths happens. Pure functions over `NightData`. Add a test in
  `lib/calc.test.ts` before changing a formula. Money is integer cents everywhere (`lib/money.ts`).
- `lib/api/types.ts` defines `Api`. Two implementations: `supabase.ts` (real) and `demo.ts`
  (localStorage + BroadcastChannel). **Any new backend call goes in the interface and in both.**
  The demo must enforce the same rules the database does.
- `components/night/context.tsx` owns optimistic writes and Undo. Screens call `addBuyIn`,
  `patchCashOut`, … and never call the API directly for entries.
- Database rules live in `supabase/migrations/`. Schema changes are new migration files, never
  dashboard edits. `tests/db.test.ts` runs the migrations in PGlite with a stubbed `auth` schema;
  a rule without a test there is not a rule.

## Conventions

- Brand tokens are CSS variables in `app/globals.css`; no hex in components. `--chip-red` is
  decoration only; anything meaning "wrong" uses `--error` plus an icon.
- Tap targets ≥ 44px (`min-h-11`). Money inputs use `MoneyInput` (`inputMode="decimal"`).
- Never hard-delete financial rows; set `deleted_at`.
- Next.js here is v16: read `node_modules/next/dist/docs/` before using an unfamiliar API.

## Not verified against a real Supabase project yet

Magic-link sign-in, Realtime between two devices (acceptance test 8), and the migration applied
through the SQL editor. The SQL rules are verified in PGlite only. See `HANDOFF.md`.
