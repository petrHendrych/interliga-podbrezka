# Context

The project runs on Node 22 (`.nvmrc`), Next 16.2.6, React 19.2.4 and TypeScript 5.9.3. The
goal is threefold:

1. Make Node 24 the project's Node version (already installed as `v24.19.0`, and nvm's
   `default` alias already points at 24), and record the pin for pnpm as well.
2. Upgrade the dependency tree to the latest stable versions, with Next and React first.
3. Get the speed of **TypeScript 7** (the native Go compiler) for `pnpm type-check`.

The blocker discovered while researching: `typescript@7.0.2` no longer ships the classic JS
compiler API. Its `exports` map is only `.` → `lib/version.cjs` plus `./unstable/*`, and there
is no `lib/typescript.js` and no `tsserver` binary. Three consumers in this repo need that API:

- `@typescript-eslint` (7.18 today, 8.67 latest) declares peer `typescript >=4.8.4 <6.1.0` and
  genuinely `require`s the compiler API for the type-aware rules that `eslint.config.mjs:24-30`
  turns on via `parserOptions.project`. Airbnb-typescript is built on those rules.
- Next probes `typescript/lib/typescript.js` by file path (`node_modules/next/dist/lib/
  verify-typescript-setup.js:70`, `has-necessary-dependencies.js:18`). If it is missing, Next
  tries to auto-install `typescript` and — worse, silently — `load-jsconfig.js:104` stops
  reading `tsconfig` `paths`, so the `@/*` alias dies.
- The `{"name": "next"}` tsconfig plugin and WebStorm both need a classic `tsserver`.

`@typescript/native-preview` is not the answer either: its last publish was 2026-07-07
(`7.0.0-dev.20260707.2`), superseded by stable `typescript@7.0.2`.

**Chosen approach: ship the Node 24 pin and the dependency upgrades now, defer TypeScript 7.**
Measured on this repo (cold, `--incremental false`): `tsc --noEmit` takes **3.6 s** and `eslint`
**6.9 s**. TypeScript 7 would cut the first to well under a second and leave the second
untouched, because `@typescript-eslint` keeps running on 5.9 either way — so the payoff today is
roughly three seconds, against carrying two compilers and two sets of diagnostics. The upgrade
becomes genuinely worthwhile once `typescript-eslint` supports TS 7 and Next stops probing
`typescript/lib/typescript.js`; at that point `typescript` simply moves to 7 as a single
dependency and lint plus build speed up too. Section 2 below is kept as the ready-to-run
follow-up.

ESLint stack stays on eslint 9 / `@typescript-eslint` 7.18 / airbnb — modernising it means
dropping the unmaintained `eslint-config-airbnb-typescript` and is out of scope here.

> Project rule (`AGENTS.md`, Plan Mode Rules) wants plans under `.junie/plans/`. Plan mode only
> permits editing this file, so **Step 0 of execution is to copy this plan to
> `.junie/plans/upgrade-node-24-next-16-3-typescript-7.md`**.

# Scope

**In scope:** Node 24 pin, pnpm/Vercel/CI node config, dependency upgrades to latest stable,
doc + memory sync.

**Out of scope / deferred:** TypeScript 7 (Section 2, revisit when `typescript-eslint` ships TS 7
support), eslint 10 / `@typescript-eslint` 8 migration (needs airbnb-typescript removal),
`drizzle-orm`/`drizzle-kit` 1.0 (still RC), vitest 5 (beta), any money-logic change.

# Technical Design

## 1. Node 24 pin

| File | Change |
| --- | --- |
| `.nvmrc` | `22` → `24` |
| `pnpm-workspace.yaml` | add `useNodeVersion: 24.19.0` |
| `package.json` | add `"engines": { "node": ">=24" }` and `"packageManager": "pnpm@10.29.2"` |
| `.github/actions/setup/action.yml` | comment says "vite and jsdom need Node 22.12+" — update to Node 24 / jsdom 30 (`^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0`). `node-version-file: .nvmrc` already picks the new value up. |

Notes:

- The setting lives in `pnpm-workspace.yaml`, not `.npmrc`: `use-node-version` is a pnpm-only
  key and npm warns `Unknown project config "use-node-version". This will stop working in the
  next major version of npm`. pnpm reads the camelCase `useNodeVersion` from the workspace file
  and reports it under the kebab-case name (`pnpm config get use-node-version` → `24.19.0`).
- What it actually does: pnpm fetches Node 24.19.0 into `~/Library/pnpm/nodejs/` and runs its
  own CLI on it, which is what silences `WARN Unsupported engine`. It does **not** override the
  Node that `pnpm run <script>` inherits — that still comes from `PATH`, where nvm wins. The
  real switch for scripts is `nvm use` against `.nvmrc`.
- `engines.node` is what Vercel reads to choose the deployment runtime — confirm the Vercel
  project offers 24.x before merging.

## 2. TypeScript 7 alongside 5.9 — DEFERRED, do not execute now

Kept here as the recipe for the follow-up. Trigger to revisit: `typescript-eslint` announces a
release whose `typescript` peer range includes 7.x.

`package.json`:

```jsonc
"devDependencies": {
  "typescript": "5.9.3",
  "tsgo": "npm:typescript@7.0.2"
}
```

```jsonc
"scripts": {
  "type-check": "node ./node_modules/tsgo/bin/tsc --noEmit --tsBuildInfoFile .tsbuildinfo.native",
  "type-check:legacy": "tsc --noEmit"
}
```

Why the path instead of a bare binary: `typescript@7.0.2` exposes its bin as `tsc`, the same
name `typescript@5.9.3` exposes, so letting pnpm link both is a coin flip. Calling
`node_modules/tsgo/bin/tsc` is deterministic. (If `bin/tsc` turns out not to be a Node shim,
drop the `node ` prefix and call the file directly.)

Separate `--tsBuildInfoFile` because `tsconfig.json` sets `incremental: true`: the native and
the JS compiler must not fight over `tsconfig.tsbuildinfo`. Add `.tsbuildinfo.native` to
`.gitignore`.

`type-check:legacy` stays as the TS 5.9 cross-check — useful when the two compilers disagree;
`pnpm check` keeps calling `type-check` (now the native one).

`tsconfig.json` needs no change. `plugins: [{"name": "next"}]` is a language-service-only field
that the native compiler ignores; `moduleResolution: "bundler"`, `paths` and the `.next/types`
includes are all supported.

## 3. Dependency targets

**dependencies**

| Package | From → To | Note |
| --- | --- | --- |
| `next` | 16.2.6 → 16.3.0 | primary |
| `react`, `react-dom` | 19.2.4 → 19.2.8 | primary, patch-level |
| `@base-ui/react` | 1.5.0 → 1.7.0 | two minors; portalled popups are test-covered |
| `lucide-react` | 1.17.0 → 1.31.0 | icons only |
| `resend` | 6.12.4 → 6.19.0 | |
| `jose` | 6.2.3 → 6.2.8 | auth tokens — `lib/auth.ts` tests must pass |
| `country-flag-icons` | 1.6.17 → 1.6.20 | |
| `@formatjs/intl-localematcher` | 0.8.10 → 0.8.13 | used by `proxy.ts` locale negotiation |
| `shadcn` | 4.8.3 → 4.17.0 | CLI only |
| `drizzle-orm` | 0.45.2 | unchanged — 1.0 is RC |

**devDependencies**

| Package | From → To | Note |
| --- | --- | --- |
| `eslint-config-next`, `@next/eslint-plugin-next` | 16.2.6 → 16.3.0 | track Next |
| `@types/node` | ^20 → ^24 (24.13.3) | match the Node 24 runtime, not the newest DT major |
| `@types/react` / `@types/react-dom` | 19.2.15 → 19.2.18 / 19.2.3 → 19.2.4 | |
| `@types/bcryptjs` | **remove** | deprecated stub; `bcryptjs@3` ships its own types |
| `@types/negotiator` | 0.6.4 → 0.6.5 | |
| `@eslint/eslintrc` | 3.3.5 → 3.3.6 | |
| `tailwindcss`, `@tailwindcss/postcss` | 4.3.0 → 4.3.3 | |
| `eslint-import-resolver-typescript` | 4.4.4 → 4.4.5 | |
| `jsdom` | 28.1.0 → 30.0.1 | needs Node ≥ 24.15 — hence the Node pin lands first |
| `tsx` | 4.22.4 → 4.23.12 | |
| `typescript` | `^5` unchanged (5.9.3) | TS 7 deferred, see Section 2 |
| `eslint`, `@typescript-eslint/*`, `eslint-config-airbnb*`, `eslint-plugin-*` | unchanged | see Out of scope |
| `vite` 8.2.1, `vitest` 4.1.10, `@vitejs/plugin-react` 6.0.5, `drizzle-kit` 0.31.10, `@testing-library/*` | already latest stable | |

## 4. Documentation sync

- `AGENTS.md` → Testing Rules says "Run with `nvm use 22` — `vite` and `jsdom` need Node ≥
  22.12". Update to Node 24 and the new jsdom floor.
- After execution, update the memory file `project_node_version.md` (it records "shell default
  is Node 18; Next 16 needs `nvm use 22`").

# Edge Cases / Risks

- **base-ui 1.5 → 1.7.** Portalled popups carry no role and are read off `[data-base-ui-portal]`
  in the tests; a markup change there breaks `components/MatchFineTooltip.test.tsx` and
  `components/dashboard/SeasonLeagueFilter.test.tsx`. Also re-check the z-index invariant
  (Positioner above the blurred sticky filter bar).
- **jsdom 30** can change DOM behaviour under the 11 `dom`-project test files.
- **Vercel** must offer Node 24.x for `engines.node: ">=24"`; otherwise pin `"24.x"`.
- No money logic changes, so no new money tests are due — but `pnpm check` (lint + type-check +
  tests) must pass, per the Quality Check Rules.

# Delivery Steps

### Step 0: Copy this plan into the repo
Write it to `.junie/plans/upgrade-node-24-next-16-3-typescript-7.md` and mark steps `✓` there
while executing.

### Step 1: Pin Node 24
Touches `.nvmrc`, new `.npmrc`, `package.json` (`engines`, `packageManager`),
`.github/actions/setup/action.yml` comment. Then `nvm use`, `node -v` → `v24.19.0`,
`pnpm -v` (user-agent should report node 24 once `use-node-version` takes effect).

### Step 2: Safe patch/minor wave
`jose`, `country-flag-icons`, `@formatjs/intl-localematcher`, `@eslint/eslintrc`, `tailwindcss`,
`@tailwindcss/postcss`, `eslint-import-resolver-typescript`, `@types/negotiator`, `tsx`,
`@types/react`, `@types/react-dom`. Touches `package.json`, `pnpm-lock.yaml`. Run `pnpm check`.

### Step 3: Next 16.3 + React 19.2.8
`next`, `react`, `react-dom`, `eslint-config-next`, `@next/eslint-plugin-next`. Touches
`package.json`, `pnpm-lock.yaml`. Run `pnpm check` **and** `pnpm build`.

### Step 4: Toolchain deps that need Node 24
`jsdom` → 30.0.1, `@types/node` → ^24, remove `@types/bcryptjs`. Touches `package.json`,
`pnpm-lock.yaml`. Run `pnpm test:run` and `pnpm type-check`; check `lib/auth.ts` and anything
importing `bcryptjs` still types.

### Step 5: UI and service deps
`@base-ui/react` → 1.7.0, `lucide-react` → 1.31.0, `resend` → 6.19.0, `shadcn` → 4.17.0.
Touches `package.json`, `pnpm-lock.yaml`. Run `pnpm test:run`, then a manual popup smoke test
(Step "Verification" below).

### Step 6: TypeScript 7 — SKIPPED
Deferred per Section 2. Nothing to do in this batch.

### Step 7: Docs and memory
Update the `nvm use 22` line in `AGENTS.md` (Testing Rules). Update the
`project_node_version.md` memory file.

### Step 8: Mandatory final check
`pnpm check` (lint + type-check + tests) and `pnpm build`, on Node 24. Required by the Quality
Check Rules.

# Testing

### Validation Approach

- `pnpm check` — eslint (airbnb, unchanged stack), `tsc --noEmit`, all 23 test files / 183 cases.
  Baseline before the upgrade: lint 6.9 s, type-check 3.6 s.
- `pnpm build` — Next 16.3 production build with its own TS pass and `tsconfig` `paths` (`@/*`).
- `pnpm dev` manual smoke, **mobile viewport first**: a match tooltip
  (`components/MatchFineTooltip.tsx`), the dashboard `SeasonLeagueFilter` select, and one
  dialog — verifying base-ui 1.7 still portals correctly and paints above the sticky blurred
  filter bar.
- CI: open the PR against `main` and confirm all three jobs (lint, type-check, tests) pass on
  Node 24.
- Money logic is untouched, so no new money tests are required; the existing
  `lib/money-rules.test.ts` and `lib/db-utils.test.ts` must stay green.
