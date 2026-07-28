import * as React from 'react';
import { triggerSync } from '@/lib/actions';

export function useSyncData() {
  const [isSyncing, setIsSyncing] = React.useState(false);

  const handleSync = React.useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const data = await triggerSync();
      if (!data.success && data.error) {
        // eslint-disable-next-line no-console
        console.error('Failed to sync data:', data.error);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Sync error:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing]);

  return { isSyncing, handleSync };
}
