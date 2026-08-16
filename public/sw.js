// Bump on every change to PRECACHE below, otherwise `activate` keeps the old entries alive.
const CACHE = 'ilp-static-v2';

const LOCALES = ['sk', 'cs', 'hu', 'sr'];
const DEFAULT_LOCALE = 'sk';
const OFFLINE_URLS = LOCALES.map((locale) => `/${locale}/offline`);
const PRECACHE = [
  ...OFFLINE_URLS,
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-96.png',
];

// Content-hashed bundles and static images only. Authenticated HTML is never stored: the app
// shows one player's fines and balances, and a shared phone would hand them to the next user.
const CACHE_FIRST_PREFIXES = ['/_next/static/', '/icons/', '/players/'];

function offlineUrlFor(url) {
  const locale = url.pathname.split('/')[1];
  return LOCALES.includes(locale) ? `/${locale}/offline` : `/${DEFAULT_LOCALE}/offline`;
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkWithOfflineFallback(request, url) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(CACHE);
    const fallback = await cache.match(offlineUrlFor(url));
    return fallback ?? Response.error();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // RSC payloads are per-user data behind the same URLs as the pages; let them reach the
  // network untouched so nothing personal ends up in a cache entry.
  if (request.headers.has('RSC') || url.searchParams.has('_rsc')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkWithOfflineFallback(request, url));
    return;
  }

  if (CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_CACHES') return;
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  event.waitUntil(self.registration.showNotification(payload.title || 'Interliga Podbrezová', {
    body: payload.body || '',
    icon: '/icons/icon-192.png',
    // The status bar icon on Android. Only the alpha channel survives, so this must be the
    // transparent silhouette -- pointing it at the opaque app icon paints a solid square.
    badge: '/icons/badge-96.png',
    // One tag per event, so a repeat replaces the old notification instead of stacking.
    tag: payload.tag || 'ilp-data',
    data: { url: payload.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => 'focus' in client);

    if (!existing) {
      await self.clients.openWindow(target);
      return;
    }

    await existing.focus();
    if ('navigate' in existing) {
      await existing.navigate(target);
    }
  })());
});

// Push services rotate endpoints; without re-registering the subscription silently dies.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    const subscription = event.newSubscription
      || await self.registration.pushManager.subscribe(event.oldSubscription.options);

    await fetch('/api/push/resubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oldEndpoint: event.oldSubscription?.endpoint,
        subscription: subscription.toJSON(),
      }),
    });
  })());
});
