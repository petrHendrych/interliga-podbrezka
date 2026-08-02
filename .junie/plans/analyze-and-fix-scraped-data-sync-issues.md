---
sessionId: session-260731-162059-i948
---

# Requirements

### Overview & Goals
The user reported that `scraped_data` contains much more entries than expected and has multiple timestamps per day, despite a daily cron job scheduled for midnight. The goal is to analyze the cause (potential schema issues, overlapping runs, or manual triggers) and implement safeguards to ensure data integrity and observability.

### Scope
- **Analysis**: Investigating the root cause of multiple entries and timestamps.
- **Safeguards**: Implementing locks to prevent parallel scraping jobs.
- **Schema**: Ensuring `UNIQUE` constraints are properly applied to existing tables.
- **Observability**: Improving logs to track sync triggers.

### Functional Requirements
- The scraping job must not run more than once at a time.
- `scraped_data` should only contain one entry per `(type, external_id)`.
- The system should distinguish between scheduled and manual syncs in logs.
- The `updated_at` timestamp in `scraped_data` should be understood in the context of job duration.

### Non-Functional Requirements
- **Performance**: The scraping job should handle timeouts gracefully on Vercel.
- **Security**: The cron endpoint must be properly secured even if environment variables are missing.

# Technical Design

### Current Implementation Analysis
- **Scraper Duration**: The `runScrapingJob` in `lib/scraper.ts` processes teams, matches, and players sequentially with `500ms` delays. For 50+ matches and 20+ players, the total duration likely exceeds **30-40 seconds**, which is close to or above Vercel's serverless timeout limits (10s for Hobby, 60s for Pro).
- **Timestamp Spreading**: Because the job is sequential, `updated_at` (set to `NOW()` on each upsert) will differ across entries within the same job run.
- **Snapshots vs Data**: The job writes to both `scraped_data` (upsert) and `scraped_snapshots` (insert). `scraped_snapshots` grows indefinitely and might be what the user is seeing if they report "much more entries".
- **Schema Laziness**: `ensureSchema` uses `CREATE TABLE IF NOT EXISTS`. If the `UNIQUE` constraint was added to the code after the table was already created in the DB, it would be missing. However, `upsertScrapedData` uses `ON CONFLICT`, which would fail if the unique index was missing.

### Key Decisions
- **Sync Locking**: Use a database-level lock (e.g., a `job_locks` table) to prevent multiple scraper instances from running concurrently.
- **Schema Hardening**: Add explicit SQL to ensure the `UNIQUE` index exists on `scraped_data(type, external_id)` if it's missing.
- **API Security**: Update the cron route to explicitly reject requests if `CRON_SECRET` is not configured.

### Proposed Changes

#### 1. Database Locking (`lib/db-utils.ts`)
Add a mechanism to track running jobs.
```typescript
export async function tryAcquireLock(jobName: string, timeoutMinutes: number = 30) {
  // Logic to insert/update a lock record if not already locked or expired
}
export async function releaseLock(jobName: string) {
  // Logic to clear the lock
}
```

#### 2. Scraper Enhancement (`lib/scraper.ts`)
Wrap the scraping job in a lock and add better logging.
```typescript
export async function runScrapingJob(source: 'cron' | 'manual' = 'manual') {
  if (!await tryAcquireLock('scraping_job')) return;
  try {
    console.log(`Starting ${source} scraping job...`);
    // ... rest of the job
  } finally {
    await releaseLock('scraping_job');
  }
}
```

#### 3. Route Protection (`app/api/cron/scrape/route.ts`)
```typescript
if (!process.env.CRON_SECRET) {
  return new Response('Cron secret not configured', { status: 500 });
}
```

### Risks & Mitigations
- **Stuck Locks**: If a job crashes, the lock might remain. *Mitigation*: Use a timeout for locks so they expire after e.g. 30 minutes.
- **Vercel Timeout**: If the job is killed by Vercel, the lock might not be released immediately. *Mitigation*: The `finally` block might not run if the process is killed instantly, so the lock timeout is crucial.

# Delivery Steps

### ✓ Step 1: Analyze scraping mechanism and potential for duplicates
Perform a detailed analysis of why `scraped_data` might have multiple entries and timestamps.
- Investigate `lib/scraper.ts` for long-running loops and timeout risks.
- Verify `lib/db-utils.ts` for potential `UNIQUE` constraint issues on existing tables.
- Check `app/api/cron/scrape/route.ts` for security and execution patterns.
- Confirm if `scraped_snapshots` might be confused with `scraped_data`.

### ✓ Step 2: Implement sync locks and schema safeguards
Add safeguards to prevent multiple simultaneous scraping jobs and improve data integrity.
- Implement a "sync lock" mechanism in `lib/db-utils.ts` using a new `system_status` table or similar.
- Add an explicit `ALTER TABLE scraped_data ADD UNIQUE IF NOT EXISTS` check (or similar via index) to handle cases where the table was created without it.
- Improve the security check in the cron route to handle missing secrets.

### ✓ Step 3: Optimize and enhance scraper observability
Enhance the scraper to provide better observability and handle timeouts more gracefully.
- Add logging to distinguish between Cron and Manual syncs.
- Add a timestamp to the `scraped_data` payload to track when the data was actually fetched from the API (independent of DB `updated_at`).
- (Optional) Introduce batching or concurrency limits in `lib/scraper.ts` to improve speed while respecting API limits.