import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { REFRESH_THROTTLE_MS, useLiveDataRefresh } from '@/lib/hooks/useLiveDataRefresh';
import { SW_DATA_UPDATED } from '@/lib/pwa/messages';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

class FakeServiceWorkerContainer extends EventTarget {}

function installServiceWorker() {
  const container = new FakeServiceWorkerContainer();
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: container,
    configurable: true,
  });
  return container;
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}

beforeEach(() => {
  refresh.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-08T18:00:00Z'));
  setVisibility('visible');
  refresh.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
});

describe('useLiveDataRefresh', () => {
  it('refreshes when the app comes back to the foreground', () => {
    renderHook(() => useLiveDataRefresh());

    setVisibility('hidden');
    expect(refresh).not.toHaveBeenCalled();

    vi.setSystemTime(new Date('2026-09-08T18:05:00Z'));
    setVisibility('visible');

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes on window focus, for browsers that skip visibilitychange', () => {
    renderHook(() => useLiveDataRefresh());

    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('collapses a visibilitychange and focus pair into one refetch', () => {
    renderHook(() => useLiveDataRefresh());

    setVisibility('visible');
    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(refresh).toHaveBeenCalledOnce();
  });

  it('refreshes again once the throttle window has passed', () => {
    renderHook(() => useLiveDataRefresh());

    act(() => { window.dispatchEvent(new Event('focus')); });
    vi.setSystemTime(Date.now() + REFRESH_THROTTLE_MS);
    act(() => { window.dispatchEvent(new Event('focus')); });

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('refreshes on a service worker data-updated message, ignoring the throttle', () => {
    const container = installServiceWorker();
    renderHook(() => useLiveDataRefresh());

    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => {
      container.dispatchEvent(new MessageEvent('message', { data: { type: SW_DATA_UPDATED } }));
    });

    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('ignores other service worker messages', () => {
    const container = installServiceWorker();
    renderHook(() => useLiveDataRefresh());

    act(() => {
      container.dispatchEvent(new MessageEvent('message', { data: { type: 'CLEAR_CACHES' } }));
    });

    expect(refresh).not.toHaveBeenCalled();
  });

  it('drops every listener on unmount', () => {
    const container = installServiceWorker();
    const { unmount } = renderHook(() => useLiveDataRefresh());

    unmount();

    act(() => { window.dispatchEvent(new Event('focus')); });
    act(() => {
      container.dispatchEvent(new MessageEvent('message', { data: { type: SW_DATA_UPDATED } }));
    });

    expect(refresh).not.toHaveBeenCalled();
  });
});
