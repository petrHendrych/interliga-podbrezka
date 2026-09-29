# Context

`AGENTS.md` now carries binding Testing Rules (commit `4d4c9c4`): any change to money or
calculation logic must ship unit tests, and `pnpm check` must run them. No test tooling
exists yet, and the money logic itself is not reachable from a unit test — the whole of
`recalculateDerivedFinancials()` (`lib/sync.ts:105-220`) lives inside three raw `sql`
templates, so every threshold in the Money Calculation Rules is currently unverifiable
without a database.

This plan installs Vitest, extracts the calculation and validation logic that is trapped
inside SQL and `'use server'` modules into pure, db-free modules, and specifies the concrete
test files and cases for backend and frontend. Outcome: the rules in `AGENTS.md` become
enforceable, and a wrong threshold fails CI instead of a season's accounting.

# Requirements

### Overview & Goals

- Make every money rule in the Money Calculation Rules section of `AGENTS.md` provable by a
  test that runs in milliseconds, with no database.
- Cover the pure logic that surrounds the money: season/league resolution, date handling in
  `Europe/Bratislava`, input validation of admin forms, i18n pluralization and labels.
- Cover the frontend where money is rendered or where a user action changes state: the fine
  tooltip, the season/league filter, the admin/withdrawal forms and their error codes.
- Keep the suite fast and deterministic: no network, no database, no wall-clock dependence.

### Scope

**In scope**

- Vitest setup with two projects (`node`, `jsdom`) and the ESLint/tsconfig adjustments.
- A new pure module `lib/money-rules.ts` mirroring the SQL money logic, plus its tests.
- Extraction of the pure `validate()` helpers out of `'use server'` modules into
  `lib/validation/*.ts`, plus their tests.
- Extraction of the pure transform helpers out of `lib/sync.ts` into `lib/sync-transform.ts`.
- Unit tests for `season-config`, `home-helpers` date/aggregation helpers, `api.parseApiDate`,
  `auth` (JWT + bcrypt), `proxy.ts`, `lib/i18n/*`, and locale-file parity.
- Component tests for `MatchFineTooltip`, `SeasonLeagueFilter`, `WithdrawalForm`,
  `ManualMatchForm`, one delete-confirmation dialog, `SignInForm`, and `useSyncData`.

**Out of scope**

- Any change to the SQL in `recalculateDerivedFinancials()` or to the money rules themselves.
  The mirror is written to match today's SQL exactly, including its quirks.
- Integration tests against a real or emulated Postgres (PGlite / testcontainers). Decided
  against for now; see Key Decisions.
- End-to-end tests (Playwright), visual regression, and server-component page rendering.
- Fixing the two inconsistencies found while exploring (see Edge Cases / Risks) — they are
  documented and asserted as current behaviour, not changed.

### Functional Requirements

1. `pnpm test:run` runs the full suite; `pnpm check` runs lint, type check, and the suite.
2. Every threshold in the Money Calculation Rules has a test asserting the value below, at,
   and above the boundary.
3. No test depends on the current date, the machine timezone, or a network/database call.
4. Test files live next to their source (`lib/money-rules.test.ts`) and pass the same lint
   and `no-explicit-any` rules as production code.
5. A test asserting a rule names the rule in its `describe`/`it` text, so a failure reads as
   "team under 3750 does not fine away Interliga" rather than an assertion dump.

# Technical Design

### Current Implementation

| Area | Where | Testability today |
|---|---|---|
| Player fines, bonus, streak, `is_*` flags | `lib/sync.ts:105-166` (raw `sql`) | none — no JS equivalent exists |
| Trainer payments (create + delete-unless-paid) | `lib/sync.ts:168-220` (raw `sql`) | none |
| League scope of the under-3750 fine | duplicated: SQL `lib/sync.ts:117-131` and JS `isUnderLimitEligible` (`lib/home-helpers.ts:70-72`, private) | the JS copy is private and its module reaches `lib/db.ts` |
| Fine/withdrawal league filtering | `fineAmount`/`withdrawalTotal`/`leagueCondition`/`isAllLeagues` (`lib/db-utils.ts:148-184`) | branch is pure JS, payload is a `sql` fragment |
| Withdrawal validation | `validate()` (`lib/bank-withdrawal-actions.ts:53-80`) — pure, but the file is `'use server'` so it cannot be exported | none |
| Manual-match validation | `validate()` + `isCountable()` (`lib/manual-match-actions.ts:62-92`) — same problem | none |
| Season/league/id resolution | `lib/season-config.ts` — fully pure, zero imports | ready to test as-is |
| Bratislava date helpers | `lib/home-helpers.ts:118-183` — pure, but the module imports `lib/db-utils.ts` → `lib/db.ts`, which throws without `DATABASE_URL` | needs a dummy env var in setup |
| i18n | `lib/i18n/plural.ts`, `league-labels.ts`, `config.ts` — pure | ready to test as-is |
| Money in the UI | `MatchFineTooltip` sums `calculatedFine + streakFine` (`components/MatchFineTooltip.tsx:52`); every other surface receives a pre-summed number from SQL | ready once jsdom exists |
| Admin error codes | each `'use server'` action returns a string-union code; the client indexes `translations.errors[code]` (no mapping function) | ready once jsdom exists |

Two structural facts drive the design: **the money logic has no JS representation at all**,
and **the pure validators are locked inside `'use server'` files** (which may only export
async functions).

### Proposed Changes

#### 1. Test infrastructure (`vitest.config.ts`, `vitest.setup.node.ts`, `vitest.setup.dom.ts`, `package.json`, `eslint.config.mjs`)

- devDependencies, versions verified against the registry and against the local Node
  (`.nvmrc` → v22.12.0): `vitest@4.1.10`, `vite@8.2.1`, `@vitejs/plugin-react@6.0.5`,
  `vite-tsconfig-paths@6.1.1`, `jsdom@28.1.0`, `@testing-library/react@16.3.2` (the React 19
  line), `@testing-library/user-event@14.6.4`, `@testing-library/jest-dom@7.0.1`.
  **`jsdom@30` must not be used** — it requires Node `^22.22.2`, while this machine's Node 22
  is 22.12.0; `jsdom@28` requires `^22.12.0` and fits exactly. `vite@8` also requires
  `>=22.12.0`, which is the real reason `nvm use 22` is mandatory (Next itself needs only 20.9).
- `test/mocks/server-only.ts` (an empty `export {}`) plus a `resolve.alias` entry — the real
  `server-only` package throws unconditionally outside Next's `react-server` condition.
- `vitest.setup.dom.ts` also polyfills what jsdom lacks and base-ui needs: pointer capture
  (`hasPointerCapture`/`setPointerCapture`/`releasePointerCapture`), `scrollIntoView`,
  `ResizeObserver` (Floating UI positioner), and `window.matchMedia` (next-themes).
- Interactions in component tests go through `@testing-library/user-event`, never
  `fireEvent.click`: base-ui listens for the full native pointer sequence.
- `vitest.config.ts` defines two projects under `test.projects` (Vitest 4 dropped the separate
  workspace file):
  - `node` — `environment: 'node'`, includes `lib/**/*.test.ts`, `proxy.test.ts`,
    `locales/**/*.test.ts`; `setupFiles: ['./vitest.setup.node.ts']`.
  - `dom` — `environment: 'jsdom'`, includes `components/**/*.test.tsx`,
    `app/**/*.test.tsx`, `lib/hooks/**/*.test.ts`; `setupFiles: ['./vitest.setup.dom.ts']`;
    `plugins: [react()]`.
  - `vite-tsconfig-paths` resolves the `@/*` alias from `tsconfig.json`.
  - `resolve.alias` stubs `server-only` to an empty module so `lib/i18n/dictionaries.ts`
    is importable.
- `vitest.setup.node.ts`: `process.env.DATABASE_URL ??= 'postgres://test:test@localhost/test'`
  and `process.env.JWT_SECRET ??= 'test-secret'`. `neon()` does not connect at import time,
  so this makes db-importing modules loadable without any database — needed for
  `lib/home-helpers.ts` and `lib/db-utils.ts`.
- `vitest.setup.dom.ts`: `import '@testing-library/jest-dom/vitest'` plus a global
  `afterEach(cleanup)`.
- `package.json`: `"test": "vitest"`, `"test:run": "vitest run"`,
  `"check": "pnpm lint && pnpm type-check && pnpm test:run"`. Requires Node 22 (`nvm use 22`).
- `eslint.config.mjs`: append a block for `**/*.test.ts`, `**/*.test.tsx`,
  `vitest.setup.*.ts`, `vitest.config.ts` turning off `import/no-extraneous-dependencies`
  (devDependencies are legitimate there) and relaxing `react/jsx-props-no-spreading` if needed.
  Test files already match the tsconfig `include` globs, so no tsconfig change is required.

#### 2. Pure money mirror (`lib/money-rules.ts`, new)

A db-free module — its import graph must never reach `lib/db.ts` — holding one exported
function per rule, each carrying a one-line comment naming the SQL block it mirrors
(`lib/sync.ts:105-166` / `:168-190` / `:198-220`). `TEAM_SCORE_LIMIT` and the league id lists
are imported from `lib/season-config.ts`, never retyped.

```ts
export const UNDER_600_LIMIT = 600;
export const BONUS_TOTAL_LIMIT = 700;
export const PLAYER_BONUS = 40;
export const STREAK_LENGTH = 5;
export const STREAK_FINE = 10;

export interface PlayerRow {
  userId: string;
  total: number;
  faults: number | null;
  specialFaultsCount: number;
}
export interface MatchContext {
  teamTotalScore: number | null;
  isHome: boolean;
  leagueId?: number;
  leagueName?: string | null;
}
export interface PlayerDerived {
  isWorstPlayer: boolean;
  isUnder600: boolean;
  isTeamUnder3750: boolean;
  calculatedFine: number;
  streakFine: number;
  bonusReceived: number;
}

export function faultFine(faults: number | null): number;          // n*(n+1)/2
export function specialFaultFine(count: number): number;           // count * 5
export function isUnderLimitEligible(match: MatchContext): boolean; // home Interliga OR tournament
export function isTeamUnderLimit(match: MatchContext): boolean;     // eligible AND teamTotal < 3750
export function playerBonus(total: number): number;                 // total > 700 -> 40
export function streakFineFor(streak: number): number;              // streak >= 5 -> 10
export function worstTotal(rows: PlayerRow[]): number | null;        // min total among total > 0
export function derivePlayers(match: MatchContext, rows: PlayerRow[]): Map<string, PlayerDerived>;

// Streak grouping mirrors the window function; input is one player's rows, date-ordered
// across ALL seasons and leagues.
export function faultlessStreaks(rows: { faults: number | null }[]): number[];

export function trainerScoreBonus(teamTotalScore: number | null): number | null; // 3900>15, 3800>10
export function trainerZeroFaultsBonus(teamFaults: number | null, activePlayers: number): number | null;
export function trainerElitePlayerBonus(rows: PlayerRow[]): number | null;       // count * 10
export function deriveTrainerPayments(match: MatchContext, rows: PlayerRow[]):
  { conditionType: 'score_bonus' | 'zero_faults' | 'elite_player'; amount: number }[];
```

`lib/home-helpers.ts` deletes its private `isInterliga`/`isTournament`/`isUnderLimitEligible`
(lines 60-72) and imports `isUnderLimitEligible` from `lib/money-rules.ts`, so the duplicate
disappears and the JS rule has exactly one home.

#### 3. Pure validators (`lib/validation/withdrawal.ts`, `lib/validation/manual-match.ts`, new)

`'use server'` files may only export async functions, so the validators move out:

- `lib/validation/withdrawal.ts` — exports `WithdrawalError`, `WithdrawalInput`,
  `ValidWithdrawal`, the limits (`MAX_WITHDRAWAL`, `MIN_DESCRIPTION_LENGTH`,
  `MAX_DESCRIPTION_LENGTH`), and
  `validateWithdrawal(input: WithdrawalInput, now?: Date): WithdrawalError | ValidWithdrawal`.
  The `now` parameter is new and is what makes the "date is in the future" branch testable;
  it defaults to `new Date()` and is threaded into `getStartOfBratislavaToday(now)`.
  `lib/bank-withdrawal-actions.ts` re-exports the type and calls the new function.
  Note: this module must not import `lib/home-helpers.ts` (which reaches `lib/db.ts`) —
  move `getStartOfBratislavaToday` and its sibling date helpers into `lib/dates.ts` and let
  `home-helpers.ts` re-export them, keeping every current import path working.
- `lib/validation/manual-match.ts` — exports `ManualMatchError`, the input types, the limits
  (`MAX_PLAYERS`, `MAX_SCORE`, `MAX_FAULTS`), `isCountable`, and
  `validateManualMatch(input): ManualMatchError | null`. `lib/manual-match-actions.ts`
  imports both and keeps its `'use server'` exports untouched.
- Client components already import these error unions from the action modules; the re-export
  keeps those imports valid.

#### 4. Pure sync transforms (`lib/sync-transform.ts`, new)

Extract from `lib/sync.ts` and `lib/api.ts` the row-shaping logic that is currently inline:

- `computeAverage(total: number): number` — `Math.round((total / 4) * 10) / 10`, used in three
  places today (`sync.ts:336`, `sync.ts:632`, `manual-match-actions.ts:146`); all three import it.
- `isHomeMatch(homeTeamId: number | undefined, clubId: number): boolean` — the `649` check.
- `normalizeMatchList(data: unknown): unknown[]` — the `Array.isArray(data) ? data : data.list || []`
  branch from `lib/api.ts:152-155`.
- `toSnapshotRows` moves here from `lib/sync.ts:97` and is exported.

#### 5. Backend test files

| File | Covers | Priority |
|---|---|---|
| `lib/money-rules.test.ts` | every player and trainer money rule (case list below) | P0 |
| `lib/validation/withdrawal.test.ts` | all `WithdrawalError` branches | P1 |
| `lib/validation/manual-match.test.ts` | all `ManualMatchError` branches | P1 |
| `lib/season-config.test.ts` | season/league/team id resolution, date→season, id ranges | P1 |
| `lib/dates.test.ts` | Bratislava date helpers, DST, invalid input | P1 |
| `lib/home-helpers.test.ts` | `collectBelowLimit`, top-donator pick (both must be exported) | P2 |
| `lib/sync-transform.test.ts` | average, home detection, match-list normalization, snapshot rows | P2 |
| `lib/api.test.ts` | `parseApiDate` naive-string-as-UTC handling | P2 |
| `lib/i18n/plural.test.ts` | `pluralize` per locale | P1 |
| `lib/i18n/league-labels.test.ts` | label lookup incl. retired id 366 fallback | P1 |
| `locales/locales.test.ts` | key parity and placeholder parity across sk/cs/hu/sr | P1 |
| `lib/auth.test.ts` | bcrypt roundtrip, JWT sign/verify, tamper/expiry | P3 |
| `proxy.test.ts` | locale detection and the four redirect branches | P3 |
| `lib/db-utils.test.ts` | `isAllLeagues` + golden SQL of `fineAmount`/`withdrawalTotal`/`leagueCondition` via `new PgDialect().sqlToQuery(...)` | P3 |

**`lib/money-rules.test.ts` — required cases** (table-driven, boundary on both sides):

- `faultFine`: `0→0`, `1→1`, `2→3`, `3→6`, `10→55`, `null→0`.
- `specialFaultFine`: `0→0`, `1→5`, `3→15`.
- Under-600: totals `599 / 600 / 601` → fine `1 / 0 / 0`; `total = 0` → no fine and
  `isUnder600 === false` (a player who did not play is never fined).
- Player bonus: totals `699 / 700 / 701` → `0 / 0 / 40`.
- Worst in team: single minimum pays 1€; **tie** — two players on the same minimum both pay;
  players with `total = 0` are excluded from the minimum; a squad where everyone scored 0
  yields no worst player.
- Team under limit, `teamTotalScore` `3749 / 3750 / 3751` → `10 / 0 / 0` per player who played,
  and `0` for a player with `total = 0`.
- League scope of that fine: home Interliga by `leagueId` → fined; home match whose
  `leagueName` matches `%interliga%` but has no id → fined; away Interliga → exempt;
  tournament home → fined; tournament away → fined; Slovak Cup (`POHAR_LEAGUE_IDS`, incl.
  retired `366`) → exempt.
- `calculatedFine` composition: a row with 2 faults + worst + under-600 + 1 special fault +
  team under limit → `3 + 1 + 1 + 5 + 10 = 20`, and `streakFine` is **not** included in it.
- `faultlessStreaks`: `[fault, clean, clean, clean, clean]` → the 5th game is streak 4 → no
  fine; `[clean × 5]` → 5th game streak 5 → 10€; `[clean × 6]` → 6th also 10€; a fault resets
  the counter; streaks are computed over the given row order regardless of season/league
  (a test that mixes leagues asserts the count is unaffected).
- `trainerScoreBonus`: `3799 / 3800 / 3801` → `null / null / 10`;
  `3899 / 3900 / 3901` → `10 / 10 / 15` (15 replaces 10, never stacks); `null` team total → `null`.
- `trainerZeroFaultsBonus`: 0 faults with 6 players who played → 10; 0 faults with 5 players
  → `null`; 1 fault with 8 players → `null`; every row's `faults === null` (sum is NULL) → `null`.
- `trainerElitePlayerBonus`: 0 elite → `null`; 1 elite → 10; 3 elite → 30; a player on exactly
  700 is not elite.
- `deriveTrainerPayments`: returns at most one row per `condition_type` per match, and the
  amount is per-trainer (the fan-out to both approved trainers is the SQL's job, asserted only
  as a comment).

**`lib/season-config.test.ts` — required cases**: `getSeasonIdForDate` at `2025-07-31T23:59Z`
(season 12 not yet started → previous startYear) vs `2025-08-01T00:00Z` (season 12), and a
date outside every configured season → `null`; `isManualMatchId` at `899_999_999 / 900_000_000`;
tournament ids `9000 + seasonId` / `9100 + seasonId` present in `TOURNAMENT_LEAGUE_IDS`;
`POHAR_LEAGUE_IDS` contains retired `366` while `getLeagueByLeagueId(366)` is `undefined`
(the documented inconsistency, asserted so it cannot change silently);
`getAllTeamIds()`/`getTeamIdsForSeason()` exclude manual leagues; `getSeasonAndLeagueConfig`
resolution order (teamId, then leagueId, then case-insensitive `leagueName`, then `null`).

**`lib/validation/withdrawal.test.ts`**: `invalidAmount` for `''`, `'abc'`, `'0'`, `'-5'`,
`'10001'`, and valid at `'10000'`; rounding `'12.345'` → `12.35`(`Math.round(x*100)/100`);
`invalidDescription` at 2 and 301 characters, valid at 3 and 300, whitespace trimmed before
measuring; `invalidCategory` for an unknown string, valid for every entry of
`WITHDRAWAL_CATEGORIES`; `invalidDate` for `''`, `'not-a-date'`, for tomorrow (with `now`
injected), and for a date outside every configured season; valid for today in Bratislava time
across a DST boundary; `seasonId` derived correctly for a July vs August date.

**`lib/validation/manual-match.test.ts`**: `invalidLeague` when the league is not manual for
that season; `invalidDate` for an empty/garbage date; `noPlayers` for 0 players, for 13
players, and for a row with an empty `userId`; `duplicatePlayer` for a repeated `userId`;
`invalidScore` for a negative, fractional, or `> MAX_SCORE` score, for faults `> 200`, and for
`opponentTotalScore > 12000`; `null` (valid) for a well-formed input with `opponentTotalScore`
of both `null` and a legal number.

**`lib/i18n` and locale tests**: `pluralize` for counts `0 / 1 / 2 / 5 / 22` in `sk`, `cs`,
`sr` mapping to one/few/other correctly, and `hu` returning the same form for every count;
`{count}` interpolation; `interpolate` leaving an unknown placeholder untouched.
`leagueLabelForId` returns the localized label for a known id, and for retired `366` returns
the passed fallback, and `'-'` when the fallback is empty. `locales/locales.test.ts` asserts
`cs`/`hu`/`sr` have exactly the same flattened key set as `sk` (256 keys today) and that each
string contains the same `{placeholders}` as its Slovak counterpart.

**`proxy.test.ts`**: `/api/cron/*` bypasses everything; a path with no locale redirects to
`/sk/...` **preserving the query string** (`?season=12&league=interliga`); the `next-locale`
cookie wins over `Accept-Language`; a malformed `Accept-Language` falls back to `sk`;
an unauthenticated request to a protected path redirects to `/{locale}/sign-in`; a non-admin
session on `/{locale}/admin/...` redirects to `/{locale}` — the last two currently **drop** the
query string, which the test asserts as current behaviour with a comment.

#### 6. Frontend test files

| File | Covers | Priority |
|---|---|---|
| `components/MatchFineTooltip.test.tsx` | the one client-side money sum and every breakdown branch | P0 |
| `components/dashboard/SeasonLeagueFilter.test.tsx` | URL writing, filter preservation | P2 |
| `app/[lang]/withdrawals/WithdrawalForm.test.tsx` | submit payload, error-code rendering, reset on success | P2 |
| `app/[lang]/admin/matches/ManualMatchForm.test.tsx` | row/team total math, add/remove rows, error rendering | P2 |
| `app/[lang]/withdrawals/DeleteWithdrawalButton.test.tsx` | dialog stays open on failure (representative of all four confirm dialogs) | P2 |
| `components/auth/SignInForm.test.tsx` | `useActionState` error mapping incl. the raw-string fallback | P3 |
| `lib/hooks/useSyncData.test.ts` | the sync state machine | P3 |

**`MatchFineTooltip`**: renders `calculatedFine + streakFine` as the visible amount
(`12 + 10` → `22 €`); `totalFine <= 0` renders a plain `0 €` and **no** tooltip trigger;
paid vs unpaid switches the label and the colour class; each reason appears only when its flag
is set (`faults`, `fullFaultsCount`, `secondToLastFaultsCount`, `isWorstPlayer`, `isUnder600`,
`isTeamUnder3750`); the mutually exclusive branch at lines 68-80 — when
`secondToLastFaultsCount > 0` the generic `specialFaults` line is **not** rendered, and when
`fullFaultsCount > 0` it is not rendered either; the streak line appears at
`faultlessStreak = 5` but not at `4` and not when the prop is `undefined`; clicking the
trigger opens the tooltip (touch devices have no hover) and the popup content is found via
`findByRole('tooltip')` because base-ui renders through a portal; `noFine` shows when the total
is positive but no flag explains it. Labels come from `locales/sk.json` so the interpolation of
`{count}` is exercised against real strings.

**`SeasonLeagueFilter`**: mock `next/navigation`; changing the league pushes
`${pathname}?season=…&league=…`; an existing unrelated query param survives; when `season` is
absent from the URL it is added from `selectedSeasonId`; the active tab is the one matching
`selectedLeagueKey`; all controls are disabled during the transition.

**`WithdrawalForm`**: mock `@/lib/bank-withdrawal-actions`; submitting passes the **raw**
strings (`amount`, `description`, `category`, `date`) straight to `createWithdrawal`;
a returned `{ success: false, error: 'invalidAmount' }` renders `translations.errors.invalidAmount`;
success clears amount/description and resets date and category to their defaults and calls
`router.refresh()`; the button is disabled and shows the saving label while pending.

**`ManualMatchForm`**: a row's displayed total is `full + clean`; the team total is the sum of
the rows; adding a row up to the 12-player cap and removing one; a returned error code renders
the mapped translation and the form stays filled.

**`DeleteWithdrawalButton`**: on `{ success: false, error: 'notFound' }` the dialog stays open
and shows the message (the "dialogs that can fail stay open" invariant); on success it closes.

**`useSyncData`** (via `renderHook`): `requestSync` opens the confirm dialog; `setConfirmOpen(false)`
is ignored while `isSyncing`; `confirmSync` sets `isSyncing`, awaits the mocked `triggerSync`,
and resets both flags in `finally` even when the action rejects.

### Architecture Diagram

```mermaid
flowchart TD
  subgraph src["Production code"]
    SQL["recalculateDerivedFinancials()<br/>lib/sync.ts (raw SQL)"]
    MR["lib/money-rules.ts<br/>pure mirror + constants"]
    SC["lib/season-config.ts<br/>TEAM_SCORE_LIMIT, league ids"]
    VAL["lib/validation/*.ts<br/>pure validators"]
    ACT["'use server' actions<br/>admin / manual-match / withdrawal"]
    HH["lib/home-helpers.ts"]
    DATES["lib/dates.ts"]
    UI["MatchFineTooltip, forms, filter"]
  end

  subgraph tests["Vitest"]
    NODE["node project<br/>lib/**/*.test.ts, proxy.test.ts"]
    DOM["jsdom project<br/>components/**, app/**"]
  end

  SC --> MR
  SC --> SQL
  MR -. "same thresholds,<br/>changed in the same commit" .-> SQL
  MR --> HH
  DATES --> HH
  DATES --> VAL
  VAL --> ACT
  NODE --> MR
  NODE --> VAL
  NODE --> SC
  NODE --> DATES
  DOM --> UI
  UI -. "mocked" .-> ACT
```

### Key Decisions

1. **Vitest over Jest / node:test.** Native TS + ESM, one config for both the node and the
   jsdom project, and the only runner with first-class React 19 support through
   `@testing-library/react` v16. Already fixed in the Testing Rules.
2. **Pure mirror, no database in CI.** A PGlite or Docker Postgres integration test would
   verify the actual SQL, but it doubles the setup, slows every run, and PGlite's window
   function behaviour is not guaranteed identical to Neon. The mirror plus the same-commit
   rule already in `AGENTS.md` catches the realistic failure — a threshold changed in one
   place. Revisit if a bug ever slips through that the mirror could not have caught.
3. **Mirror lives in production code, not in the test file.** Putting the thresholds in
   `lib/money-rules.ts` lets `home-helpers.ts` consume the same rule that the test asserts,
   which removes today's duplicated `isUnderLimitEligible`. A copy inside a test file would
   drift silently.
4. **Extract validators rather than test through the action.** `'use server'` modules can only
   export async functions, and calling the action would need a session, a database, and
   `next/cache` mocks to reach a pure branch. Extraction is a few lines and makes the error
   codes directly assertable.
5. **Dummy `DATABASE_URL` in the node setup file** instead of refactoring every db-importing
   module. `neon()` does not open a connection at import time, so the variable only satisfies
   the module-scope guard in `lib/db.ts`. The one exception is `lib/validation/withdrawal.ts`,
   which must stay genuinely db-free because a client component's import graph can reach it —
   hence `lib/dates.ts`.
6. **Locale parity as a test, not a lint rule.** The four files agree today (256 keys each);
   a test is the cheapest way to keep the Money Calculation Rules' "update all four locales"
   requirement honest.

### Edge Cases / Risks

- **The mirror can drift from the SQL.** Mitigated by the `AGENTS.md` same-commit rule and by
  each mirror function naming its SQL block in a comment. It is a discipline, not a guarantee.
- **`faultlessStreaks` is the hardest mirror.** The SQL uses a running fault count as a group
  key with an offset for the first group (`grp = 0`). The JS version must reproduce the
  off-by-one at `grp = 0` exactly; the test therefore includes a player whose very first
  recorded game is faultless.
- **Timezone.** Tests must never depend on the machine's zone. Date tests pass explicit UTC
  instants and, where "today" matters, inject `now`. DST cases: `2026-03-29` and `2026-10-25`
  (Bratislava switches) are included in `lib/dates.test.ts`.
- **`Intl.PluralRules` data** varies by Node ICU build; assert category behaviour through
  `pluralize`'s output for known counts rather than asserting the raw category name.
- **base-ui portals in jsdom.** Tooltip/Select content renders outside the container; queries
  must go through `screen` and `findBy*`, and `user-event` must be set up with
  `pointerEventsCheck: 0` if base-ui guards on pointer events.
- **Two pre-existing inconsistencies found while exploring, deliberately not fixed here:**
  `applyMatchMoneyUpdates()` (`lib/match-money.ts:257`) calls `recalculateDerivedFinancials()`
  but never `updateSyncedData()`, unlike every other money-mutating action — the bank total is
  served from the cache, so a mark-paid can show stale numbers. And `approveUser()`
  (`lib/admin-actions.ts:27`) throws a raw `Error` instead of returning an `AdminActionError`
  code, so its failure reaches the client as an unhandled error. Both are worth a follow-up;
  raise before changing.
- **Node 18 is the shell default** on this machine; every command below needs `nvm use 22`.

# Delivery Steps

### ✓ Step 1: Install and configure Vitest

Add the devDependencies, write `vitest.config.ts`, `vitest.setup.node.ts`,
`vitest.setup.dom.ts`, the `test`/`test:run` scripts and the updated `check` script, and the
ESLint override block. Verify with one throwaway smoke test that both projects run
(`pnpm test:run`), then delete it.
Files: `package.json`, `vitest.config.ts`, `vitest.setup.node.ts`, `vitest.setup.dom.ts`,
`eslint.config.mjs`.

### ✓ Step 2: Extract the pure date helpers

Create `lib/dates.ts` with `parseUtcDate`, `getStartOfBratislavaToday`, `isNextDay`,
`formatMatchDate`, `formatDateOnly` moved out of `lib/home-helpers.ts`; re-export them from
`home-helpers.ts` so no call site changes. Add `lib/dates.test.ts`.
Files: `lib/dates.ts`, `lib/home-helpers.ts`, `lib/dates.test.ts`.

### ✓ Step 3: Create the pure money mirror

Write `lib/money-rules.ts` exactly mirroring `lib/sync.ts:105-220`, point
`lib/home-helpers.ts` at its `isUnderLimitEligible`, and delete the private duplicate.
Files: `lib/money-rules.ts`, `lib/home-helpers.ts`.

### ✓ Step 4: Test the money mirror

Write `lib/money-rules.test.ts` covering every case listed in Proposed Changes §5. This is the
step that makes the Money Calculation Rules enforceable.
Files: `lib/money-rules.test.ts`.

### ✓ Step 5: Extract and test the validators

Create `lib/validation/withdrawal.ts` (with the injectable `now`) and
`lib/validation/manual-match.ts`; rewire `lib/bank-withdrawal-actions.ts` and
`lib/manual-match-actions.ts` to import from them and re-export the error unions. Add both
test files.
Files: `lib/validation/withdrawal.ts`, `lib/validation/manual-match.ts`,
`lib/bank-withdrawal-actions.ts`, `lib/manual-match-actions.ts`,
`lib/validation/withdrawal.test.ts`, `lib/validation/manual-match.test.ts`.

### ✓ Step 6: Test season config, i18n, and locale parity

Add `lib/season-config.test.ts`, `lib/i18n/plural.test.ts`, `lib/i18n/league-labels.test.ts`,
`locales/locales.test.ts`.
Files: the four new test files.

### ✓ Step 7: Extract and test the sync transforms

Create `lib/sync-transform.ts` (`computeAverage`, `isHomeMatch`, `normalizeMatchList`,
`toSnapshotRows`), rewire `lib/sync.ts`, `lib/api.ts`, and `lib/manual-match-actions.ts` to use
it, and add `lib/sync-transform.test.ts` plus `lib/api.test.ts`.
Files: `lib/sync-transform.ts`, `lib/sync.ts`, `lib/api.ts`, `lib/manual-match-actions.ts`,
`lib/sync-transform.test.ts`, `lib/api.test.ts`.

### ✓ Step 8: Test the money UI

Export `collectBelowLimit` (`lib/home-helpers.ts:84`) and extract the inline top-donator pick
(`lib/home-helpers.ts:299-311`) plus the player-stats reshape and AVG sort
(`lib/home-helpers.ts:273-297`) into exported pure functions `pickTopDonator(balances)` and
`toPlayersWithStats(balances)`; add `lib/home-helpers.test.ts` covering: `collectBelowLimit`
returns `null` for `pohar`, `[]` (not `null`) for `interliga`/`turnaje` with no played match,
`null` for another filter with no played match, excludes `teamTotalScore === 0`, and names the
opponent by `isHome`; `pickTopDonator` returns `null` when nobody owes, picks the highest
`totalDue`, and falls back to `name` when `firstName` is empty; `toPlayersWithStats` drops
balances with `matchesCount === 0` or a null `externalPlayerId` and sorts by AVG descending.
Add `components/MatchFineTooltip.test.tsx`.
Files: `lib/home-helpers.ts`, `lib/home-helpers.test.ts`, `components/MatchFineTooltip.test.tsx`.

### ✓ Step 9: Test the interactive frontend

Add `components/dashboard/SeasonLeagueFilter.test.tsx`,
`app/[lang]/withdrawals/WithdrawalForm.test.tsx`,
`app/[lang]/admin/matches/ManualMatchForm.test.tsx`,
`app/[lang]/withdrawals/DeleteWithdrawalButton.test.tsx`.
Files: the four new test files.

### ✓ Step 10: Test auth and proxy

Add `lib/auth.test.ts`, `proxy.test.ts`, `lib/hooks/useSyncData.test.ts`,
`components/auth/SignInForm.test.tsx`, and the optional `lib/db-utils.test.ts` golden-SQL test.
Files: the five new test files.

### ✓ Step 11: Quality check

`nvm use 22 && pnpm check` — lint, type check, and the full suite must pass with no
TypeScript errors, no Airbnb violations, and no `any`.

# Testing

### Validation Approach

- **Automated**: `nvm use 22 && pnpm test:run` after every step; the suite must stay green as
  each step lands. Target for the finished suite: no test slower than ~50 ms except the bcrypt
  ones, and a total runtime under ~15 s.
- **Mirror fidelity check** (manual, once, after Step 4): pick three real matches from the
  database, feed their `match_player_results` rows into `derivePlayers()`/`deriveTrainerPayments()`,
  and compare the output against the stored `calculated_fine`, `streak_fine`, `bonus_received`,
  and `trainer_payments` rows. Any mismatch means the mirror is wrong (or the SQL is), and it
  must be resolved before Step 4 is considered done. Use a read-only script under
  `scripts/` — do not write to the database.
- **Regression check on the refactors** (Steps 2, 3, 5, 7 move code): `pnpm build` must succeed
  and the app must render the home page, a player detail page with a fine tooltip, the
  withdrawals page, and the admin matches page without a client/server boundary error — the
  failure mode for these extractions is `DATABASE_URL is not defined in environment variables`
  in the browser.
- **Manual click-through** after Step 9: create and delete a withdrawal, save a manual match,
  switch season and league on the player detail page, and open a fine tooltip on a phone-width
  viewport — the same flows the new component tests cover, confirming the mocks match reality.
- **Final gate**: `pnpm check` (lint + type check + tests), per the Quality Check Rules.

### Outcome

Executed in full on 12 August 2026. 21 test files, 254 tests, ~2.8 s; `pnpm check` and
`pnpm build` both pass. The mirror was additionally verified against production rows: 31
random matches and 31 streak rows matched `calculated_fine`, `streak_fine`, `bonus_received`,
the `is_*` flags, and `trainer_payments` exactly.

Two deviations from the plan, both forced by what the libraries actually do:

- No `vitest.setup.node.ts`; the node project gets its dummy `DATABASE_URL` from `test.env`
  in `vitest.config.ts` instead, and `server-only` is aliased to `test/mocks/server-only.ts`.
- base-ui popups are opened with `fireEvent`, not `user-event`, and read off
  `[data-base-ui-portal]` — a full pointer sequence closes the tooltip again in jsdom, and
  the popup carries no ARIA role to query.
