# M1 result — Phase 1 MVP

Date: 2026-10-01 · commit on `main` at time of writing: see `git log -1`.

## What was built

- `lib/calc.ts`, `lib/money.ts`, `lib/dates.ts` with tests, written before any UI.
- `supabase/migrations/20261001000000_host_book.sql`: tables, host allowlist + sign-up trigger,
  RLS, closed-night lock (RLS + trigger), `close_night()` / `reopen_night()`, cash-out book
  guard, hard-delete ban, audit trigger, Realtime publication.
- Screens: login (magic link + code), nights list with month total, live night (sticky summary
  header; Players / Expenses / Summary / Audit tabs), closed-night read-only view with reopen.
- Buy-in (one-tap default, hold or Custom for the sheet, paid/unpaid, method, comp), cash-out
  with live settlement preview and override-with-reason, settle / mark paid / mark sent, player
  detail with edit and soft delete, add player with "referred by", expenses with quick-add,
  derived comps line, copy-settlement text, close validation with warnings.
- Optimistic writes with a 5-second Undo toast, sync indicator, "Added by X at 9:42pm".
- Demo backend (localStorage + BroadcastChannel) behind the same `Api` interface.
- Brand tokens, `ChipBadge`, felt panels, PWA manifest and icons.
- GitHub Actions: verify, then deploy to GitHub Pages.

## Verification run (local, Windows, Node 26)

```
$ npm run verify
 Test Files  3 passed (3)
      Tests  48 passed (48)
✓ Generating static pages using 7 workers (6/6)
Route (app): /  /_not-found  /login  /night  /nights   (all static)
```

`tsc --noEmit` exit 0, `eslint` exit 0.

Mutation check on the database tests: deleting the `buyins_night_open` / `cashouts_night_open`
triggers and the `night_is_open` RLS check from the migration made 2 of 20 tests fail
(`a host cannot add, edit or soft-delete entries on a closed night`, `even the database owner
(service role) cannot write to a closed night`). Restored; 20 of 20 pass.

CI: run 36872503907 on GitHub (ubuntu, Node 24) — `npm run verify` passed, deploy succeeded.

## Exercised by hand in a browser (375×812, demo backend)

Local dev server and the deployed site `https://lightofdoom828.github.io/hot-streak-poker/`.

| Action | Observed |
|---|---|
| Seed night | Book $380.00, net $120.00 (950 in − 570 out − 260 expenses, checked by hand) |
| One-tap buy-in for Dan | Book $380 → $580, chip 1× → 2×, "$400 unpaid" badge, toast with Undo |
| Undo | Book $680 → $480 |
| Cash-out $5,000 | Blocked: "exceeds chips on the books by $4,420.00", save disabled until a reason is typed |
| Cash-out $300 for Dan (owes $400 unpaid) | Preview "Dan owes $100 — $400 unpaid netted off"; book $580 → $280 |
| Summary | Projected final $220.00 = Net P&L $220.00; settlement text matches the spec format |
| Close | Sheet lists seated / unpaid / pending; after close, no action buttons render |
| Reopen | Disabled without a reason; audit shows `Night reopened by Jack / "Dan paid late"` |
| Override cash-out | Book −$220, red banner + checklist, Close night disabled |
| Second tab | Updated 61 ms after a buy-in in the first tab (BroadcastChannel) |
| Deployed site | Loads under `/hot-streak-poker/`, assets 200, manifest and icon 200, no console errors |

## Bugs found and fixed during verification

- `reopen_night` checked `FOUND` after a `PERFORM`, which resets it. Now checks the returned row.
- The host row was inserted from a BEFORE trigger on `auth.users`, before the row it references
  existed. Split into a BEFORE check and an AFTER insert.
- Swapping one sheet for another fired the first dialog's close event and cleared the new sheet.
- Net P&L in the header could stay stale: the count-up used `requestAnimationFrame`, which
  pauses when the tab is not painted. A timer now forces the final value.

## Not verified

- Anything against a hosted Supabase project: magic-link email, the `auth.users` trigger under
  Supabase's own roles, Realtime between two devices (acceptance 8), RLS as served by PostgREST.
- iOS Safari and "Add to Home Screen" on a real phone. Only Chromium at phone size was used.
- WCAG contrast was computed from the token hex values, not measured on rendered pixels:
  cream on felt 4.74 (felt-dark 7.29), black on gold 11.55, muted on rail 7.48 / raised 6.78,
  ok 9.04, pending 10.41, error on raised 4.73 / on rail 5.22 / on the banner 4.78. Three
  failures were found and fixed (85–90% cream labels on felt 3.86–4.14, gold "HOT" on felt
  2.99, dimmed placeholders 4.19). Gold on felt is now used only for the divider line.
- Long-press on a touch screen (tested: click and the Custom button).

## Unresolved

- One-tap buy-in defaults to **unpaid**. The spec does not say; confirm this is what the hosts want.
- Display names are "Jack" and "Partner" in the private setup SQL; change before running.
