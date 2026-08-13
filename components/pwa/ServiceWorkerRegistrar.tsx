'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Never in development: the worker would serve stale bundles back to the dev server.
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {
      // A failed registration only costs the offline fallback; the app itself still works.
    });
  }, []);

  return null;
}
