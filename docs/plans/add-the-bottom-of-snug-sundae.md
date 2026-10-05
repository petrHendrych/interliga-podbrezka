# Requirements

### Overview & Goals
Show a small `Version: 1.87.431` line at the bottom of every page. The number comes from the
project's Vercel deployments, so every deploy produces a new version automatically.

**Version scheme — `MAJOR.PROD.TOTAL`**
- `MAJOR`: set by hand. It is the major of `package.json` `version`, bumped for big releases.
- `PROD`: the number of production deployments, including the build that is running.
- `TOTAL`: the number of all deployments (preview and production), including the build that is running.

So a preview deploy bumps only `TOTAL`, and a production deploy bumps `PROD` and `TOTAL`.
The number is fixed when the deployment is built. If you instantly roll back to an older
deployment, the footer shows that deployment's own number, which is the correct version.

### Scope
**In scope**
- Compute the version once per build, in `next.config.ts`, from the Vercel REST API.
- Footer rendered in the root layout `app/[lang]/layout.tsx`, so it is on every page.
- A localized label in `common.version` in all four locales.
- Fallbacks that never fail the build.
- Unit tests for the pure version logic.

**Out of scope**
- Changelog, release notes, git tags.
- Showing the version anywhere other than the footer (settings page, API).
- Switching `vercel.json` to `vercel.ts`.

### Functional Requirements
1. Every page ends with a muted, centred, `text-xs` line: `Verzia: 1.87.431` (sk), `Verze:` (cs),
   `Verzió:` (hu), `Verzija:` (sr).
2. Production and preview builds on Vercel show `MAJOR.PROD.TOTAL`.
3. If the count can't be read on Vercel (no token, API error, timeout), the footer shows
   `MAJOR.x.x+<7-char commit sha>` and the build still succeeds.
4. Local `next dev` / `next build` (no `VERCEL` env) shows `MAJOR.0.0-dev`.
5. The footer works in light and dark mode and on phone width, and it sits above the iOS
   safe-area inset.

# Technical Design

### Current Implementation
- `package.json` `version` is `0.1.0` and is not used anywhere.
- `app/[lang]/layout.tsx` renders `<Header>` … `<main className="flex flex-1 flex-col pb-[var(--app-safe-bottom)]">`. There is no footer and no fixed bottom nav.
- `next.config.ts` exports a plain object. It has no `env`.
- Vercel injects `VERCEL`, `VERCEL_ENV`, `VERCEL_PROJECT_ID`, `VERCEL_GIT_COMMIT_SHA` at build. There is no deployment counter, so the count has to come from `GET https://api.vercel.com/v6/deployments`.
- Vercel project: `interliga-podbrezka` (`prj_TSph3iDuUtnclwp6kTTX0BMrisiL`), team `team_msx5R81CCiOuO5oPlc58SIvj`.

### Proposed Changes

#### 1. Version logic (`lib/app-version.ts`, new, db-free)
This file only does pure work plus one injectable `fetch`. `next.config.ts` imports it by relative path, so it must not import `@/` aliases or anything that reaches `lib/db.ts`.

```ts
export type DeploymentSummary = { target: string | null };

export function majorFromPackageVersion(version: string): number; // '1.0.0' -> 1

export function formatAppVersion(major: number, production: number, total: number): string;
// -> `${major}.${production}.${total}`

// The running build is still BUILDING, so the API's READY list never contains it: add it.
export function countDeployments(
  ready: DeploymentSummary[],
  currentEnv: string | undefined,
): { production: number; total: number };

export function fallbackVersion(major: number, sha: string | undefined): string;
// sha ? `${major}.x.x+${sha.slice(0, 7)}` : `${major}.0.0-dev`

export async function resolveAppVersion(
  env: NodeJS.ProcessEnv,
  major: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string>;
```

`resolveAppVersion`:
- If `env.VERCEL` is not set, return `${major}.0.0-dev`.
- If `VERCEL_TOKEN`, `VERCEL_TEAM_ID` or `VERCEL_PROJECT_ID` is missing, use `fallbackVersion(major, env.VERCEL_GIT_COMMIT_SHA)`.
- Otherwise page through `/v6/deployments?projectId=…&teamId=…&state=READY&limit=100&until=<pagination.next>` with an `Authorization: Bearer` header and `AbortSignal.timeout(10_000)`. Collect `{ target }`, then call `countDeployments(list, env.VERCEL_ENV)`.
- On any thrown error or non-2xx response, log one `console.warn` and use `fallbackVersion`.

`countDeployments`: `total = ready.length + 1`; `production = ready.filter(target === 'production').length + (currentEnv === 'production' ? 1 : 0)`.

#### 2. Build-time injection (`next.config.ts`)
Turn the default export into an async config function and add `env`:

```ts
import packageJson from './package.json';
import { majorFromPackageVersion, resolveAppVersion } from './lib/app-version';

export default async function config(): Promise<NextConfig> {
  const appVersion = await resolveAppVersion(
    process.env,
    majorFromPackageVersion(packageJson.version),
  );
  return { ...nextConfig, env: { APP_VERSION: appVersion } };
}
```
The existing `experimental`, `redirects` and `headers` stay unchanged in `nextConfig`. If importing `package.json` trips `resolveJsonModule`, read the version with `fs.readFileSync` instead.

#### 3. Footer (`components/layout/AppFooter.tsx`, new, server component)
```tsx
export function AppFooter({ label }: { label: string }) {
  return (
    <footer className="px-4 pt-6 pb-[calc(0.75rem+var(--app-safe-bottom))] text-center text-xs text-muted-foreground">
      {label.replace('{version}', process.env.APP_VERSION ?? '')}
    </footer>
  );
}
```
Use whatever placeholder helper the codebase already has for `{date}`-style strings, if there is one.

#### 4. Layout (`app/[lang]/layout.tsx`)
- Render `<AppFooter label={dict.common.version} />` right after `<main>`.
- Move the `pb-[var(--app-safe-bottom)]` safe-area padding from `<main>` to the footer, so the inset is applied once and stays below the footer.

#### 5. Locales (`locales/{sk,cs,hu,sr}.json`)
Add `common.version`: sk `"Verzia: {version}"`, cs `"Verze: {version}"`, hu `"Verzió: {version}"`, sr `"Verzija: {version}"`.

#### 6. `package.json`
Bump `version` from `0.1.0` to `1.0.0`, so the first footer reads `1.<prod>.<total>`.

#### 7. Vercel env vars (dashboard, done by you)
- `VERCEL_TOKEN`: a read-only token scoped to team `petrhendrychs-projects`.
- `VERCEL_TEAM_ID`: `team_msx5R81CCiOuO5oPlc58SIvj`.

Set both for Production and Preview. They are build-time only and never get a `NEXT_PUBLIC_` prefix.

### Architecture Diagram
```mermaid
flowchart LR
  B[next build on Vercel] --> C[next.config.ts]
  C --> R[resolveAppVersion]
  R -->|VERCEL_TOKEN| API[(Vercel API /v6/deployments READY)]
  API --> CD[countDeployments +1 for current build]
  CD --> F[formatAppVersion → 1.87.431]
  R -->|no token / error| FB[fallbackVersion → 1.x.x+sha]
  F & FB --> E[env.APP_VERSION inlined]
  E --> L[app/[lang]/layout.tsx → AppFooter]
```

### Key Decisions
- **Vercel API instead of a git commit count.** Vercel clones shallowly, so `git rev-list --count` is wrong there. The API also counts real deployments, which is what you asked for.
- **Compute at build time, not per request.** One API call per build, zero runtime cost, and the number stays frozen per deployment, so rollbacks show their own version.
- **Count READY deployments + 1.** Failed and cancelled builds never reached anyone, so they don't use up a number. The running build is not READY yet, so it adds itself.
- **Never fail the build on the footer.** You chose the SHA fallback.
- **`APP_VERSION` through `next.config` `env`.** Next inlines it at build. The footer is a server component, so nothing else is needed.

### Edge Cases / Risks
- A concurrent build that finishes READY while this one is building can make two deployments share a number. That is rare and harmless.
- "Promote to production" of an existing preview deployment doesn't rebuild, so it keeps its preview-built version. The `PROD` digit then lags until the next production build. This is accepted.
- An expired token makes the API return 401, which falls back to `1.x.x+sha`. A warning shows in the build log.
- The service worker may serve a cached page with the previous version until it refreshes. This is acceptable.
- `next.config.ts` imports from `lib/` by relative path, and that import graph must stay free of `lib/db.ts`.

# Delivery Steps

### Step 1: Write the version tests first
Create `lib/app-version.test.ts`. Touches only that new file. Run it and confirm it fails because the module is missing.

### Step 2: Implement `lib/app-version.ts`
Make the Step 1 tests pass. Touches `lib/app-version.ts`.

### Step 3: Inject the version at build
Touches `next.config.ts` and `package.json` (`1.0.0`). Verify with `pnpm dev`: `process.env.APP_VERSION` resolves to `1.0.0-dev`.

### Step 4: Add the footer and its labels
Touches `components/layout/AppFooter.tsx`, `app/[lang]/layout.tsx` and `locales/{sk,cs,hu,sr}.json`. Check it in the browser at phone width in light and dark mode.

### Step 5: Set the Vercel env vars (you)
Add `VERCEL_TOKEN` and `VERCEL_TEAM_ID` in the Vercel dashboard. After the next deploy, the footer shows `1.<prod>.<total>`.

### Step 6: Quality check
Run `pnpm check` (lint, type check, tests). Everything must pass.

# Testing

### Validation Approach
- `lib/app-version.test.ts` (node project), table-driven, with an injected fake `fetch`:
  - `formatAppVersion(1, 87, 431)` → `1.87.431`.
  - `countDeployments`: a production build adds 1 to both counts, a preview build adds 1 to `total` only, and an empty list gives `1.1.1` for prod and `1.0.1` for preview.
  - Pagination: two pages joined through `pagination.next` are both counted.
  - No `VERCEL` env → `1.0.0-dev`.
  - Missing token → `1.x.x+abc1234` (SHA cut to 7 chars). No SHA either → `1.0.0-dev`.
  - Non-2xx response and a thrown fetch both fall back to the SHA version and never throw.
  - `majorFromPackageVersion('1.0.0')` → 1, and `'0.1.0'` → 0.
- `locales/locales.test.ts` already checks that all four locales have the same keys and `{version}` placeholder.
- Manual: `pnpm dev` shows `Verzia: 1.0.0-dev` at the bottom of `/sk`, `/sk/rules` and `/sk/settings`, in light and dark mode at 375 px. Switch to `/hu` and check `Verzió:`.
- After deploy: the footer on a preview URL and on production matches the counts in the Vercel dashboard, and the next deploy bumps it.
- Final: `pnpm check` passes.
