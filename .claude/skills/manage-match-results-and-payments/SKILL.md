---
name: manage-match-results-and-payments
description: Record special misses (fault into full, missed 2nd-to-last throw) for a played match. Use when asked to manage match results or record misses. Marking fines, bonuses or trainer payments paid is done in the app under /money (admin only), not here.
trigger: "user asks to manage match results or mark special misses for a match"
---

# Record Special Misses

Special misses — **fault into playing full** and **missing the 2nd-to-last throw**,
5€ each — are the only money inputs a human enters, and they have no UI. They go
through one driver: `scripts/match-money.ts`. It has three subcommands — `list`,
`sheet`, `apply` — and every one prints JSON to stdout and nothing else.

Paid flags (player fines, player bonuses, trainer payments) are settled by the admin
in the app under *Pokuty a platby* (`/money`; everyone can view it, only the admin
sees the paid buttons). Do not offer to mark anything
paid from here; if the user asks, point them to that page.

Paths are relative to the repo root. The driver reads `.env.local` for
`DATABASE_URL`, plus `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` to refresh the live
cache and send notifications over HTTP. It runs on the repo's pinned Node.

## The three commands

```bash
# Played matches, newest first. Unplayed fixtures are already filtered out.
npx tsx scripts/match-money.ts list --limit 4

# Everything about one match: match info, every player row, trainer payments, totals.
npx tsx scripts/match-money.ts sheet --match-id 44568

# Write. Payload on stdin. Omitted fields keep their current value.
npx tsx scripts/match-money.ts apply --match-id 44568 --notify <<'JSON'
{
  "players": [
    { "userId": "849c7762-9e50-4797-9594-c5041818edaf", "fullFaults": 1, "secondToLastFaults": 0 }
  ]
}
JSON
```

`apply` accepts `--dry-run`, which echoes the payload plus the current sheet and
writes nothing. `apply` returns `{ changes, recalculated, sheet }`: `changes` is a
human-readable before/after list, `sheet` is the state after the write.

`--notify` tells every player whose fine changed, with the new amount. Pass it on
the one `apply` of a match, never on a `--dry-run`.

## Workflow

1. **Pick the match.** Run `list --limit 4` and offer the four newest played
   matches through `AskUserQuestion`, labelled with date, opponent and score.
   Older matches: the user gives the `external_id` directly.
2. **Show the roster once.** Run `sheet --match-id <id>` and render a compact
   markdown table: player, total, faults, special misses (full / 2nd-to-last),
   fine €, fine paid?.
3. **Ask for the misses in one message**, e.g. `Magala 1 full; Bína 1 2nd`.
   Do not iterate player by player.
4. **Apply them in one call** with `--notify`, only `fullFaults` /
   `secondToLastFaults` fields.
5. **Summarize** from the returned `changes` array: each player's misses and fine
   before → after, and the match's new fine total.

## Money rules that decide the questions

- Everything besides the two special misses — sequential fault fines,
  worst-in-team, under-600, under the team limit, team loss, the 5-game faultless streak (counted per
  season), the 700+ bonus, and every trainer payment row — is derived and
  recalculated automatically. Never ask the user for those numbers.

## Gotchas

- **Recalculation does not spare paid player rows.** The `UPDATE
  match_player_results` in `recalculateDerivedFinancials()` (`lib/sync.ts`) has no
  `is_paid` guard — only `trainer_payments` rows are protected. Adding a miss to a
  player whose fine was already marked paid in the app leaves the row paid with a
  higher amount, so the extra 5€ is never collected. If the sheet shows
  `is_paid: true` for a player getting a miss, tell the user before applying so
  they can unmark it in `/money` afterwards.
- **`list` returns played matches only.** The `matches` table also holds
  scheduled fixtures, and they sort to the top. `getPlayedMatches()` filters on
  `team_total_score IS NOT NULL`; do not reintroduce an unfiltered listing.
- **`AskUserQuestion` caps at 4 options.** Offer the 4 newest; anything older
  comes in as an explicit match id.
- **One `apply` call = at most one recalculation**, and only when a miss count
  actually changed (`recalculated` in the response says so). Splitting a match
  across many calls re-runs a full cross-season recalculation each time.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `Error: No match with external id 999999.` | Wrong id. Ids come from `list` (`external_id`), not from a row index. |
| `Error: User <uuid> has no result row in match <id>.` | The player did not play that match, or the uuid came from another match's sheet. |
| `Error: apply expects the payload JSON on stdin` | `apply` was run without a heredoc or pipe. |
| `Error: stdin is not valid JSON` | Heredoc was interpolated by the shell. Quote the delimiter: `<<'JSON'`. |
| `DATABASE_URL is not defined in environment variables` | `.env.local` is missing or has no `DATABASE_URL`. It is a sensitive variable on Vercel, so `vercel env pull` returns it blank — copy it from the Neon console. |
| `Cache revalidation failed with status 401` / nobody notified | `CRON_SECRET` in `.env.local` differs from Vercel's, or the deployment predates a secret change. |
