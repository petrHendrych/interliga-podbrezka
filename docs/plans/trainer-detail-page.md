# Requirements

### Overview & Goals

Players have a detail page (`/[lang]/player/[id]`) that lists every match of the season with
the fine and whether it is paid. Trainers have only the summary card on the home page. This
adds a trainer detail page, `/[lang]/trainer/[id]`, with the same season/league filter and a
table of the trainer's payments per match, so a trainer can see:

- how much he owes for each match and why (which condition),
- whether that match is already paid, and
- what is still missing, per match and in total.

This is a read-only view. No money rule, threshold, SQL in `recalculateDerivedFinancials()`,
or `trainer_payments` row changes.

### Scope

**In Scope**
- New page `app/[lang]/trainer/[id]/page.tsx`, keyed by `users.id` (trainers have no external id).
- New read query + cached wrappers in `lib/db-utils.ts`.
- New db-free helper `lib/trainer-matches.ts` that groups payment rows into one row per match
  and computes totals/status.
- New money-displaying components in `components/money/`.
- Home trainer card becomes a link to the new page (like player cards).
- Cache tag + `revalidatePath` so paid toggles refresh the page.
- `trainerDetail` locale namespace in `locales/{sk,cs,hu,sr}.json`.
- Tests for the helper and the components.

**Out of Scope**
- Any change to how trainer payments are calculated (`lib/sync.ts`, `lib/money-rules.ts`),
  so the Money Calculation Rules section and the `rules` namespace stay untouched.
- Marking payments paid from this page (admin keeps doing that in `/admin/money`).
- ~~Upcoming (unplayed) fixtures — only played matches are listed.~~ Added in follow-up Step 11.
- Access restriction — every signed-in user can open it, like player pages.
- Hiding the trainer under the `pohar` filter: the home page skips the trainer card there,
  the detail page simply shows whatever the filter selects (cup matches can carry
  `zero_faults` / `elite_player` rows).

### User Stories

- As a trainer, I tap my card on the home page and land on my page with the same season and
  league filter selected.
- As a trainer, I see at the top: total owed, already paid, still to pay for the selection.
- As a trainer, I see every played match of the season, newest first. A match with no
  payment shows `0 €`; a match with payments shows the match total.
- As a trainer, tapping the amount shows each condition (e.g. "Výkon tímu 15 €",
  "Tím bez chyby 10 €") with its own paid/unpaid state.
- As a trainer, the status column tells me per match: Paid / Unpaid / "Remaining X €"
  (partly paid) / nothing when there was no payment.

# Technical Design

### Current Implementation

- `trainer_payments` (`lib/db/schema.ts:79`): one row per `(match_id, user_id, condition_type)`
  with `amount` (numeric) and its own `is_paid`. Written only by
  `recalculateDerivedFinancials()` (`lib/sync.ts:212-260`).
- Home trainer card: `app/[lang]/page.tsx:365-435`, a plain `<div>` (not a link), data from
  `getTrainersWithStats()` (`lib/db-utils.ts:241`) via `fetchHomeData()`
  (`lib/home-helpers.ts:186`). `trainer.id` is `users.id::text`.
- Player page: `app/[lang]/player/[id]/page.tsx` — header summary, sticky
  `SeasonLeagueFilter`, `Table` with `MatchFineTooltip` per row. Data through `unstable_cache`
  wrappers (`getCachedPlayerBalance` etc., `lib/db-utils.ts:457-593`) tagged with
  `SYNCED_DATA_TAGS` (`lib/cache.ts`).
- Condition labels already exist: `admin.money.conditions.{score_bonus,zero_faults,elite_player,clean_sweep}`.
  `TrainerConditionType` lives in `lib/money-rules.ts:72` (db-free).
- Paid toggles go through `applyMatchMoney()` (`lib/match-money-actions.ts`), which calls
  `updateSyncedData()` and `revalidatePath` for the admin pages and `PLAYER_PATH`.

### Proposed Changes

#### 1. Pure grouping helper (`lib/trainer-matches.ts`, new, db-free)

No import path may reach `lib/db.ts` (the components import its types). The SQL only selects
rows; all summing happens here so it is unit testable.

```ts
import type { TrainerConditionType } from '@/lib/money-rules';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id would make Postgres throw on the `::uuid` cast instead of returning nothing. */
export function isUuid(value: string): boolean { return UUID_PATTERN.test(value); }

/** One played match joined with at most one of the trainer's payment rows. */
export interface TrainerPaymentRow {
  matchId: number;
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  leagueName: string | null;
  leagueId: number | null;
  teamTotalScore: number | null;
  conditionType: string | null; // null = LEFT JOIN found no payment
  amount: number;
  isPaid: boolean;
}

export interface TrainerMatchPayment {
  conditionType: TrainerConditionType | string;
  amount: number;
  isPaid: boolean;
}

export type TrainerMatchStatus = 'none' | 'paid' | 'unpaid' | 'partial';

export interface TrainerMatchRow {
  matchId: number; date: string | null; opponent: string | null; isHome: boolean | null;
  leagueName: string | null; leagueId: number | null; teamTotalScore: number | null;
  payments: TrainerMatchPayment[];
  total: number; paid: number; unpaid: number;
  status: TrainerMatchStatus;
}

export interface TrainerPaymentSummary { total: number; paid: number; unpaid: number }

export function trainerMatchStatus(paid: number, unpaid: number): TrainerMatchStatus;
// total 0 -> 'none'; unpaid 0 -> 'paid'; paid 0 -> 'unpaid'; else 'partial'

export function buildTrainerMatchRows(rows: TrainerPaymentRow[]): TrainerMatchRow[];
// groups by matchId, orders payments by a fixed condition order
// (score_bonus, zero_faults, elite_player, clean_sweep, then unknown), sorts matches newest
// first with undated last (same rule as `byDate` in lib/player-matches.ts)

export function summarizeTrainerMatches(rows: TrainerMatchRow[]): TrainerPaymentSummary;
```

#### 2. Read query + cache (`lib/db-utils.ts`)

```ts
export interface TrainerProfile { id: string; name: string }

export async function getTrainerById(userId: string): Promise<TrainerProfile | null>
//   SELECT u.id::text, u.name FROM users u
//   WHERE u.id = ${userId}::uuid AND u.role = 'trainer' AND u.is_approved = true

export async function getTrainerPaymentRows(
  userId: string, seasonId?: number, leagueKey?: string,
): Promise<TrainerPaymentRow[]>
```

```sql
SELECT m.external_id AS match_id, m.date, m.opponent, m.is_home, m.league_name, m.league_id,
       m.team_total_score, tp.condition_type, tp.amount, tp.is_paid
FROM matches m
LEFT JOIN trainer_payments tp
  ON tp.match_id = m.external_id AND tp.user_id = ${userId}::uuid
WHERE m.season_id = ${targetSeasonId}
  ${leagueCondition(leagueKey)}
  -- "played" is the same test getPlayerMissingMatches() uses; a paid row on a match whose
  -- score was later cleared must still show up
  AND (m.team_total_score IS NOT NULL OR tp.id IS NOT NULL)
ORDER BY m.date DESC
```

Map with `Number()` / `Boolean()` exactly like `getPlayerMatchResultsByExternalId()`;
`amount` comes back as numeric text → `Number(r.amount ?? 0)`.

Cached wrappers, same shape as the player ones:

```ts
export const getCachedTrainer = unstable_cache(
  async (userId: string) => getTrainerById(userId),
  ['trainer-detail'],
  { revalidate: SYNCED_DATA_REVALIDATE_SECONDS, tags: ['trainer-payments'] },
);
export const getCachedTrainerPaymentRows = unstable_cache(
  async (userId: string, seasonId: number, leagueKey: string) => (
    getTrainerPaymentRows(userId, seasonId, leagueKey)
  ),
  ['trainer-payment-rows'],
  { revalidate: SYNCED_DATA_REVALIDATE_SECONDS, tags: ['trainer-payments'] },
);
```

#### 3. Cache invalidation (`lib/cache.ts`, `lib/match-money-actions.ts`)

- Add `'trainer-payments'` to `SYNCED_DATA_TAGS`. That covers every existing writer:
  sync/cron, `applyMatchMoney()`, `approveUser()`, user deletion, manual-match edits,
  and the CLI via `/api/revalidate`, since all of them go through
  `updateSyncedData()` / `revalidateSyncedData()`.
- `lib/match-money-actions.ts`: add `const TRAINER_PATH = '/[lang]/trainer/[id]';` and
  `revalidatePath(TRAINER_PATH, 'page');` next to `PLAYER_PATH`.

#### 4. Money components (`components/money/TrainerMatchPayment.tsx`, new, `'use client'`)

Imports only `lib/trainer-matches.ts` types, `lib/i18n/config` (`interpolate`) and
`components/ui/tooltip` — no db path.

```ts
export interface TrainerMatchPaymentLabels {
  paidStatus: string; unpaidStatus: string; partialStatus: string; // "Zostáva {amount} €"
  conditions: Record<TrainerConditionType, string>;
}

export function TrainerMatchAmount({ row, labels }: { row: TrainerMatchRow; labels: … })
// total 0  -> muted "0 €", no tooltip (same as MatchFineTooltip)
// otherwise -> "{total} €" coloured green if status 'paid', amber if 'partial', red if
//             'unpaid'; wrapped in <Tooltip> listing each payment:
//             "<condition label>  <amount> €  (Zaplatené|Nezaplatené)" with per-line colour

export function TrainerMatchStatusBadge({ row, labels })
// 'none'    -> "-" (muted)
// 'paid'    -> pill "Zaplatené" emerald
// 'unpaid'  -> pill "Nezaplatené" red
// 'partial' -> pill interpolate(partialStatus, { amount: row.unpaid }) amber
```

Pill styling reuses the player page's `inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap`.
Unknown condition types fall back to the raw string, like `TrainerPaymentCard`.

#### 5. Summary component (`components/money/TrainerPaymentSummary.tsx`, new, server-safe)

Three tiles in a `grid grid-cols-3 gap-2` (fits a phone), reusing the home stat-tile look
(`rounded-lg bg-surface-2 px-2 py-1.5 text-center`):

| label | value | tone |
|---|---|---|
| `trainerDetail.totalDue` | `{total} €` | neutral |
| `trainerDetail.paid` | `{paid} €` | emerald when > 0 |
| `trainerDetail.unpaid` | `{unpaid} €` | red when > 0 |

#### 6. Page (`app/[lang]/trainer/[id]/page.tsx`, new)

Structure mirrors `app/[lang]/player/[id]/page.tsx`:

1. `await params` / `searchParams`; `selectedSeasonId`, `selectedLeagueKey` exactly as player page.
2. `if (!isUuid(id)) notFound();` (`next/navigation`, as in `admin/money/[matchId]/page.tsx`).
3. `Promise.all([getCachedTrainer(id), getCachedTrainerPaymentRows(id, season, league)])`;
   `if (!trainer) notFound();`
4. `const rows = buildTrainerMatchRows(paymentRows); const summary = summarizeTrainerMatches(rows);`
5. Header: `PlayerAvatar userId={trainer.id}` (w-32 h-32 like the player page), name,
   "(Tréner)" via `dict.home.trainerLabel`, then `<TrainerPaymentSummary>`.
6. Sticky `SeasonLeagueFilter`, copied from the player page (same classes and labels).
7. `Card` "Platby za zápasy" with `Table` inside `overflow-x-auto`, columns:
   `Dátum | Súťaž | Zápas | Tím spolu | Platba | Stav`
   - date: `formatDateOnly(date, lang)`; league: `leagueLabelForId(...)` (never the raw name);
     match: same `matchLabel()` using `playerDetail.matchHome/matchAway`;
   - team total: `teamTotalScore ?? '-'`, bold, emerald when `>= TRAINER_SCORE_LIMIT`
     (import the constant from `lib/money-rules.ts`, don't retype 3800);
   - `TrainerMatchAmount`, `TrainerMatchStatusBadge`.
   - Empty state row `colSpan={6}`: `trainerDetail.noResults`.
8. Errors: same try/catch block as the player page with `trainerDetail.errorLoading`
   (`notFound()` must be called outside the try so its throw is not swallowed).

#### 7. Home card link (`app/[lang]/page.tsx:366-434`)

Replace the trainer `<div>` with `<Link href={`/${lang}/trainer/${trainer.id}?season=${selectedSeasonId}&league=${selectedLeagueKey}`}>`,
keeping `md:col-span-2 ${PERSON_CARD} ring-1 ring-inset ring-red-800/25` and adding the
player card's `block transition-[box-shadow,transform] hover:shadow-lift-lg active:scale-[0.99]`.

#### 8. Locales (`locales/{sk,cs,hu,sr}.json`, new `trainerDetail` namespace)

Reuse existing keys where the meaning is identical: `playerDetail.date/league/match/matchHome/matchAway/paidStatus/unpaidStatus`,
`admin.money.conditions.*`, `home.trainerLabel`. New keys (sk shown; cs/hu/sr written via the
`translations` skill):

```json
"trainerDetail": {
  "totalDue": "Spolu",
  "paid": "Zaplatené",
  "unpaid": "Zostáva zaplatiť",
  "paymentsTitle": "Platby za zápasy",
  "teamTotal": "Tím spolu",
  "payment": "Platba",
  "status": "Stav",
  "partialStatus": "Zostáva {amount} €",
  "noResults": "V tejto sezóne zatiaľ nie je odohraný žiadny zápas.",
  "errorLoading": "Chyba pri načítaní trénera"
}
```

#### 9. AGENTS.md invariant

Under **Player Photos** / a new line in **Seasons, Leagues, Ids**: "The trainer page
`/[lang]/trainer/[id]` is keyed by `users.id` (uuid) — trainers have no external id. It lists
`trainer_payments` grouped per match by `buildTrainerMatchRows()`; SQL never sums them."

### Architecture Diagram

```mermaid
flowchart TD
  HOME["app/[lang]/page.tsx<br/>trainer card → Link"] -->|"/trainer/{users.id}?season&league"| PAGE
  PAGE["app/[lang]/trainer/[id]/page.tsx"] -->|isUuid| TM
  PAGE --> CT["getCachedTrainer()"]
  PAGE --> CR["getCachedTrainerPaymentRows()"]
  CT --> DB[(users)]
  CR --> DB2[("matches LEFT JOIN trainer_payments")]
  CR -->|TrainerPaymentRow[]| TM["lib/trainer-matches.ts<br/>buildTrainerMatchRows / summarizeTrainerMatches"]
  TM --> SUM["TrainerPaymentSummary"]
  TM --> AMT["TrainerMatchAmount (tooltip)"]
  TM --> ST["TrainerMatchStatusBadge"]
  ACT["applyMatchMoney() / sync / approveUser"] -->|"updateSyncedData() → tag 'trainer-payments'"| CR
  ACT -->|"revalidatePath('/[lang]/trainer/[id]')"| PAGE
```

### Key Decisions

- **One row per match with a tooltip breakdown** (user's choice) — the status column shows
  Paid / Unpaid / "Remaining X €"; per-condition paid state lives in the tooltip.
- **All played matches, `0 €` rows included** (user's choice); upcoming fixtures left out.
- **Open to every signed-in user** (user's choice), consistent with player pages; the proxy
  already requires a session for every non-public route, so no proxy change.
- **SQL selects, TypeScript sums.** Grouping and totals live in `lib/trainer-matches.ts` so
  they are unit tested; mocking `db.execute` is forbidden by the Testing Rules.
- **Key by `users.id`**, matching `IMAGES_BY_USER_ID` and the home card's `trainer.id`.
- **Validate the uuid before querying** — a bad `::uuid` cast throws a Postgres error, which
  would render the error block instead of a 404.
- **New cache tag `trainer-payments` in `SYNCED_DATA_TAGS`** rather than reusing a player tag:
  every existing invalidator picks it up for free, and the name says what it caches.
- **Reuse existing locale keys** (conditions, paid/unpaid, match labels) instead of duplicating.

### Edge Cases / Risks

- **Partly paid match** (e.g. score_bonus paid, zero_faults added later by recalculation):
  status `partial`, remaining = sum of unpaid rows.
- **Paid row on a match with no score any more**: kept by the `OR tp.id IS NOT NULL` clause,
  so paid money never disappears from the page.
- **Trainer approved mid-season**: recalculation fans out rows for all past matches, so they
  appear; before approval `getTrainerById` returns null → 404.
- **Numeric amounts** arrive as strings; `Number()` in the mapper, sums in the helper.
- **League filter**: trainer payments have a league via their match, so unlike `streak_fine`
  they are valid under every filter; the page total for a filter must equal the home card's
  `totalPaid` for the same filter.
- **Client/Server boundary**: `TrainerMatchPayment.tsx` is `'use client'`; it must import
  types only from `lib/trainer-matches.ts` / `lib/money-rules.ts`, never from `lib/db-utils.ts`.
- **Tooltip z-index**: reuse `components/ui/tooltip` which already sets the Positioner z-index
  above the sticky filter bar.
- **Linked trainer** (a trainer who also owns an `external_player_id`) still has a player card
  and now also a trainer page — both are correct views of different money.

# Delivery Steps

### ✓ Step 1: Rename the plan file
Rename this file to `docs/plans/trainer-detail-page.md`.
Touches: `docs/plans/`.

### ✓ Step 2: Add the pure helper
Create `lib/trainer-matches.ts` with `isUuid`, `trainerMatchStatus`, `buildTrainerMatchRows`,
`summarizeTrainerMatches` and the types from Proposed Changes §1.
Touches: `lib/trainer-matches.ts`.

### ✓ Step 3: Add the query and cache
Add `TrainerProfile`, `getTrainerById`, `getTrainerPaymentRows`, `getCachedTrainer`,
`getCachedTrainerPaymentRows` to `lib/db-utils.ts`; add `'trainer-payments'` to
`SYNCED_DATA_TAGS`; add `TRAINER_PATH` revalidation to `applyMatchMoney()`.
Touches: `lib/db-utils.ts`, `lib/cache.ts`, `lib/match-money-actions.ts`.

### ✓ Step 4: Add locale keys
Add the `trainerDetail` namespace to all four locale files (use the `translations` skill).
Touches: `locales/{sk,cs,hu,sr}.json`.

### ✓ Step 5: Add the money components
Create `components/money/TrainerMatchPayment.tsx` (`TrainerMatchAmount`,
`TrainerMatchStatusBadge`) and `components/money/TrainerPaymentSummary.tsx`.
Touches: `components/money/`.

### ✓ Step 6: Add the trainer page
Create `app/[lang]/trainer/[id]/page.tsx` per §6.
Touches: `app/[lang]/trainer/[id]/page.tsx`.

### ✓ Step 7: Link the home trainer card
Turn the trainer card into a `Link` per §7.
Touches: `app/[lang]/page.tsx`.

### ✓ Step 8: Record the invariant
Add the AGENTS.md line from §9.
Touches: `AGENTS.md`.

### ✓ Step 9: Write the tests
- `lib/trainer-matches.test.ts` (node project), table-driven:
  - `isUuid`: valid lowercase/uppercase uuid → true; `'abc'`, `'123'`, uuid with extra char → false.
  - `trainerMatchStatus`: `(0,0)→none`, `(10,0)→paid`, `(0,10)→unpaid`, `(10,5)→partial`.
  - `buildTrainerMatchRows`:
    - a match with no payment (`conditionType: null, amount: 0`) → one row, `payments: []`, `total 0`, status `none`;
    - a match with `score_bonus 15` + `zero_faults 10` + `elite_player 20` (2 elite players) → one row, `total 45`;
    - mixed paid (`score_bonus` paid 15, `zero_faults` unpaid 10) → `paid 15`, `unpaid 10`, `partial`;
    - all paid → `paid`; none paid → `unpaid`;
    - `clean_sweep 10` included in the total;
    - payments ordered `score_bonus, zero_faults, elite_player, clean_sweep` regardless of input order;
    - matches sorted newest first, undated last.
  - `summarizeTrainerMatches`: sums `total/paid/unpaid` over rows including `0 €` rows; empty list → zeros.
- `components/money/TrainerMatchPayment.test.tsx` (dom project):
  - `0 €` rendered muted with no tooltip trigger;
  - `45 €` rendered; opening the tooltip with `fireEvent` shows each condition label with
    `15 €`, `10 €`, `20 €` and the right paid/unpaid text (read from `[data-base-ui-portal]`);
  - status badge: `Zaplatené`, `Nezaplatené`, `Zostáva 10 €`, and `-` for `none`;
  - unknown condition type renders the raw string.
- `components/money/TrainerPaymentSummary.test.tsx`: fixed props `{ total: 45, paid: 15, unpaid: 30 }`
  render `45 €`, `15 €`, `30 €` under their labels.
- `lib/match-money-actions.test.ts`: assert `revalidatePath('/[lang]/trainer/[id]', 'page')`.
- `locales/locales.test.ts` already guards key/placeholder parity for the new namespace.
Touches: the four test files above.

### ✓ Step 10: Run the quality check
`pnpm check` (lint + type check + tests) must pass with no errors and no `any`.

### ✓ Step 11: List upcoming fixtures like the player page (follow-up request)
- `getTrainerPaymentRows()` drops the "played or has a payment" filter, selects
  `(m.team_total_score IS NOT NULL) AS is_played`, and uses
  `leagueCondition(leagueKey, { includeUnassigned: true })` — the same condition as
  `getPlayerMissingMatches()`, so both pages list the same fixtures.
- `lib/trainer-matches.ts`: grouping is now `groupTrainerMatches()` (feeds
  `summarizeTrainerMatches()`); `buildTrainerMatchRows()` orders via `buildPlayerMatchRows()`
  — played matches newest first, then fixtures still ahead oldest first. A match holding a
  payment counts as played even without a score, so money never sits among the fixtures.
- Page renders `notPlayedYet` rows muted with `-` for team total and payment and the
  `playerDetail.notPlayedYet` pill in the status column, as on the player page.
- Tests: fixtures sort to the bottom oldest first, undated last; an unscored match with a
  payment stays among the played ones; the summary ignores fixtures.
- Verified read-only: for season 13 under every filter, the trainer's upcoming match ids equal
  the player page's, and the page total still equals the home card.
Touches: `lib/db-utils.ts`, `lib/trainer-matches.ts`, `lib/trainer-matches.test.ts`,
`components/money/TrainerMatchPayment.test.tsx`, `app/[lang]/trainer/[id]/page.tsx`.

# Testing

### Validation Approach

- **Automated**: `pnpm check` — ESLint (Airbnb), `tsc`, Vitest (node + dom projects), with the
  test files listed in Step 9.
- **Data check (read-only, not committed)**: for the current season and each filter
  (`all`, `interliga`, `turnaje`), compare the page's summary `total` with the home trainer
  card's `totalPaid` for the same filter, and spot-check two matches against
  `SELECT condition_type, amount, is_paid FROM trainer_payments WHERE user_id = … AND match_id = …`.
- **Manual flows** (`pnpm dev`, mobile viewport first, then desktop; light and dark mode):
  1. Home → tap the trainer card → lands on `/sk/trainer/<uuid>?season=…&league=…` with the filter preserved.
  2. Summary shows total / paid / remaining; the table lists every played match, newest first, `0 €` rows included.
  3. Tap an amount → tooltip lists conditions with amounts and paid states; it paints above the sticky filter.
  4. In `/admin/money/<matchId>` toggle one trainer payment paid → reload trainer page: the row turns
     `partial` / `paid` and the summary updates.
  5. Switch season and league in the filter → table and totals follow.
  6. `/sk/trainer/not-a-uuid` and a player's uuid → 404.
  7. Switch language (cs, hu, sr) → all labels translated, competition names localized.
- **Final step**: lint, type check, and the full test suite via `pnpm check`.
