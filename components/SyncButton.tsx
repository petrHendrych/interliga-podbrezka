'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { triggerSync } from '@/lib/actions';
import { Button } from '@/components/ui/button';

export function SyncButton({
  translations,
}: {
  translations: {
    syncing: string;
    syncData: string;
  };
}) {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleSync = async () => {
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      const data = await triggerSync();

      if (!data.success) {
        // eslint-disable-next-line no-console
        console.error('Failed to sync data:', data.error);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Button
      onClick={handleSync}
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
  );
}
