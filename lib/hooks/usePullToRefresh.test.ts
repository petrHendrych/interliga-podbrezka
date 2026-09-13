import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  PULL_DIRECTION_SLOP,
  PULL_MAX_DISTANCE,
  PULL_TRIGGER_DISTANCE,
  resist,
  usePullToRefresh,
} from '@/lib/hooks/usePullToRefresh';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// The shared setup stubs matchMedia to always miss, so each standalone case opts in by hand.
function setDisplayMode(standalone: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: standalone, media: query } as MediaQueryList),
  );
}

function setScrollY(value: number) {
  Object.defineProperty(window, 'scrollY', { value, configurable: true });
}

// jsdom has no `Touch` constructor, but `TouchEvent` keeps whatever objects it is handed.
function point(clientX: number, clientY: number) {
  return {
    clientX, clientY, identifier: 0, target: document.body,
  } as unknown as Touch;
}

function fireTouch(type: string, points: Touch[]) {
  const event = new TouchEvent(type, {
    touches: points,
    targetTouches: points,
    changedTouches: points,
    bubbles: true,
    cancelable: true,
  });
  act(() => { document.body.dispatchEvent(event); });
  return event;
}

/** A pull far enough past the slop that the gesture always arms. */
function pull(toY: number, toX = 0) {
  fireTouch('touchstart', [point(0, 0)]);
  return fireTouch('touchmove', [point(toX, toY)]);
}

function release() {
  fireTouch('touchend', []);
}

beforeEach(() => {
  refresh.mockReset();
  setDisplayMode(true);
  setScrollY(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.style.overflow = '';
  document.body.style.overflowY = '';
});

describe('resist', () => {
  it.each([
    [0, 0],
    [-50, 0],
  ])('maps %i to %i', (delta, expected) => {
    expect(resist(delta)).toBe(expected);
  });

  it('tracks the finger closely at the start', () => {
    expect(resist(20)).toBeGreaterThan(17);
    expect(resist(20)).toBeLessThan(20);
  });

  it('rises monotonically and never reaches the ceiling', () => {
    const samples = [10, 50, 100, 400, 4000].map(resist);

    samples.forEach((value, index) => {
      expect(value).toBeLessThan(PULL_MAX_DISTANCE);
      if (index > 0) expect(value).toBeGreaterThan(samples[index - 1]);
    });
  });
});

describe('usePullToRefresh', () => {
  it('does nothing in a browser tab, which keeps the native gesture', () => {
    setDisplayMode(false);
    const { result } = renderHook(() => usePullToRefresh());

    pull(300);
    release();

    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('follows the finger with resistance', () => {
    const { result } = renderHook(() => usePullToRefresh());

    pull(200);

    expect(result.current.pullDistance).toBeCloseTo(resist(200 - PULL_DIRECTION_SLOP), 5);
    expect(result.current.isDragging).toBe(true);
  });

  it('never lets the badge past the ceiling', () => {
    const { result } = renderHook(() => usePullToRefresh());

    pull(5000);

    expect(result.current.pullDistance).toBeGreaterThan(PULL_TRIGGER_DISTANCE);
    expect(result.current.pullDistance).toBeLessThanOrEqual(PULL_MAX_DISTANCE);
  });

  it('refreshes when released past the trigger', () => {
    renderHook(() => usePullToRefresh());

    pull(300);
    release();

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not refresh when released short of the trigger', () => {
    const { result } = renderHook(() => usePullToRefresh());

    pull(40);
    release();

    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.pullDistance).toBe(0);
  });

  it('cancels the browser scroll once the pull is armed', () => {
    renderHook(() => usePullToRefresh());

    expect(pull(200).defaultPrevented).toBe(true);
  });

  it('leaves an upward swipe to the page', () => {
    const { result } = renderHook(() => usePullToRefresh());

    const event = pull(-200);
    release();

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('leaves a sideways swipe to the results tables', () => {
    const { result } = renderHook(() => usePullToRefresh());

    const event = pull(12, 60);
    release();

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('ignores jitter below the direction slop', () => {
    const { result } = renderHook(() => usePullToRefresh());

    const event = pull(PULL_DIRECTION_SLOP - 1);

    expect(event.defaultPrevented).toBe(false);
    expect(result.current.pullDistance).toBe(0);
  });

  it('ignores a pull that starts below the top of the page', () => {
    const { result } = renderHook(() => usePullToRefresh());
    setScrollY(40);

    pull(300);
    release();

    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('still starts while iOS reports a negative scrollY mid-bounce', () => {
    const { result } = renderHook(() => usePullToRefresh());
    setScrollY(-5);

    pull(300);

    expect(result.current.pullDistance).toBeGreaterThan(0);
  });

  it('ignores a two finger gesture', () => {
    const { result } = renderHook(() => usePullToRefresh());

    fireTouch('touchstart', [point(0, 0), point(10, 0)]);
    fireTouch('touchmove', [point(0, 300), point(10, 300)]);
    release();

    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('drops the pull when a second finger lands mid-gesture', () => {
    const { result } = renderHook(() => usePullToRefresh());

    pull(300);
    fireTouch('touchmove', [point(0, 320), point(10, 320)]);

    expect(result.current.pullDistance).toBe(0);
  });

  it.each([
    ['overflow', 'the mobile menu'],
    ['overflowY', 'a dialog'],
  ])('stands aside while %s is locked by %s', (property) => {
    const { result } = renderHook(() => usePullToRefresh());
    document.body.style.setProperty(property === 'overflow' ? 'overflow' : 'overflow-y', 'hidden');

    pull(300);
    release();

    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('drops the pull on touchcancel', () => {
    const { result } = renderHook(() => usePullToRefresh());

    pull(300);
    fireTouch('touchcancel', []);
    release();

    expect(result.current.pullDistance).toBe(0);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('drops every listener on unmount', () => {
    const { unmount } = renderHook(() => usePullToRefresh());

    unmount();
    pull(300);
    release();

    expect(refresh).not.toHaveBeenCalled();
  });
});
