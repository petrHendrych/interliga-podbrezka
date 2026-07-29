---
sessionId: session-260729-122617-37s0
---

# Requirements

### Overview & Goals
The goal is to provide a financial overview of the "team bank" on the main dashboard and ensure all payments (fines and bonuses) are tracked accurately. This includes showing current liquidity (paid fines - paid bonuses) and projected total (all fines - all bonuses), highlighting the next "pickup" date, and providing tools for admins to mark payments as paid.

### Scope
- **In Scope**:
  - Tracking payout status for player bonuses (`is_bonus_paid`).
  - Calculation of bank balances (actual and grand total) from database views, respecting payment status.
  - Identification of the next home match for the "next pickup" notification.
  - New UI section in the dashboard with mobile-first design.
  - CLI tools and Agent Skill updates to manage payment statuses for players and trainers.
  - Multi-language support for the new section.
- **Out of Scope**:
  - Detailed bank statement view.

### User Stories
- As a player/trainer, I want to see the total amount of money in the team bank so that I know how much we have for team events.
- As a player, I want to see when the next payment is due so that I can prepare the cash.
- As an admin, I want to mark player fines, player bonuses, and trainer payments as "paid" so the bank balance is accurate.
- As an admin, I want the system to automatically reflect bonuses (like scoring > 700) in the bank balance only when they are actually paid out.

# Technical Design

### Current Implementation
- `view_user_balances` in PostgreSQL provides a per-user summary of `total_due`, `total_paid`, and `total_bonuses`.
- `fetchHomeData` in `lib/home-helpers.ts` aggregates data for the dashboard but currently lacks bank-wide totals.
- The dashboard in `app/[lang]/page.tsx` uses Tailwind CSS and Radix UI components (via Shadcn/UI).

### Proposed Changes
#### 1. Data Layer (`lib/db-utils.ts`)
- Update `ensureSchema()` to:
  - Add `is_bonus_paid` column (boolean, default false) to `match_player_results`.
  - Update `view_user_balances` to include `paid_bonuses`.
- Update `PlayerMatchResult` interface to include `isBonusPaid`.
- Add a new helper function `getTeamBankBalance()`:
```typescript
export async function getTeamBankBalance(): Promise<{ actual: number; total: number }> {
  const result = await sql`
    WITH player_totals AS (
      SELECT 
        SUM(CASE WHEN is_paid THEN calculated_fine ELSE 0 END) as paid_fines,
        SUM(calculated_fine) as all_fines,
        SUM(CASE WHEN is_bonus_paid THEN bonus_received ELSE 0 END) as paid_bonuses,
        SUM(bonus_received) as all_bonuses
      FROM match_player_results
    ),
    trainer_totals AS (
      SELECT
        SUM(CASE WHEN is_paid THEN amount ELSE 0 END) as paid_payments,
        SUM(amount) as all_payments
      FROM trainer_payments
      WHERE condition_type != 'elite_player'
    )
    SELECT 
      (COALESCE(p.paid_fines, 0) + COALESCE(t.paid_payments, 0) - COALESCE(p.paid_bonuses, 0))::numeric as actual,
      (COALESCE(p.all_fines, 0) + COALESCE(t.all_payments, 0) - COALESCE(p.all_bonuses, 0))::numeric as total
    FROM player_totals p, trainer_totals t
  `;
  
  return {
    actual: Number(result[0].actual || 0),
    total: Number(result[0].total || 0),
  };
}
```
*Note: We exclude 'elite_player' payments as they are handled directly from trainer to player.*

#### 2. Business Logic & CLI
- Update `lib/special-misses.ts` and `scripts/update-special-misses.ts` to support marking player fines and bonuses as paid.
- Add `lib/trainer-payments.ts` and `scripts/update-trainer-payments.ts` to manage trainer payment status.

#### 3. Agent Skill Update
- Update `.junie/skills/manage-match-results-and-payments/SKILL.md` to:
  - Include questions for "Is fine paid?" and "Is bonus paid?".
  - Add a new section for marking Trainer Payments as paid.

#### 4. Home Data (`lib/home-helpers.ts`)
- Extend `FetchDataResult` with `bankBalance` and `nextHomeMatchDate`.
- Update `fetchHomeData` to find the next home match and fetch bank balance.

#### 5. User Interface (`app/[lang]/page.tsx`)
- Add a new section using `Card` and `Separator`.
- Display two columns for "Actual real money" and "Grand total money".
- Use `AlertTriangle` icon from `lucide-react` for the next pickup warning.
- Style the balances with green/red colors depending on whether they are positive or negative.

### Architecture Diagram
```mermaid
graph TD
    DB[(PostgreSQL)] --> View[view_user_balances]
    View --> DBUtils[lib/db-utils.ts: getTeamBankBalance]
    Scraped[Scraped Data] --> HH[lib/home-helpers.ts: fetchHomeData]
    DBUtils --> HH
    HH --> Page[app/[lang]/page.tsx]
    Page --> UI[Team Bank Card]
```

### Risks
- **Direct Trainer Bonus**: We've explicitly excluded the 10€ trainer bonus for >700 scores as per user instructions, ensuring it doesn't inflate the bank balance.
- **Bonus Payout Transparency**: We assume all bonuses are "paid out" (subtracted from bank) as soon as they are recorded in the system.
- **Data Freshness**: The next pickup date depends on the `match_list` being up-to-date.

# Testing

### Validation Approach
- Verify calculations by comparing the dashboard totals with manual sums from the `match_player_results` and `trainer_payments` tables.
- Verify that scoring > 700 correctly deducts the bonus from the bank balance (simulated via test data if possible).
- Check that the "Next Pickup" date correctly identifies the first *home* match, skipping any intervening *away* matches.
- Ensure the UI looks correct on both mobile and desktop screens.
- Test language switching to ensure all new strings are translated.

# Delivery Steps

### ✓ Step 1: Update database schema and calculation logic
The database is updated with new columns and views to support payment tracking, and the calculation logic is implemented.

- Update `ensureSchema` in `lib/db-utils.ts` to add `is_bonus_paid` to `match_player_results`.
- Update `view_user_balances` definition in `ensureSchema` to track `paid_bonuses`.
- Run `ensureSchema()` via a temporary script or by triggering a sync to apply changes.
- Update `PlayerMatchResult` interface and its mapping in `getPlayerMatchResultsByExternalId`.
- Implement `getTeamBankBalance` in `lib/db-utils.ts` using the updated logic (Actual = Paid Fines + Paid Trainer - Paid Bonuses).

### ✓ Step 2: Update payment management logic and CLI scripts
CLI tools and underlying logic are updated to allow admins to mark fines and bonuses as paid.

- Update `lib/special-misses.ts` and `scripts/update-special-misses.ts` to handle `is_paid` and `is_bonus_paid`.
- Create `lib/trainer-payments.ts` and `scripts/update-trainer-payments.ts` for managing trainer payment status.

### ✓ Step 3: Update the Agent Skill for managing match results and payments
The `manage-match-results-and-payments` skill is enhanced to cover all payment types and player bonuses.

- Modify `.junie/skills/manage-match-results-and-payments/SKILL.md` to:
  - Rename/Refactor it into a more general "Manage Match Results and Payments" skill.
  - Add steps to iterate over players and ask: "Has the fine been paid?" and "Has the bonus been paid?".
  - Add a new section for Trainers to ask: "Has the trainer payment for this match been paid?".
  - Guide the agent to use the updated CLI scripts (`update-special-misses.ts` and `update-trainer-payments.ts`).

### ✓ Step 4: Update home data fetching
Backend helpers are updated to provide bank balance and next home match info to the frontend.

- Update the `FetchDataResult` interface and the `fetchHomeData` function in `lib/home-helpers.ts`.
- Add `bankBalance` and `nextHomeMatch` to `FetchDataResult`.
- In `fetchHomeData`, call `getTeamBankBalance`.
- Filter the sorted `teamMatches` to find the first match where `homeId` matches the team ID and the date is in the future.

### ✓ Step 5: Add translations for the new Team Bank section
Localized strings are added for all supported languages.

- Add new translation keys to `locales/sk.json`, `locales/cs.json`, `locales/hu.json`, and `locales/sr.json`.
- Add `bank` section to `home` with `title`, `actualBalance`, `grandTotal`, and `nextPickup` keys.

### ✓ Step 6: Implement the Team Bank UI in the dashboard
The dashboard UI is updated with the new Team Bank section, following mobile-first design.

- Modify `app/[lang]/page.tsx` to display the Team Bank section.
- Insert a new `Card` between the "Next Match" and the player list.
- Use a `Separator` to divide it from the next match section.
- Display "Actual real money" and "Grand total money" in two columns.
- Add a warning-styled row (using amber colors and an icon) showing the next pickup date based on the next home match.