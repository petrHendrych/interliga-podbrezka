---
sessionId: session-260728-234434-1pyg
---

# Requirements

### Overview & Goals
Implement money calculation logic according to defined rules for Players, Trainers, and Admins using real match data and fallback previous season data, ensuring correct fine and bonus calculations across background sync and UI displays.

### Scope
- **In Scope**:
  - Auto-syncing match results for current and fallback seasons (e.g., team 4844 / previous season snapshots) into `matches`, `match_player_results`, and `trainer_payments`.
  - Automatic player user creation/linking in `users` table via `external_player_id` during sync if a user record does not exist yet.
  - Player fine calculations: Sequential fault fine `(n*(n+1))/2`, score < 600 fine (1€), worst in team fine (1€ for lowest active player score), >700 score bonus (30€ team bank), and faultless streak gathering (10€ for 5th and every subsequent consecutive match with 0 faults).
  - Trainer payment calculations: Score bonus (>3800 score = 10€, >3900 score = 15€), zero fault bonus (10€ if team faults == 0 and active players >= 6), elite player bonus (10€ per player scoring > 700).
  - Database view updates (`view_user_balances`) to handle fines, bonuses, trainer payments, paid amounts, and net balances.
  - Updating `fetchHomeData` and player detail page (`app/[lang]/player/[id]/page.tsx`) to display real calculated money totals (total fines, total bonuses, unpaid balances) instead of hardcoded `0 €`.
- **Out of Scope**:
  - Manual special fault marking flows (handled separately in `mark-special-misses` skill).

### Functional Requirements
- **Player Fines & Bonuses**:
  - For each player in a match, compute sequential fault fine `(n * (n + 1)) / 2`.
  - Add 1€ fine if player's total score > 0 and < 600.
  - Add 1€ fine if player has the lowest total score among active players in the team (`total > 0`).
  - Add 10€ fine for each match in a faultless streak where streak length >= 5 (10€ on 5th, 6th, 7th... consecutive match with 0 faults).
  - Record 30€ team bank bonus if player's total score > 700.
- **Trainer Payments**:
  - Record 10€ score bonus if team score > 3800, or 15€ if team score > 3900.
  - Record 10€ zero faults bonus if team total faults == 0 and active players present >= 6.
  - Record 10€ elite player bonus for each player scoring > 700 in the match.
- **Data Sync & Fallback**:
  - Ensure fallback previous season match details (e.g. team ID 4844) are synced into `matches`, `match_player_results`, and `trainer_payments`.
  - Auto-create system user in `users` table with role `player` if `external_player_id` is present but not yet registered.
- **Financial UI Display**:
  - Home page cards display real calculated total fines/paid amounts for players and real trainer performance counts.
  - Player detail page displays total payments, unpaid balance, and per-match calculated fine.

# Technical Design

### Current Implementation
`lib/sync.ts` partially calculates sequential fines and trainer score/zero-fault bonuses, but skips players without pre-existing user records and does not calculate trainer elite player bonuses. `lib/home-helpers.ts` and `app/[lang]/player/[id]/page.tsx` hardcode `'0 €'` for total payments.

### Key Decisions
- **Faultless Streak Rule (5+ Matches)**: Calculate running streak of faultless matches (`faults == 0`) per player in chronological date order. For each match where consecutive faultless count >= 5, add 10€ gathering to `calculated_fine`.
- **Auto-provisioning Player Users in Sync**: Automatically create or match player records in `users` with `external_player_id` during sync so no match results are lost or ignored.
- **Unified Balance View (`view_user_balances`)**: Update SQL view definition to accurately aggregate player fines, bonuses, trainer payments, paid amounts, and net balances across seasons.
- **Comprehensive Trainer Payments**: Expand `syncMatch` to record trainer elite player bonuses (10€ for every player with score > 700 in a match) alongside score bonuses and zero fault bonuses.
- **Dynamic UI Financial Stats**: Replace static hardcoded strings in `home-helpers.ts` and `app/[lang]/player/[id]/page.tsx` with dynamic DB queries based on `view_user_balances` and `match_player_results`.

### Proposed Changes
- **`lib/sync.ts`**:
  - Upgrade `syncMatch` and `syncData` to sync all available match snapshots (including fallback team ID 4844).
  - Auto-create user records in `users` table if `external_player_id` is present but not yet in `users`.
  - Compute sequential fine `(n*(n+1))/2`, score < 600 fine (1€), worst in team fine (1€), >700 score bonus (30€).
  - Implement chronological faultless streak calculation across player matches: add 10€ fine for 5th and every subsequent consecutive match with 0 faults (6th, 7th, etc.).
  - Record trainer score bonuses (>3800 = 10€, >3900 = 15€), zero fault bonus (10€ if faults == 0 and players >= 6), and elite player bonus (10€ for player score > 700).
- **`AGENTS.md`**:
  - Update Money Calculation Rules to document the adjusted streak rule (10€ at 5th, 6th, 7th... consecutive faultless match).
- **`lib/db-utils.ts`**:
  - Update `ensureSchema` and `view_user_balances` to aggregate total fines, total trainer payments, bonuses, paid status, and net balances per user.
  - Update `getTrainersWithStats` and add `getPlayerBalances` / `getUserBalance` helper functions.
- **`lib/home-helpers.ts`**:
  - Update `fetchHomeData` to compute real player money statistics (`totalPaid` / total fines / balance) using DB helper functions instead of `'0 €'`.
- **`app/[lang]/player/[id]/page.tsx`**:
  - Query DB for player's financial totals (`total_due`, `total_bonuses`, `balance`) and render actual fine per match in the match table.

### File Structure
- `lib/sync.ts` - Sync logic & calculation algorithms for players and trainers.
- `lib/db-utils.ts` - Database schema, `view_user_balances` view, and balance helper functions.
- `lib/home-helpers.ts` - Home page data fetcher with real player/trainer financial stats.
- `app/[lang]/player/[id]/page.tsx` - Player detail view displaying real financial summary and match fines.

# Testing

### Validation Approach
- Execute sync data job (`syncData()`) via CLI or script to populate database tables with match results and calculations.
- Query database rows in `match_player_results`, `trainer_payments`, and `view_user_balances` to verify accuracy against money calculation rules.
- Run `pnpm check` (`pnpm lint` and `pnpm type-check`) to guarantee zero TypeScript or ESLint errors.

### Key Scenarios
- **Player Fines**: Verify that sequential faults, score < 600, and worst player in team fines match the exact monetary rules per match.
- **Faultless Streak Fines**: Verify that a player with 5, 6, or 7 consecutive matches with 0 faults receives 10€ fine per match starting from the 5th match, and streak resets when `faults > 0`.
- **Player Bonuses**: Verify that scores > 700 generate 30€ in `bonus_received` in `match_player_results`.
- **Trainer Payments**: Verify that team total > 3800 / > 3900, zero team faults (with >= 6 active players), and elite player bonuses (> 700 score) insert correct rows into `trainer_payments`.
- **UI Rendering**: Verify that Home page player cards and Player detail page render real calculated money values instead of `0 €`.

# Delivery Steps

### ✓ Step 1: Update sync logic and auto-user provisioning for money calculation rules
Background sync calculates correct player fines, bonuses, and trainer payments for current and fallback matches.

- Update `lib/sync.ts` to auto-provision user records for players with `external_player_id` if missing in `users`.
- Implement sequential fault fine `(n*(n+1))/2`, score < 600 fine (1€), worst in team fine (1€), faultless streak fine (10€ for 5th, 6th, 7th... consecutive match with 0 faults), and >700 score bonus (30€) in `syncMatch`/`syncData`.
- Implement trainer payments in `syncMatch`: score bonus (>3800 = 10€, >3900 = 15€), zero faults bonus (10€ for faults == 0 and >= 6 active players), and elite player bonus (10€ for player score > 700).
- Update `AGENTS.md` Money Calculation Rules section to accurately reflect the 5+ faultless streak rule.
- Update `syncData()` to sync snapshots for both current and fallback season match details.

### ✓ Step 2: Refine database schema views and helper queries for user balances
Database views and queries return accurate money metrics for players, trainers, and admins.

- Update `ensureSchema` and `view_user_balances` in `lib/db-utils.ts` to aggregate total fines, trainer payments, bonuses, paid amounts, and net balances per user.
- Refine `getTrainersWithStats` to query calculated trainer payments accurately.
- Add database helper functions in `lib/db-utils.ts` to fetch player financial statistics and user balance summaries for the UI.

### ✓ Step 3: Integrate real money calculations into Home Page and Player Detail UI
Home page and player detail pages display real calculated money totals, fines, and balances.

- Update `lib/home-helpers.ts` (`fetchHomeData`) to replace hardcoded `'0 €'` player payments with real calculated fines/balances from the DB.
- Update `app/[lang]/player/[id]/page.tsx` to display real total payment, unpaid balance, and calculated fine per match in the table.
- Validate implementation using `pnpm check` (`pnpm lint` and `pnpm type-check`) to ensure zero static typing or style violations.