import * as React from 'react';
import { useRouter } from 'next/navigation';
import { SW_DATA_UPDATED } from '@/lib/pwa/messages';

/** Two foregrounds in quick succession (visibilitychange then focus) must cost one refetch. */
export const REFRESH_THROTTLE_MS = 5000;

/**
 * An installed PWA resumed from the background keeps the router cache it was suspended with,
 * and standalone display mode has no pull-to-refresh, so without this the only way to see new
 * fines is to close and reopen the app. Refreshes on foreground, and immediately when the
 * service worker reports a push that changed the data.
 */
export function useLiveDataRefresh() {
  const router = useRouter();
  const lastRefreshRef = React.useRef(0);

  React.useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < REFRESH_THROTTLE_MS) return;
      lastRefreshRef.current = now;
      router.refresh();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      refresh();
    };

    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type !== SW_DATA_UPDATED) return;
      // A push means the data already changed, so this refresh is never a duplicate.
      lastRefreshRef.current = 0;
      refresh();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', refresh);

    const worker = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
    worker?.addEventListener('message', onServiceWorkerMessage);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', refresh);
      worker?.removeEventListener('message', onServiceWorkerMessage);
    };
  }, [router]);
}
