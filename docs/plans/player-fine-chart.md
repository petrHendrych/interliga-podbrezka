# Requirements

### Overview & Goals

The player detail page (`app/[lang]/player/[id]/page.tsx`) lists the player's matches only as a
table. We are adding an interactive line chart above that table: **one point per match, showing
the fine the player owes for that match**. Players can see at a glance which matches cost them
money, and how much.

It is built on the shadcn **chart** component (Recharts), modelled on
<https://ui.shadcn.com/charts/line#charts> ("Line Chart – Interactive" look: hover/tap cursor,
active dot, rich tooltip), and coloured with the logo's line colour (`--decor-dot`).

### Scope

**In Scope**
- Add the shadcn `chart` component (`components/ui/chart.tsx`) and the `recharts` dependency.
- A pure, db-free helper that turns the player's match results into chart points.
- A short-date formatter (`dd.MM.`) for the X axis ticks.
- A client chart component inside its own `Card`, full content width, placed between the sticky
  season/league filter and the "Výsledky zápasov" table card.
- A tooltip showing the date, competition, match, the amount, and whether it is paid (plus the
  existing "Striedal" pill for a substitute's minor row).
- One new locale key (card title) in `locales/{sk,cs,hu,sr}.json`.
- Unit tests for the helper, the date formatter and the tooltip body.

**Out of Scope**
- Bonuses (no second series, no shadcn toggle header).
- Running totals, or a separate "paid" line. There is no payment date, only `is_paid`.
- Matches the player sat out, and fixtures still ahead. Neither has a result row, so neither is
  plotted.
- Any change to money calculation, SQL, or cached queries. The chart reuses the data the page
  already loads (`getCachedPlayerMatchResults`).
- Page-level or e2e tests, and rendering Recharts in jsdom.

### User Stories

- As a player, I open my detail page and see a line of my fines match by match for the selected
  season and league, oldest on the left.
- As a player on a phone, I tap a point and a tooltip shows: date · competition, the match
  ("vs X (doma)"), the amount in € and "Zaplatené" / "Nezaplatené" ("Bez pokuty" at 0 €).
- The line is the logo's red in light mode and the logo's blue-grey in dark mode.
- The Y axis shows € ticks; the X axis shows sparse short dates that never overlap on mobile.
- If the player has no dated result rows for the current filter, no chart card is shown.

# Technical Design

### Current Implementation

- `page.tsx` (server component) loads `matchFines: PlayerMatchResult[]` via
  `getCachedPlayerMatchResults(playerId, seasonId, leagueKey)` (`lib/db-utils.ts:553`). The rows
  are ordered `m.date DESC` and carry `calculatedFine`, `streakFine`, `isPaid`,
  `substitutionRole`, `date` (ISO), `opponent`, `isHome`, `leagueId` and `leagueName`.
- The table's "Pokuta" cell (`components/MatchFineTooltip.tsx`) shows
  `calculatedFine + streakFine` for every row, under every league filter.
- `lib/player-matches.ts` has a private `byDate('asc' | 'desc')` comparator that puts undated
  rows last.
- Date formatting lives in `lib/dates.ts` (`formatDateOnly(date, lang)`, Bratislava timezone).
  It is re-exported through `lib/home-helpers.ts`.
- Labels: `leagueLabelForId(leagueId, leagueName, dict)` (`lib/i18n/league-labels.ts`). The
  page's local `matchLabel(opponent, isHome)` builds the match text from `dict.playerDetail.matchHome/matchAway`.
- Theme: `next-themes` with `attribute="class"`. `--decor-dot` is `oklch(0.72 0.15 24)` in
  light mode and `oklch(0.68 0.055 265.755)` in dark mode (`app/globals.css:70,123`). It is the
  colour of the logo lines in `components/layout/BrandTitle.tsx`.
- No chart component and no `recharts` dependency exist yet. shadcn registry `chart` for
  `base-nova` pulls in `recharts@3.8.0` and depends on `card`, which is already present.
- ESLint (Airbnb) also lints `components/ui/**`; existing ui files are in Airbnb style (single
  quotes, semicolons).

### Proposed Changes

#### 1. Chart primitive (`components/ui/chart.tsx`, `package.json`, `pnpm-lock.yaml`)

- Run `pnpm dlx shadcn@latest add chart`, which adds `recharts@3.8.0` and writes
  `components/ui/chart.tsx`.
- Reformat it to the repo's Airbnb style (`pnpm lint --fix`, then fix by hand what remains, e.g.
  `react/no-array-index-key`, `no-nested-ternary`). Fix it in code where possible. Use a single
  `eslint-disable-next-line` only where the rule cannot be satisfied (`react/no-danger` on
  `ChartStyle`'s injected `<style>`, which is shadcn's theming mechanism).
- Otherwise leave its behaviour unchanged.

#### 2. Short date (`lib/dates.ts`, re-export in `lib/home-helpers.ts`)

```ts
export function formatShortDate(dateString: string, lang: string): string {
  try {
    const date = parseUtcDate(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return new Intl.DateTimeFormat(lang, {
      timeZone: 'Europe/Bratislava',
      day: 'numeric',
      month: 'numeric',
    }).format(date);
  } catch {
    return dateString;
  }
}
```

#### 3. Chart points (`lib/player-fine-chart.ts` — new, db-free)

It has no import path to `lib/db.ts` (Client/Server Boundary): the source type is declared
structurally, so it does not import `PlayerMatchResult` from `db-utils`.

```ts
export interface FineChartSource {
  matchId: number;
  date: string | null;
  calculatedFine: number;
  streakFine: number;
  isPaid: boolean;
  substitutionRole?: 'major' | 'minor' | null;
}

export interface FineChartPoint {
  matchId: number;
  fine: number;
  isPaid: boolean;
  isSubstitution: boolean;
  dateLabel: string;
  shortDateLabel: string;
  matchLabel: string;
  leagueLabel: string;
}

export interface FineChartFormatters<T> {
  date: (iso: string) => string;
  shortDate: (iso: string) => string;
  match: (row: T) => string;
  league: (row: T) => string;
}

export function buildFineChartPoints<T extends FineChartSource>(
  results: T[],
  format: FineChartFormatters<T>,
): FineChartPoint[]
```

- Drop rows without a date, because they cannot be placed on a time axis.
- Sort ascending by date. Reuse `byDate`, exported from `lib/player-matches.ts` instead of being
  duplicated.
- `fine = Math.round((calculatedFine + streakFine) * 100) / 100`. This is the same per-match
  debt the table's "Pokuta" cell shows, and it avoids float noise such as `0.34 + 5`.
- `isSubstitution = substitutionRole === 'minor'`.
- The labels are already formatted on the server, so the client component receives plain
  strings and needs neither `dict`, `lang` nor any server module.

#### 4. Tooltip body (`components/player/FineChartTooltip.tsx` — new)

A presentational component that takes `{ point: FineChartPoint; labels: { paidStatus; unpaidStatus; noFine; substitution } }`
and renders, in the shadcn tooltip style
(`grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl`):
- Line 1 (muted): `{dateLabel} · {leagueLabel}`.
- Line 2 (medium): `{matchLabel}`, plus the "Striedal" pill (same classes as the table's
  substitution pill) when `isSubstitution`.
- Line 3: `{fine} €` in `font-mono tabular-nums`, followed by `(Zaplatené)` in emerald or
  `(Nezaplatené)` in red, using the colour classes from `MatchFineTooltip`. When `fine === 0`
  it shows `0 €` in muted text with `labels.noFine` and no paid status.

#### 5. Chart (`components/player/PlayerFineChart.tsx` — new, `'use client'`)

```tsx
const chartConfig = {
  fine: { label: title, color: 'var(--decor-dot)' },
} satisfies ChartConfig;
```

`--decor-dot` already switches between light and dark, so a single `color` is enough and no
`theme` map is needed.

```tsx
<Card>
  <CardHeader><CardTitle>{labels.title}</CardTitle></CardHeader>
  <CardContent className="px-2 sm:px-6">
    <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[260px]">
      <LineChart data={points} margin={{ left: 0, right: 12, top: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="matchId"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(id) => shortDateById.get(id) ?? ''}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickFormatter={(v: number) => `${v} €`}
          allowDecimals={false}
          domain={[0, 'auto']}
        />
        <ChartTooltip
          cursor={{ strokeDasharray: '4 4' }}
          content={({ active, payload }) => (active && payload?.[0]
            ? <FineChartTooltip point={payload[0].payload as FineChartPoint} labels={labels} />
            : null)}
        />
        <Line
          dataKey="fine"
          type="monotone"
          stroke="var(--color-fine)"
          strokeWidth={2}
          dot={{ r: 2.5, fill: 'var(--color-fine)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ChartContainer>
  </CardContent>
</Card>
```

- The X axis is keyed on `matchId`, not the date, so two matches on the same day (tournament
  days) stay separate points. `shortDateById` is a `Map` built with `useMemo` from the points.
- The exact Recharts 3 types for `content` / `payload` are checked against
  `node_modules/recharts` at implementation time; no `any`.

#### 6. Page wiring (`app/[lang]/player/[id]/page.tsx`)

```tsx
const finePoints = buildFineChartPoints(matchFines ?? [], {
  date: (iso) => formatDateOnly(iso, lang),
  shortDate: (iso) => formatShortDate(iso, lang),
  match: (r) => matchLabel(r.opponent, r.isHome),
  league: (r) => leagueLabelForId(r.leagueId, r.leagueName, dict),
});
```

Render `{finePoints.length > 0 ? <PlayerFineChart points={finePoints} labels={...} /> : null}`
right after the sticky filter `div` and before the table `Card`, wrapped so the gap matches the
page rhythm (`mb-8`). The labels are `title: dict.playerDetail.fineChartTitle`, `paidStatus`,
`unpaidStatus`, `noFine` and `substitution`, all taken from `dict.playerDetail`.

#### 7. Locales (`locales/{sk,cs,hu,sr}.json`)

New key `playerDetail.fineChartTitle`:
- sk: `Pokuty po zápasoch`
- cs: `Pokuty po zápasech`
- hu: `Büntetések meccsenként`
- sr: `Kazne po utakmicama`

Added through the `translations` skill. `locales/locales.test.ts` guards key parity. Restart
`pnpm dev` afterwards, because new keys read as undefined until then.

### Architecture Diagram

```mermaid
flowchart TD
  DB[(match_player_results + matches)] --> Q[getCachedPlayerMatchResults<br/>lib/db-utils.ts]
  Q --> P[page.tsx — server]
  P -->|results + formatters| B[buildFineChartPoints<br/>lib/player-fine-chart.ts]
  D[formatDateOnly / formatShortDate<br/>lib/dates.ts] --> B
  L[leagueLabelForId / matchLabel] --> B
  B -->|FineChartPoint[] plain strings + numbers| C[PlayerFineChart — 'use client']
  C --> UI[components/ui/chart.tsx<br/>Recharts LineChart]
  C --> T[FineChartTooltip]
  P --> TBL[Matches table — unchanged]
```

### Key Decisions

- **Per-match value, not cumulative.** Your call. Each point is that match's fine.
- **Value is `calculatedFine + streakFine` under every filter.** It equals the row's "Pokuta"
  cell. The rule that leaves `streak_fine` out of league-filtered **sums** (`fineAmount()`)
  does not apply, because a point is one row, not a sum. Alternative: drop `streakFine` under
  a league filter. That would make the chart disagree with the table cell for the same match.
- **Fines only.** No bonus series, so no shadcn toggle header. "Interactive" means the hover/tap
  cursor, the active dot and the rich tooltip.
- **Sat-out and upcoming matches are skipped.** A 0 € point would read as "clean match".
- **Colour = `var(--decor-dot)`.** One token gives the logo's red in light mode and its
  blue-grey in dark mode, so it stays matched to the logo if the logo token changes.
- **Labels formatted on the server.** The client component gets plain data, which keeps it free
  of `dict`/`lang` and of any module that might reach `lib/db.ts`.
- **X axis keyed by `matchId`.** Two matches on one date never merge into a single point.
- **Monotone curve plus small dots.** It has the shadcn look, the dots keep discrete matches
  visible, and monotone interpolation never dips below 0.

### Edge Cases / Risks

- Single point: Recharts draws only the dot. That's acceptable.
- All 0 €: a flat line at 0, with the domain `[0, 'auto']` so the axis still shows `0 €`.
- Fractional amounts (substitution shares such as `0.34`): the Y ticks stay integers
  (`allowDecimals={false}`), and the tooltip shows the exact amount.
- Undated rows are dropped from the chart. They are rare (half-scraped) and still appear in the
  table.
- `--decor-dot` red at L 0.72 on a white card is about 2.6:1 contrast, just under the 3:1
  guideline for graphics. This is accepted to match the logo. The tooltip carries the numbers.
- Recharts touch: a tap opens the tooltip in Recharts 3, so no hover is needed. The tooltip is
  rendered inside the chart wrapper, not portalled, so the sticky filter's z-index does not
  cover it.
- The shadcn `ChartStyle` themes via `.dark`, which matches `attribute="class"`. Not needed
  here anyway, since the colour is a CSS variable.
- Bundle: Recharts loads only on the player and trainer pages. Since
  [`trainer-payment-chart.md`](trainer-payment-chart.md), both charts are built on the shared
  `components/charts/MatchAmountChart.tsx`, and that is its only client importer.

# Delivery Steps

### ✓ Step 0: Rename this plan to `docs/plans/player-fine-chart.md`
Touches: this file.

### ✓ Step 1: Add the shadcn chart component
`pnpm dlx shadcn@latest add chart`, then reformat to Airbnb style.
Touches: `components/ui/chart.tsx`, `package.json`, `pnpm-lock.yaml`.
Verify: `pnpm lint` and `pnpm tsc --noEmit` clean for the file.

### ✓ Step 2: Add `formatShortDate` with tests
Touches: `lib/dates.ts`, `lib/home-helpers.ts` (re-export), `lib/dates.test.ts`.

### ✓ Step 3: Add `buildFineChartPoints` with tests (tests first)
Export `byDate` from `lib/player-matches.ts`.
Touches: `lib/player-fine-chart.ts`, `lib/player-fine-chart.test.ts`, `lib/player-matches.ts`.

### ✓ Step 4: Add the locale key
Touches: `locales/{sk,cs,hu,sr}.json`.

### ✓ Step 5: Build `FineChartTooltip` with tests
Touches: `components/player/FineChartTooltip.tsx`, `components/player/FineChartTooltip.test.tsx`.

### ✓ Step 6: Build `PlayerFineChart`
Touches: `components/player/PlayerFineChart.tsx`.

### Step 7: Wire it into the player page
Touches: `app/[lang]/player/[id]/page.tsx`.
Verify: manual check in the browser (see Testing).

### ✓ Step 8: Final quality check
`pnpm check` (lint + type check + tests) passes with no errors or warnings.

# Testing

### Validation Approach

**Unit tests (Vitest)**
- `lib/dates.test.ts` covers `formatShortDate`:
  - sk / cs / hu / sr output for a fixed date;
  - a late-evening UTC timestamp that is already the next day in Bratislava, on both DST
    switch days;
  - an invalid string returned unchanged.
- `lib/player-fine-chart.test.ts` (node), table-driven:
  - `fine = calculatedFine + streakFine` (5 + 10 → 15) and fractional shares
    (`0.34 + 0` → 0.34; `0.1 + 0.2` → 0.3);
  - a 0 € row stays a point with `fine: 0`;
  - DESC input comes out ASC; rows with a `null` date are dropped;
  - two rows on the same date both kept, in a stable order;
  - `substitutionRole: 'minor'` → `isSubstitution: true`, while `'major'` / `null` → false;
  - `isPaid` passed through;
  - the formatters are called with the row's ISO date and the row itself, and their output
    lands in the labels.
- `components/player/FineChartTooltip.test.tsx` (dom), queried by visible text:
  - an unpaid `5 €` row shows "5 €" and "Nezaplatené";
  - a paid row shows "Zaplatené";
  - a `15 €` row (calculated 5 + streak 10) shows "15 €", the sum;
  - a 0 € row shows "0 €" and "Bez pokuty", with no paid status;
  - a fractional `0.34 €` row is exact;
  - a substitution row shows the "Striedal" pill;
  - the date, competition and match labels are rendered.
- `locales/locales.test.ts` (existing) keeps the four locale files in key parity.

**Manual flows** (`pnpm dev`, phone-width viewport first, then desktop):
1. Open `/sk/player/<id>` for a player with several fines. The card sits between the filter and
   the table, full width, and the line is red in light mode.
2. Toggle dark mode: the line turns blue-grey to match the header logo lines, on the
   `bg-slate-950` background.
3. Tap or hover points: the tooltip shows date · competition, match, amount and paid status.
   A 0 € match shows "Bez pokuty".
4. Compare 3–4 points with the table's "Pokuta" cells for the same matches; the amounts are equal.
5. Switch season and league: the chart updates, and a filter with no results hides the card.
6. On a narrow phone, the X ticks do not overlap and nothing scrolls horizontally.
7. Check a season with a substitution row: the tooltip shows "Striedal" and the substitute's
   own fine.

**Final check:** `pnpm check` (lint + type check + full test suite) must pass.
