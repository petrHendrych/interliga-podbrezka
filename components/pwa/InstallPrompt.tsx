'use client';

import { Download, Share, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePwaInstall } from '@/lib/hooks/usePwaInstall';

export interface InstallPromptTranslations {
  installTitle: string;
  installDescription: string;
  installButton: string;
  dismiss: string;
  iosInstructionsTitle: string;
  iosInstructionsStep1: string;
  iosInstructionsStep2: string;
}

export function InstallPrompt({ translations }: { translations: InstallPromptTranslations }) {
  const {
    canPrompt, isIOS, isStandalone, isDismissed, promptInstall, dismiss,
  } = usePwaInstall();

  if (isStandalone || isDismissed) return null;
  if (!canPrompt && !isIOS) return null;

  return (
    <div className="mx-4 mt-4 flex gap-3 rounded-2xl bg-surface p-4 shadow-lift-lg sm:mx-8">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-2">
        <Download className="size-4 text-muted-foreground" aria-hidden />
      </span>

      <div className="min-w-0 flex-1 space-y-2">
        <p className="font-bold leading-tight">{translations.installTitle}</p>
        <p className="text-sm text-muted-foreground">{translations.installDescription}</p>

        {canPrompt ? (
          <Button type="button" size="lg" onClick={promptInstall}>
            {translations.installButton}
          </Button>
        ) : (
          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{translations.iosInstructionsTitle}</p>
            <p className="flex items-center gap-1.5">
              <Share className="size-4 shrink-0" aria-hidden />
              {translations.iosInstructionsStep1}
            </p>
            <p>{translations.iosInstructionsStep2}</p>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={translations.dismiss}
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
