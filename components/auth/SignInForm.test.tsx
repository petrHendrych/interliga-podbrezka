import {
  describe, expect, it, vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import sk from '@/locales/sk.json';
import SignInForm from '@/components/auth/SignInForm';

const state = vi.hoisted(() => ({ current: null as { error?: string } | null }));

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useActionState: () => [state.current, vi.fn(), false],
  };
});

vi.mock('@/lib/auth-actions', () => ({ signIn: vi.fn() }));
vi.mock('@/lib/webauthn-actions', () => ({
  startPasskeyAuthentication: vi.fn(),
  finishPasskeyAuthentication: vi.fn(),
}));

function renderForm(actionState: { error?: string } | null) {
  state.current = actionState;
  return render(<SignInForm lang="sk" dict={sk.auth} />);
}

describe('SignInForm', () => {
  it('requires an e-mail and a password before submitting', () => {
    renderForm(null);

    expect(screen.getByLabelText(new RegExp(sk.auth.emailLabel, 'i'))).toBeRequired();
    expect(screen.getByLabelText(new RegExp(sk.auth.passwordLabel, 'i'))).toBeRequired();
  });

  it('carries the locale so the action can redirect back into it', () => {
    const { container } = renderForm(null);
    const langField = container.querySelector<HTMLInputElement>('input[name="lang"]');

    expect(langField?.value).toBe('sk');
  });

  it.each(['invalidCredentials', 'notApproved', 'missingFields'])(
    'maps the %s error code to a localized message',
    (code) => {
      renderForm({ error: code });
      const message = sk.auth.errors[code as keyof typeof sk.auth.errors];

      expect(screen.getByText(message)).toBeInTheDocument();
    },
  );

  it('falls back to the raw string for a code with no translation', () => {
    renderForm({ error: 'someBrandNewCode' });
    expect(screen.getByText('someBrandNewCode')).toBeInTheDocument();
  });
});
