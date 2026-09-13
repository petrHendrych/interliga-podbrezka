'use client';

import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePullToRefresh } from '@/lib/hooks/usePullToRefresh';

export interface PullToRefreshTranslations {
  refreshing: string;
}

interface PullToRefreshIndicatorProps {
  distance: number;
  progress: number;
  isDragging: boolean;
  isRefreshing: boolean;
}

export function PullToRefreshIndicator({
  distance,
  progress,
  isDragging,
  isRefreshing,
}: PullToRefreshIndicatorProps) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none fixed inset-x-0 z-40 flex justify-center',
        'top-[calc(var(--app-safe-top)+var(--app-header-height))]',
        !isDragging && 'transition-[transform,opacity] duration-200 ease-out',
      )}
      style={{
        transform: `translate3d(0, ${distance}px, 0)`,
        opacity: isRefreshing ? 1 : Math.min(1, progress * 2.5),
      }}
    >
      <span className="-mt-10 flex size-10 items-center justify-center rounded-full border bg-background shadow-lift">
        <RefreshCw
          className={cn('size-5 text-muted-foreground', isRefreshing && 'animate-spin')}
          style={isRefreshing ? undefined : { transform: `rotate(${Math.round(progress * 270)}deg)` }}
        />
      </span>
    </div>
  );
}

export function PullToRefresh({ translations }: { translations: PullToRefreshTranslations }) {
  const {
    pullDistance, progress, isDragging, isRefreshing,
  } = usePullToRefresh();

  return (
    <>
      {/* Mounted empty up front: a live region inserted with its text already in place is
          not reliably announced. */}
      <span role="status" aria-live="polite" className="sr-only">
        {isRefreshing ? translations.refreshing : ''}
      </span>
      {(pullDistance > 0 || isRefreshing) && (
        <PullToRefreshIndicator
          distance={pullDistance}
          progress={progress}
          isDragging={isDragging}
          isRefreshing={isRefreshing}
        />
      )}
    </>
  );
}
