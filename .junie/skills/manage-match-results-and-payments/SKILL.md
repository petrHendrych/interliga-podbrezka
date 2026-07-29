---
name: manage-match-results-and-payments
description: Handles manual marking of specific misses and tracking payment statuses (fines, bonuses, trainer payments) for played matches.
trigger: "user asks to manage match results, mark special misses, update payment status, or record fines/bonuses for a match"
---

# Manage Match Results and Payments Skill

This skill guides the agent in manually marking specific misses (fault into full, missing 2nd to last throw), and tracking payment statuses (fines, bonuses, trainer payments) for played matches and updating the database accordingly.

## Overview
- **Special Fault Types**:
  1. **Fault into playing full** (Miss in full) — fine: 5€ per occurrence.
  2. **Missing 2nd to last throw** — fine: 5€ per occurrence.
- **Payment Statuses**:
  - **Player Fine**: Whether the fine for the match has been paid to the bank.
  - **Player Bonus**: Whether the bonus for the match (e.g. for score > 700) has been paid out from the bank.
  - **Trainer Payment**: Whether the trainer's payment for the match (e.g. for team performance) has been paid to the bank.
- **Workflow**:
  1. Prompt the user to select either the last played match or pick a match from a list of played matches.
  2. Retrieve players and trainer payments for the selected match.
  3. For each player:
     - Ask about special misses (full and 2nd to last throw).
     - Ask if the fine has been paid.
     - Ask if the bonus has been paid (if applicable).
  4. For each trainer payment:
     - Ask if the payment has been paid.
  5. Update the database using CLI scripts.
  6. Show summary.

---

## Instructions for Agent Execution

### Step 1: Database Verification
Ensure database schema is up to date.
Run the schema script:
```bash
npx tsx scripts/ensure-schema.ts
```

### Step 2: Match Selection
Ask the user via `ask_user`:
- **Question**: "Which match do you want to manage results and payments for?"
- **Options**:
  1. **Last played match**
  2. **Pick a specific match**

#### Handling Selection:
- **If "Last played match"**:
  Execute the script to list matches and select the first match in the list (ordered by date descending):
  ```bash
  npx tsx scripts/update-special-misses.ts --list-matches
  ```
- **If "Pick a specific match"**:
  Fetch played matches using:
  ```bash
  npx tsx scripts/update-special-misses.ts --list-matches
  ```
  Present the retrieved matches as interactive options using `ask_user`.

---

### Step 3: Iterate Over Players
For the selected match, fetch player results:
```bash
npx tsx scripts/update-special-misses.ts --get-players --match-id <MATCH_ID>
```

For EACH player in the match, sequentially ask:

#### Special Misses
1. Ask: "Did **[Player Name]** have a miss (fault) into playing full in this match?"
2. If "Yes", ask for count `N`.
3. Ask: "Did **[Player Name]** have misses on the second to last throw in this match?"
4. If "Yes", ask for count `M`.
5. Update misses:
   ```bash
   npx tsx scripts/update-special-misses.ts --update-misses --match-id <MATCH_ID> --user-id <USER_ID> --full-faults <N> --second-to-last-faults <M>
   ```

#### Payment Status
1. Ask: "Has **[Player Name]** paid the fine for this match (**[Fine Amount]€**)?"
   - Options: "Yes" / "No"
2. If the player has a bonus (> 0):
   - Ask: "Has the bonus for **[Player Name]** (**[Bonus Amount]€**) been paid out?"
     - Options: "Yes" / "No"
3. Update payment status:
   ```bash
   npx tsx scripts/update-special-misses.ts --update-payment --match-id <MATCH_ID> --user-id <USER_ID> --is-paid <true|false> --is-bonus-paid <true|false>
   ```

---

### Step 4: Manage Trainer Payments
Fetch trainer payments for the match:
```bash
npx tsx scripts/update-trainer-payments.ts --get-payments --match-id <MATCH_ID>
```

For EACH trainer payment (excluding 'elite_player' type as it's paid directly):
1. Ask: "Has the trainer payment for **[Condition Type]** (**[Amount]€**) been paid?"
   - Options: "Yes" / "No"
2. Update payment status:
   ```bash
   npx tsx scripts/update-trainer-payments.ts --update-payment --payment-id <PAYMENT_ID> --is-paid <true|false>
   ```

---

### Step 5: Summary
Show a summary of all updates performed.
