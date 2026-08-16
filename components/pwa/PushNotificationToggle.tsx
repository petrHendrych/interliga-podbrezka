'use client';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import { Locale } from '@/lib/i18n/config';

export interface PushToggleTranslations {
  notificationsEnable: string;
  notificationsDisable: string;
  notificationsBlocked: string;
  notifyErrors: Record<string, string>;
}

interface PushNotificationToggleProps {
  lang: Locale;
  translations: PushToggleTranslations;
  className: string;
}

export function PushNotificationToggle({
  lang,
  translations,
  className,
}: PushNotificationToggleProps) {
  const {
    isSupported, permission, isSubscribed, isBusy, error, subscribe, unsubscribe,
  } = usePushNotifications(lang);

  if (!isSupported) return null;

  // There is no way back from a denied permission in JS, so the row explains instead of retrying.
  const isBlocked = permission === 'denied';
  const label = (() => {
    if (isBlocked) return translations.notificationsBlocked;
    return isSubscribed ? translations.notificationsDisable : translations.notificationsEnable;
  })();

  return (
    <button
      type="button"
      onClick={isSubscribed ? unsubscribe : subscribe}
      disabled={isBusy || isBlocked}
      className={className}
      aria-pressed={isSubscribed}
    >
      {(() => {
        if (isBusy) return <Loader2 className="size-4 text-muted-foreground animate-spin" />;
        if (isSubscribed) return <Bell className="size-4 text-muted-foreground" />;
        return <BellOff className="size-4 text-muted-foreground" />;
      })()}
      <span>{error ? translations.notifyErrors[error] : label}</span>
    </button>
  );
}
