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
- Every plan ends with the mandatory lint and type check from the Quality Check Rules as the final step.
<!-- END:plan-rules -->

<!-- BEGIN:money-rules -->
# Money Calculation Rules

Rules for calculating gatherings (fines) and bonuses for each role.

### Role: Player
**Gatherings (to be paid to the bank):**
- **Score < 600**: 1€ per game.
- **Worst in Team**: 1€ per game (lowest total score among players with total > 0).
- **Team under 3750 (Interliga home matches only)**: 10€ per player who played (total > 0), when the team total is below 3750. Exactly 3750 is fine — only under 3750 is penalised. Does not apply away or in the Slovak Cup.
- **Faults (Sequential Fine)**: Sum of numeric order of faults. Formula: `(n * (n + 1)) / 2`.
  - 1 fault = 1€
  - 2 faults = 1€ + 2€ = 3€
  - 3 faults = 1€ + 2€ + 3€ = 6€
  - ... and so on.
- **Special Faults**: 5€ per occurrence (marked manually).
  - Includes: Fault into playing full, missing 2nd to last throw.
- **Success Gathering**: 10€ for 5th and every subsequent consecutive game without a fault (5th, 6th, 7th... consecutive game with 0 faults).

**Bonuses (to be received):**
- **Score > 700**: 40€ total (30€ from team bank + 10€ from trainer).

### Role: Trainer
**Payments (to be paid by trainer):**
- **Team Performance**:
  - Team Total > 3800: 10€
  - Team Total > 3900: 15€ (replaces the 3800 bonus, not cumulative).
- **Zero Faults Bonus**: 10€ if the team plays without any faults (at least 6 players must be present).
- **Elite Player Bonus**: 10€ paid to any player who scores > 700.

### Role: Admin
**Responsibilities:**
- Approving new user registrations.
- Manually marking special faults (playing full fault, 2nd to last throw miss).
- Manually marking 5-game faultless streaks.
- General system maintenance and data synchronization.
<!-- END:money-rules -->
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
- Scraped placeholder users have no e-mail — they exist only so match results have something to hang off. Everything with an e-mail is a real, registered account.
- `match_player_results` and `trainer_payments` both FK to `users` without cascade, so children go first on delete, and a player with any results cannot simply be removed.

### UI
- Portalled popups (tooltip, popover, select) must carry a z-index on the **Positioner**, above the header (`z-50`); the blurred sticky filter bar makes its own stacking context and will otherwise paint over them.
- Tooltips toggle on click as well as hover — touch devices have no hover.
- Dialogs that can fail stay open on failure, so the reason is visible instead of silently swallowed.
