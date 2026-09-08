'use client';

import { useLiveDataRefresh } from '@/lib/hooks/useLiveDataRefresh';

export function LiveDataRefresher() {
  useLiveDataRefresh();

  return null;
}
