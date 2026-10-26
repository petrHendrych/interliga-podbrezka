# Requirements

### Overview & Goals

The trainer detail page (`app/[lang]/trainer/[id]/page.tsx`) lists the trainer's payments only
as the "Platby za zápasy" table. This adds the same interactive line chart the player page got
in [`player-fine-chart.md`](player-fine-chart.md): **one point per match, showing what the
trainer owes for that match**. A trainer sees at a glance which matches cost them money, how
much, and what is still unpaid.

Both charts share one chart component, so the two pages look and behave the same and a future
fix lands in both.

### Scope

**In Scope**
- A shared, generic chart: `components/charts/MatchAmountChart.tsx` plus the db-free helpers in
  `lib/match-chart.ts`. The player chart (`components/player/PlayerFineChart.tsx`) is built on it
  too.
- A pure helper, `buildTrainerChartPoints()` (`lib/trainer-payment-chart.ts`), that turns the
  trainer's grouped matches into chart points.
- A client wrapper, `components/trainer/TrainerPaymentChart.tsx`, placed between the sticky
  season/league filter and the payments table card.
- A tooltip, `components/trainer/TrainerChartTooltip.tsx`, with the date, competition, match,
  total, paid status, and the per-condition breakdown.
- `TrainerPaymentBreakdown` split out of `TrainerMatchAmount`
  (`components/money/TrainerMatchPayment.tsx`), so the table cell and the chart tooltip render
  the same list.
- `isPastTrainerMatch()` exported from `lib/trainer-matches.ts`, so the chart and the table agree
  on which matches are behind us.
- One locale key, `trainerDetail.paymentChartTitle`, in `locales/{sk,cs,hu,sr}.json`.
- Unit tests for the helper and the tooltip.

**Out of Scope**
- Any change to how trainer payments are calculated (`recalculateDerivedFinancials()`,
  `trainer_payments`), to SQL, or to cached queries. The chart reuses the rows the page already
  loads (`getCachedTrainerPaymentRows`).
- One line per condition, cumulative totals, and a separate "paid" line.
- Fixtures still ahead. They hold no payment yet.
- Page-level or e2e tests, and rendering Recharts in jsdom.

### User Stories

- As a trainer, I open my detail page and see a line of what I owe match by match for the
  selected season and league, oldest on the left.
- On a phone, I tap a point and the tooltip shows the date · competition, the match, the total
  in €, its status (paid / unpaid / what is still owed), and which conditions make up the total
  (score bonus, zero faults, elite players, clean sweep).
- A played match where I owe nothing is a 0 € point with no status.
- If there are no dated matches behind us for the current filter, no chart card is shown.

# Technical Design

### Current Implementation

- `page.tsx` (server component) loads `paymentRows` through
  `getCachedTrainerPaymentRows(id, seasonId, leagueKey)`. `groupTrainerMatches()` turns them into
  one `TrainerMatchRow` per match (`total`, `paid`, `unpaid`, `status`, `payments[]`, `isPlayed`,
  `date`, `opponent`, `isHome`, `leagueId`, `leagueName`). `buildTrainerMatchRows()` orders them
  for the table.
- `TrainerMatchRow.status` is `'none' | 'paid' | 'unpaid' | 'partial'`, derived from the
  per-condition `is_paid` flags.
- The table's payment cell is `TrainerMatchAmount`. Its tooltip listed each condition inline.
- `buildTrainerMatchRows()` treated a match as "behind us" through a local `isPast` closure:
  `isPlayed || payments.length > 0`.

### Proposed Changes

#### 1. Shared chart helpers (`lib/match-chart.ts`)

```ts
export interface MatchChartPoint { matchId: number; amount: number; shortDateLabel: string }
export interface MatchChartFormatters<T> {
  date: (iso: string) => string;
  shortDate: (iso: string) => string;
  match: (row: T) => string;
  league: (row: T) => string;
}
export function datedOldestFirst<T extends DatedMatch>(rows: T[]): Array<T & { date: string }>;
```

`datedOldestFirst()` drops undated rows and sorts with `byDate('asc')` from
`lib/player-matches.ts`. `buildFineChartPoints()` and `buildTrainerChartPoints()` both use it.

#### 2. Shared chart component (`components/charts/MatchAmountChart.tsx`)

A `'use client'` generic `MatchAmountChart<T extends MatchChartPoint>({ title, points,
renderTooltip })`. It holds everything the two charts share: the card, the
`--decor-dot` colour, the X axis keyed by `matchId` with short-date ticks, € ticks on the Y axis
from 0, the monotone line with dots, and a tooltip that hands the hovered point to
`renderTooltip`. `PlayerFineChart` and `TrainerPaymentChart` only pass a title and their own
tooltip.

#### 3. Trainer points (`lib/trainer-payment-chart.ts`)

```ts
export function buildTrainerChartPoints(
  matches: TrainerMatchRow[],
  format: MatchChartFormatters<TrainerMatchRow>,
): TrainerChartPoint[] {
  return datedOldestFirst(matches.filter(isPastTrainerMatch)).map((m) => ({
    matchId: m.matchId,
    amount: m.total,
    status: m.status,
    unpaid: m.unpaid,
    payments: m.payments,
    dateLabel: format.date(m.date),
    shortDateLabel: format.shortDate(m.date),
    matchLabel: format.match(m),
    leagueLabel: format.league(m),
  }));
}
```

`amount` is `TrainerMatchRow.total`, the number the table's payment cell shows. The point
carries `status`, `unpaid` and `payments`, so the tooltip can reuse the table's components.

#### 4. "Behind us" (`lib/trainer-matches.ts`)

The `isPast` closure becomes the exported `isPastTrainerMatch()`, used by both
`buildTrainerMatchRows()` and the chart. An unscored match that already holds a payment is
plotted, just as the table lists it among the past matches.

#### 5. Tooltip (`components/trainer/TrainerChartTooltip.tsx`, `components/money/TrainerMatchPayment.tsx`)

- `TrainerPaymentBreakdown({ payments, labels })` is the per-condition list, extracted from
  `TrainerMatchAmount`, which now renders it inside its own tooltip.
- `TrainerMatchStatusBadge` takes `Pick<TrainerMatchRow, 'status' | 'unpaid'>`, so a chart
  point can be passed as is.
- The chart tooltip shows `date · league`, the match, then either the total + status badge +
  breakdown, or a muted `0 €` when nothing is owed.

#### 6. Page (`app/[lang]/trainer/[id]/page.tsx`)

Builds `chartPoints` from `matches` with `formatDateOnly`, `formatShortDate`, the page's
`matchLabel` and `leagueLabelForId`, and renders
`<TrainerPaymentChart points={chartPoints} labels={{ ...paymentLabels, title }} />` above the
payments card when `chartPoints.length > 0`.

#### 7. Locales (`locales/{sk,cs,hu,sr}.json`)

`trainerDetail.paymentChartTitle`: sk "Platby po zápasoch", cs "Platby po zápasech",
hu "Befizetések alakulása", sr "Kretanje uplata".

### Architecture Diagram

```mermaid
flowchart TD
  DB[(trainer_payments + matches)] --> Q[getCachedTrainerPaymentRows]
  Q --> P[trainer page.tsx — server]
  P --> G[groupTrainerMatches]
  G --> TBL[buildTrainerMatchRows → payments table]
  G --> B[buildTrainerChartPoints<br/>lib/trainer-payment-chart.ts]
  IP[isPastTrainerMatch] --> TBL
  IP --> B
  MC[datedOldestFirst<br/>lib/match-chart.ts] --> B
  B -->|TrainerChartPoint[]| C[TrainerPaymentChart — 'use client']
  C --> S[MatchAmountChart<br/>components/charts]
  PF[PlayerFineChart] --> S
  C --> T[TrainerChartTooltip]
  T --> BD[TrainerPaymentBreakdown + TrainerMatchStatusBadge]
  TBL --> BD
```

### Key Decisions

- **One shared chart, not a copy.** The player and trainer charts differ only in their points
  and tooltip, so `MatchAmountChart` takes a `renderTooltip` prop. A copied chart would drift
  the first time one of them is restyled.
- **Amount = `TrainerMatchRow.total`.** It equals the table's payment cell for the same match.
  A trainer's payments have no league-independent part (unlike the player's `streak_fine`), so
  no filter rule applies.
- **One line, with the breakdown in the tooltip.** A line per condition would be four mostly
  flat series at 0 on a phone. The tooltip already says which conditions make up the total.
- **"Behind us" shared with the table** through `isPastTrainerMatch()`, so a match never shows
  in the table as past but stays missing from the chart, or the other way round.
- **Played matches with nothing owed stay as 0 € points.** Unlike the player chart, where a
  missing row means the player sat out, every played match is the trainer's match.
- **Tooltip reuses the table's components**, so labels, status colours and wording match.

### Edge Cases / Risks

- Partly paid match: the status badge shows what is still owed (`unpaid`), not the total.
- Unscored match with a payment (rare, half-scraped): plotted, same as in the table.
- Undated match: dropped from the chart, still in the table.
- Two trainers: each page charts only its own trainer's rows. The query is already per
  trainer.
- Bundle: Recharts now loads on both the player and the trainer pages, the only client importers
  of `MatchAmountChart`.
- Colour, contrast, touch and z-index behave as in the player chart (see its Edge Cases).

# Delivery Steps

### ✓ Step 1: Extract the shared chart
Move the chart body out of `PlayerFineChart` into `MatchAmountChart`, and add `lib/match-chart.ts`.
Touches: `components/charts/MatchAmountChart.tsx`, `lib/match-chart.ts`,
`components/player/PlayerFineChart.tsx`, `lib/player-fine-chart.ts`.

### ✓ Step 2: Share "behind us"
Export `isPastTrainerMatch()` and use it in `buildTrainerMatchRows()`.
Touches: `lib/trainer-matches.ts`.

### ✓ Step 3: Add `buildTrainerChartPoints` with tests
Touches: `lib/trainer-payment-chart.ts`, `lib/trainer-payment-chart.test.ts`.

### ✓ Step 4: Split out the payment breakdown and build the tooltip with tests
Touches: `components/money/TrainerMatchPayment.tsx`, `components/trainer/TrainerChartTooltip.tsx`,
`components/trainer/TrainerChartTooltip.test.tsx`.

### ✓ Step 5: Add `TrainerPaymentChart` and the locale key
Touches: `components/trainer/TrainerPaymentChart.tsx`, `locales/{sk,cs,hu,sr}.json`.

### ✓ Step 6: Wire it into the trainer page
Touches: `app/[lang]/trainer/[id]/page.tsx`.

### Step 7: Check it in the browser
Manual flow from Testing, on a phone width, in light and dark mode.

### ✓ Step 8: Final quality check
`pnpm check` (lint + type check + tests) and `pnpm build` pass.

# Testing

### Validation Approach

**Unit tests (Vitest)**
- `lib/trainer-payment-chart.test.ts` (node):
  - every payment of a match sums into one point (`total`);
  - a played match without a payment is a 0 € point with status `none`;
  - paid flags `[true, true]` / `[false, false]` / `[true, false]` carry status `paid` /
    `unpaid` / `partial`, with 0 / 25 / 10 € still owed;
  - fixtures still ahead are left out;
  - an unscored match that already holds a payment is kept, like the table keeps it;
  - points come out oldest first, and a match without a date is dropped;
  - each label goes through the injected formatters;
  - no matches give no points.
- `components/trainer/TrainerChartTooltip.test.tsx` (dom):
  - date, competition and match are shown;
  - a match with no payment reads `0 €` and has no status;
  - the total and each condition behind it are shown;
  - a fully paid match reads as paid;
  - a partly paid match shows what is still owed.
- The existing trainer table tests keep passing after the `TrainerPaymentBreakdown` split and
  the `isPastTrainerMatch` extraction.

**Manual flow** (`pnpm dev`, phone width, light and dark mode)
1. A trainer page, current season, "all" filter: the chart sits between the filter and the
   payments table, oldest match on the left, with € ticks on the Y axis.
2. Tap a point that has payments: the tooltip shows the total, the status and the condition
   list. They match that match's cell in the table.
3. Tap a point at 0 €: muted `0 €`, no status.
4. Switch the league filter: the chart follows it. A filter with no matches behind us shows no
   chart card.

**Final check**: `pnpm check` and `pnpm build` pass.
