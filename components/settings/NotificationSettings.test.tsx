import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { savePushSubscription } from '@/lib/push-actions';
import sk from '@/locales/sk.json';

vi.mock('@/lib/push-actions', () => ({
  savePushSubscription: vi.fn().mockResolvedValue({ success: true }),
  removePushSubscription: vi.fn().mockResolvedValue({ success: true }),
}));

const t = sk.settings.notifications;

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

function renderSettings() {
  return render(<NotificationSettings lang="sk" translations={t} />);
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

describe('NotificationSettings', () => {
  it('explains that the browser cannot receive notifications where push is unsupported', () => {
    renderSettings();

    expect(screen.getByText(t.unsupported)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the device as off and offers to enable notifications', async () => {
    stubPush();
    renderSettings();

    const button = await screen.findByRole('button', { name: t.enable });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText(t.device)).toBeInTheDocument();
    expect(screen.getByText(t.off)).toBeInTheDocument();
  });

  it('shows the device as on and offers to disable once subscribed', async () => {
    stubPush({ existing: true });
    renderSettings();

    const button = await screen.findByRole('button', { name: t.disable });
    await waitFor(() => expect(button).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByText(t.on)).toBeInTheDocument();
  });

  it('subscribes and stores the subscription when enabled', async () => {
    stubPush();
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: t.enable }));

    await waitFor(() => expect(savePushSubscription).toHaveBeenCalledWith(
      subscription.toJSON(),
      'sk',
    ));
    expect(await screen.findByText(t.on)).toBeInTheDocument();
  });

  it('shows the localized error and keeps notifications off when saving fails', async () => {
    vi.mocked(savePushSubscription).mockResolvedValueOnce({ success: false, error: 'saveFailed' });
    stubPush();
    renderSettings();

    fireEvent.click(await screen.findByRole('button', { name: t.enable }));

    expect(await screen.findByText(t.errors.saveFailed)).toBeInTheDocument();
    expect(screen.getByText(t.off)).toBeInTheDocument();
  });

  it('explains a permanently blocked permission instead of offering a dead button', async () => {
    stubPush({ permission: 'denied' });
    renderSettings();

    expect(await screen.findByText(t.blocked)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(savePushSubscription).not.toHaveBeenCalled();
  });
});
