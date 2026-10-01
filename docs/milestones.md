# Milestones

Directory: `Syndicate Files/hot-streak-poker` · branch `main` · remote `lightofdoom828/hot-streak-poker` (public)

| # | Milestone | Status | Evidence |
|---|---|---|---|
| M1 | Phase 1 MVP: maths, schema + RLS, all screens, demo backend, PWA, deploy | **Built and deployed in demo mode. Not yet connected to a real database.** | `docs/work/m1-result.md` |
| M1b | Connect Supabase: run setup SQL, set repo variables, redeploy, two-phone test | **Open — waiting on the owner** to create the Supabase project | steps in `private/GO-LIVE-STEPS.md` (local only) |
| M2 | Phase 2: player roster, carry-over balances, settle old balance, referral tracking | Not started. Ask before starting. | — |
| M3 | Phase 3: reports, CSV export, read-only share link | Not started | — |

## Phase 1 acceptance tests

| # | Test | State | Where it is proven |
|---|---|---|---|
| 1 | $200 paid in, $350 out → +$150, send $350 | pass | `lib/calc.test.ts` |
| 2 | $200 paid + $100 unpaid, $450 out → send $350 | pass | `lib/calc.test.ts`; seen in the UI (Sam) |
| 3 | $300 unpaid, $0 out → owes $300 | pass | `lib/calc.test.ts` |
| 4 | Comp $50 → chips +$50, comps expense $50, cash received unchanged | pass | `lib/calc.test.ts` |
| 5 | $2,000 in, $1,900 out, $60 food → revenue $100, net $40 | pass | `lib/calc.test.ts` |
| 6 | Negative book → close disabled, red banner | pass | `lib/calc.test.ts`; `tests/db.test.ts` (close_night refuses); seen in the UI |
| 7 | Closed night: projected_final === NET_PNL | pass | `lib/calc.test.ts` (fixture + 300 random nights) |
| 8 | Host A's buy-in appears on Host B's screen within ~2s | **not verified on Supabase.** Demo backend only: second tab updated 61 ms after the click | needs M1b |
| 9 | Editing a closed night is blocked at the database level | pass in PGlite against the real migration, including for the table owner. **Not yet run on the hosted project.** | `tests/db.test.ts` |
