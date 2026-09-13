import * as React from 'react';
import { useRouter } from 'next/navigation';
import { isStandaloneDisplay } from '../pwa/display-mode';

/** Badge travel, in px, that arms the refresh -- 117px of finger, after resistance. */
export const PULL_TRIGGER_DISTANCE = 72;
/** The badge stops following the finger here, so a long drag cannot fling it down the page. */
export const PULL_MAX_DISTANCE = 110;
/** Below this the move is still jitter, so neither axis has won the touch yet. */
export const PULL_DIRECTION_SLOP = 8;
/** `experimental.useOffline` keeps a refresh pending instead of failing, so it can hang. */
export const PULL_SAFETY_TIMEOUT_MS = 10_000;

/** Asymptotic, so the badge tracks the finger at first and grows heavier the further it goes. */
export function resist(delta: number) {
  if (delta <= 0) return 0;
  return PULL_MAX_DISTANCE * (1 - Math.exp(-delta / PULL_MAX_DISTANCE));
}

/**
 * `MobileNav` sets the shorthand; the longhand is checked too because a longhand-only write
 * leaves the shorthand unserializable and therefore empty.
 */
function isScrollLocked() {
  const { style } = document.body;
  return style.overflow === 'hidden' || style.overflowY === 'hidden';
}

type GesturePhase = 'idle' | 'watching' | 'pulling' | 'rejected';

/**
 * Standalone display mode has no pull-to-refresh of its own, and `overscroll-behavior-y:
 * contain` in app/globals.css deliberately suppresses the browser's, so a player who suspects
 * the numbers moved has no gesture to reach for. There is no gesture library in the project,
 * so the drag is tracked by hand. Installed app only -- a browser tab keeps the native one.
 */
export function usePullToRefresh() {
  const router = useRouter();
  const [isStandalone, setIsStandalone] = React.useState(false);
  const [pullDistance, setPullDistance] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();
  const isRefreshingRef = React.useRef(false);
  // Held in a ref so a re-render mid-drag can never tear the listeners down and lose the
  // gesture's closure state.
  const routerRef = React.useRef(router);

  React.useEffect(() => {
    setIsStandalone(isStandaloneDisplay());
  }, []);

  React.useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  React.useEffect(() => {
    routerRef.current = router;
  }, [router]);

  React.useEffect(() => {
    if (!isStandalone) return undefined;

    let phase: GesturePhase = 'idle';
    let startX = 0;
    let startY = 0;
    let distance = 0;

    const cancel = () => {
      phase = 'idle';
      distance = 0;
      setIsDragging(false);
      setPullDistance(0);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (
        isRefreshingRef.current
        || event.touches.length !== 1
        || window.scrollY > 0
        || isScrollLocked()
      ) {
        phase = 'rejected';
        return;
      }
      phase = 'watching';
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      distance = 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (phase === 'idle' || phase === 'rejected') return;
      if (event.touches.length !== 1) {
        cancel();
        return;
      }

      const deltaX = event.touches[0].clientX - startX;
      const deltaY = event.touches[0].clientY - startY;

      if (phase === 'watching') {
        if (Math.abs(deltaX) < PULL_DIRECTION_SLOP && Math.abs(deltaY) < PULL_DIRECTION_SLOP) {
          return;
        }
        // Sideways wins outright: the results tables and the filter strip scroll horizontally.
        if (deltaY <= 0 || Math.abs(deltaX) > Math.abs(deltaY) || window.scrollY > 0) {
          phase = 'rejected';
          return;
        }
        phase = 'pulling';
        setIsDragging(true);
      }

      // Chrome only honours this when the gesture's first move was cancelled too, and iOS
      // still rubber-bands the document in standalone despite `overscroll-behavior`.
      if (event.cancelable) event.preventDefault();

      const next = resist(deltaY - PULL_DIRECTION_SLOP);
      if (Math.round(next) === Math.round(distance)) return;
      distance = next;
      setPullDistance(next);
    };

    const onTouchEnd = () => {
      if (phase !== 'pulling') {
        phase = 'idle';
        return;
      }
      const shouldRefresh = distance >= PULL_TRIGGER_DISTANCE;
      phase = 'idle';
      distance = 0;
      setIsDragging(false);

      if (!shouldRefresh) {
        setPullDistance(0);
        return;
      }

      setPullDistance(PULL_TRIGGER_DISTANCE);
      setIsRefreshing(true);
      // Must be called synchronously here: React shares one transition lane per event, and
      // that is what keeps `isPending` true until the RSC payload is applied.
      startTransition(() => {
        routerRef.current.refresh();
      });
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', cancel, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', cancel);
    };
  }, [isStandalone]);

  React.useEffect(() => {
    if (!isRefreshing) return undefined;

    if (!isPending) {
      setIsRefreshing(false);
      setPullDistance(0);
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setIsRefreshing(false);
      setPullDistance(0);
    }, PULL_SAFETY_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [isRefreshing, isPending]);

  return {
    pullDistance,
    progress: Math.min(1, pullDistance / PULL_TRIGGER_DISTANCE),
    isDragging,
    isRefreshing,
  };
}
