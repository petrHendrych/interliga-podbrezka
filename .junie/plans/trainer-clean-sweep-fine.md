# Requirements

### Context / Overview & Goals

New trainer rule: when a match ends **8:0 in match points for Podbrezová**, every approved trainer pays **10 €** into the team bank. Home or away makes no difference. The home-page trainer card gets a sixth tile counting how many such matches the trainer paid for.

Today nothing in the codebase knows about match points at all — `matches` stores only pin totals (`team_total_score` / `opponent_total_score`). The data does exist in the scrape: `scraped_data.data` carries `teamResult.{home,away}.teamPoints` on `match_detail` and `homeTeamPoints` / `awayTeamPoints` on `match_list` (verified against the live DB). It is simply never read. So the work is: persist match points, add a fourth trainer condition, surface it.

### Scope

**In scope**
- Two new columns on `matches`: `team_match_points`, `opponent_match_points` (numeric, nullable).
- Sync writes them from both scrape paths (`match_list` and `match_detail`).
- New trainer `condition_type` `clean_sweep`, 10 € per approved trainer, in `recalculateDerivedFinancials()` and its pure mirror.
- Season cutoff: the rule applies **from season 13 (2026/2027) onward** — the four 8:0 matches of 2025/2026 must not be charged.
- 6th tile on the trainer card (`8:0`, count), placed before `Pokuty`.
- Tests, `rules` page copy in all four locales, AGENTS.md, skill doc.

**Out of scope**
- Manually entered matches (World Cup / Champions League): they have no match points, so the columns stay NULL and the rule can never fire. No change to `ManualMatchForm` or `lib/validation/manual-match.ts`.
- Slovak Cup: played to 6 points, so 6:0 is **not** a clean sweep. The rule is literally 8 and 0.
- Showing the match-point result (`8:0`) anywhere else in the UI.
- Backfilling season 12.

### User Stories

- As an admin, after a sync the trainers automatically owe 10 € each for a match won 8:0, the same way they owe for a 3800+ team total.
- As a trainer, my card on the home page shows how many 8:0 matches I have paid for in the selected season/league, and the amount is already inside `Pokuty`.
- As any user, the rules page lists the new payment in my language.

# Technical Design

### Current Implementation

- `matches` (`lib/db/schema.ts:30-42`) has no match-point column; nothing in `lib/`, `app/`, `components/`, `scripts/` mentions points.
- `recalculateDerivedFinancials()` (`lib/sync.ts:111-227`) is the single writer of trainer payments. Second statement: `agg` CTE → `spec` CTE emitting `score_bonus` / `zero_faults` / `elite_player` → `INSERT … CROSS JOIN (trainers) … ON CONFLICT`. Third statement deletes unpaid rows whose condition no longer holds, via `CASE tp.condition_type` (`lib/sync.ts:219-223`).
- Pure mirror: `lib/money-rules.ts` (`TrainerConditionType` at `:56`, `deriveTrainerPayments()` at `:250`), tested in `lib/money-rules.test.ts:232-331`.
- Display: `getTrainersWithStats()` (`lib/db-utils.ts:214-238`) counts by `condition_type` + `amount`; `DBTrainerStats` (`:204-212`) → `TrainerStats` (`lib/home-helpers.ts:41-47`) → 5 tiles in the trainer card (`app/[lang]/page.tsx:370-406`), grid `TRAINER_STAT_GRID` at `app/[lang]/page.tsx:29` (`sm:grid-cols-5`).
- Rules page renders `rules.trainer.fines` as a positional array (`app/[lang]/rules/page.tsx:75`, `components/rules/RuleList.tsx`); `locales/locales.test.ts` enforces identical key sets across sk/cs/hu/sr, arrays included.
- Schema is `db:push`-driven — no migrations folder has ever been committed.

### Verified data facts (live DB, read-only)

- `match_detail.teamResult.{home,away}` = `{ id, full, clean, total, faults, teamId, matchId, setPoints, teamPoints, tablePoints }`.
- `match_list` items carry `homeTeamPoints`, `awayTeamPoints`, `homeSetPoints`, `awaySetPoints`.
- Interliga: `teamPoints` tops out at 8. Slovak Cup: 6 (and halves occur — `0.5`), hence **numeric**, not integer.
- Season 12 has four 8:0 wins (2025-10-04, 2025-10-11, 2026-01-17, 2026-04-18) — excluded by the season cutoff.
- Season 13 has 22 fixtures, none played yet, so the first real 8:0 will be charged live.

### Proposed Changes

#### 1. Schema (`lib/db/schema.ts`)

```ts
export const matches = pgTable('matches', {
  …
  teamTotalScore: integer('team_total_score'),
  opponentTotalScore: integer('opponent_total_score'),
  // Match points ("body"): 8 in Interliga, 6 in the cup, halves on a drawn duel.
  teamMatchPoints: numeric('team_match_points'),
  opponentMatchPoints: numeric('opponent_match_points'),
  …
});
```
Applied with `pnpm db:push` (no migration files in this repo).

#### 2. Scrape types (`lib/api.ts`)

- `MatchListItem` (`:22-35`): add `homeTeamPoints?: number | null; awayTeamPoints?: number | null;`.
- Leave both `fields` whitelists alone: `match_list` already returns the point fields and `getMatchDetail` requests `teams`/`results`, and `teamResult` already arrives in the stored payload.

#### 3. Sync (`lib/sync.ts`)

- Extend `SyncMatchData` (`:42-72`) with:
  ```ts
  teamResult?: {
    home?: { teamPoints?: number | null };
    away?: { teamPoints?: number | null };
  };
  ```
- `match_list` branch (`:591-620`): alongside `teamTotalScore`, read `m.homeTeamPoints` / `m.awayTeamPoints` by side.
- `match_detail` branch (`:660-686`): `data.teamResult?.[teamKey]?.teamPoints` / `[opponentKey]`.
- **Use `??`, never `||`, for points.** `0` is the whole point of the rule; the existing `teamTotalScore = a || b || null` idiom would silently drop the losing side's `0`.
- Add both columns to the `matches` upsert column list (`:731-747`).

#### 4. Money rule — SQL (`lib/sync.ts`, `recalculateDerivedFinancials()`)

`agg` CTE gains `m.season_id, m.team_match_points, m.opponent_match_points` (both statements — the `agg` block is duplicated inside the cleanup `DELETE`). New `spec` branch:

```sql
UNION ALL
SELECT match_id, 'clean_sweep',
       CASE WHEN season_id >= ${CLEAN_SWEEP_FIRST_SEASON_ID}
             AND team_match_points = ${CLEAN_SWEEP_TEAM_POINTS}
             AND opponent_match_points = 0
            THEN ${TRAINER_CLEAN_SWEEP_FINE} END
FROM agg
```

and the cleanup `CASE` (`:219-223`) gains the matching arm:

```sql
WHEN 'clean_sweep' THEN agg.season_id >= … AND agg.team_match_points = 8
                        AND agg.opponent_match_points = 0
```

NULL points make both predicates NULL, so manual/tournament matches neither create nor keep a row. Paid rows are already spared by `WHERE NOT tp.is_paid`.

#### 5. Money rule — pure mirror (`lib/money-rules.ts`)

```ts
export const CLEAN_SWEEP_TEAM_POINTS = 8;
export const TRAINER_CLEAN_SWEEP_FINE = 10;
/** The rule starts in 2026/2027; the four 8:0 wins of season 12 are not charged. */
export const CLEAN_SWEEP_FIRST_SEASON_ID = 13;
```

- `MatchContext` gains `seasonId?: number | null`, `teamMatchPoints?: number | null`, `opponentMatchPoints?: number | null`.
- `TrainerConditionType` gains `'clean_sweep'`.
- New `trainerCleanSweepFine(match: MatchContext): number | null` with the one-line "mirrors the `clean_sweep` branch of the `spec` CTE" comment.
- `deriveTrainerPayments()` candidate list gains `['clean_sweep', trainerCleanSweepFine(match)]` **last**, after `elite_player` (the existing test asserts exact array order).

#### 6. Display (`lib/db-utils.ts`, `lib/home-helpers.ts`, `app/[lang]/page.tsx`)

- `getTrainersWithStats()` SQL: `COUNT(CASE WHEN m.external_id IS NOT NULL AND tp.condition_type = 'clean_sweep' THEN 1 END)::int as "cleanSweeps"`; add `cleanSweeps: number` to `DBTrainerStats`.
- `TrainerStats` + the mapping at `lib/home-helpers.ts:242-254` gain `cleanSweeps`.
- `app/[lang]/page.tsx`: `TRAINER_STAT_GRID` → `sm:grid-cols-6`; new `STAT_TILE` between `zeroMisses` and `totalPaid`, label `dict.home.cleanSweep`, value `{trainer.stats.cleanSweeps}x`, `font-semibold` (same as `zeroMisses`). `totalPaid` keeps `col-span-2 sm:col-span-1`, so mobile stays two columns: 3800/3900, 4000/0 chyb, 8:0 + (blank), Pokuty full width.

#### 7. Locales (`locales/{sk,cs,hu,sr}.json`) — all four, identical key sets

- `home.cleanSweep`: `"8:0"` in every locale (numeral, nothing to translate).
- `rules.trainer.fines`: 6th entry in every file, e.g. sk
  ```json
  { "title": "Výhra 8:0", "amount": "10 €", "note": "Tím vyhrá zápas 8:0 na body. Doma aj vonku." }
  ```
  cs "Výhra 8:0", hu "8:0-s győzelem", sr "Pobeda 8:0" — `title` must stay unique inside the array (`RuleList` keys on it).

#### 8. Docs

- `AGENTS.md` → Money Calculation Rules → Role: Trainer: new bullet **Clean Sweep** (`clean_sweep`) — 10 € when the match ends 8:0 in match points for Podbrezová, home or away, from season 2026/2027 on.
- `AGENTS.md` → Codebase Invariants: match points come from the scrape only (`teamResult.teamPoints` / `homeTeamPoints`), are NULL on manual matches, and must be read with `??` because `0` is meaningful.
- `.claude/skills/manage-match-results-and-payments/SKILL.md:75-76`: add `clean_sweep` to the condition list.

### Architecture Diagram

```mermaid
flowchart TD
  A[kolky.sk API] -->|match_list: home/awayTeamPoints<br/>match_detail: teamResult.teamPoints| B[scraped_data.data jsonb]
  B --> C[syncFromScrapedData<br/>lib/sync.ts]
  C -->|?? never ||| D[(matches.team_match_points<br/>matches.opponent_match_points)]
  D --> E[recalculateDerivedFinancials<br/>spec CTE: clean_sweep]
  E --> F[(trainer_payments<br/>condition_type='clean_sweep', 10 EUR)]
  F --> G[getTrainersWithStats<br/>cleanSweeps count + totalPaid]
  G --> H[Trainer card, 6th tile '8:0']
  E -.mirrored by.-> M[lib/money-rules.ts<br/>trainerCleanSweepFine]
  M -.tested by.-> T[lib/money-rules.test.ts]
```

### Key Decisions

- **Store the points, don't recompute them.** Per-player duel outcomes are not in the DB, so 8:0 cannot be derived from `match_player_results`; the scrape already hands us the aggregate.
- **Two numeric columns, not a boolean flag.** Halves exist (`0.5` observed in the cup), the raw result is reusable, and a derived boolean would violate the "`recalculateDerivedFinancials()` is the only writer of derived fields" invariant.
- **Strict `= 8 AND = 0`.** Confirmed with the user: a 6:0 cup sweep does not count, which also keeps the league-scope question out of the SQL entirely.
- **Season cutoff as a constant, not a date.** `CLEAN_SWEEP_FIRST_SEASON_ID = 13` reads the same in the SQL and the mirror and is testable.
- **New condition type rather than folding into `score_bonus`.** `getTrainersWithStats()` already distinguishes `score_bonus` tiers by `amount`; a fourth 10 € `score_bonus` row would be double-counted as a 3800+ tile.

### Edge Cases / Risks

- `0` vs falsy: the existing score mapping uses `||`, which would erase the opponent's `0` — the rule would then never fire. `??` everywhere for points.
- Season 12's four 8:0 matches: covered by the cutoff; the delete arm carries the same cutoff, so no stale rows survive if the columns are backfilled by a re-sync.
- Manual matches: NULL points, both predicates NULL, no row created, no row kept.
- Paid rows: untouched by recalculation (`WHERE NOT tp.is_paid`).
- Approving a new trainer must recalculate — already handled by `approveUser()`.
- `locales.test.ts` flattens arrays, so a 6th `fines` entry missing in one locale fails the suite.
- `db:push` on a live Neon DB: adding two nullable columns is additive and safe.
- Mobile: six tiles at `grid-cols-2` leaves one gap next to `8:0`; acceptable and visually identical to the current five-tile layout.

# Delivery Steps

### ✓ Step 0: Mirror this plan into the repo
Write the same content to `.junie/plans/trainer-clean-sweep-fine.md` (plan mode only allows editing the harness plan file, so this is the first execution step).

### ✓ Step 1: Schema + push
`lib/db/schema.ts` — add `teamMatchPoints`, `opponentMatchPoints`. Run `pnpm db:push`. Verify with `\d matches` equivalent query.

### ✓ Step 2: Persist match points in sync
`lib/api.ts` (`MatchListItem`), `lib/sync.ts` (`SyncMatchData`, both mapping branches, upsert column list). `??` for points.

### ✓ Step 3: Pure mirror + constants
`lib/money-rules.ts` — constants, `MatchContext` fields, `TrainerConditionType`, `trainerCleanSweepFine()`, `deriveTrainerPayments()`.

### ✓ Step 4: SQL rule
`lib/sync.ts` `recalculateDerivedFinancials()` — `agg` columns, `spec` branch, cleanup `CASE` arm, in both copies of `agg`.

### ✓ Step 5: Display
`lib/db-utils.ts` (`DBTrainerStats`, SQL count), `lib/home-helpers.ts` (`TrainerStats`, mapping), `app/[lang]/page.tsx` (grid + tile).

### ✓ Step 6: Locales + rules page
`locales/{sk,cs,hu,sr}.json` — `home.cleanSweep` and the 6th `rules.trainer.fines` entry in all four.

### ✓ Step 7: Tests
`lib/money-rules.test.ts` — new `trainer: clean sweep` table plus the updated `deriveTrainerPayments` expectations (see Testing).

### ✓ Step 8: Docs
`AGENTS.md` (Money Calculation Rules + Codebase Invariants), `.claude/skills/manage-match-results-and-payments/SKILL.md`.

### ✓ Step 9: Verify against real rows
Throwaway read-only script (scratchpad, never committed): read the season-12 and season-13 matches plus their `scraped_data` payloads, run `deriveTrainerPayments()` over them, and confirm (a) the four season-12 8:0 matches produce no `clean_sweep`, (b) `team_match_points` / `opponent_match_points` match `teamResult.teamPoints` for every synced match, (c) no existing `trainer_payments` row changes.

### ✓ Step 10: Quality check
`nvm use && pnpm check` (lint + type-check + tests). No `any`, Airbnb clean.

# Testing

### Validation Approach

`lib/money-rules.test.ts`, table-driven around the boundary:

| team pts | opp pts | season | expected |
|---|---|---|---|
| 8 | 0 | 13 | 10 |
| 8 | 0 | 12 | null (cutoff) |
| 8 | 1 | 13 | null |
| 7 | 0 | 13 | null |
| 6 | 0 | 13 | null (cup sweep) |
| 8 | 0.5 | 13 | null |
| null | null | 13 | null (manual match) |
| 8 | 0 | null | null |

plus: `isHome: true` and `isHome: false` both yield 10 (home/away irrelevant), and `deriveTrainerPayments()` returns
`[score_bonus, zero_faults, elite_player, clean_sweep]` in that order for a match that triggers all four, and omits `clean_sweep` when the points are absent.

`locales/locales.test.ts` covers key/placeholder parity for the new `home.cleanSweep` and `rules.trainer.fines.5.*` entries — no new test file needed.

No component test is added for the tile: the trainer card lives in the server component `app/[lang]/page.tsx`, which has no test today and is out of the frontend test scope (pure helpers + money-displaying components).

Manual pass: home page in all four locales — trainer card shows six tiles, `8:0` reads `0x` for the current season, `Pokuty` unchanged; `/rules` lists the new trainer payment.

Final step is the mandatory `pnpm check` (lint, type check, tests) from the Quality Check Rules.
