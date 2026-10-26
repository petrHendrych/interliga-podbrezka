# Requirements

Changelog: feature (all)

### Overview & Goals
Users learn what changed in the app. After a production release, every approved user sees a
"What's new" dialog once, on their first visit. Subscribed devices get a push: "New version has
been uploaded. Open application to see what is new." Closing the dialog marks it seen, so it does
not come back until the next release.

Releases become deliberate. Merging to `main` no longer deploys. A manually triggered GitHub
workflow deploys production, and right after that it cuts a release from the changelog entries
merged since the previous one.

A Claude Code skill plus a `SessionStart` hook keeps the entries coming:
- **At the start of a session**: the developer classifies the work (feature / improvement / fix /
  internal).
- **When the work is done**: Claude drafts the user-facing text in Slovak and translates it to
  cs, hu and sr. The developer approves the text, and Claude writes the entry file.

### Scope
**In scope**
- Changelog entries as typed TS files in the repo: one file per entry, all 4 locales.
- DB table `app_releases` and column `users.last_seen_release_id`.
- `POST /api/release`, which cuts a release from unreleased entries and sends the push.
- The auto-opening dialog in the root layout and the `/[lang]/changelog` history page, linked
  from the footer version.
- A new push event `appUpdated`.
- GitHub workflow `deploy.yml` (`workflow_dispatch`), and `vercel.json`
  `git.deploymentEnabled.main = false`.
- Skill `.claude/skills/changelog/`, created with `/skill-creator:skill-creator`, plus a
  `SessionStart` hook in `.claude/settings.json`.
- Docs: a Changelog section and invariants in `AGENTS.md`, and a `Changelog:` line in the plan
  template.
- Tests for every pure helper, the entry registry, the dialog and the locales.

**Out of scope**
- Admin UI for writing or editing entries. Entries live in the repo only.
- Editing an entry after it is released (the text is read from the code, so a later deploy can
  fix a typo, but nothing is built for it).
- Running `pnpm check` in the deploy workflow. CI on PRs is the gate.
- Vercel webhooks. They are not needed: the workflow knows when the deploy is done. As far as we
  know they are a Pro/Enterprise feature, while this project runs on Hobby.
- Changing how `APP_VERSION` is computed.

### Functional Requirements
1. **Entries.** A changelog entry has:
   - `id`, equal to its file name.
   - `type`: `feature` | `improvement` | `fix`.
   - `audience`: `all` | `admin`.
   - `text` in sk, cs, hu and sr: one short sentence, plain language, readable by non-players.

   Internal work (refactor, chore, tests, CI, docs) writes no entry.
2. **Release.** A release is the set of entries present in the deployed code that are not in any
   earlier release. It is cut only by `POST /api/release`, which the deploy workflow calls after
   `vercel deploy --prod` succeeds.
   - If nothing is new, no release is created, no push is sent and no dialog is shown, but the
     deploy itself still happens.
   - Re-running the endpoint is harmless.
3. **Push.** The new event `appUpdated` goes to every approved user with a subscription. If the
   release holds only `admin` entries, it goes to admins only. Tapping it opens the home page.
4. **Dialog.** On any page, an approved, signed-in user sees the dialog when there are unseen
   releases they are allowed to see.
   - Unseen means `release.id > last_seen_release_id`, and `released_at > users.created_at`.
     That second condition means new users never see older releases.
   - At most the latest 5 are shown, newest first.
   - **Each release:** a header "Verzia 1.42.180 · 26. 10. 2026". Under it are headings Novinky /
     Vylepšenia / Opravy, each with bulleted short descriptions.
   - **Filtering:** admin items are shown only to admins. A release with no visible item for this
     user is skipped.
   - **Closing:** "Rozumiem", Esc or a tap outside all close the dialog and store the newest
     release id that was shown as seen.
5. **History.** `/[lang]/changelog` lists every release the user may see, newest first, rendered
   the same way as the dialog. The footer version links to it.
6. **Rollback.** Entry ids stored in a release that are missing from the running code are
   silently dropped.
7. **First release.** The first release ships with this feature. Its entry announces the
   changelog itself, so existing users see it once.
8. **Session workflow.**
   - Each new Claude Code session starts with the question: feature / improvement / fix /
     internal / no work (just questions).
   - The answer goes into the plan's `Changelog:` line when there is a plan.
   - When the work is done, Claude drafts the sk text, translates cs/hu/sr, gets the
     developer's approval and writes the entry file plus the index line.
   - The skill can also be run on demand as `/changelog`.

# Technical Design

### Current Implementation
- **Version.** `lib/app-version.ts` and `next.config.ts` produce `APP_VERSION` =
  `MAJOR.PROD.TOTAL` from Vercel deployment counts. It changes on every deploy, preview builds
  included. It is rendered only by `components/layout/AppFooter.tsx`.
- **Deploy.** Vercel's Git integration deploys every push to `main`. `.github/workflows/ci.yml`
  runs on PRs only. `vercel.json` holds the crons only.
- **Push.** `lib/push.ts` provides `sendPushToUsers(recipients, event)` and
  `getAdminUserIds()`. Events and paths are in `lib/push-payload.ts` (`PUSH_EVENTS`,
  `EVENT_PATHS`), and the strings in `push.events.<event>` of each locale.
- **Auth.** Login is required everywhere (`proxy.ts`). API prefixes that skip the proxy are in
  `publicApiPrefixes`. `app/api/revalidate/route.ts` is the `CRON_SECRET` bearer pattern to
  copy.
- **DB.** Drizzle schema is in `lib/db/schema.ts`, applied with `pnpm db:push` (no migration
  files). `users` has no preference columns.
- **UI.** `components/ui/alert-dialog.tsx` (base-ui) is the only dialog primitive. Nothing opens
  on its own yet. `InstallPrompt` in `app/[lang]/layout.tsx` is the closest pattern for a global
  component with props built from `dict`.
- **Claude Code.** `.claude/settings.json` holds only `plansDirectory`. There are no hooks, and
  the skills are `manage-match-results-and-payments` and `translations`.

### Proposed Changes

#### 1. Entry types and registry (`lib/changelog/types.ts`, `lib/changelog/entries/*.ts`, `lib/changelog/entries/index.ts`)
These files are db-free, so client and server can both import them.

```ts
export const CHANGELOG_TYPES = ['feature', 'improvement', 'fix'] as const;
export type ChangelogType = (typeof CHANGELOG_TYPES)[number];
export type ChangelogAudience = 'all' | 'admin';
export interface ChangelogEntry {
  id: string;                                // '2026-10-26-changelog-dialog'
  type: ChangelogType;
  audience: ChangelogAudience;
  text: Record<Locale, string>;
}
```

- **Entry files.** Each one is `lib/changelog/entries/<yyyy-mm-dd>-<slug>.ts` with
  `export default { … } satisfies ChangelogEntry;`.
- **Index.** `entries/index.ts` imports each entry and exports
  `CHANGELOG_ENTRIES: ChangelogEntry[]`. The list is explicit because runtime `readdir` is not
  reliable on Vercel functions.
- **First entry.** `2026-10-26-changelog-dialog.ts`: feature, all. Its text is drafted at
  delivery and approved by the user.

#### 2. Pure release logic (`lib/changelog/release-logic.ts`, db-free)
- `unreleasedEntryIds(entries, releasedIds: Set<string>): string[]` lists entries in code that
  are not released yet, in index order.
- `releaseAudience(entries): 'all' | 'admin' | null` returns:
  - `'all'` if any entry is for everyone,
  - `'admin'` if all entries are admin-only,
  - `null` if there are no entries.
- `buildReleaseViews(releases, entries, { lang, isAdmin })` returns
  `ReleaseView[]` = `{ id, version, releasedAt, groups: { type, items: string[] }[] }`.
  - Groups come in the fixed order feature → improvement → fix, and empty groups are dropped.
  - Admin items are dropped for non-admins, and ids missing from the code are dropped (rollback).
  - Releases with no groups are dropped.
- `unseenReleases(releases, { lastSeenId, userCreatedAt })`:
  - keeps `id > (lastSeenId ?? 0)` and `releasedAt > userCreatedAt`,
  - newest first, capped at `CHANGELOG_DIALOG_LIMIT = 5`.

  Each release's `audience` decides whether the user may see it.

#### 3. Schema (`lib/db/schema.ts`)
```ts
export const appReleases = pgTable('app_releases', {
  id: serial('id').primaryKey(),
  version: text('version').notNull(),          // APP_VERSION of the deploy that cut it
  entryIds: jsonb('entry_ids').$type<string[]>().notNull(),
  audience: text('audience').notNull(),        // 'all' | 'admin'
  releasedAt: timestamp('released_at', { withTimezone: true }).notNull().defaultNow(),
});
// users: lastSeenReleaseId: integer('last_seen_release_id').references(() => appReleases.id)
```
Apply with `pnpm db:push`, after asking the user to confirm, because it writes to Neon.

#### 4. Server queries (`lib/changelog/releases.ts`, server-only)
- `getReleasedEntryIds()`: the union of `entry_ids` across all releases.
- `cutRelease(version)`:
  1. Compute `unreleasedEntryIds`. If none, return `{ created: false }`.
  2. Otherwise insert a row with `releaseAudience(...)` and return it.
- `notifyRelease(release)`: recipients are approved users (`role` any, `is_approved`) or
  `getAdminUserIds()`, depending on audience. It calls `sendPushToUsers(recipients, 'appUpdated')`,
  guarded by `claimPush('appUpdated', String(release.id))`.
- `getDialogReleases(userId)`: one query for the user's `last_seen_release_id`, `created_at` and
  `role`, plus the latest releases. It returns `buildReleaseViews(unseenReleases(...))`.
- `getAllReleaseViews(userId)`: the same views for the history page.
- These are not cached: they are per-user, cheap and indexed by PK.

#### 5. Release endpoint (`app/api/release/route.ts`, `proxy.ts`)
- `POST` with `CRON_SECRET` bearer, the same pattern as `app/api/revalidate/route.ts`.
- It returns 409 unless `process.env.VERCEL_ENV === 'production'`, so preview deploys never
  release.
- It calls `cutRelease(process.env.APP_VERSION)`, then `notifyRelease`, and returns
  `{ created, releaseId, version, entryIds }`.
- Add `'/api/release'` to `publicApiPrefixes` in `proxy.ts`.

#### 6. Seen action (`lib/changelog-actions.ts`, `'use server'`)
`markChangelogSeen(releaseId: number)` returns `{ success, error }` with codes `unauthorized` /
`invalidRelease` / `genericError`. It runs:

```sql
UPDATE users SET last_seen_release_id = GREATEST(COALESCE(last_seen_release_id, 0), $id)
WHERE id = $session
```

Using `GREATEST` means an old tab can never move it backwards. The release id is validated by
`validateReleaseId()` in `lib/validation/changelog.ts`.

#### 7. Dialog UI (`components/changelog/ChangelogGate.tsx`, `components/changelog/ChangelogDialog.tsx`, `components/changelog/ReleaseList.tsx`)
- **`ChangelogGate`** is a server component mounted in `app/[lang]/layout.tsx` next to
  `InstallPrompt`. It reads the session. With no session, or an unapproved user, it renders
  nothing. Otherwise it calls `getDialogReleases` and renders the dialog only when the result is
  non-empty.
- **`ChangelogDialog`** is `'use client'` and takes `releases: ReleaseView[]` plus a
  translations prop. It uses the `alert-dialog` primitives:
  - It opens on mount, scrolls inside the dialog for long content, and is mobile-first.
  - On close (button, Esc or backdrop) it hides at once and calls
    `markChangelogSeen(releases[0].id)`. On failure it just logs, and the dialog comes back on
    the next visit. This is deliberate, because a failed "seen" must not trap the user in a
    dialog.
  - Check whether the alert-dialog allows closing on backdrop click. If not, add a small
    `components/ui/dialog.tsx` wrapper over `@base-ui/react/dialog` in the same style.
- **`ReleaseList`** is shared with the history page. It renders a header "Verzia {version} ·
  {date}" with the date formatted in `lib/dates.ts` style, the headings, and `<ul>` bullets.
- Positioner/Popup z-index sits above the header (`z-50`), per the UI invariants.

#### 8. History page and footer (`app/[lang]/changelog/page.tsx`, `components/layout/AppFooter.tsx`)
- The page renders `ReleaseList` over `getAllReleaseViews`. With none, it shows an empty state.
- The footer version becomes a `Link` to `/${lang}/changelog`. `AppFooter` takes `lang`.

#### 9. Push event (`lib/push-payload.ts`, `locales/*.json`)
- Add `'appUpdated'` to `PUSH_EVENTS`, with `EVENT_PATHS.appUpdated = ''`.
- Add `push.events.appUpdated.{title, body}` to all 4 locales. sk:
  - title "Nová verzia aplikácie"
  - body "Bola nahraná nová verzia. Otvor aplikáciu a pozri si, čo je nové."

#### 10. Locales (`locales/{sk,cs,hu,sr}.json`)
- A new `changelog` namespace: `title` ("Čo je nové"), `releaseHeader` ("Verzia {version} ·
  {date}"), `types.feature/improvement/fix` ("Novinky" / "Vylepšenia" / "Opravy"),
  `confirm` ("Rozumiem"), `pageTitle`, `empty`, and `errors.*`.
- Follow the `translations` skill.

#### 11. Deploy workflow (`.github/workflows/deploy.yml`, `vercel.json`)
```yaml
name: Deploy
on: workflow_dispatch
concurrency: { group: deploy-production, cancel-in-progress: false }
jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
      VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
    steps:
      - uses: actions/checkout@v4
      - run: npx vercel@latest deploy --prod --yes --token=${{ secrets.VERCEL_TOKEN }}
      - name: Cut release
        run: |
          curl --fail-with-body -X POST "${{ vars.PRODUCTION_URL }}/api/release" \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
```
- The deploy builds remotely on Vercel, as today, so `next.config.ts` still counts deployments
  with the project env vars.
- The release call targets the production domain (`PRODUCTION_URL` =
  `https://interliga-podbrezka.vercel.app`) and not the unique deployment URL. The unique URL is
  behind Vercel Authentication, and `deploy --prod` returns only after the domain points at the
  new build.
- The workflow is restricted to `main` with `if: github.ref == 'refs/heads/main'`.
- `vercel.json` gets `"git": { "deploymentEnabled": { "main": false } }`, so PR previews still
  deploy and `main` does not.
- **Manual setup (user):** GitHub secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID` (=
  `team_msx5R81CCiOuO5oPlc58SIvj`), `VERCEL_PROJECT_ID`, `CRON_SECRET`, and the variable
  `PRODUCTION_URL`. Provide a short checklist in the final report.

#### 12. Claude Code skill and hook (`.claude/skills/changelog/SKILL.md`, `.claude/settings.json`)
- **Skill.** Created with `/skill-creator:skill-creator`. It has two modes:
  - **classify (session start):** suggest a type from the branch prefix (`feat/` → feature,
    `fix/` → fix, `chore/`, `refactor/`, `test/`, `ci/`, `docs/` → internal). Ask the developer
    to confirm feature / improvement / fix / internal / no work, and audience all / admin. Record
    the result in the plan's `Changelog:` line when a plan exists.
  - **write (work done, or `/changelog`):** draft one short plain-Slovak sentence per
    user-visible change, readable by people who don't play. Translate cs/hu/sr and show all four
    for approval. Then write the entry file and the index line. Never commit.
- **Hook.** In `.claude/settings.json`:
  ```json
  "hooks": { "SessionStart": [{ "matcher": "startup", "hooks": [{ "type": "command",
    "command": "echo 'Before starting work, invoke the changelog skill in classify mode.'" }] }] }
  ```
  The `startup` matcher means it doesn't fire again on resume or compaction.

#### 13. Docs (`AGENTS.md`)
- **New "Changelog Rules" section:**
  - Every user-visible change ships an entry; internal work ships none.
  - Text is approved by the developer.
  - One file per entry plus the index.
  - Releases are cut only by the deploy workflow, and merging to `main` does not deploy.
- **Plan template:** a mandatory `Changelog: <type> (<audience>)` line at the top of
  Requirements.
- **Invariants:**
  - `app_releases` is written only by `/api/release`.
  - `last_seen_release_id` only ever moves up.

### Architecture Diagram
```mermaid
flowchart TD
  dev[Developer session] -->|SessionStart hook| skill[changelog skill: classify]
  skill -->|work done, text approved| entry[lib/changelog/entries/*.ts]
  entry -->|PR merged| main[main branch, no auto deploy]
  main -->|workflow_dispatch| wf[deploy.yml]
  wf -->|vercel deploy --prod| prod[Production deployment]
  wf -->|POST /api/release + CRON_SECRET| api[/api/release]
  api -->|unreleased ids| rel[(app_releases)]
  api -->|appUpdated| push[sendPushToUsers]
  user[User opens app] --> gate[ChangelogGate in layout]
  gate -->|unseen releases| dlg[ChangelogDialog]
  dlg -->|close| act[markChangelogSeen] --> users[(users.last_seen_release_id)]
  footer[Footer version link] --> page[/changelog page]
```

### Key Decisions
- **Release unit:** releases are batched and cut at deploy time. Per-PR releases were rejected:
  they mean too many pushes.
- **Entry text in the repo** (TS files) rather than Markdown or a DB with admin UI: it is
  versioned with the code, typed, and testable.
- **Release log in the DB**, not commits back to `main`: no bot commits, and the "no commits
  without approval" rule holds.
- **Seen state in the DB per user**, not localStorage: once per person across devices, and the
  server decides, so nothing flashes.
- **Trigger** is the workflow calling the endpoint after the deploy. Rejected alternatives:
  - The Vercel webhook is likely unavailable on Hobby and unnecessary here.
  - `instrumentation.ts` fires per cold start.
  - The cron is up to 24 hours late.
- **Deploy** uses `vercel deploy --prod` from Actions. A Deploy Hook would need polling to know
  when the deploy finished.
- **New users** are filtered by `released_at > created_at`. No column has to be set in every
  user-insert path (`signUp`, `scripts/create-admin.ts`, `scripts/add-trainer.ts`, sync
  placeholders).

### Edge Cases / Risks
- **Preview deploys share the Neon DB:** `/api/release` refuses outside
  `VERCEL_ENV=production`.
- **Rollback to a build without some entries:** those ids are dropped from views. Re-deploying
  later does not re-release them, because they are already in `app_releases`.
- **Two quick deploys:** the second finds nothing new, so no duplicate push. The workflow's
  `concurrency` group serialises runs.
- **Push not configured or failing:** `sendPushToUsers` swallows errors, and the release is still
  stored.
- **User never closes the dialog** (kills the app): it shows again next time. This is intended.
- **Missed more than 5 releases:** only the latest 5 are shown, all marked seen; the older ones
  remain on `/changelog`.
- **Hobby plan:** `deploy --prod` is fine. Rollbacks only go to the previous deployment, which
  the design tolerates.
- **Forgetting secrets:** the workflow fails loudly (`--fail-with-body`). The deploy itself has
  already happened, and re-running only the release step is safe.
- **Removing auto-deploy of `main`** changes the team's habit. It is documented in AGENTS.md and
  README.

# Delivery Steps

### ✓ Step 1: Entry types, registry and pure release logic
Files: `lib/changelog/types.ts`, `lib/changelog/entries/index.ts`,
`lib/changelog/entries/2026-10-26-changelog-dialog.ts` (text drafted, then approved by the
user), `lib/changelog/release-logic.ts`.

### ✓ Step 2: Schema
Files: `lib/db/schema.ts` (`app_releases`, `users.last_seen_release_id`). Then run
`pnpm db:push`, after the user confirms.

### ✓ Step 3: Server queries, release endpoint, push event
Files: `lib/changelog/releases.ts`, `app/api/release/route.ts`, `proxy.ts`,
`lib/push-payload.ts`, `push.events.appUpdated` in `locales/*.json`.

### ✓ Step 4: Seen action and validation
Files: `lib/changelog-actions.ts`, `lib/validation/changelog.ts`.

### ✓ Step 5: Dialog, history page, footer link
Files:
- `components/changelog/{ChangelogGate,ChangelogDialog,ReleaseList}.tsx`
- `components/ui/dialog.tsx` (only if needed)
- `app/[lang]/layout.tsx`
- `app/[lang]/changelog/page.tsx`
- `components/layout/AppFooter.tsx`
- the `changelog` namespace in `locales/*.json`

### ✓ Step 6: Deploy workflow
Files: `.github/workflows/deploy.yml`, `vercel.json`, `README.md` (the deploy section). Hand the
user the secrets checklist.

### ✓ Step 7: Skill and SessionStart hook
Files: `.claude/skills/changelog/SKILL.md`, created with `/skill-creator:skill-creator`, and
`.claude/settings.json`.

### ✓ Step 8: Docs
Files: `AGENTS.md` (Changelog Rules, plan template line, invariants).

### ✓ Step 9: Tests
Files:
- `lib/changelog/release-logic.test.ts`
- `lib/changelog/entries/entries.test.ts`
- `lib/validation/changelog.test.ts`
- `lib/push-payload.test.ts` (appUpdated path)
- `components/changelog/ChangelogDialog.test.tsx`
- `components/changelog/ReleaseList.test.tsx`

`locales/locales.test.ts` picks up the new keys automatically.

### ✓ Step 10: Quality check
Run `pnpm check` (lint, type-check, tests). It must pass with no `any`.

# Testing

### Validation Approach
- **`release-logic.test.ts`:**
  - `unreleasedEntryIds`: none, some, or all released.
  - `releaseAudience`: all-only, admin-only, mixed (→ `'all'`), empty (→ `null`).
  - `buildReleaseViews`:
    - group order, empty groups dropped;
    - admin items hidden for players and shown for admins;
    - unknown (rolled-back) ids dropped;
    - a release left with no visible items dropped;
    - all 4 locales.
  - `unseenReleases`:
    - `lastSeenId` null, equal to the latest, or below;
    - `releasedAt` before, equal to and after `userCreatedAt` (strict);
    - the cap at 5 and the order newest first.
- **`entries.test.ts`:**
  - Ids are unique, and each id equals its file name (via `import.meta.glob` or `fs` in the
    node project).
  - Every file in `entries/` is in the index.
  - All 4 locales are non-empty, with no `TODO` or placeholder text.
  - `type` and `audience` are valid.
- **`validation/changelog.test.ts`:** non-integer, ≤ 0 and valid ids.
- **`ChangelogDialog.test.tsx`:**
  - It renders release headers, headings and bullets.
  - "Rozumiem" calls the action with the newest id and closes.
  - Esc closes and marks seen.
  - A failed action still closes.
- **`ReleaseList.test.tsx`:** the formatted header per locale, and no heading for an empty
  group.
- **Manual checks:**
  1. Locally, insert a release row with SQL. As a player, the dialog shows. After closing and
     reloading, it does not.
  2. As an admin, admin items are visible.
  3. A freshly signed-up and approved user sees nothing.
  4. `/changelog` lists the release, and the footer link works.
  5. Light/dark mode, phone width.
  6. `curl` `/api/release` locally with `VERCEL_ENV` unset returns 409.
- **After the setup is live:** trigger `deploy.yml` once. Check that a release row exists and
  the push arrives on a subscribed device. Re-run the workflow and check that no second release
  or push happens.
- **Final:** `pnpm check` passes.
