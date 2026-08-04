'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSyncData } from '@/lib/hooks/useSyncData';
import {
  SyncDataDialog,
  type SyncDataDialogTranslations,
} from '@/components/layout/SyncDataDialog';

export function SyncButton({
  translations,
}: {
  translations: SyncDataDialogTranslations;
}) {
  const {
    isSyncing, isConfirmOpen, requestSync, setConfirmOpen, confirmSync,
  } = useSyncData();

  return (
    <>
      <Button
        onClick={requestSync}
        disabled={isSyncing}
        variant="outline"
        size="sm"
        className="flex items-center gap-2"
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">
          {isSyncing ? translations.syncing : translations.syncData}
        </span>
      </Button>
      <SyncDataDialog
        open={isConfirmOpen}
        onOpenChange={setConfirmOpen}
        isSyncing={isSyncing}
        onConfirm={confirmSync}
        translations={translations}
      />
    </>
  );
}
