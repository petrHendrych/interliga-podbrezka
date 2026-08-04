---
name: manage-match-results-and-payments
description: Mark special misses (fault into full, missed 2nd-to-last throw) and settle money for a played match — player fines, player bonuses, trainer payments. Use when asked to manage match results, record misses, mark a fine or bonus paid, or check who still owes for a match.
trigger: "user asks to manage match results, mark special misses, update payment status, or record fines/bonuses for a match"
---

# Manage Match Results and Payments

All reads and writes go through one driver: `scripts/match-money.ts`. It has three
subcommands — `list`, `sheet`, `apply` — and every one prints JSON to stdout and
nothing else. There is no admin UI for these fields; this driver is the only write path.

Paths are relative to the repo root. The driver reads `.env.local` for
`DATABASE_URL` and runs on the shell's default Node (verified on 18 and 22) — the
`nvm use 22` this repo needs elsewhere is only for the Next build and lint.

## The three commands

```bash
# Played matches, newest first. Unplayed fixtures are already filtered out.
npx tsx scripts/match-money.ts list --limit 4

# Only played matches that still have unpaid fines, bonuses or trainer payments.
npx tsx scripts/match-money.ts list --unpaid-only --limit 4

# Everything about one match: match info, every player row, trainer payments, totals.
npx tsx scripts/match-money.ts sheet --match-id 44568

# Write. Payload on stdin. Omitted fields keep their current value.
npx tsx scripts/match-money.ts apply --match-id 44568 <<'JSON'
{
  "players": [
    { "userId": "849c7762-9e50-4797-9594-c5041818edaf", "fullFaults": 1, "isPaid": true }
  ],
  "trainerPayments": [ { "id": 8, "isPaid": true } ]
}
JSON
```

`apply` accepts `--dry-run`, which echoes the payload plus the current sheet and
writes nothing. `apply` returns `{ changes, recalculated, sheet }`: `changes` is a
human-readable before/after list, `sheet` is the state after the write.

## Workflow

1. **Pick the match.** Run `list --limit 4` and offer the four newest played
   matches through `AskUserQuestion`, labelled with date, opponent and score.
   Older matches: the user gives the `external_id` directly.
2. **Show the roster once.** Run `sheet --match-id <id>` and render a compact
   markdown table: player, total, faults, special misses (full / 2nd-to-last),
   fine €, bonus €, fine paid?, bonus paid?. Then list trainer payments and totals.
3. **Ask for deltas, not a questionnaire.** One message: "reply with only what
   changes, e.g. `Magala 1 full; Gorecký fine paid; trainer score_bonus paid`."
   Do not iterate player by player.
4. **Apply misses first, in one call.** If any special-miss count changed, send
   that payload alone (no `isPaid` fields) and read the new fine amounts from the
   returned `sheet` — see the ordering gotcha below.
5. **Confirm the new amounts, then apply the payment flags** in a second call.
   If nothing changed misses, steps 4 and 5 collapse into one call.
6. **Summarize** from the returned `changes` array, plus the new totals.

## Money rules that decide the questions

- Special misses are the only fields a human enters: **fault into playing full**
  and **missing the 2nd-to-last throw**, 5€ each. Everything else — sequential
  fault fines, worst-in-team, under-600, under-3750, the 5-game faultless streak,
  the >700 bonus, and every trainer payment row — is derived and recalculated
  automatically. Never ask the user for those numbers.
- Trainer payment condition types in the database are `score_bonus`,
  `zero_faults` and `elite_player`. `elite_player` is paid to the player directly,
  so ask about it only if the user brings it up.

## Gotchas

- **Recalculation does not spare paid player rows.** The `UPDATE
  match_player_results` in `recalculateDerivedFinancials()` (`lib/sync.ts:152`)
  has no `is_paid` guard — only `trainer_payments` rows are protected. Marking a
  miss after a fine was marked paid silently changes the amount owed on a settled
  row. Verified: adding one full-fault to a player whose 1€ fine was already
  marked paid left the row paid with `calculated_fine` now 6€. Hence: misses
  first, confirm the new amount, then the paid flag.
- **`apply` is a read-modify-write.** Fields you omit are preserved, so sending
  `{"isPaid": true}` alone can no longer wipe `is_bonus_paid`. The old scripts
  required both flags on every call and clobbered whichever you forgot.
- **`list` returns played matches only.** The `matches` table also holds
  scheduled fixtures — 22 of 53 rows at the time of writing, the newest dated
  2027 — and they sort to the top. `getPlayedMatches()` filters on
  `team_total_score IS NOT NULL`; do not reintroduce an unfiltered listing.
- **`AskUserQuestion` caps at 4 options.** There are 31 played matches. Offer the
  4 newest; anything older comes in as an explicit match id.
- **One `apply` call = at most one recalculation**, and only when a miss count
  actually changed (`recalculated` in the response says so). Splitting a match
  across many calls re-runs a full cross-season recalculation each time.
- **Bonus flags are guarded**: `isBonusPaid: true` on a player with
  `bonus_received: 0` fails with an error instead of recording a phantom payout.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Error: No match with external id 999999.` | Wrong id. Ids come from `list` (`external_id`), not from a row index. |
| `Error: User <uuid> has no result row in match <id>.` | The player did not play that match, or the uuid came from another match's sheet. |
| `Error: Šimon Magala has no bonus in this match, so isBonusPaid cannot be true.` | Bonus is derived from a >700 total; there is nothing to pay out. |
| `Error: apply expects the payload JSON on stdin` | `apply` was run without a heredoc or pipe. |
| `Error: stdin is not valid JSON` | Heredoc was interpolated by the shell. Quote the delimiter: `<<'JSON'`. |
| Connection / auth error from Neon | `.env.local` missing or `DATABASE_URL` stale; the driver loads it with `dotenv` and no fallback. |
