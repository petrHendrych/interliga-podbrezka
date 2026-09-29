# Requirements

### Overview & Goals

The app is deployed on Vercel over HTTPS, is mobile-first by design, and is used by team
members on their phones. Today it can only be reached through a browser tab: no home-screen
icon, no standalone window, no offline behaviour, and a session that expires after two hours.

The goal is to make it installable as a Progressive Web App on both iPhone (Safari, iOS 16.4+)
and Android (Chrome), so it launches from the home screen in a standalone window, respects the
notch and home-indicator safe areas, shows a localized offline screen instead of a browser
error, and keeps the user signed in for a realistic amount of time.

Nothing in the money calculation, sync, or database layer changes.

### Scope

**In scope**

- Web app manifest (`app/manifest.ts`) served at `/manifest.webmanifest`.
- PWA icon set: 192/512 standard + 192/512 maskable, generated once from `assets/brand-mark.svg`.
- `viewport` export (`themeColor` light/dark, `viewportFit: 'cover'`) and `appleWebApp` metadata.
- Safe-area handling for the sticky header, the two sticky filter bars, and dialogs.
- A hand-written service worker (`public/sw.js`) that precaches static assets and an offline
  fallback page, and **never** caches authenticated HTML or RSC payloads.
- Localized `/{lang}/offline` route, allowlisted in `proxy.ts`.
- Install prompt: `beforeinstallprompt` button on Android, "Add to Home Screen" instructions
  on iOS, dismissible, hidden when already installed.
- Rolling 30-day session with refresh in `proxy.ts`.
- `experimental.useOffline` + `loading.tsx` shells so soft navigations and server actions
  retry instead of throwing when the network drops.
- Security/caching headers for `/sw.js` in `next.config.ts`.
- New `pwa` namespace in all four `locales/*.json`.

**Out of scope**

- Web Push notifications (VAPID keys, `push_subscriptions` table, permission UI). Nothing here
  blocks adding them later — the service worker is written so `push`/`notificationclick`
  handlers can be appended.
- Offline caching of authenticated pages or DB data. The app shows per-player money data; a
  runtime cache of authenticated responses would leak one user's balances to the next user of a
  shared phone and would add a second, unmanaged staleness layer on top of the server-side cache
  invariants in `AGENTS.md`.
- Background sync / offline write queueing for server actions.
- iOS `apple-touch-startup-image` splash sets. iOS builds a launch screen from the manifest
  `name`, `background_color` and icon, which is enough.
- Per-locale manifests. `app/manifest.ts` is a single non-localized route; the app name is a
  proper noun and the description is written in Slovak, the default locale.

### User Stories

1. As a player on Android, I open the site in Chrome, see an "Install app" button, tap it, and
   get an icon on my home screen that opens the app without browser chrome.
2. As a player on iPhone, I see an instruction card telling me to tap Share → Add to Home
   Screen, and after doing so the app opens full-screen with the status bar area painted by the
   app's own header rather than a white strip.
3. As an installed user, the header sits below the notch, the sticky season/league filter bar
   still lines up under the header, and dialog buttons are not covered by the home indicator.
4. As an installed user who loses signal, I get the app's own offline screen in my language
   instead of the browser's error page, and when signal returns a pending navigation or a
   pending form submit completes on its own.
5. As an installed user, I sign in once and stay signed in for a month of regular use instead of
   being kicked out every two hours.

# Technical Design

### Current Implementation

- **No root `app/layout.tsx`.** `app/[lang]/layout.tsx:54` is the root layout — `<html>`/`<body>`
  live there. Metadata file conventions (`app/favicon.ico`, `app/icon.svg`,
  `app/apple-icon.png` 180×180) already sit at the `app/` root.
- **No `viewport` export anywhere**, so Next emits only its default
  `width=device-width, initial-scale=1`. No `theme-color`, no `viewport-fit=cover`.
- **No manifest, no service worker, no 192/512 icons.** `public/` holds only the Next
  boilerplate SVGs and `public/players/*.jpg`.
- **`proxy.ts:101` matcher** is `'/((?!_next/static|_next/image|favicon.ico|.*\\.).*)'`. Every
  path containing a dot escapes the proxy, so `/manifest.webmanifest` and `/sw.js` are already
  unauthenticated. Any *dot-less* new route (`/offline`) would be locale-redirected and then
  session-gated. Public allowlist is `proxy.ts:32`
  `['/sign-in', '/sign-up', '/opengraph-image']`.
- **Session**: `lib/session.ts:7` sets a 2-hour cookie; `lib/auth.ts:25`
  `.setExpirationTime('2h')`. No refresh anywhere. `lib/session.ts:29` `clearSession()` omits
  `path: '/'`, so it does not reliably match the cookie it is trying to delete.
- **Sticky chrome**: `components/layout/Header.tsx:32` is `sticky top-0 z-50 … backdrop-blur`
  with an `h-16` row; `app/[lang]/page.tsx:316` and `app/[lang]/player/[id]/page.tsx:145` are
  both `sticky top-16 z-30`, hardcoded to that height. No `env(safe-area-inset-*)` in the repo.
- **Theme colours** exist only as OKLCH variables: `app/globals.css:62`
  `--background: oklch(0.97 0.003 264.695)` and `app/globals.css:114`
  `--background: oklch(0.129 0.042 264.695)`. No hex source of truth.
- **No `loading.tsx`, `error.tsx`, or `not-found.tsx`** anywhere in `app/`.
- `next.config.ts` is empty. `vercel.json` holds only the scrape cron.
- Inputs use `text-base` (`components/ui/input.tsx:10`) with no `md:text-sm`, so iOS will not
  zoom on focus — no change needed there.

### Proposed Changes

#### 1. Icon assets (`scripts/generate-pwa-icons.ts`, `public/icons/*`)

`assets/brand-mark.svg` (64×64, light-on-dark gradient pin + red ball) is the source. Add
`sharp` as a **devDependency** and a one-off script, run manually, output committed:

```ts
// scripts/generate-pwa-icons.ts
// Run once with `pnpm tsx scripts/generate-pwa-icons.ts` after changing assets/brand-mark.svg.
const BACKGROUND = '#020618'; // manifest background_color, matches the OG image gradient end
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, padding: 0.10 },
  { file: 'icon-512.png', size: 512, padding: 0.10 },
  { file: 'icon-maskable-192.png', size: 192, padding: 0.20 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.20 },
];
```

Each output is the SVG rasterised to `size * (1 - 2 * padding)` and composited centred on a
solid `BACKGROUND` square of `size`. The 20 % padding on the maskable variants keeps the mark
inside Android's 80 % safe circle so the pin is not cropped by a circular or squircle mask.

`app/apple-icon.png` (180×180) stays as-is and keeps serving `apple-touch-icon`.

#### 2. Manifest (`app/manifest.ts`)

New file at the **`app/` root** — sibling of `icon.svg`, not inside `[lang]`.

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Interliga Podbrezová',
    short_name: 'Interliga',
    description: '…', // Slovak, mirrors locales/sk.json home.pageDescription
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['standalone', 'minimal-ui'],
    orientation: 'portrait',
    lang: 'sk',
    dir: 'ltr',
    background_color: '#020618',
    theme_color: '#020618',
    prefer_related_applications: false,
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

Notes that drive these values:

- `start_url: '/'` deliberately has no locale. The proxy redirects it to the locale from the
  `next-locale` cookie (`proxy.ts:9`), so an installed app follows the user's chosen language
  instead of freezing Slovak into the WebAPK at install time. The one extra 307 on cold start is
  the price.
- `id: '/'` pins the app identity so a later `start_url` change does not register as a second app.
- `scope: '/'` must cover every locale prefix.
- `purpose: 'any'` and `purpose: 'maskable'` are separate entries; a single
  `purpose: 'any maskable'` entry makes Chrome apply mask padding to the browser tab icon too.

Also add `manifest: '/manifest.webmanifest'` explicitly to the returned object in
`generateMetadata` (`app/[lang]/layout.tsx:34`). Next resolves `app/manifest.ts` into
`staticFilesMetadata` automatically (`node_modules/next/dist/lib/metadata/resolve-metadata.js:159`),
but the root layout lives one segment deeper at `app/[lang]/layout.tsx`; setting it explicitly
makes the `<link rel="manifest">` deterministic rather than dependent on that resolution.

#### 3. Viewport and iOS metadata (`app/[lang]/layout.tsx`)

Add a static `viewport` export alongside the existing async `generateMetadata`:

```ts
import type { Viewport } from 'next';

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f5f7' },
    { media: '(prefers-color-scheme: dark)', color: '#020618' },
  ],
  viewportFit: 'cover',
  width: 'device-width',
  initialScale: 1,
};
```

`#f4f5f7` and `#020618` are the sRGB conversions of the two `--background` OKLCH values in
`app/globals.css:62` and `:114`. Add a comment next to each OKLCH declaration naming its hex
twin so the two stay in sync — this is a *why* comment and is allowed under the Comment Rules.

Do **not** set `maximumScale: 1` / `userScalable: false`. Inputs are already 16px so iOS will
not zoom on focus, and disabling pinch-zoom breaks accessibility.

In `generateMetadata`, add:

```ts
appleWebApp: {
  capable: true,
  title: 'Interliga',
  statusBarStyle: 'black-translucent',
},
```

`black-translucent` + `viewportFit: 'cover'` lets the existing blurred `bg-background/95`
header extend under the status bar, which is what makes it read as native. It is also exactly
what forces the safe-area work in the next section — with `default` the header would be fine
but the app would show an inert white strip above it.

#### 4. Safe areas (`app/globals.css`, `components/layout/Header.tsx`, two sticky bars, `components/ui/alert-dialog.tsx`)

In `app/globals.css`, add to `:root`:

```css
--app-header-height: 4rem;      /* the h-16 row inside Header.tsx */
--app-safe-top: env(safe-area-inset-top, 0px);
--app-safe-bottom: env(safe-area-inset-bottom, 0px);
```

and in the base layer:

```css
html {
  /* Standalone mode has no browser chrome to absorb the bounce; without this iOS
     rubber-bands the whole app and Android fires pull-to-refresh on the dashboard. */
  overscroll-behavior-y: contain;
}
body {
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
}
```

Then:

- `components/layout/Header.tsx:32` — add `pt-[var(--app-safe-top)]` to the `<header>`. The
  `h-16` rows inside stay untouched, so the blur simply grows upward into the status bar.
- `app/[lang]/page.tsx:316` and `app/[lang]/player/[id]/page.tsx:145` — replace `top-16` with
  `top-[calc(var(--app-header-height)+var(--app-safe-top))]`. Without this the filter bar pins
  under the notch and the first table row hides behind it.
- `components/ui/alert-dialog.tsx:46` — add `pb-[var(--app-safe-bottom)]` to the content so the
  confirm/cancel row clears the iOS home indicator.
- `app/[lang]/layout.tsx:79` — add `pb-[var(--app-safe-bottom)]` to `<main>` so the last row of
  every page is reachable.

#### 5. Offline route (`app/[lang]/offline/page.tsx`, `proxy.ts`)

A server component using the dictionary, rendering a centred card: title, explanation, and a
"Try again" client button that calls `location.reload()`.

`proxy.ts:32` grows to `['/sign-in', '/sign-up', '/opengraph-image', '/offline']`. This is
required for two reasons: the service worker precaches the page at install time (possibly
before sign-in), and an expired session must not turn the offline fallback into a sign-in
redirect that then also fails offline.

The page still renders inside the root layout, so it shows the header in its signed-out state
when served from cache. That is cosmetic and accepted.

#### 6. Service worker (`public/sw.js`, `next.config.ts`, `components/pwa/ServiceWorkerRegistrar.tsx`)

`public/sw.js` is hand-written plain JS (not TypeScript, not bundled) so it is served from the
origin root and can claim scope `/`.

```js
const CACHE = 'ilp-static-v1'; // bump on every change to this file's precache list
const OFFLINE_URLS = ['/sk/offline', '/cs/offline', '/hu/offline', '/sr/offline'];
const PRECACHE = [...OFFLINE_URLS, '/icons/icon-192.png', '/icons/icon-512.png'];
const CACHE_FIRST_PREFIXES = ['/_next/static/', '/icons/', '/players/'];
```

- `install` — `caches.open(CACHE).then(c => c.addAll(PRECACHE))`, then `self.skipWaiting()`.
- `activate` — delete every cache whose key is not `CACHE`, then `self.clients.claim()`.
- `fetch` — bail out (no `respondWith`) unless the request is same-origin **and**
  `request.method === 'GET'` **and** it carries no `RSC` header and no `_rsc` query param.
  Server actions are `POST` and RSC payloads carry those markers, so both flow straight to the
  network and are never cached. Then:
  - `request.mode === 'navigate'` → network only; on rejection, serve
    `caches.match('/' + localeFromPath(url) + '/offline')`, falling back to `/sk/offline`.
    **Successful navigations are never written to the cache** — they are authenticated HTML
    containing one player's money data.
  - URL starts with one of `CACHE_FIRST_PREFIXES` → cache-first, populate on miss. These are
    content-hashed or static files, so a stale hit is impossible for `_next/static` and
    harmless for icons and player photos.
  - anything else → passthrough.
- `message` — on `{ type: 'CLEAR_CACHES' }`, delete every cache. Wired to `signOut` so a shared
  phone keeps nothing.

`next.config.ts` gains a `headers()` block:

```ts
async headers() {
  return [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
      ],
    },
  ];
}
```

Without `no-cache` the browser can pin an old worker for 24 h and the app becomes unfixable
remotely.

`components/pwa/ServiceWorkerRegistrar.tsx` (`'use client'`, renders `null`) registers in a
`useEffect`, guarded on `process.env.NODE_ENV === 'production'` and `'serviceWorker' in navigator`,
with `{ scope: '/', updateViaCache: 'none' }`. Registering in dev would serve stale Turbopack
chunks and is the single most common way to brick a local Next dev server.

Mounted from `app/[lang]/layout.tsx` inside `ThemeProvider`.

`lib/auth-actions.ts` `signOut` cannot talk to the service worker (it is server-side), so the
cache clear is posted from the client: `components/layout/UserDropdown.tsx` and
`components/layout/MobileNav.tsx` call a small
`lib/pwa/clear-service-worker-caches.ts` helper before invoking the action.

#### 7. Install prompt (`lib/hooks/usePwaInstall.ts`, `components/pwa/InstallPrompt.tsx`, `locales/*.json`)

`lib/hooks/usePwaInstall.ts` mirrors the shape of the existing `lib/hooks/useSyncData.ts`
(plain `useState` + `useCallback`, no context) and returns:

```ts
{ canPrompt: boolean; isIOS: boolean; isStandalone: boolean; promptInstall: () => Promise<void>; }
```

- `isStandalone` — `window.matchMedia('(display-mode: standalone)').matches` **or**
  `(navigator as NavigatorWithStandalone).standalone === true`. iOS Safari only sets the second.
  Type it with a local interface; `any` is banned.
- `canPrompt` — a captured `beforeinstallprompt` event exists. The listener must
  `event.preventDefault()` and stash the event, otherwise Chrome shows its own mini-infobar and
  the event is gone by the time the user clicks.
- `isIOS` — user-agent test, the only option: Safari has no `beforeinstallprompt` and never will.
- Uses the existing mount-guard pattern (`components/layout/MobileNav.tsx:52-58`) so nothing is
  read from `window` during SSR or hydration.

`components/pwa/InstallPrompt.tsx` (`'use client'`) renders a dismissible card under the header.
It returns `null` when `isStandalone`, when neither `canPrompt` nor `isIOS`, or when
`localStorage['pwa-install-dismissed']` is set. On Android it renders an install button; on iOS
it renders the Share → Add to Home Screen instructions.

New `pwa` namespace added to **all four** `locales/{sk,cs,hu,sr}.json` —
`locales/locales.test.ts` enforces exact key and placeholder parity, so a missing translation
fails CI:

```
pwa.installTitle, pwa.installDescription, pwa.installButton, pwa.dismiss,
pwa.iosInstructionsTitle, pwa.iosInstructionsStep1, pwa.iosInstructionsStep2,
pwa.offlineTitle, pwa.offlineDescription, pwa.retry
```

#### 8. Rolling session (`lib/session-config.ts`, `lib/auth.ts`, `lib/session.ts`, `proxy.ts`)

New db-free `lib/session-config.ts` — imported by both `lib/session.ts` (server) and `proxy.ts`,
following the `lib/withdrawal-categories.ts` pattern from the Client/Server Boundary invariant:

```ts
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const SESSION_REFRESH_AFTER_SECONDS = SESSION_MAX_AGE_SECONDS / 2;
export const SESSION_COOKIE_NAME = 'session';
```

- `lib/auth.ts` — `encrypt()` takes the expiry from `SESSION_MAX_AGE_SECONDS` instead of the
  literal `'2h'`. `decrypt()` returns `exp` and `iat` alongside `user` so the proxy can decide
  whether to refresh.
- `lib/session.ts` — uses the shared constant, and `clearSession()` gains
  `path: '/'` (and `httpOnly`/`secure`/`sameSite` to match), which it is missing today.
- `proxy.ts` — after a successful `decrypt`, if `exp - now < SESSION_REFRESH_AFTER_SECONDS`,
  re-`encrypt` the payload and `response.cookies.set(...)` on the `NextResponse.next()`. Only
  past the halfway mark, so a `Set-Cookie` is not attached to every response.

Why this matters for the PWA specifically: an installed iOS PWA has its own cookie jar separate
from Safari, so the user signs in once *inside* the installed app. A 2-hour cookie would make
that a weekly chore. The cookie is `httpOnly` and server-set, so Safari's ITP 7-day cap on
script-writable storage does not apply to it.

#### 9. Connectivity-aware navigation (`next.config.ts`, `app/[lang]/loading.tsx`, `components/pwa/OfflineBanner.tsx`)

```ts
experimental: { useOffline: true },
```

With it, a failed navigation, prefetch, or server action no longer throws — Next keeps it
pending and retries once a `HEAD` probe succeeds
(`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/useOffline.md`).
That is what turns "tap a link on a dead connection" from an error into a spinner that resolves
by itself.

It needs a prefetchable shell to render into. The repo has **no** `loading.tsx`, so add
`app/[lang]/loading.tsx` (a simple skeleton) — that boundary is what `<Link>` prefetches and
what renders offline.

`components/pwa/OfflineBanner.tsx` (`'use client'`) uses `useOffline()` from `next/offline` and
renders a `role="status"` strip under the header while offline. Mounted in
`app/[lang]/layout.tsx`.

This flag is experimental in Next 16.3. It is isolated to one config line plus one component,
so if it misbehaves in production it can be reverted without touching anything else in this
plan — the service worker and the offline page keep working on their own.

### Architecture Diagram

```mermaid
flowchart TD
    U[Home screen icon] -->|start_url /| P{proxy.ts}
    P -->|no locale| R[307 to /{locale}]
    R --> P
    P -->|dot in path: manifest.webmanifest, sw.js, icons| SKIP[bypasses proxy entirely]
    P -->|/offline allowlisted| OFF[app/lang/offline/page.tsx]
    P -->|session valid| REFRESH{exp - now < 15d?}
    REFRESH -->|yes| SETC[re-issue cookie on NextResponse.next]
    REFRESH -->|no| APP[app/lang/layout.tsx]
    SETC --> APP
    P -->|no session| SI[/locale/sign-in/]

    APP --> SW[ServiceWorkerRegistrar]
    SW -->|register /sw.js scope /| W[public/sw.js]
    W -->|install| PC[precache 4 offline pages + icons]
    W -->|fetch: navigate| NET[network only]
    NET -->|fails| OFF
    W -->|fetch: /_next/static, /icons, /players| CF[cache-first]
    W -->|POST or RSC header| PASS[passthrough, never cached]

    APP --> IP[InstallPrompt]
    IP -->|Android: beforeinstallprompt| BTN[Install button]
    IP -->|iOS: no such event| HINT[Share to Add to Home Screen card]

    APP --> OB[OfflineBanner useOffline]
```

### Key Decisions

**Hand-written service worker over Serwist / next-pwa.** The precache list is four offline
pages and a handful of icons, and the hard requirement is that authenticated HTML is *never*
cached. A Workbox-based generator defaults to caching navigations and would have to be fought
into not doing so; ~80 lines of explicit JS is smaller than the config needed to disable the
parts we do not want, and adds no dependency to a project that pins its stack tightly.

**No caching of authenticated responses.** The dashboard shows per-player fines and balances.
A shared or borrowed phone plus a runtime navigation cache equals one player seeing another's
debts. It would also stack a second staleness layer on the server-side week-long cache
described in the Caching invariant, where correctness comes from explicit invalidation.

**`start_url: '/'` rather than `/sk`.** The proxy resolves the locale from the `next-locale`
cookie, so the installed app follows the user's language. Hardcoding `/sk` would bake Slovak
into the Android WebAPK at install time, and changing it later requires a reinstall.

**`black-translucent` status bar over `default`.** The header is already a blurred translucent
bar; letting it extend under the status bar is the difference between "web page in a window"
and "app". The cost is that safe-area padding becomes mandatory rather than optional, which
this plan pays in section 4.

**Rolling 30-day session over a longer fixed expiry.** A fixed expiry logs everyone out on the
same schedule regardless of use; rolling refresh means an active user never notices and an
inactive one still expires. The refresh is in `proxy.ts` because it already decrypts the cookie
on every request — no second code path.

**PNGs generated once and committed, not at runtime.** A `next/og` route would keep the repo
binary-free, but its path (`/icons/192`) has no dot and would need a proxy allowlist entry, and
Android fetches icons once at install so there is no benefit to generating them per request.

### Edge Cases / Risks

- **Precaching `/{lang}/offline` requires the proxy allowlist to land first.** If step 5 is
  skipped, `cache.addAll()` stores the sign-in redirect and the offline screen silently becomes
  a sign-in page. The verification step must confirm cache contents, not just that install ran.
- **A stale service worker is remotely unfixable** if `Cache-Control: no-cache` on `/sw.js` is
  missing. `CACHE` must also be bumped whenever `PRECACHE` changes, or `activate` will not
  evict the old entries.
- **Registering in development** would serve stale Turbopack chunks and break `pnpm dev`. The
  registrar is guarded on `NODE_ENV`; the guard is the point of the component.
- **`app/[lang]/layout.tsx` calls `getSession()`** through `<Header>`, which reads `cookies()`
  and makes every route dynamic. Prefetching still works via `loading.tsx`, but no route is
  statically prerenderable, so nothing beyond the shell is available offline. This is expected,
  not a bug to fix here.
- **Android WebAPK freezes `name`, `theme_color` and icons at install.** Later manifest edits
  need a reinstall to show up on already-installed devices. Getting the values right in this
  change matters more than usual.
- **iOS evicts service worker caches** for apps unused for extended periods. The offline page
  disappears until the next online launch re-runs `install`. Acceptable; the httpOnly session
  cookie is not affected.
- **`experimental.useOffline` is experimental in 16.3.** Confined to one config line and
  `OfflineBanner`; revertible on its own.
- **`proxy.test.ts:94-99` asserts the current redirect behaviour.** Both the `/offline`
  allowlist and the session refresh touch code those tests cover, so they will need new cases
  rather than only additions.
- **`display-mode: standalone` in jsdom**: `vitest.setup.dom.ts:22` stubs `matchMedia` to always
  return `matches: false`. The install-prompt tests must override that stub per test rather than
  assume it.

# Delivery Steps

### Step 1: Generate and commit the PWA icon set

Add `sharp` as a devDependency, write `scripts/generate-pwa-icons.ts` as described in Proposed
Changes §1, run it, and commit `public/icons/{icon-192,icon-512,icon-maskable-192,icon-maskable-512}.png`.
Verify each maskable PNG keeps the mark inside the centre 80 %.

Files: `package.json`, `scripts/generate-pwa-icons.ts`, `public/icons/*.png`.

### Step 2: Add the web app manifest

Create `app/manifest.ts` per §2 and add `manifest: '/manifest.webmanifest'` to the object
returned by `generateMetadata` in `app/[lang]/layout.tsx`.

Files: `app/manifest.ts`, `app/[lang]/layout.tsx`.

### Step 3: Add viewport, theme colour and iOS metadata

Add the `viewport` export and the `appleWebApp` block per §3, plus the hex twin comments next to
the two `--background` OKLCH declarations.

Files: `app/[lang]/layout.tsx`, `app/globals.css`.

### Step 4: Safe-area handling

Add the `--app-*` custom properties, `overscroll-behavior-y`, and body inline insets to
`app/globals.css`; then apply them in the header, the two sticky filter bars, the alert dialog,
and `<main>` per §4.

Files: `app/globals.css`, `components/layout/Header.tsx`, `app/[lang]/page.tsx`,
`app/[lang]/player/[id]/page.tsx`, `components/ui/alert-dialog.tsx`, `app/[lang]/layout.tsx`.

### Step 5: Offline route and proxy allowlist

Add `app/[lang]/offline/page.tsx` plus its retry client button, add `'/offline'` to
`publicRoutes` in `proxy.ts`, and add the `pwa.offline*` / `pwa.retry` keys to all four locale
files.

Files: `app/[lang]/offline/page.tsx`, `proxy.ts`, `locales/{sk,cs,hu,sr}.json`.

### Step 6: Service worker, registration and headers

Write `public/sw.js` per §6, add the `headers()` block to `next.config.ts`, add
`components/pwa/ServiceWorkerRegistrar.tsx` and mount it in the root layout, and add
`lib/pwa/clear-service-worker-caches.ts` wired into the sign-out paths in `UserDropdown.tsx`
and `MobileNav.tsx`.

Files: `public/sw.js`, `next.config.ts`, `components/pwa/ServiceWorkerRegistrar.tsx`,
`lib/pwa/clear-service-worker-caches.ts`, `app/[lang]/layout.tsx`,
`components/layout/UserDropdown.tsx`, `components/layout/MobileNav.tsx`.

### Step 7: Install prompt

Add `lib/hooks/usePwaInstall.ts` and `components/pwa/InstallPrompt.tsx` per §7, mount the
component in the root layout, and add the remaining `pwa.install*` / `pwa.ios*` keys to all four
locale files.

Files: `lib/hooks/usePwaInstall.ts`, `components/pwa/InstallPrompt.tsx`,
`app/[lang]/layout.tsx`, `locales/{sk,cs,hu,sr}.json`.

### Step 8: Rolling 30-day session

Add `lib/session-config.ts`, switch `lib/auth.ts` and `lib/session.ts` onto the shared
constants, fix `clearSession()` to set `path: '/'`, and add the halfway refresh to `proxy.ts`.

Files: `lib/session-config.ts`, `lib/auth.ts`, `lib/session.ts`, `proxy.ts`.

### Step 9: Connectivity-aware navigation

Enable `experimental.useOffline`, add `app/[lang]/loading.tsx`, add
`components/pwa/OfflineBanner.tsx` and mount it in the root layout.

Files: `next.config.ts`, `app/[lang]/loading.tsx`, `components/pwa/OfflineBanner.tsx`,
`app/[lang]/layout.tsx`.

### Step 10: Tests

Write the tests listed in the Testing section below, in the same commit as the code they cover.

Files: `proxy.test.ts`, `lib/auth.test.ts`, `lib/hooks/usePwaInstall.test.ts`,
`components/pwa/InstallPrompt.test.tsx`.

### Step 11: Quality check

Run `nvm use && pnpm check` (lint + `tsc --noEmit` + `vitest run`). Zero TypeScript errors, zero
Airbnb violations, no `any`, all tests green.

# Testing

### Validation Approach

**Automated** — all new tests sit next to their source, no `__tests__`, no `.spec.`:

- `proxy.test.ts` (node project) — `/offline` is reachable without a session and still gets the
  locale prefix; `/sk/offline` is not redirected to sign-in; a session past the halfway mark
  gets a fresh `Set-Cookie` on the response while a fresh session does not; the existing
  redirect assertions at lines 94-99 still hold.
- `lib/auth.test.ts` (node) — `encrypt()` stamps `exp` at `SESSION_MAX_AGE_SECONDS`;
  `decrypt()` surfaces `exp`/`iat`; an expired token still returns `null`.
- `lib/hooks/usePwaInstall.test.ts` (dom project — `vitest.config.ts` includes `lib/hooks/**` in
  `dom`, not `node`) — `beforeinstallprompt` is captured and `preventDefault()` is called;
  `canPrompt` flips true; `promptInstall()` calls `prompt()` on the stored event;
  `isStandalone` is true for `matchMedia('(display-mode: standalone)')` **and** separately for
  `navigator.standalone`, overriding the always-false `matchMedia` stub in
  `vitest.setup.dom.ts:22`.
- `components/pwa/InstallPrompt.test.tsx` (dom) — renders nothing when standalone, renders the
  iOS instruction text on an iOS user agent, renders the install button when `canPrompt`, and
  stays hidden once `localStorage['pwa-install-dismissed']` is set. Queries by role and visible
  text only, per the Frontend Tests rules.
- `locales/locales.test.ts` — already enforces parity; it will fail until the `pwa` namespace
  exists in all four files, which is the intended guard.

No money calculation is touched, so no `lib/money-rules.ts` mirror or `lib/sync.ts` test changes
are in scope.

**Manual, on a production build** (`pnpm build && pnpm start` — dev mode is not a reliable
reference for service worker or offline behaviour):

1. **Lighthouse → Installable** in Chrome DevTools: manifest parses, icons resolve, SW is
   registered and controls the page.
2. **Application → Manifest**: `id`, `scope`, `start_url`, both maskable icons render in the
   maskable preview without cropping the pin.
3. **Application → Service Workers**: activated; **Cache Storage** contains exactly the four
   `/{lang}/offline` pages and the icons, and *no* dashboard or player HTML. Navigate the whole
   app while online, then re-check that Cache Storage has not grown — this is the privacy
   assertion, not a nice-to-have.
4. **DevTools → Network → Offline**, then reload: the app's offline page renders in the current
   language. Toggle back online: it recovers.
5. **Android (Chrome, real device over the Vercel URL)**: install banner appears, install, launch
   from home screen — standalone window, status bar tinted `#020618` in dark / `#f4f5f7` in
   light, home-screen icon not cropped.
6. **iPhone (Safari, real device)**: the iOS instruction card is visible; Share → Add to Home
   Screen; launch — full-screen, header padding clears the notch, the sticky filter bar on the
   dashboard and on a player page lines up directly under the header, dialog buttons clear the
   home indicator, and pulling down does not rubber-band the whole app.
7. **Session**: sign in inside the installed app, confirm the `session` cookie expiry is ~30 days;
   with the clock past the halfway point, confirm a `Set-Cookie` refresh appears; sign out and
   confirm Cache Storage is emptied.
8. **Offline retry** (`experimental.useOffline`): with a link's shell prefetched, go offline, tap
   the link — the offline banner shows and the loading skeleton stays; go online — the page
   completes without a second tap. Submit a withdrawal form offline — the button label stays
   pending and the action lands when the connection returns.
