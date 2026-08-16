import * as React from 'react';
import { urlBase64ToUint8Array } from '../pwa/vapid-key';
import { removePushSubscription, savePushSubscription } from '../push-actions';
import type { PushActionError } from '../push-actions';
import type { Locale } from '../i18n/config';

function readIsSupported() {
  return (
    'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
  );
}

/**
 * Push needs a service worker, so everything runs off `serviceWorker.ready`. iOS Safari has
 * no `PushManager` outside an installed PWA, which is why the UI keys off `isSupported`
 * instead of trying and failing.
 */
export function usePushNotifications(lang: Locale) {
  const [isSupported, setIsSupported] = React.useState(false);
  const [permission, setPermission] = React.useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<PushActionError | null>(null);

  React.useEffect(() => {
    if (!readIsSupported()) return;

    setIsSupported(true);
    setPermission(Notification.permission);

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setIsSubscribed(subscription !== null))
      .catch(() => setIsSubscribed(false));
  }, []);

  const subscribe = React.useCallback(async () => {
    setIsBusy(true);
    setError(null);

    try {
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== 'granted') return;

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '',
        ),
      });

      const result = await savePushSubscription(subscription.toJSON(), lang);
      if (!result.success) {
        await subscription.unsubscribe();
        setError(result.error);
        return;
      }

      setIsSubscribed(true);
    } catch {
      setError('saveFailed');
    } finally {
      setIsBusy(false);
    }
  }, [lang]);

  const unsubscribe = React.useCallback(async () => {
    setIsBusy(true);
    setError(null);

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await removePushSubscription(subscription.endpoint);
      }

      setIsSubscribed(false);
    } catch {
      setError('saveFailed');
    } finally {
      setIsBusy(false);
    }
  }, []);

  return {
    isSupported,
    permission,
    isSubscribed,
    isBusy,
    error,
    subscribe,
    unsubscribe,
  };
}
