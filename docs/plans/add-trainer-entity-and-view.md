---
sessionId: session-260728-223932-1tns
---

# Requirements

### Overview & Goals
The goal is to introduce a 'trainer' entity into the system. Unlike players who are scraped from external data, trainers are managed manually. The trainer will be displayed on the homepage with a unique card layout that highlights their specific performance metrics (team score achievements and zero-fault matches) and total fines owed to the team.

### Scope
- **In Scope**:
    - Database support for trainer roles (already exists, but needs manual entry).
    - Logic to calculate trainer-specific counters: matches over 3800, matches over 3900, and zero-fault matches.
    - UI implementation of the trainer card on the home page.
    - Manual SQL query for adding trainers.
- **Out of Scope**:
    - Automatic scraping of trainers (not available in source data).
    - Trainer-specific login/auth (view only).
    - Admin UI for adding trainers (to be done via SQL for now).

### User Stories
- As a team member, I want to see the trainer on the homepage so that I can track their contributions/fines alongside players.
- As a trainer, I want to see my "fines" (bonuses paid to the team) based on team performance.

# Technical Design

### Current Implementation
- Players are scraped and stored in `scraped_data`.
- `fetchHomeData` calculates player stats (AVG, MAX, misses) from these results.
- `trainer_payments` table already exists and records bonuses/fines based on team performance.
- `view_user_balances` already calculates totals for both players and trainers.

### Key Decisions
- **Manual Entity**: Trainers will be added manually to the `users` table with `role = 'trainer'`.
- **Separate Tiers**: The 3800 and 3900 counters will be exclusive (a score of 3950 only increments the 3900 counter), matching the current payment logic.
- **UI Layout**: Trainer cards will span 2 columns on medium/large screens (`md:col-span-2`) to distinguish them from players.

### Proposed Changes
#### 1. Data Models (`lib/home-helpers.ts`)
```typescript
export interface TrainerStats {
  count3800: number;
  count3900: number;
  zeroMisses: number;
  totalPaid: string;
}

export interface TrainerWithStats {
  id: string;
  name: string;
  stats: TrainerStats;
}
```

#### 2. Database Fetching (`lib/db-utils.ts`)
Add `getTrainersWithStats()`:
- Fetches all users with `role = 'trainer'`.
- Counts `trainer_payments` records:
    - `count3800`: `condition_type = 'score_bonus'` and `amount = 10`.
    - `count3900`: `condition_type = 'score_bonus'` and `amount = 15`.
    - `zeroMisses`: `condition_type = 'zero_faults'`.
- Sums all payments for `totalPaid`.

#### 3. Home Page UI (`app/[lang]/page.tsx`)
- Display trainer cards in the grid.
- Use `md:col-span-2` for the card container.
- Update labels to "3800", "3900", and "0 misses".

### File Structure
- `lib/home-helpers.ts`: Update interfaces and `fetchHomeData`.
- `lib/db-utils.ts`: Add `getTrainersWithStats`.
- `app/[lang]/page.tsx`: Update UI rendering logic.

### Needed Properties for Manual Setup
To add a trainer, the following SQL query should be used:
```sql
INSERT INTO users (name, role, is_approved) 
VALUES ('John Doe', 'trainer', true);
```
*(Email and password are not required as trainers don't log in).*

# Delivery Steps

### ✓ Step 1: Extend Data Models and Database Queries for Trainers
Define the necessary data structures and SQL queries to fetch trainer data.

- Add `TrainerStats` and `TrainerWithStats` interfaces to `lib/home-helpers.ts`.
- Update `FetchDataResult` to include `trainers` array.
- Create `getTrainersWithStats` function in `lib/db-utils.ts` to fetch trainer info, calculate tiered counters (3800, 3900), zero-fault counts, and total fines from `users` and `trainer_payments` tables.

### ✓ Step 2: Integrate Trainer Data into Homepage Fetching
Update the data fetching logic to include trainer information on the homepage.

- Modify `fetchHomeData` in `lib/home-helpers.ts` to call `getTrainersWithStats`.
- Ensure trainer data is correctly populated in the `FetchDataResult`.
- Provide the SQL query for manual trainer creation in the documentation/PR.

### ✓ Step 3: Implement Trainer Card UI in Homepage
Implement the trainer card in the homepage UI with the specified layout and counters.

- Modify `app/[lang]/page.tsx` to render trainer cards.
- Apply `md:col-span-2` styling to ensure trainer cards span two columns on larger screens.
- Replace AVG, MAX, and misses with the new counters: "3800", "3900", and "0 misses".
- Include the "Total Fines" field to match player cards.
- Use a placeholder avatar for the trainer.