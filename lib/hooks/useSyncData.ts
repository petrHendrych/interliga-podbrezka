import * as React from 'react';
import { triggerSync } from '@/lib/actions';

/**
 * A sync re-scrapes the stats and recomputes every fine and bonus, so it is gated
 * behind a confirmation dialog instead of firing on the first click.
 */
export function useSyncData() {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);

  const requestSync = React.useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isSyncing) return;
    setIsConfirmOpen(true);
  }, [isSyncing]);

  // Backdrop clicks and Escape must not dismiss the dialog mid-sync.
  const setConfirmOpen = React.useCallback((open: boolean) => {
    if (!open && isSyncing) return;
    setIsConfirmOpen(open);
  }, [isSyncing]);

  const confirmSync = React.useCallback(async () => {
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
      setIsConfirmOpen(false);
    }
  }, [isSyncing]);

  return {
    isSyncing, isConfirmOpen, requestSync, setConfirmOpen, confirmSync,
  };
}
