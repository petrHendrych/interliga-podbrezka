import * as React from 'react';
import { notifyMoneyUpdated } from '@/lib/push-actions';
import type { PushActionError } from '@/lib/push-actions';

/**
 * The broadcast reaches every subscribed device at once, so it is gated behind a
 * confirmation the same way a sync is.
 */
export function useNotifyUsers() {
  const [isNotifying, setIsNotifying] = React.useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState<PushActionError | null>(null);

  const requestNotify = React.useCallback((e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (isNotifying) return;
    setError(null);
    setIsConfirmOpen(true);
  }, [isNotifying]);

  const setConfirmOpen = React.useCallback((open: boolean) => {
    if (!open && isNotifying) return;
    setIsConfirmOpen(open);
  }, [isNotifying]);

  const confirmNotify = React.useCallback(async () => {
    if (isNotifying) return;
    setIsNotifying(true);
    try {
      const result = await notifyMoneyUpdated();
      if (result.success) {
        setIsConfirmOpen(false);
        return;
      }
      // The dialog stays open on failure so the reason is visible.
      setError(result.error);
    } finally {
      setIsNotifying(false);
    }
  }, [isNotifying]);

  return {
    isNotifying, isConfirmOpen, error, requestNotify, setConfirmOpen, confirmNotify,
  };
}
