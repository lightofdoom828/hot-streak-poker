# HANDOFF — Hot Streak Poker Host Book

_Updated 2026-10-01._

## State

- **Live (demo mode):** https://lightofdoom828.github.io/hot-streak-poker/
- Repo: https://github.com/lightofdoom828/hot-streak-poker (public), branch `main`.
- Local: `Syndicate Files/hot-streak-poker`. Local-only, gitignored: `SPEC.md`,
  `docs/project-spec.md`, `private/` (go-live steps, setup SQL with the host emails).
- Phase 1 is built. `npm run verify`: 48 tests pass, build succeeds, CI green.
- **No database is connected.** The owner's Supabase account was at the free-project limit, so
  the project has to be created under a new account by the owner.

## Next action (owner, then Claude)

1. Owner follows `private/GO-LIVE-STEPS.md`: create the Supabase project, run
   `private/supabase-setup.sql`, set the auth URLs, send the project URL + anon key.
2. Claude: `gh variable set NEXT_PUBLIC_SUPABASE_URL …`, `gh variable set
   NEXT_PUBLIC_SUPABASE_ANON_KEY …`, `gh workflow run Deploy`, then confirm the demo banner is
   gone and the login page offers "Email me a sign-in link".
3. Both hosts run the two-phone test (acceptance 8) and the closed-night test on the hosted DB.
   Record the result in `docs/milestones.md`. Until then M1b stays open.

## Known issues / open questions

- See "Not verified" and "Unresolved" in `docs/work/m1-result.md`.
- Free Supabase projects pause after about a week idle; restore from the dashboard.
- Supabase's default email sender is rate-limited to a few emails per hour.

## Do not

- Commit anything from `private/`, the spec, or host emails: the repo is public.
- Start Phase 2 without asking.
