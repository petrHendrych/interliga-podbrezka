---
sessionId: session-260726-230005-12dp
---

# Requirements

### Overview & Goals
Integrate upcoming match data for ŠK Železiarne Podbrezová for the new 2026/2027 season (Team ID `5008`) and present a high-priority upcoming match card on the main dashboard before the players list.

### Scope
#### In Scope
- **Team ID Update**: Centralize and update team ID from `4844` to `5008` across scraper, sync, and dashboard.
- **Match List Scraping**: Call endpoint `https://api.vysledky.kolky.sk/match/list` with team ID `5008` during scraping and store results in `scraped_data` table (`type = 'match_list'`).
- **Dashboard UI Card**: Render a prominent card for the very next upcoming match on `app/[lang]/page.tsx` before the players grid with:
  - 3px amber yellowish border (`border-[3px] border-amber-500`).
  - Round label badge (`"{round}. kolo"` / `"Round {round}"`) overlapping the top border line in the top-left area with clean padding.
  - Opponent name (`homeName` or `awayName`) in larger bold font.
  - Formatted match date and time in `text-muted-foreground`.
  - Match venue indicator icon (`Home` icon for home matches, `Bus` icon for away matches).
- **Localization**: Add translations for all new strings in `locales/sk.json`, `locales/cs.json`, `locales/hu.json`, and `locales/sr.json`.
- **Guidelines Update**: Add permanent rule in `AGENTS.md` to require asking clarifying questions on key decisions.

#### Out of Scope
- Modifying player detail pages or historic fine calculation views.


# Technical Design

### Current Implementation
- `lib/scraper.ts`: Contains hardcoded `TEAM_ID = 4844` and scrapes team results, match details, and player details.
- `lib/sync.ts`: References hardcoded `TEAM_ID = 4844`.
- `app/[lang]/page.tsx`: Fetches team results for ID `4844` from DB and renders a grid of player avatar cards.

### Key Decisions
1. **Centralized Team ID**: Export `TEAM_ID = 5008` from `lib/api.ts` and reference it everywhere (`scraper.ts`, `sync.ts`, `page.tsx`).
2. **Scraped Data Storage**: Persist the raw response of `/match/list` in Neon DB (`scraped_data` table with `type = 'match_list'` and `external_id = 5008`).
3. **Upcoming Match Filtering**: On dashboard load, parse stored match list, match team ID (`homeId === 5008 || awayId === 5008`), and pick the first match with `startDate >= NOW()` (or first upcoming match).
4. **Card UI Layout**:
   - Container: `border-[3px] border-amber-500 rounded-xl relative bg-card text-card-foreground p-6 shadow-sm mb-8`.
   - Round badge: `absolute -top-3.5 left-6 bg-background px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500 rounded-md z-10`.
   - Home/Away icon: `Home` icon (Home) or `Bus` icon (Away) from `lucide-react`.
5. **Agent Guideline**: Update `AGENTS.md` with prompt instructions rule.

### Data Models / Contracts
```typescript
export interface MatchListItem {
  id: number;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  startDate: string;
  round: number;
  [key: string]: unknown;
}
```

### Architecture Diagram
```mermaid
graph LR
  API[api.vysledky.kolky.sk] -->|getMatchList| Scraper[lib/scraper.ts]
  Scraper -->|upsertScrapedData| DB[(Neon DB scraped_data)]
  DB -->|getScrapedData| Dashboard[app/[lang]/page.tsx]
  Dashboard -->|Render Card| UI[Upcoming Match Card]
```


# Testing

### Validation Approach
- Execute `pnpm check` (`eslint` and `tsc --noEmit`) to verify zero TypeScript or linting errors.

### Key Scenarios
1. **Scraping Verification**: Ensure `getMatchList(5008)` executes successfully and persists match objects into `scraped_data`.
2. **Dashboard Rendering**: Verify upcoming match card displays before the players grid on `/[lang]`.
3. **Home vs Away Logic**: Verify correct opponent name, round label, date format, and icon (`Home` vs `Bus`) depending on home/away status.


# Delivery Steps

### ✓ Step 1: Centralize TEAM_ID and implement match list scraping API
Centralize team ID definition and implement upcoming match API scraping endpoint.

- Export `TEAM_ID = 5008` from `lib/api.ts` as a shared constant.
- Add `MatchListItem` interface and `getMatchList(teamId: number)` call in `lib/api.ts` targeting `https://api.vysledky.kolky.sk/match/list`.
- Update `lib/scraper.ts` to import `TEAM_ID` and store upcoming match list in `scraped_data` table (`type = 'match_list'`, `external_id = 5008`).
- Update `lib/sync.ts` to reference the centralized `TEAM_ID` constant.

### ✓ Step 2: Update localization strings and AGENTS.md guidelines
Add localization dictionary keys and update project agent guidelines.

- Add translation strings (`upcomingMatch`, `roundFormat`, `homeMatch`, `awayMatch`, `vs`) across `locales/sk.json`, `locales/cs.json`, `locales/hu.json`, and `locales/sr.json`.
- Update `AGENTS.md` to include the rule: "Always ask questions instead of running your assumptions to confirm key decisions."

### ✓ Step 3: Implement upcoming match UI card on main dashboard
Render the upcoming match card on the main dashboard page before the players section.

- Update `fetchData` in `app/[lang]/page.tsx` to retrieve `match_list` from `scraped_data` table.
- Filter and identify the very next upcoming match where `homeId === TEAM_ID || awayId === TEAM_ID` and `startDate >= NOW()`.
- Construct the upcoming match card with:
  - 3px amber yellowish border (`border-[3px] border-amber-500`).
  - Top-left overlapping round label badge (`"{round}. kolo"` / `"Round {round}"`) breaking the top border line with clean padding.
  - First row showing opponent name (`awayName` for home games, `homeName` for away games) in larger bold font.
  - Second row showing readable formatted `startDate` in `text-muted-foreground`.
  - Icon indicator (`Home` for home games, `Bus` for away games).

### ✓ Step 4: Verify types and linting compliance
Run project validation checks to ensure zero linting or TypeScript errors.

- Run `pnpm check` (`eslint` and `tsc --noEmit`).
- Verify strict TypeScript compliance with no `any` types and clean Airbnb ESLint compliance.