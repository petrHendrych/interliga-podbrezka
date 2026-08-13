'use client';

import { useOffline } from 'next/offline';
import { WifiOff } from 'lucide-react';

export function OfflineBanner({ message }: { message: string }) {
  const isOffline = useOffline();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-destructive/15 px-4 py-2 text-center text-sm font-medium text-destructive"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      {message}
    </div>
  );
}
