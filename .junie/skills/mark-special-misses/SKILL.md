---
name: mark-special-misses
description: Handles manual marking of specific misses (fault into full, missing 2nd to last throw) for players in played matches and updates the database.
trigger: "user asks to mark special misses, mark faults in full, mark second to last throw misses, or record manual misses for a match"
---

# Mark Special Misses Skill

This skill guides the agent in manually marking specific misses (fault into full, missing 2nd to last throw) for players in played matches and updating the database accordingly.

## Overview
- **Special Fault Types**:
  1. **Fault into playing full** (Miss in full) — fine: 5€ per occurrence.
  2. **Missing 2nd to last throw** — fine: 5€ per occurrence.
- **Aggregated Special Faults**:
  Both fault types carry a 5€ fine per occurrence. The field `special_faults_count` represents the combined total (`special_faults_count = full_faults_count + second_to_last_faults_count`). Both answers are collected during player questioning, summed, and persisted into `special_faults_count` to maintain compatibility with automatic sync fine calculations.
- **Workflow**:
  1. Prompt the user to select either the last played match or pick a match from a list of played matches.
  2. Retrieve players for the selected match.
  3. For each player, ask about misses in full and 2nd to last throw misses.
  4. Validate positive whole numbers for miss counts (re-prompt if <= 0).
  5. Sum both answers (`full_faults` + `second_to_last_faults`) and set `special_faults_count`.
  6. Update the database using helper functions or CLI script.
  7. Remind the user to run the recalculate money skill (e.g. `recalculate-money`, to be added later) after applying new flags.

---

## Instructions for Agent Execution

### Step 1: Database Verification
Ensure database schema support by ensuring the columns `special_faults_count`, `full_faults_count`, and `second_to_last_faults_count` exist on `match_player_results`.
Run the schema script if needed:
```bash
npx tsx scripts/ensure-schema.ts
```

### Step 2: Match Selection
Ask the user via `ask_user`:
- **Question**: "Which match do you want to mark special misses for?"
- **Options**:
  1. **Last played match** — Run for the most recently played match.
  2. **Pick a specific match** — Choose from a list of previously played matches.

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
  Present the retrieved matches as interactive options using `ask_user`, formatting each match clearly (e.g., `Round/Opponent Name (Date, Score/Location)`), so the user can pick one directly without remembering IDs or names.

---

### Step 3: Iterate Over Players
For the selected match, fetch player results:
```bash
npx tsx scripts/update-special-misses.ts --get-players --match-id <MATCH_ID>
```

For EACH player in the match, sequentially ask the following questions using `ask_user`:

#### Question 1: Fault into Full (Miss in Full)
1. Ask: "Did **[Player Name]** have a miss (fault) into playing full in this match?"
   - Options: "No" / "Yes"
2. If "Yes":
   - Ask: "How many misses into playing full did **[Player Name]** have?"
   - **Validation Rule**:
     - If the typed response is `<= 0` or not a positive integer (e.g. `0`, `-1`, text), tell the user:
       > "Please provide a positive whole number (greater than 0)."
     - Re-ask the question until a valid positive whole number `N` is entered.
   - When a valid positive number `N` is entered:
     - Record `full_faults = N`.
     - Explicitly inform the user:
       > "Recorded N miss(es) in full for [Player Name]."

#### Question 2: Miss Second to Last Throw
1. Ask: "Did **[Player Name]** have misses on the second to last throw in this match?"
   - Options: "No" / "Yes"
2. If "Yes":
   - Ask: "How many second to last throw misses did **[Player Name]** have?"
   - **Validation Rule**:
     - If the typed response is `<= 0` or not a positive integer (e.g. `0`, `-1`, text), tell the user:
       > "Please provide a positive whole number (greater than 0)."
     - Re-ask the question until a valid positive whole number `M` is entered.
   - When a valid positive number `M` is entered:
     - Record `second_to_last_faults = M`.
     - Explicitly inform the user:
       > "Recorded M second to last throw miss(es) for [Player Name]."

---

### Step 4: Persist Updates to Database
Combine both responses to compute the total special faults count:
`special_faults_count = full_faults + second_to_last_faults`

For each player where special faults were recorded or modified, execute the update script:
```bash
npx tsx scripts/update-special-misses.ts --update-misses --match-id <MATCH_ID> --user-id <USER_ID> --full-faults <N> --second-to-last-faults <M>
```
*Note: The script automatically calculates `special_faults_count = N + M` and updates `calculated_fine = sequential_fine + performance_fines + (special_faults_count * 5)`.*

---

### Step 5: Summary & Final Note
After completing questions for all players in the match:
1. Print a summary table showing each player's updated special miss counts (`full_faults_count`, `second_to_last_faults_count`, total `special_faults_count`) and updated calculated fine.
2. End with the final notification:
   > "All special misses have been updated in the database. Note: To update overall money accounting, trigger the recalculate money skill (e.g., `recalculate-money`)."
