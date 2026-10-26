---
name: changelog
description: Classify the work of a session for the in-app changelog and write the user-facing changelog entry when the work is done. Use at the start of every session (the SessionStart hook asks for it), whenever work on a feature, improvement or bug fix is finished, when a plan's `Changelog:` line has to be filled, and when the user runs /changelog or asks to add, write or fix a changelog / "what's new" / release note entry — even if they don't say "changelog".
---

# Changelog

Users of this app (players, trainers, admins of a ninepin team, many of them not technical)
see a "What's new" dialog after each production release, built from entry files in
`lib/changelog/entries/`. This skill keeps those entries coming: it classifies the work when a
session starts and writes the entry when the work is done. The developer approves every text,
because players read it and it has to make sense to them.

The skill has two modes. Pick the one that fits the moment.

## Mode 1 — classify (session start)

Do this before starting any work in a new session, once.

1. Read the branch: `git branch --show-current`. Suggest a type from the prefix:

   | Prefix | Suggested type |
   |---|---|
   | `feat/` | feature |
   | `fix/` | fix |
   | `chore/`, `refactor/`, `test/`, `ci/`, `docs/` | internal |
   | `main` or anything else | no suggestion |

2. Ask the developer with **AskUserQuestion** (put the suggestion first and mark it
   "(Recommended)"):
   - **Type**: feature (something new users can do) · improvement (something existing works
     better) · fix (something broken now works) · internal (refactor, tests, tooling, docs —
     users see nothing) · no work (just questions or exploration).
   - **Audience**, only for feature / improvement / fix: `all` (everyone) or `admin` (only
     admin screens — `/money`, `/admin/*`, withdrawals management, sync). Admin items are hidden
     from players, so never mark something `all` that a player cannot see.

   If the developer already said what they are doing in their first message, still confirm in
   one question rather than assuming — the classification decides whether users get a push.

3. Record the answer:
   - If a plan file in `docs/plans/` is being written for this work, its Requirements start with
     `Changelog: <type> (<audience>)` — e.g. `Changelog: fix (all)` or `Changelog: internal`.
   - Otherwise just remember it for the session.

`internal` and `no work` end here: no entry is written. If the work later turns out to change
something users see, reclassify and say so.

## Mode 2 — write the entry (work done, or /changelog)

Run this when the feature / improvement / fix is finished and checks pass, before the developer
opens a PR. Also run it on `/changelog` or when asked to write an entry after the fact.

1. **Work out what users notice.** Look at the diff (`git diff main...HEAD` plus uncommitted
   changes) and the plan. One entry per change a user would notice; most work is one entry.
   Skip anything invisible to them.

2. **Draft the Slovak text.** One short sentence per entry, informal "ty" tone, as if telling a
   teammate. It must make sense to someone who has never seen the code and doesn't know the
   app's internals:
   - say what they can now do or what now works, not how it was built;
   - no technical words (API, cache, sync, component, endpoint, database, scraper);
   - name screens the way users see them ("na stránke hráča", "v prehľade pokút");
   - fixes say what used to go wrong in user terms.

   Good: `Na stránke hráča teraz uvidíš graf, koľko si dlhoval za jednotlivé zápasy.`
   Bad: `Pridaný MatchMoneyChart komponent do player detail page.`

3. **Translate** to cs, hu and sr with the same meaning and tone (Serbian in Latin script,
   matching `locales/sr.json`).

4. **Get approval.** Show all four texts plus type and audience to the developer and ask them
   to approve or correct. Never write the file before the developer approves — they check that
   the text reads well for non-players.

5. **Write the entry** at `lib/changelog/entries/<yyyy-mm-dd>-<slug>.ts`, with today's date and a
   short kebab-case slug. The `id` must equal the file name without `.ts`:

   ```ts
   import type { ChangelogEntry } from '../types';

   export default {
     id: '2026-11-02-match-money-chart',
     type: 'feature',
     audience: 'all',
     text: {
       sk: '…',
       cs: '…',
       hu: '…',
       sr: '…',
     },
   } satisfies ChangelogEntry;
   ```

6. **Register it** in `lib/changelog/entries/index.ts`: add the import and append it to
   `CHANGELOG_ENTRIES`. The list is explicit because a serverless function cannot read the
   directory at runtime; `lib/changelog/entries/entries.test.ts` fails if a file is missing from
   it.

7. Run `pnpm test:run lib/changelog` to confirm the entry passes the registry test.

To fix the text of an entry that is not released yet, edit its file. A released entry can be
edited the same way — its text is read from the code — but its id must never change, or it
counts as a new entry and is released a second time.

## What this skill never does

- **Commit, push or open a PR.** The project's git rules require an explicit request for each
  of those.
- **Release anything.** Releases are cut only by the Deploy GitHub workflow, which calls
  `POST /api/release` after deploying production. Merging to `main` does not deploy.
- **Write an entry for internal work**, or one the developer has not approved.
