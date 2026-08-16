'use client';

import * as React from 'react';
import { Fingerprint, Loader2 } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import {
  finishPasskeyAuthentication,
  startPasskeyAuthentication,
  type PasskeyActionError,
} from '@/lib/webauthn-actions';

export interface PasskeySignInTranslations {
  passkeySignIn: string;
  passkeySigningIn: string;
  passkeyDivider: string;
  errors: Record<string, string>;
}

interface PasskeySignInButtonProps {
  lang: string;
  translations: PasskeySignInTranslations;
}

/** A cancelled or timed-out prompt is a user decision, not a failure worth shouting about. */
function isUserCancel(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
}

export function PasskeySignInButton({ lang, translations }: PasskeySignInButtonProps) {
  // Read in an effect so the server render and the first client render agree.
  const [isSupported, setIsSupported] = React.useState(false);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<PasskeyActionError | null>(null);

  React.useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && Boolean(window.PublicKeyCredential));
  }, []);

  const signIn = React.useCallback(async () => {
    setIsBusy(true);
    setError(null);

    try {
      const options = await startPasskeyAuthentication();
      if (!options.success) {
        setError(options.error);
        return;
      }

      const response = await startAuthentication({ optionsJSON: options.data });
      const result = await finishPasskeyAuthentication(response, lang);
      // A success redirects, so anything returned here is a failure.
      if (!result.success) setError(result.error);
    } catch (caught) {
      if (!isUserCancel(caught)) setError('verificationFailed');
    } finally {
      setIsBusy(false);
    }
  }, [lang]);

  if (!isSupported) return null;

  return (
    <div className="space-y-4">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={signIn}
        disabled={isBusy}
      >
        {isBusy ? <Loader2 className="animate-spin" /> : <Fingerprint />}
        {isBusy ? translations.passkeySigningIn : translations.passkeySignIn}
      </Button>
      {error && (
        <p className="text-sm font-medium text-destructive text-center">
          {translations.errors[error]}
        </p>
      )}
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">
          {translations.passkeyDivider}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
    </div>
  );
}
