'use client';

import { Bell, BellOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import { Locale } from '@/lib/i18n/config';

export interface NotificationSettingsTranslations {
  device: string;
  on: string;
  off: string;
  blocked: string;
  unsupported: string;
  enable: string;
  disable: string;
  errors: Record<string, string>;
}

interface NotificationSettingsProps {
  lang: Locale;
  translations: NotificationSettingsTranslations;
}

const ROW = 'flex items-center gap-3 rounded-xl bg-surface-2 p-4';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const STATUS_TONE = {
  on: 'text-emerald-600 dark:text-emerald-400',
  off: 'text-muted-foreground',
  blocked: 'text-amber-700 dark:text-amber-400',
} as const;

export function NotificationSettings({ lang, translations }: NotificationSettingsProps) {
  const {
    isChecked, isSupported, permission, isSubscribed, isBusy, error, subscribe, unsubscribe,
  } = usePushNotifications(lang);

  if (!isChecked) return null;
  if (!isSupported) return <p className={EMPTY_STATE}>{translations.unsupported}</p>;

  // There is no way back from a denied permission in JS, so the row explains instead of retrying.
  const isBlocked = permission === 'denied';
  const status = (() => {
    if (isBlocked) return { text: translations.blocked, tone: STATUS_TONE.blocked };
    if (isSubscribed) return { text: translations.on, tone: STATUS_TONE.on };
    return { text: translations.off, tone: STATUS_TONE.off };
  })();
  const Icon = isSubscribed ? Bell : BellOff;

  return (
    <div className="space-y-3">
      <div className={ROW}>
        <Icon className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{translations.device}</p>
          <p className={`text-sm ${status.tone}`}>{status.text}</p>
        </div>
        {!isBlocked && (
          <Button
            type="button"
            variant={isSubscribed ? 'outline' : 'default'}
            onClick={isSubscribed ? unsubscribe : subscribe}
            disabled={isBusy}
            aria-pressed={isSubscribed}
          >
            {isBusy && <Loader2 className="animate-spin" />}
            {isSubscribed ? translations.disable : translations.enable}
          </Button>
        )}
      </div>
      {error && (
        <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
          {translations.errors[error]}
        </p>
      )}
    </div>
  );
}
