import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
import { savePushSubscription } from '@/lib/push-actions';
import sk from '@/locales/sk.json';

vi.mock('@/lib/push-actions', () => ({
  savePushSubscription: vi.fn().mockResolvedValue({ success: true }),
  removePushSubscription: vi.fn().mockResolvedValue({ success: true }),
}));

const t = sk.pwa;

const subscription = {
  endpoint: 'https://push.example.com/abc',
  toJSON: () => ({
    endpoint: 'https://push.example.com/abc',
    keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
  }),
  unsubscribe: vi.fn().mockResolvedValue(true),
};

function stubPush({ existing = false, permission = 'default' as NotificationPermission } = {}) {
  Object.defineProperty(window, 'PushManager', { value: function PushManager() {}, configurable: true });
  Object.defineProperty(window, 'Notification', {
    value: { permission, requestPermission: vi.fn().mockResolvedValue('granted') },
    configurable: true,
  });
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(existing ? subscription : null),
          subscribe: vi.fn().mockResolvedValue(subscription),
        },
      }),
    },
    configurable: true,
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'BPqyxNi0RmV0GNbBfOPQHsGv4i3xk917tw6uVrUGhoyl2RYEPGzVk21lIPy9GctqkV5iFxcIwt0rB_F6YUcGar4');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'PushManager');
  Reflect.deleteProperty(window, 'Notification');
  Reflect.deleteProperty(window.navigator, 'serviceWorker');
});

describe('PushNotificationToggle', () => {
  it('renders nothing where push is unsupported', () => {
    const { container } = render(
      <PushNotificationToggle lang="sk" translations={t} className="row" />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('offers to enable notifications when none are subscribed', async () => {
    stubPush();
    render(<PushNotificationToggle lang="sk" translations={t} className="row" />);

    const button = await screen.findByRole('button', { name: t.notificationsEnable });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers to disable notifications once subscribed', async () => {
    stubPush({ existing: true });
    render(<PushNotificationToggle lang="sk" translations={t} className="row" />);

    const button = await screen.findByRole('button', { name: t.notificationsDisable });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
  });

  it('explains a permanently blocked permission instead of offering a dead button', async () => {
    stubPush({ permission: 'denied' });
    render(<PushNotificationToggle lang="sk" translations={t} className="row" />);

    const button = await screen.findByRole('button', { name: t.notificationsBlocked });
    expect(button).toBeDisabled();
    expect(savePushSubscription).not.toHaveBeenCalled();
  });
});
