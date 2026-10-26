'use client';

import { useState } from 'react';
import {
  Dialog, DialogClose, DialogContent, DialogTitle,
} from '@/components/ui/dialog';
import { markChangelogSeen } from '@/lib/changelog-actions';
import type { Locale } from '@/lib/i18n/config';
import type { ReleaseView } from '@/lib/changelog/types';
import { ReleaseList, type ReleaseListTranslations } from './ReleaseList';

export interface ChangelogDialogTranslations extends ReleaseListTranslations {
  title: string;
  confirm: string;
}

interface ChangelogDialogProps {
  releases: ReleaseView[];
  lang: Locale;
  translations: ChangelogDialogTranslations;
}

export function ChangelogDialog({ releases, lang, translations }: ChangelogDialogProps) {
  const [open, setOpen] = useState(true);

  // Closes whatever the outcome: a failed save only means the dialog returns on the next visit,
  // which beats trapping the user in it.
  const handleOpenChange = (next: boolean) => {
    if (next) return;
    setOpen(false);
    markChangelogSeen(releases[0].id)
      .then((result) => {
        // eslint-disable-next-line no-console
        if (!result.success) console.error('Changelog not marked as seen:', result.error);
      })
      // eslint-disable-next-line no-console
      .catch((error: unknown) => console.error('Changelog not marked as seen:', error));
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogTitle>{translations.title}</DialogTitle>
        <div className="overflow-y-auto">
          <ReleaseList releases={releases} lang={lang} translations={translations} />
        </div>
        <DialogClose className="w-full sm:w-auto sm:justify-self-end">
          {translations.confirm}
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
