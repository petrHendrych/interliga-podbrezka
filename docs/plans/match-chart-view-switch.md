# Requirements

Changelog: feature (all) — extends the unreleased entry `2026-10-26-match-money-chart` once the
developer has approved the result in the browser.

### Overview & Goals

The money chart on the player and trainer pages gets a **view switch** in its card header:
"Pokuty" / "Výkon" (trainer "Platby" / "Výkon tímu"). It works like the league tabs and
changes what the one line plots without the card changing size. The fines line is now
coloured by payment status. This builds on `docs/plans/match-chart-tooltip-score.md`; the
score stays in the tooltip in both views.

### Scope

**In Scope**
- A view switch: two pills in the league-tab style at every width. A phone dropdown was
  dropped once the title went and the pills fit.
- The card has no title: the switch sits at the top left, where the title was (changed after
  the browser review).
- The fines line:
  - each segment takes the payment state of the match it leaves (green paid or nothing owed,
    red unpaid, amber partly paid);
  - each dot has its own match's state.
- The score line in sky blue, with the Y axis zoomed and null scores bridged.
- A key row under the chart: the payment states in the fines view, "Výkon" in the score view.
- New locale keys in sk/cs/hu/sr.

**Out of Scope**
- Keeping the view in the URL or across reloads. It is page state only and resets to fines.
- Threshold lines.

### Functional Requirements
- The fines view is the default.
- The card and chart keep their size in both views:
  - the chart height is fixed (`h-[200px] sm:h-[240px]`);
  - the key row has a fixed height.
- Every match keeps its X position in both views.
- Colours are the table's status colours: emerald/red/amber 600 in light mode, 400 in dark mode.
  The score is sky `oklch(0.588 0.158 241.966)` in both modes.
- The tooltip is unchanged.

# Technical Design

### Current Implementation
`MatchAmountChart` draws one `amount` line in `--decor-dot`. The wrappers pass the title in
their labels.

### Proposed Changes

#### 1. `lib/match-chart.ts`
- New types `MatchPaymentState` (`'paid' | 'unpaid' | 'partial'`; "paid" also means nothing
  owed) and `MatchChartView` (`'amount' | 'score'`).
- `MatchChartPoint` gains `score` and `paymentState`.
- `paymentStateRuns(states)` returns the coloured runs as fractions of the first-to-last span:
  - segment *i* takes `states[i]`;
  - equal neighbours merge;
  - the last match starts no segment.

#### 2. Points
- Player: `paymentState = amount > 0 && !isPaid ? 'unpaid' : 'paid'`.
- Trainer: `PAYMENT_STATE[status]`, mapping none/paid → paid, unpaid → unpaid, partial → partial.

#### 3. Tokens (`app/globals.css`)
`--chart-paid`, `--chart-unpaid`, `--chart-partial` and `--chart-score` for light and dark.

#### 4. `components/charts/MatchAmountChart.tsx`
- `labels: MatchChartLabels`, with `view`, `views`, `paid`, `unpaid` and an optional `partial`.
- `useState<MatchChartView>('amount')`.
- `PaymentStateGradient`:
  - a chart child that reads `useXAxisScale()`;
  - draws a `userSpaceOnUse` gradient from the first to the last match's X, with hard stops
    per run;
  - a bounding-box gradient would vanish on a flat line, whose box has no height.
- `PaymentStateDot` is passed to `dot` / `activeDot` as an element.
- Score `Line`: `connectNulls`, Y domain `['auto', 'auto']`.
- `ViewSwitch` is the only thing in `CardHeader`; `ChartKey` sits under the chart.

#### 5. Wrappers and pages
`PlayerFineChart` / `TrainerPaymentChart` take `labels` (tooltip) and `chartLabels`. The pages
build both.

#### 6. Locales
- `playerDetail`: `chartFines`, `chartScore`, `chartView`.
- `trainerDetail`: `chartPayments`, `chartScore`, `partlyPaid`.
- Removed with the title: `playerDetail.fineChartTitle` and `trainerDetail.paymentChartTitle`.

### Architecture Diagram

```mermaid
flowchart TD
  P[page.tsx] -->|points + labels + chartLabels| W[PlayerFineChart / TrainerPaymentChart]
  W --> C[MatchAmountChart — view state]
  C --> S[ViewSwitch: two pills]
  C -->|amount| A[Line stroke=url(#gradient), PaymentStateDot]
  A --> G[PaymentStateGradient — useXAxisScale + paymentStateRuns]
  C -->|score| B[Line sky, connectNulls]
  C --> K[ChartKey]
```

### Key Decisions
- **A switch instead of two series**: two stacked panels looked bad in the browser.
- **The segment takes the state of the match it leaves**: that was the developer's rule.
  0 € counts as green ("nothing owed").
- **Pixel-space gradient** rather than per-state `Line`s: it keeps one smooth curve with no
  joins, and it works on flat lines.

### Edge Cases / Risks
- A single match: no gradient; only its dot shows its state.
- All matches in the same state: one run, so a single colour.
- The longest pill pair, the Hungarian trainer's "Befizetések" / "Csapatteljesítmény", is
  about 210 px of the roughly 296 px a 360 px phone leaves inside the card.

# Delivery Steps

### ✓ Step 1: Series model and runs, with tests
`lib/match-chart.ts`, `lib/match-chart.test.ts`.

### ✓ Step 2: Payment state on the points, with tests
`lib/player-fine-chart.ts` + test, `lib/trainer-payment-chart.ts` + test.

### ✓ Step 3: Colour tokens
`app/globals.css`.

### ✓ Step 4: Chart, switch, gradient, key, with a DOM test
`components/charts/MatchAmountChart.tsx` + test, both wrappers.

### ✓ Step 5: Locales and pages
`locales/{sk,cs,hu,sr}.json`, `app/[lang]/player/[id]/page.tsx`, `app/[lang]/trainer/[id]/page.tsx`.

### ✓ Step 6: Final quality check
`pnpm check`.

# Testing

### Validation Approach
- `lib/match-chart.test.ts`:
  - `paymentStateRuns`: none, one, two, an unpaid lead-in, a last match that colours nothing,
    merged runs, partly paid;
  - `scoreOrNull`.
- Point tests: player unpaid / paid / 0 € / fractional; trainer none / paid / unpaid / partial.
- `components/charts/MatchAmountChart.test.tsx`:
  - opens on fines;
  - the key lists the states;
  - switching moves the pills and the key together;
  - switching back works;
  - partly paid appears in the key only when passed;
  - the gradient stops for an unpaid → paid pair.
- Manual (the developer, after restarting `pnpm dev`):
  - phone and desktop widths, light and dark;
  - the switch doesn't move the card;
  - segment colours match the table's paid status;
  - the score view bridges substitution gaps.
- Final: `pnpm check`.
