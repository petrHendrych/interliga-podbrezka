import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import { PasskeyManager, type PasskeyRow } from '@/components/settings/PasskeyManager';

const actions = vi.hoisted(() => ({
  startPasskeyRegistration: vi.fn(),
  finishPasskeyRegistration: vi.fn(),
  deletePasskey: vi.fn(),
}));
const browser = vi.hoisted(() => ({ startRegistration: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('@/lib/webauthn-actions', () => actions);
vi.mock('@simplewebauthn/browser', () => browser);
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const translations = { ...sk.settings, cancel: sk.common.cancel };

const ROWS: PasskeyRow[] = [
  {
    id: 7, label: 'iPhone', createdAt: '1. 8. 2026', lastUsedAt: '15. 8. 2026',
  },
  {
    id: 8, label: 'Pixel', createdAt: '2. 8. 2026', lastUsedAt: null,
  },
];

function setSupported(supported: boolean) {
  if (supported) {
    Object.defineProperty(window, 'PublicKeyCredential', {
      value: function PublicKeyCredentialStub() {},
      configurable: true,
      writable: true,
    });
  } else {
    Reflect.deleteProperty(window, 'PublicKeyCredential');
  }
}

/** base-ui portals its popups out of the render container and hangs no role on them. */
async function openPopup(): Promise<HTMLElement> {
  return waitFor(() => {
    const portal = document.querySelector<HTMLElement>('[data-base-ui-portal]');
    if (!portal) throw new Error('popup is not open');
    return portal;
  });
}

beforeEach(() => {
  setSupported(true);
  actions.startPasskeyRegistration.mockReset();
  actions.finishPasskeyRegistration.mockReset();
  actions.deletePasskey.mockReset();
  browser.startRegistration.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  setSupported(false);
});

describe('PasskeyManager', () => {
  it('lists every passkey with its dates', async () => {
    render(<PasskeyManager passkeys={ROWS} translations={translations} />);

    expect(await screen.findByText('iPhone')).toBeInTheDocument();
    expect(screen.getByText('Pixel')).toBeInTheDocument();
    expect(screen.getByText(`${sk.settings.created}: 1. 8. 2026`)).toBeInTheDocument();
    expect(screen.getByText(`${sk.settings.lastUsed}: 15. 8. 2026`)).toBeInTheDocument();
  });

  it('says "never used" for a passkey that has not signed anyone in yet', () => {
    render(<PasskeyManager passkeys={ROWS} translations={translations} />);

    expect(screen.getByText(`${sk.settings.lastUsed}: ${sk.settings.neverUsed}`))
      .toBeInTheDocument();
  });

  it('shows the empty state when there is no passkey', () => {
    render(<PasskeyManager passkeys={[]} translations={translations} />);

    expect(screen.getByText(sk.settings.empty)).toBeInTheDocument();
  });

  it('explains itself instead of offering a button on a browser without WebAuthn', async () => {
    setSupported(false);
    render(<PasskeyManager passkeys={ROWS} translations={translations} />);

    expect(await screen.findByText(sk.settings.unsupported)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: sk.settings.addPasskey })).not.toBeInTheDocument();
  });

  it('deletes the passkey whose row was confirmed', async () => {
    actions.deletePasskey.mockResolvedValue({ success: true, data: undefined });
    render(<PasskeyManager passkeys={ROWS} translations={translations} />);

    const [, secondRowButton] = screen.getAllByRole('button', { name: sk.settings.deleteLabel });
    fireEvent.click(secondRowButton);

    const popup = await openPopup();
    fireEvent.click(within(popup).getByRole('button', { name: sk.settings.deleteLabel }));

    await waitFor(() => expect(actions.deletePasskey).toHaveBeenCalledWith(8));
    expect(router.refresh).toHaveBeenCalled();
  });

  it('keeps the dialog open and shows why when the delete fails', async () => {
    actions.deletePasskey.mockResolvedValue({ success: false, error: 'notFound' });
    render(<PasskeyManager passkeys={ROWS} translations={translations} />);

    fireEvent.click(screen.getAllByRole('button', { name: sk.settings.deleteLabel })[0]);

    const popup = await openPopup();
    fireEvent.click(within(popup).getByRole('button', { name: sk.settings.deleteLabel }));

    expect(await screen.findByText(sk.settings.errors.notFound)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('registers a new passkey with the label the user typed', async () => {
    actions.startPasskeyRegistration.mockResolvedValue({ success: true, data: { challenge: 'c' } });
    browser.startRegistration.mockResolvedValue({ id: 'cred-1' });
    actions.finishPasskeyRegistration.mockResolvedValue({ success: true, data: undefined });

    render(<PasskeyManager passkeys={[]} translations={translations} />);
    fireEvent.click(screen.getByRole('button', { name: sk.settings.addPasskey }));

    const popup = await openPopup();
    fireEvent.change(within(popup).getByLabelText(new RegExp(sk.settings.labelLabel, 'i')), {
      target: { value: 'Služobný mobil' },
    });
    fireEvent.click(within(popup).getByRole('button', { name: sk.settings.addPasskey }));

    await waitFor(() => {
      expect(actions.finishPasskeyRegistration)
        .toHaveBeenCalledWith({ id: 'cred-1' }, 'Služobný mobil');
    });
    expect(router.refresh).toHaveBeenCalled();
  });
});
