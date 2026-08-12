<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

- **Use `proxy.ts` instead of `middleware.ts`**: Starting with Next.js 16, Middleware is renamed to Proxy. Always use `proxy.ts` in the root (or `src/`) and export a `proxy` function (either as a named export or default export). Do NOT create `middleware.ts`.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:design-rules -->
# Mobile-First Design

The main and first focus of the design should be mobile view. All components and layouts must be optimized for mobile devices before considering larger screens.
<!-- END:design-rules -->

<!-- BEGIN:check-rules -->
# Quality Check Rules

Before finishing any task, you must run linting and type checks. No TypeScript errors or linting violations (Airbnb style) are allowed.
Strictly avoid using the `any` type in the codebase.
If the task touched anything covered by the Testing Rules, the test suite must run and pass in the same check (`pnpm check`).
<!-- END:check-rules -->

<!-- BEGIN:comment-rules -->
# Comment Rules

Keep comments to a minimum. Code should be self-explanatory through clear naming and structure.

- Do NOT add comments that restate what the code already says.
- Do NOT add section banners, step-by-step narration, or "// eslint-disable" style explanations unless required.
- Only comment when it explains *why* something non-obvious is done (a workaround, a business rule, an external API quirk).
- Never leave commented-out code behind.
<!-- END:comment-rules -->

<!-- BEGIN:decision-rules -->
# Decision Making Rules

Always ask questions instead of running your assumptions to confirm key decisions.
<!-- END:decision-rules -->

<!-- BEGIN:plan-rules -->
# Plan Mode Rules

When working in plan mode, the plan must be detailed and written to a file — never delivered only as a chat message.

- **Location**: save every plan to `.junie/plans/<kebab-case-slug>.md`. The slug describes the task in a few words (e.g. `add-team-bank-section.md`, `speed-up-dashboard-filter.md`). Reuse the existing file when iterating on a plan that is already there.
- **Write the file before presenting the plan** for approval, so the approved plan and the file always match. If the plan changes during discussion, update the file.
- **Level of detail**: name concrete files, functions, columns, and components. Include code or SQL snippets for non-obvious changes. A step should be executable without re-deriving decisions.

### Required structure

```markdown
# Requirements

### Overview & Goals
### Scope            (explicit In Scope / Out of Scope lists)
### User Stories     (or Functional Requirements)

# Technical Design

### Current Implementation
### Proposed Changes  (split into numbered `#### N. <Area> (\`path/to/file.ts\`)` subsections)
### Architecture Diagram  (mermaid)
### Key Decisions     (options considered and why one was chosen)
### Edge Cases / Risks

# Delivery Steps

### Step 1: <imperative title>
### Step 2: ...

# Testing

### Validation Approach
```

- **Delivery Steps** must be ordered, independently verifiable, and each state which files it touches. Mark a step done by prefixing its title with `✓` while executing the plan.
- **Testing** must state how the change is validated (lint, type check, manual flows to click through, data to verify).
- Every plan ends with the mandatory lint, type check, and test run from the Quality Check Rules as the final step.
- If the plan touches money or any other calculation, the **Testing** section must list the concrete test files and the boundary cases they cover (see Testing Rules), and writing those tests must be its own numbered Delivery Step, placed before the final check step.
<!-- END:plan-rules -->

<!-- BEGIN:money-rules -->
# Money Calculation Rules

Rules for calculating gatherings (fines) and bonuses for each role. The fine thresholds are
strict — a player on exactly 600 or a team on exactly 3750 is not penalised — while the bonus
thresholds are inclusive: exactly 700 / 3800 / 3900 already earns the bonus.
`recalculateDerivedFinancials()` in `lib/sync.ts` is the only implementation; this section
describes it, so the two change together.

### Role: Player
**Gatherings (to be paid to the bank):**
- **Total < 600**: 1€ per game. Only for players who actually played (`total > 0`).
- **Worst in Team**: 1€ per game — the lowest total among players with `total > 0`. On a tie
  every player on that minimum pays; there is no tie-break.
- **Team under 3750**: 10€ per player who played (`total > 0`) when the team total is below
  `TEAM_SCORE_LIMIT`. Applies to **home Interliga matches** and to **tournaments home and
  away** (`TOURNAMENT_LEAGUE_IDS` — World Cup, Champions League). Away Interliga and the
  Slovak Cup are exempt.
- **Faults (Sequential Fine)**: Sum of numeric order of faults. Formula: `(n * (n + 1)) / 2`.
  - 1 fault = 1€
  - 2 faults = 1€ + 2€ = 3€
  - 3 faults = 1€ + 2€ + 3€ = 6€
  - ... and so on.
- **Special Faults**: 5€ per occurrence. `special_faults_count` is the sum of
  `full_faults_count` (fault into playing full) and `second_to_last_faults_count` (missing
  the 2nd to last throw); both are entered by hand through `lib/match-money.ts`.
- **Success Gathering**: 10€ for the 5th and every subsequent consecutive game without a
  fault. Computed automatically from the match history — never marked by hand — and stored
  in its own `streak_fine` column, never folded into `calculated_fine`.

The first five land in `calculated_fine`; the success gathering lands in `streak_fine`. A
player's debt for one match row is always `calculated_fine + streak_fine`.

**Bonuses (to be received):**
- **Total 700 or more**: 40€ total (30€ from team bank + 10€ from trainer), written to
  `bonus_received`.

### Role: Trainer
**Payments (to be paid by trainer)** — rows in `trainer_payments`, one per
`(match, trainer, condition_type)`. Every **approved** trainer gets the full set, so two
trainers each owe the full amount.
- **Team Performance** (`score_bonus`):
  - Team Total 3800 or more: 10€
  - Team Total 3900 or more: 15€ (replaces the 3800 bonus, not cumulative).
- **Zero Faults Bonus** (`zero_faults`): 10€ when the team's fault total is 0 and at least
  6 players actually played (`total > 0`). If no player row carries a fault count at all,
  the sum is NULL and no bonus is created.
- **Elite Player Bonus** (`elite_player`): 10€ for each player scoring 700 or more, stored as a
  single row per match with `amount = count * 10`.

### Role: Admin
**Responsibilities:**
- Approving new user registrations.
- Manually marking special misses (fault into playing full, 2nd to last throw miss) — the
  only money input that is not derived.
- Marking fines and bonuses as paid.
- General system maintenance and data synchronization.

The player-facing wording of all of the above lives in the `rules` namespace of
`locales/{sk,cs,hu,sr}.json` and is rendered by `app/[lang]/rules/page.tsx`. Any change to
the calculation must update those four files too.
<!-- END:money-rules -->

<!-- BEGIN:test-rules -->
# Testing Rules

These rules are binding, not aspirational.

### Tooling

- **Vitest** is the runner. `vitest.config.ts` declares two projects: `node` (environment
  `node`, for `lib/**`, `locales/**`, `proxy.ts`) and `dom` (jsdom + `@testing-library/react`,
  for `components/**`, `app/**`, `lib/hooks/**`, set up by `vitest.setup.dom.ts`).
- Run with `nvm use` — the project pins Node 24 (`.nvmrc`, `.npmrc`, `engines`); `jsdom` needs
  Node ≥ 24.15, whatever Next needs.
- `test.env` supplies a dummy `DATABASE_URL`, because `lib/db.ts` throws at import time
  without one; `neon()` opens no connection, so no test ever reaches a database.
- `server-only` is aliased to `test/mocks/server-only.ts`; the real package throws outside
  Next's react-server condition.
- Scripts: `pnpm test`, `pnpm test:run`, and `pnpm check` = lint + type check + tests.
- Test files sit next to the source: `lib/db-utils.test.ts`, `components/MatchFineTooltip.test.tsx`.
  No `__tests__` directory, no `.spec.` suffix.
- Tests obey the same lint and `any` rules as the rest of the codebase.
- base-ui popups (tooltip, select, dialog) portal outside the render container and carry no
  role, so they are read off `[data-base-ui-portal]`. Use `fireEvent`, not `user-event`, to
  open them: a full pointer sequence closes the tooltip again in jsdom.

### When tests are mandatory

Writing or updating unit tests is **not optional** for any change that touches:

- `lib/sync.ts` — `recalculateDerivedFinancials()` and anything it computes.
- `lib/match-money.ts`, `lib/special-misses.ts`, `lib/trainer-payments.ts`,
  `lib/admin-actions.ts`, `lib/manual-match-actions.ts`, `lib/bank-withdrawal-actions.ts`.
- `lib/db-utils.ts` money aggregation — `fineAmount()`, `withdrawalTotal()`,
  `getTeamBankBalance()`, `getPlayerBalances()`, `getUnpaidDebtors()`, `getUnpaidBonusReceivers()`.
- `lib/season-config.ts`, `lib/bank-withdrawals.ts`, `lib/home-helpers.ts` stat helpers.
- Any threshold, formula, or league-scope rule described in the Money Calculation Rules.

A change to any of these that ships without a test change is incomplete. If a bug is fixed,
the test that reproduces it comes first and must fail before the fix.

### Testing SQL-resident calculations

`recalculateDerivedFinancials()` is pure SQL and cannot be unit tested directly. Therefore:

- Every threshold and formula it applies must also exist as a **pure, db-free TypeScript
  function** in `lib/money-rules.ts` (no import path from there may reach `lib/db.ts` — see
  the Client/Server Boundary invariant). Constants such as `TEAM_SCORE_LIMIT` are imported
  by both sides, never retyped.
- `lib/money-rules.test.ts` tests those functions. The SQL and the pure mirror change in the
  **same commit**, and each mirror function carries a one-line comment naming the SQL block
  it mirrors — this is a `why` comment and is allowed under the Comment Rules.
- Mocking `db.execute` to assert on SQL strings is forbidden — it tests the string, not the
  money. The exception is `lib/db-utils.test.ts`, which reads the *fragments* built by
  `fineAmount()`, `withdrawalTotal()`, and `leagueCondition()`, because the rule those encode
  (the success gathering and withdrawals count only under the "all" filter) is a money rule.
- After changing the mirror or the SQL, verify them against real rows once: read a sample of
  matches out of the database and compare `derivePlayers()` / `deriveTrainerPayments()` /
  `faultlessStreaks()` with the stored `calculated_fine`, `streak_fine`, `bonus_received`,
  the `is_*` flags, and `trainer_payments`. Read-only, never committed to `scripts/`.

### Required cases for money tests

Every rule is a strict threshold, so tests are table-driven and always cover the value below,
at, and above the boundary:

- Player total `599 / 600 / 601` (under-600 fine, strict) and `699 / 700 / 701` (40€ bonus,
  inclusive from 700).
- Team total `3749 / 3750 / 3751` (10€ per player, strict), and `3799 / 3800` / `3899 / 3900`
  for the trainer `score_bonus`, which starts at each limit and where 15€ replaces 10€ rather
  than stacking.
- Faults `0, 1, 2, 3, n` against `(n * (n + 1)) / 2`.
- `special_faults_count` at 5€ each, summed from `full_faults_count` and
  `second_to_last_faults_count`.
- Faultless streak `4 / 5 / 6` — `streak_fine` is 10€ from the 5th consecutive game on, lands
  in `streak_fine` and never in `calculated_fine`.
- Worst-in-team **including a tie**: every player on the minimum pays, no tie-break.
- Players with `total = 0` are excluded from under-600, worst-in-team, and the under-3750 fine.
- League scope for the under-3750 fine: home Interliga (penalised), away Interliga (exempt),
  tournament home and away (both penalised), Slovak Cup (exempt).
- Trainer `zero_faults`: 10€ at 0 team faults with ≥ 6 players who played; no bonus at 5
  players; no bonus when the fault sum is NULL. Both approved trainers get the full set.
- Trainer `elite_player`: one row per match with `amount = count * 10`.
- League filtering: `streak_fine` and withdrawals count only under the "all" filter.
- Paid rows survive a recalculation untouched.

### Frontend tests

Scope is pure helpers and the components that display money. No page-level or end-to-end
tests — do not add Playwright without asking first.

- **Pure helpers** (`lib/i18n/plural.ts`, `lib/i18n/league-labels.ts`, `lib/dates.ts`,
  `lib/home-helpers.ts` stat helpers, `lib/sync-transform.ts`, `lib/validation/*`,
  `lib/withdrawal-categories.ts`): tested for all four locales where
  the output is localized. `pluralize` needs 1 / 2 / 5 / 0 for `sk`, `cs`, `sr` and the
  singular-after-numeral case for `hu`. `leagueLabelForId` and `leagueLabelForKey` must be
  shown never to leak the raw Slovak `league_name`.
- **Money-displaying components** (`components/MatchFineTooltip.tsx`, dashboard badges,
  balance and bank totals, `components/dashboard/SeasonLeagueFilter.tsx`): render with fixed
  props and assert the exact rendered amount, including that a per-match total reads
  `calculated_fine + streak_fine` and that the success gathering appears as its own named badge.
- Query by role and visible text (`getByRole`, `getByText`). No snapshot tests, no test ids
  unless there is no accessible alternative.
- Date-dependent code takes an injected `now` (as `validateWithdrawal()` and
  `getStartOfBratislavaToday()` do) or pins the clock with `vi.setSystemTime`. No test may
  depend on the day it runs, and the Bratislava helpers are covered on both DST switch days.
- Server actions return **error codes**, so their pure validation lives in `lib/validation/*`
  (a `'use server'` file may only export async functions) and is tested there code by code.
  The client side is tested for rendering the mapped `translations.errors[code]` string, and
  `locales/locales.test.ts` guards that all four locale files carry the same keys and
  placeholders.

### Keeping documents in sync

A calculation change is only complete when all four move together: the code, its tests, the
Money Calculation Rules section above, and the `rules` namespace of `locales/{sk,cs,hu,sr}.json`.
<!-- END:test-rules -->

# Codebase Invariants

Rules distilled from the code. Break one and the data or the money goes wrong.

### Player Photos
- Photos live in `public/players/`; the mapping lives in `lib/player-images.ts`. Adding a photo means adding the file **and** an entry there — nothing scans the directory.
- Keying is by stable identifier, never by name: scraper spelling changes and surnames collide. Players use their external (scraper) id (`IMAGES_BY_EXTERNAL_ID`); trainers and admins have no external id, so they use their `users.id` (`IMAGES_BY_USER_ID`).

### Seasons, Leagues, Ids
- `lib/season-config.ts` is the single source of truth for seasons, leagues, team ids, and id ranges. Never hardcode a league or team id elsewhere; derive it from the helpers (`getLeagueIdsForKey`, `getTeamIdsForSeason`, …).
- Tournaments (World Cup, Champions League) are absent from the results API, so their ids are ours: `9000 + seasonId` and `9100 + seasonId`. kolky.sk league ids are three digits, so the 9xxx block cannot collide.
- Manually entered matches get external ids `>= 900_000_000` (`MANUAL_MATCH_ID_BASE`), so the id range alone says "not scraped".
- `POHAR_LEAGUE_IDS` keeps the retired id `366` ("Finále") because rows in the database still carry it.
- Manual leagues are excluded from every scrape-side lookup, so a scrape can never stamp a tournament id onto a match.
- `TEAM_SCORE_LIMIT = 3750`. Interliga **home** matches and tournaments (home and away alike) are penalised under it; away Interliga and the Slovak Cup are not.

### Matching Our Team
- Match our team by **team id only**, never by club name. Name matching also catches B-team, youth, and women's fixtures — it once pulled ~1250 foreign fixtures into `matches` and mislabelled them as our Slovenský pohár season.

### Derived Money Fields
- `recalculateDerivedFinancials()` in `lib/sync.ts` is the single writer of every derived money field: `calculated_fine`, `streak_fine`, `bonus_received`, `is_worst_player`, `is_under_600`, `is_team_under_3750`, `faultless_streak`, and the `trainer_payments` rows. Sync upserts write raw scores only; admin actions and manual-match edits call the recalculation afterwards. Never compute these inline.
- Faultless streaks are counted across **all** seasons, so the streak query is never filtered by season or league.
- The success gathering lives in its own column, `streak_fine`, never inside `calculated_fine`. It is earned across competitions, so the league that hosted the fifth faultless game is arbitrary and moves whenever a date or a fault count changes. League-filtered sums therefore exclude it (`fineAmount()` in `lib/db-utils.ts` adds it only for the "all" filter), and the player detail page breaks it out of the "all" total as its own badge so the amount is named rather than silently folded in. A player's real debt for one match row is always `calculated_fine + streak_fine`, settled by the single `is_paid` flag.
- Rows already marked paid are never deleted or overwritten by a recalculation — money that changed hands must survive.
- The SQL is not unit testable, so its thresholds and formulas are mirrored by pure functions in `lib/money-rules.ts`, which is what the tests exercise. SQL and mirror change in the same commit — see the Testing Rules.
- Trainer payments are fanned out over `role = 'trainer' AND is_approved`, so approving a trainer must recalculate: their rows for matches already played do not exist until it runs. `approveUser()` does this; anything else that flips `is_approved` or a role must too.
- `applyMatchMoneyUpdates()` (`lib/match-money.ts`) recalculates but deliberately never invalidates — it runs from `scripts/match-money.ts`, outside Next, where `updateSyncedData()` throws. The caller owns invalidation: the CLI calls `requestSyncedDataRevalidation()`, an in-app caller must call `updateSyncedData()`.

### Bank Withdrawals
- `bank_withdrawals` is hand-entered money leaving the bank (food, gear, travel), never derived from match data, so `recalculateDerivedFinancials()` neither writes nor reads it.
- A withdrawal has a season (derived from its date by `getSeasonIdForDate()`) but no league, so it counts only under the "all" league filter — same rule as `streak_fine`. `withdrawalTotal()` in `lib/db-utils.ts` is the only place that decides this.
- It lowers `TeamBankBalance.total` and never touches `unpaid`: unpaid answers who still owes the bank, a withdrawal is money already spent.
- Writes go through `lib/bank-withdrawal-actions.ts` (admin only) and must call `updateSyncedData()`, because the bank total is served from the `home-data` cache.
- The category list lives in `lib/withdrawal-categories.ts`, apart from `lib/bank-withdrawals.ts`, because the form is a client component and the query module is not importable from one.

### Client/Server Boundary
- A `'use client'` file must never import a module whose import graph reaches `lib/db.ts` — not even for a constant or a type-only symbol, because the import still pulls the module into the browser bundle. `lib/db.ts` throws `DATABASE_URL is not defined in environment variables` at module scope, and in the browser that variable is always undefined: it has no `NEXT_PUBLIC_` prefix, so Next never inlines it. The page then fails to render with an error that reads like a missing environment variable even though the server has it.
- Keep shared constants, enums, and types that both the client and a query module need in their own db-free file (`lib/withdrawal-categories.ts` is the pattern), and let the server module re-import them.

### Caching
- Cached reads live for a week (`SYNCED_DATA_REVALIDATE_SECONDS`); freshness comes from explicit invalidation, not expiry. Any write that changes synced data must invalidate.
- `revalidateSyncedData()` (stale-while-revalidate, for the weekly cron) is **route-handler only**. `updateSyncedData()` (expires immediately, for the admin Sync button) is for server actions. Neither may be called from `scripts/run-sync.ts`, which runs outside Next and would throw. CLI scripts invalidate over HTTP instead, via `requestSyncedDataRevalidation()` (`lib/revalidate-client.ts`) hitting `POST /api/revalidate` with `CRON_SECRET`; without it, each `(playerId, seasonId, leagueKey)` cache entry ages independently and different filters show different eras of the same data.
- Cached player/home data is keyed by user id, so anything that moves result rows between users must invalidate too.

### i18n
- `matches.league_name` and `LeagueConfig.name` are Slovak by definition. Every competition name shown in the UI goes through `lib/i18n/league-labels.ts`, never straight from the database or config.
- Counted nouns go through `pluralize` (`lib/i18n/plural.ts`): Slavic locales need three forms (1 zápas / 3 zápasy / 5 zápasov); Hungarian keeps the noun singular after any numeral.
- Server actions return **error codes**, not messages (`AdminActionError`, and the equivalents in `manual-match-actions.ts`); the client maps them to localized strings. Raw error messages never reach the client.
- Redirects must preserve the locale slug and the query string. Cloning `nextUrl` keeps filters (`?season=`, `?league=`) alive across a proxy redirect; building a fresh URL drops them.

### Auth & Admin
- Password-reset and similar flows always report success, to prevent e-mail enumeration.
- Every admin action returns `{ success, error }` with a code the client maps to a localized string — none of them throws. A thrown error reaches the admin as an opaque Next digest, with no way to render the reason.
- Scraped placeholder users have no e-mail — they exist only so match results have something to hang off. Everything with an e-mail is a real, registered account.
- `match_player_results` and `trainer_payments` both FK to `users` without cascade, so children go first on delete, and a player with any results cannot simply be removed.

### UI
- Portalled popups (tooltip, popover, select) must carry a z-index on the **Positioner**, above the header (`z-50`); the blurred sticky filter bar makes its own stacking context and will otherwise paint over them.
- Tooltips toggle on click as well as hover — touch devices have no hover.
- Dialogs that can fail stay open on failure, so the reason is visible instead of silently swallowed.
