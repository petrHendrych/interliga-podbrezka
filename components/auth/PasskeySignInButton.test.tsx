import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import { PasskeySignInButton } from '@/components/auth/PasskeySignInButton';

const actions = vi.hoisted(() => ({
  startPasskeyAuthentication: vi.fn(),
  finishPasskeyAuthentication: vi.fn(),
}));
const browser = vi.hoisted(() => ({ startAuthentication: vi.fn() }));

vi.mock('@/lib/webauthn-actions', () => actions);
vi.mock('@simplewebauthn/browser', () => browser);

const translations = {
  passkeySignIn: sk.auth.passkeySignIn,
  passkeySigningIn: sk.auth.passkeySigningIn,
  passkeyDivider: sk.auth.passkeyDivider,
  errors: sk.auth.errors,
};

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

beforeEach(() => {
  actions.startPasskeyAuthentication.mockReset();
  actions.finishPasskeyAuthentication.mockReset();
  browser.startAuthentication.mockReset();
});

afterEach(() => {
  setSupported(false);
});

describe('PasskeySignInButton', () => {
  it('renders nothing when the browser has no WebAuthn', () => {
    setSupported(false);
    render(<PasskeySignInButton lang="sk" translations={translations} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers the passkey button when WebAuthn is available', async () => {
    setSupported(true);
    render(<PasskeySignInButton lang="sk" translations={translations} />);

    expect(await screen.findByRole('button', { name: sk.auth.passkeySignIn }))
      .toBeInTheDocument();
  });

  it('runs the ceremony and stays silent on success, because the action redirects', async () => {
    setSupported(true);
    actions.startPasskeyAuthentication.mockResolvedValue({ success: true, data: { challenge: 'c' } });
    browser.startAuthentication.mockResolvedValue({ id: 'cred-1' });
    actions.finishPasskeyAuthentication.mockResolvedValue({ success: true, data: undefined });

    render(<PasskeySignInButton lang="sk" translations={translations} />);
    fireEvent.click(await screen.findByRole('button', { name: sk.auth.passkeySignIn }));

    await waitFor(() => {
      expect(actions.finishPasskeyAuthentication).toHaveBeenCalledWith({ id: 'cred-1' }, 'sk');
    });
    expect(screen.queryByText(sk.auth.errors.verificationFailed)).not.toBeInTheDocument();
  });

  it.each(['verificationFailed', 'notApproved', 'noChallenge'] as const)(
    'maps the %s error code to a localized message',
    async (code) => {
      setSupported(true);
      actions.startPasskeyAuthentication.mockResolvedValue({ success: true, data: {} });
      browser.startAuthentication.mockResolvedValue({ id: 'cred-1' });
      actions.finishPasskeyAuthentication.mockResolvedValue({ success: false, error: code });

      render(<PasskeySignInButton lang="sk" translations={translations} />);
      fireEvent.click(await screen.findByRole('button', { name: sk.auth.passkeySignIn }));

      expect(await screen.findByText(sk.auth.errors[code])).toBeInTheDocument();
    },
  );

  it('says nothing when the user cancels the biometric prompt', async () => {
    setSupported(true);
    actions.startPasskeyAuthentication.mockResolvedValue({ success: true, data: {} });
    const cancelled = Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
    browser.startAuthentication.mockRejectedValue(cancelled);

    render(<PasskeySignInButton lang="sk" translations={translations} />);
    fireEvent.click(await screen.findByRole('button', { name: sk.auth.passkeySignIn }));

    await waitFor(() => expect(browser.startAuthentication).toHaveBeenCalled());
    expect(screen.queryByText(sk.auth.errors.verificationFailed)).not.toBeInTheDocument();
  });
});
