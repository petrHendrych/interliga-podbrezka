---
sessionId: session-260729-152300-1pqa
---

# Requirements

### Overview & Goals
The goal of this task is to introduce a centralized season and league configuration file (`lib/season-config.ts`) that maps all relevant season IDs, league IDs, and team IDs for Podbrezová. Furthermore, the dashboard UI will be updated to include a season selection dropdown (e.g. `2026/2027` and `2025/2026`) alongside league filter tabs (`All`, `Interliga`, `Slovenský pohár`, `Finále`) to filter player averages, max scores, misses, and match counts per season and league.

### Scope
- **In Scope**:
  - `lib/season-config.ts` configuration file containing metadata for Season 12 (`2025/2026`) and Season 13 (`2026/2027`).
  - Refactoring `lib/api.ts`, `lib/scraper.ts`, and `lib/sync.ts` to reference configuration IDs rather than hardcoded team IDs (`5008`, `4844`, `4948`).
  - Enhancing database helper functions in `lib/db-utils.ts` and `lib/home-helpers.ts` to support filtering stats by `seasonId` and `leagueKey`.
  - Adding a mobile-first Season Select dropdown and League filter tabs on the dashboard (`app/[lang]/page.tsx`).
  - Adding i18n translation keys in all 4 supported locales (`sk`, `cs`, `hu`, `sr`).
- **Out of Scope**:
  - Modifying core money calculation logic or fine rules (fines and bonuses remain unchanged).
  - Modifying admin workflows for payment tracking or special miss logging.

### User Stories
- **As a user**, I want to choose between seasons (`2026/2027` and `2025/2026`) on the dashboard so I can inspect current or historical player performance.
- **As a user**, I want to click on league tabs (`All`, `Interliga`, `Slovenský pohár`, `Finále`) so that player card statistics (AVG, MAX, misses, matches count) update specifically for that league context.

### Functional Requirements
- **Season Configuration**:
  - Season 12 (`2025/2026`): Interliga (leagueId: `354`, teamId: `4844`), Slovensky pohar (leagueId: `364`, teamId: `4948`), Slovensky pohar - finale (leagueId: `366`, teamId: `4988`).
  - Season 13 (`2026/2027`): Interliga (leagueId: `368`, teamId: `5008`).
- **Dashboard Season Select**:
  - Placed before the player card list.
  - Dropdown options: `2026/2027` (season 13) and `2025/2026` (season 12).
  - Default selection: `2026/2027`.
- **Dashboard League Filter Tabs**:
  - Tab buttons next to/integrated with the season select: `All`, `Interliga`, `Slovenský pohár`, `Finále`.
  - Default selection: `All`.
  - Clicking a tab updates player averages, maximum scores, misses, and match count for the selected league (or all leagues in the selected season).

### Non-Functional Requirements
- **Mobile-First Design**: Responsive layout for season select and tab buttons optimized for mobile screens.
- **Type Safety**: Strictly typed TypeScript code without `any`.
- **Internationalization**: Fully localized across Slovak (`sk`), Czech (`cs`), Hungarian (`hu`), and Serbian (`sr`).

# Technical Design

### Current Implementation
- `TEAM_ID = 5008` is hardcoded in `lib/api.ts`.
- Fallbacks for previous season team IDs (`4844`, `4948`) are hardcoded in `lib/scraper.ts`, `lib/sync.ts`, and `lib/home-helpers.ts`.
- `getPlayerBalances()` in `lib/db-utils.ts` queries `view_user_balances` for the latest season overall without support for filtering player stats per specific league.

### Key Decisions
1. **Centralized Season & League Config (`lib/season-config.ts`)**:
   Define `SEASONS` config array containing season IDs, season display names (`2026/2027`, `2025/2026`), and array of leagues with `leagueId`, `teamId`, `key` (`interliga`, `pohar`, `finale`), and `name`.
2. **Dynamic Client Component for Filters (`components/dashboard/SeasonLeagueFilter.tsx`)**:
   Extract season dropdown and league tab buttons into a client component. Maintain selected season and league in component state (or URL query parameters) so that player stats update dynamically on user selection.
3. **Parameterized DB Aggregation**:
   Update `getPlayerBalances(seasonId?, leagueKey?)` and `fetchHomeData()` in `lib/db-utils.ts` / `lib/home-helpers.ts` to perform database filtering on `matches.season_id` and `matches.league_name` or `league_id`.

### Proposed Changes
- **`lib/season-config.ts` (New File)**:
  - Define interfaces `LeagueConfig` and `SeasonConfig`.
  - Export `SEASONS_CONFIG` object mapping seasons 12 and 13 with their respective leagues and team IDs.
  - Export helper functions `getAllTeamIds()`, `getSeasonConfig(seasonId)`, `getLeagueConfig(seasonId, key)`.
- **`lib/api.ts`, `lib/scraper.ts`, `lib/sync.ts`**:
  - Replace hardcoded `TEAM_ID` and fallback team ID arrays with helpers from `lib/season-config.ts`.
- **`lib/db-utils.ts` & `lib/home-helpers.ts`**:
  - Update `getPlayerBalances` to accept optional `seasonId: number` and `leagueKey: string`.
  - Filter `view_user_balances` or join `match_player_results` with `matches` according to `season_id` and `league_name`/`league_id`.
- **`components/dashboard/SeasonLeagueFilter.tsx` (New Component)**:
  - Render mobile-friendly season `<select>` and league tab `<button>` elements.
- **`app/[lang]/page.tsx`**:
  - Integrate season and league filter component above the player cards list.
- **`locales/*.json`**:
  - Add translation keys for season names, league tab labels, and filter controls in `sk`, `cs`, `hu`, and `sr`.

### File Structure
- `lib/season-config.ts` (Added)
- `components/dashboard/SeasonLeagueFilter.tsx` (Added)
- `lib/api.ts` (Modified)
- `lib/scraper.ts` (Modified)
- `lib/sync.ts` (Modified)
- `lib/db-utils.ts` (Modified)
- `lib/home-helpers.ts` (Modified)
- `app/[lang]/page.tsx` (Modified)
- `locales/sk.json`, `locales/cs.json`, `locales/hu.json`, `locales/sr.json` (Modified)

# Testing

### Validation Approach
Verification will be performed using automated code quality checks and manual flow verification:
1. Run `pnpm lint` to ensure zero ESLint warnings or errors according to Airbnb rules.
2. Run `pnpm type-check` (or `tsc --noEmit`) to ensure zero TypeScript errors and no `any` types.

### Key Scenarios
- **Season Selection**: Switch season select from `2026/2027` (Season 13) to `2025/2026` (Season 12) and verify displayed player stats reflect Season 12 data.
- **League Tab Filtering**: Click `Interliga`, `Slovenský pohár`, and `Finále` tab buttons; verify that AVG, MAX, misses, and match counts correspond to matches in that specific league.
- **Default State**: Verify that loading the page defaults to Season 13 (`2026/2027`) and `All` leagues.
- **Localization**: Verify that season labels and league names render correctly when switching UI language between Slovak, Czech, Hungarian, and Serbian.

# Delivery Steps

### ✓ Step 1: Create season and league configuration file and update scraper/sync utilities
The system has a centralized config defining season, league, and team IDs, and scraping/syncing utilities reference it instead of hardcoded IDs.

- Create `lib/season-config.ts` with definitions for Season 12 (`2025/2026`) and Season 13 (`2026/2027`), mapping season IDs, league IDs (`354`, `364`, `366`, `368`), team IDs (`4844`, `4948`, `4988`, `5008`), and league keys (`interliga`, `pohar`, `finale`).
- Refactor `lib/api.ts`, `lib/scraper.ts`, and `lib/sync.ts` to utilize team IDs and season configurations from `lib/season-config.ts`.
- Ensure scraping and sync jobs populate match and player result metadata with correct season and league identifiers.

### ✓ Step 2: Implement season and league filtered queries in database and helper functions
Database queries in `lib/db-utils.ts` and `lib/home-helpers.ts` accept optional season and league parameters to aggregate player statistics accurately.

- Update `getPlayerBalances` and `fetchHomeData` in `lib/db-utils.ts` and `lib/home-helpers.ts` to support optional `seasonId` and `leagueKey` parameters.
- Filter `match_player_results` joined with `matches` by `season_id` and `league_name` / `league_id`.
- Ensure money balances remain accurate while averages (AVG), maximum scores (MAX), misses, and match counts update dynamically based on the selected season and league context.

### ✓ Step 3: Build Season Select and League Tab Filter UI on the Dashboard
The dashboard features a mobile-first season select dropdown and league filter tabs that allow users to filter player statistics.

- Create `SeasonLeagueFilter` component in `components/dashboard/SeasonLeagueFilter.tsx` with a season select dropdown (`2026/2027` and `2025/2026`) and league filter buttons (`All`, `Interliga`, `Slovenský pohár`, `Finále`).
- Integrate the filter UI in `app/[lang]/page.tsx` directly before the player cards list.
- Wire state updates so selecting a season or league updates player card statistics in real time.

### ✓ Step 4: Update locale translations and run quality checks
All UI strings for seasons and leagues are translated across all 4 supported locales, and the codebase passes linting and type checks.

- Add translation keys for season labels (`2025/2026`, `2026/2027`), league names (`All`, `Interliga`, `Slovenský pohár`, `Finále`), and filter labels to `locales/sk.json`, `locales/cs.json`, `locales/hu.json`, and `locales/sr.json`.
- Run `pnpm lint` and `pnpm type-check` to verify zero TypeScript errors, no `any` usage, and adherence to Airbnb linting guidelines.