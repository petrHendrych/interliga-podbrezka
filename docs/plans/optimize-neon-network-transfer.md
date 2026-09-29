---
sessionId: session-260802-155527-lscl
---

# Requirements

### Overview & Goals
The project experienced a massive spike in database network transfer on Neon DB, consuming the entire 5 GB free-tier monthly allowance on the 1st day of the month when no active development or user testing occurred.

The goal is to eliminate redundant database writes/reads during scraping and synchronization, optimize SQL query execution, adjust cron schedules to Sunday evenings starting from September 13, 2026, and retain only 1 latest scrape per entity in `scraped_data` while purging all snapshot history.

### Root Cause Analysis
1. **Boundless Snapshot Accumulation (`scraped_snapshots`)**:
   - On every scrape run (triggered daily by Vercel Cron at midnight), `saveSnapshot()` inserted duplicate raw JSON rows into `scraped_snapshots` for every match and player (~100 large JSON blobs per run).
   - `syncData()` in `lib/sync.ts` queried `scraped_snapshots` using `SELECT DISTINCT ON (external_id) external_id, data, scraped_at FROM scraped_snapshots WHERE type = '...' ORDER BY external_id, scraped_at DESC;`.
   - Postgres performed heavy unindexed sequential scans sorting thousands of historical JSON blobs, transferring tens of megabytes of raw JSON across the network back to Node on every sync run.

2. **Redundant Dual Database Writes**:
   - Every scrape wrote identical payload to `scraped_data` (with `ON CONFLICT DO UPDATE`) AND appended to `scraped_snapshots`, doubling outbound and inbound database bandwidth.

3. **Sequential N+1 Query Loops in Sync**:
   - `syncMatch()`, `syncAllPlayerResultsSnapshots()`, and `recalculateFaultlessStreaks()` iterated over hundreds of rows and executed single-row `INSERT` and `UPDATE` queries sequentially over HTTP serverless connections.

4. **DDL Overhead**:
   - `ensureSchema()` executed ~20 DDL statements (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE`, `CREATE VIEW`) on every scraper execution.

5. **Daily Vercel Cron Trigger**:
   - `vercel.json` ran `/api/cron/scrape` automatically every midnight (`0 0 * * *`), immediately executing all these heavy write/read cycles when the quota reset on the 1st of the month.

### Scope
- **In Scope**:
  - Updating `syncData()` to query `scraped_data` directly.
  - Removing duplicate `saveSnapshot()` writes in `lib/scraper.ts` and purging `scraped_snapshots` table bloat so only 1 scrape per item is kept in `scraped_data`.
  - Adding payload hash comparison in `upsertScrapedData()` to prevent unnecessary DB writes when data is unchanged.
  - Batching SQL queries in `lib/sync.ts`.
  - Updating Vercel Cron schedule in `vercel.json` to weekly on Sunday evening (`0 20 * * 0`).
  - Adding start date guard in `/api/cron/scrape/route.ts` to pause periodic cron runs until September 13, 2026 (`2026-09-13`).
- **Out of Scope**:
  - Changing database providers.
  - Modifying user balance or fine calculation formulas.

### Functional Requirements
- Data synchronization must accurately populate relational tables (`matches`, `match_player_results`, `users`).
- Manual sync triggered via `SyncButton` in the UI must continue working as expected.
- Automated cron scraping will run weekly on Sunday evenings, starting from September 13, 2026.
- Database holds only 1 latest scrape per entity in `scraped_data` (all snapshot duplicates purged).
- Total network transfer per scrape/sync cycle must be reduced from ~50 MB to <1 MB.

# Technical Design

### Current Implementation
- `lib/scraper.ts` calls `upsertScrapedData()` and `saveSnapshot()` for all entities on every run.
- `lib/sync.ts` reads `scraped_snapshots` using `DISTINCT ON` queries, fetching full historical snapshot collections into server memory over TLS.
- `lib/db-utils.ts` runs ~20 DDL statements on every schema check.
- `vercel.json` schedules daily cron scraping at `0 0 * * *`.

### Key Decisions
- **`scraped_data` as Single Source (1 Scrape per Entity)**: Query `scraped_data` directly for sync tasks. Deprecate and purge `scraped_snapshots` so only 1 scrape record per `(type, external_id)` is stored.
- **Payload Hash Diffing**: Calculate SHA-256 hash or payload signature before calling `upsertScrapedData()`. Skip DB write if content is unchanged.
- **Batched SQL Execution**: Refactor `syncMatch`, `syncAllPlayerResultsSnapshots`, and `recalculateFaultlessStreaks` to execute set-based bulk `UPDATE` and `INSERT` statements instead of sequential single-row queries in loops.
- **Sunday Evening Weekly Cron Schedule**: Change `vercel.json` cron schedule to `0 20 * * 0` (Sunday at 20:00 UTC).
- **Cron Start Date Activation (13.9.2026)**: Add date check in `/api/cron/scrape/route.ts` to return early without scraping if current date < September 13, 2026.

### Proposed Changes
- **`lib/db-utils.ts`**:
  - Add payload hash checking in `upsertScrapedData`.
  - Deprecate `saveSnapshot`.
  - Add `purgeScrapedSnapshots()` database cleanup function to delete historical snapshot bloat.
- **`lib/sync.ts`**:
  - Update `syncData()` to read from `scraped_data`.
  - Refactor `syncMatch`, `syncAllPlayerResultsSnapshots`, and `recalculateFaultlessStreaks` for batched SQL execution.
- **`lib/scraper.ts`**:
  - Remove `saveSnapshot` calls.
  - Remove redundant `ensureSchema` calls inside loops.
- **`vercel.json`**:
  - Update cron schedule to `0 20 * * 0` (Sundays at 20:00 UTC / 22:00 CEST).
- **`app/api/cron/scrape/route.ts`**:
  - Add start date guard checking `new Date() >= new Date('2026-09-13T00:00:00Z')` before executing scraper.

### Architecture Diagram
```mermaid
graph LR
    ExternalAPI[Kolky External API] --> Scraper[lib/scraper.ts]
    Scraper -- Hash Diff Check --> ScrapedData[(scraped_data - 1 per item)]
    ScrapedData -- Indexed Query --> Sync[lib/sync.ts]
    Sync -- Batched SQL --> RelationalDB[(matches & match_player_results)]
```

# Testing

### Validation Approach
- Verify TypeScript types and linting using `pnpm check`.
- Verify that `runScrapingJob('manual')` successfully fetches data and syncs relational tables without errors.
- Confirm `scraped_snapshots` table is purged and no new snapshot records are created.
- Validate that payload diffing correctly skips database writes when re-running scraper on identical data.
- Validate that cron API endpoint skips scraping prior to September 13, 2026, and proceeds on or after that date.

### Key Scenarios
1. **Manual Sync Execution**: Admin triggers sync from UI; data is fetched from Kolky API, saved to `scraped_data`, and synced to `matches` and `match_player_results`.
2. **Unchanged Scrape Payload**: Re-running scraper when no match or player stats have changed results in 0 database write calls.
3. **Weekly Sunday Evening Cron Execution**: Cron endpoint `/api/cron/scrape` checks date guard (`2026-09-13`) and executes weekly on Sundays at 20:00 UTC with <1 MB transfer.

# Delivery Steps

### ✓ Step 1: Migrate sync logic to scraped_data and purge snapshot bloat
The data sync process queries `scraped_data` directly instead of `scraped_snapshots`, eliminating heavy unindexed scans, double writes, and snapshot table bloat.

- Refactor `syncData()` in `lib/sync.ts` to query `scraped_data` using `WHERE type = ...`.
- Deprecate `saveSnapshot()` in `lib/db-utils.ts` and remove all `saveSnapshot()` calls from `lib/scraper.ts`.
- Add a database migration utility `purgeScrapedSnapshots()` in `lib/db-utils.ts` to truncate the bloated `scraped_snapshots` table, keeping only 1 scrape record per entity in `scraped_data`.
- Remove redundant `ensureSchema()` execution calls inside loop iterations in `lib/scraper.ts`.

### ✓ Step 2: Batch SQL operations in sync and implement payload hash diffing
Data sync and scraping operations run via optimized bulk queries and skip database writes when scraped payloads have not changed.

- Implement SHA-256 hash or payload comparison check in `upsertScrapedData()` in `lib/db-utils.ts` to skip redundant `INSERT` statements when data is unchanged.
- Refactor `syncMatch()` in `lib/sync.ts` to batch player lineup upserts rather than executing single-row queries in a loop.
- Refactor `syncAllPlayerResultsSnapshots()` and `recalculateFaultlessStreaks()` in `lib/sync.ts` to execute bulk updates using single CTE or batched queries.

### ✓ Step 3: Configure Sunday evening cron schedule and date activation guard
Vercel Cron schedule is updated to Sunday evening, cron route pauses periodic execution until September 13, 2026, and the codebase passes all quality checks.

- Update `schedule` in `vercel.json` to Sunday evening (`0 20 * * 0`).
- Add date guard in `app/api/cron/scrape/route.ts` to pause periodic cron scraping until September 13, 2026 (`2026-09-13`).
- Run `pnpm lint` and `pnpm type-check` to ensure no linting errors or TypeScript violations remain.
- Perform a manual test execution of `runScrapingJob('manual')` to verify end-to-end functionality.