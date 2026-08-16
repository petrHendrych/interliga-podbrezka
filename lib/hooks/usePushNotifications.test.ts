import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { usePushNotifications } from '@/lib/hooks/usePushNotifications';
import { removePushSubscription, savePushSubscription } from '@/lib/push-actions';

vi.mock('@/lib/push-actions', () => ({
  savePushSubscription: vi.fn().mockResolvedValue({ success: true }),
  removePushSubscription: vi.fn().mockResolvedValue({ success: true }),
}));

const ENDPOINT = 'https://push.example.com/abc';

const subscriptionJson = {
  endpoint: ENDPOINT,
  keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
};

function stubPushManager(existing: unknown = null) {
  const unsubscribe = vi.fn().mockResolvedValue(true);
  const subscription = {
    endpoint: ENDPOINT,
    toJSON: () => subscriptionJson,
    unsubscribe,
  };
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(existing === 'existing' ? subscription : null),
    subscribe: vi.fn().mockResolvedValue(subscription),
  };

  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  });

  return { pushManager, unsubscribe };
}

function stubNotification(permission: NotificationPermission, granted = permission) {
  const requestPermission = vi.fn().mockResolvedValue(granted);
  Object.defineProperty(window, 'Notification', {
    value: { permission, requestPermission },
    configurable: true,
  });
  return requestPermission;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BPqyxNi0RmV0GNbBfOPQHsGv4i3xk917tw6uVrUGhoyl2RYEPGzVk21lIPy9GctqkV5iFxcIwt0rB_F6YUcGar4');
  Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
  stubNotification('default', 'granted');
  stubPushManager();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
});

describe('usePushNotifications', () => {
  it('reports unsupported without PushManager, which is iOS Safari outside an installed PWA', () => {
    Reflect.deleteProperty(window, 'PushManager');

    const { result } = renderHook(() => usePushNotifications('sk'));

    expect(result.current.isSupported).toBe(false);
  });

  it('seeds isSubscribed from the existing browser subscription', async () => {
    stubPushManager('existing');

    const { result } = renderHook(() => usePushNotifications('sk'));

    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(result.current.isSupported).toBe(true);
  });

  it('subscribes with userVisibleOnly and stores the subscription with its locale', async () => {
    const { pushManager } = stubPushManager();
    const { result } = renderHook(() => usePushNotifications('hu'));

    await act(async () => { await result.current.subscribe(); });

    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({
      userVisibleOnly: true,
      applicationServerKey: expect.any(Uint8Array),
    }));
    expect(savePushSubscription).toHaveBeenCalledWith(subscriptionJson, 'hu');
    expect(result.current.isSubscribed).toBe(true);
  });

  it('never subscribes when the permission prompt is denied', async () => {
    stubNotification('default', 'denied');
    const { pushManager } = stubPushManager();
    const { result } = renderHook(() => usePushNotifications('sk'));

    await act(async () => { await result.current.subscribe(); });

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(savePushSubscription).not.toHaveBeenCalled();
    expect(result.current.permission).toBe('denied');
    expect(result.current.isSubscribed).toBe(false);
  });

  it('rolls the browser subscription back when the server refuses to store it', async () => {
    vi.mocked(savePushSubscription).mockResolvedValueOnce({ success: false, error: 'unauthorized' });
    const { unsubscribe } = stubPushManager();
    const { result } = renderHook(() => usePushNotifications('sk'));

    await act(async () => { await result.current.subscribe(); });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(result.current.isSubscribed).toBe(false);
    expect(result.current.error).toBe('unauthorized');
  });

  it('unsubscribes in the browser and on the server', async () => {
    const { unsubscribe } = stubPushManager('existing');
    const { result } = renderHook(() => usePushNotifications('sk'));

    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    await act(async () => { await result.current.unsubscribe(); });

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(removePushSubscription).toHaveBeenCalledWith(ENDPOINT);
    expect(result.current.isSubscribed).toBe(false);
  });
});
