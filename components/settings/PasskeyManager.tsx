'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Fingerprint, KeyRound, Loader2, Trash2,
} from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  deletePasskey,
  finishPasskeyRegistration,
  startPasskeyRegistration,
  type PasskeyActionError,
} from '@/lib/webauthn-actions';
import { defaultPasskeyLabel, MAX_PASSKEY_LABEL_LENGTH } from '@/lib/webauthn-config';

export interface PasskeyRow {
  id: number;
  label: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface PasskeyManagerTranslations {
  addPasskey: string;
  addingPasskey: string;
  addTitle: string;
  addDescription: string;
  labelLabel: string;
  labelPlaceholder: string;
  empty: string;
  unsupported: string;
  created: string;
  lastUsed: string;
  neverUsed: string;
  deleteLabel: string;
  deleteTitle: string;
  deleteDescription: string;
  cancel: string;
  errors: Record<string, string>;
}

interface PasskeyManagerProps {
  passkeys: PasskeyRow[];
  translations: PasskeyManagerTranslations;
}

const CARD = 'flex flex-col gap-3 rounded-xl bg-surface-2 p-4 sm:flex-row sm:items-center sm:justify-between';
const EMPTY_STATE = 'rounded-xl bg-surface-2 p-6 text-center text-sm text-muted-foreground';
const INPUT = 'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

/** A cancelled or timed-out prompt is a user decision, not a failure worth shouting about. */
function isUserCancel(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  return name === 'NotAllowedError' || name === 'AbortError';
}

export function PasskeyManager({ passkeys, translations }: PasskeyManagerProps) {
  const router = useRouter();
  // Read in an effect so the server render and the first client render agree.
  const [isSupported, setIsSupported] = React.useState(true);
  const [isAddOpen, setAddOpen] = React.useState(false);
  const [label, setLabel] = React.useState('');
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<PasskeyActionError | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<number | null>(null);

  React.useEffect(() => {
    setIsSupported(typeof window !== 'undefined' && Boolean(window.PublicKeyCredential));
  }, []);

  const openAdd = () => {
    setLabel(defaultPasskeyLabel(navigator.userAgent));
    setError(null);
    setAddOpen(true);
  };

  // Stays open on failure so the reason is visible instead of silently swallowed.
  const addPasskey = async () => {
    setIsBusy(true);
    setError(null);

    try {
      const options = await startPasskeyRegistration();
      if (!options.success) {
        setError(options.error);
        return;
      }

      const response = await startRegistration({ optionsJSON: options.data });
      const result = await finishPasskeyRegistration(response, label);
      if (!result.success) {
        setError(result.error);
        return;
      }

      setAddOpen(false);
      router.refresh();
    } catch (caught) {
      if (isUserCancel(caught)) setAddOpen(false);
      else setError('verificationFailed');
    } finally {
      setIsBusy(false);
    }
  };

  const removePasskey = async (id: number) => {
    setIsBusy(true);
    setError(null);

    const result = await deletePasskey(id);
    setIsBusy(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    setPendingDeleteId(null);
    router.refresh();
  };

  if (!isSupported) {
    return <p className={EMPTY_STATE}>{translations.unsupported}</p>;
  }

  return (
    <div className="space-y-4">
      {passkeys.length === 0 ? (
        <p className={EMPTY_STATE}>{translations.empty}</p>
      ) : (
        <ul className="space-y-3">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className={CARD}>
              <div className="flex items-start gap-3 min-w-0">
                <KeyRound className="size-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-semibold truncate">{passkey.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {`${translations.created}: ${passkey.createdAt ?? '—'}`}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {`${translations.lastUsed}: ${passkey.lastUsedAt ?? translations.neverUsed}`}
                  </p>
                </div>
              </div>
              <AlertDialog
                open={pendingDeleteId === passkey.id}
                onOpenChange={(open) => {
                  setPendingDeleteId(open ? passkey.id : null);
                  if (!open) setError(null);
                }}
              >
                <AlertDialogTrigger
                  render={(
                    <Button variant="destructive" size="sm">
                      <Trash2 />
                      {translations.deleteLabel}
                    </Button>
                  )}
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{translations.deleteTitle}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {translations.deleteDescription}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {error && (
                    <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
                      {translations.errors[error]}
                    </p>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isBusy}>{translations.cancel}</AlertDialogCancel>
                    <Button
                      variant="destructive"
                      onClick={() => removePasskey(passkey.id)}
                      disabled={isBusy}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      {isBusy ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      {translations.deleteLabel}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={isAddOpen}
        onOpenChange={(open) => {
          setAddOpen(open);
          if (!open) setError(null);
        }}
      >
        <AlertDialogTrigger
          render={(
            <Button className="w-full sm:w-auto" onClick={openAdd}>
              <Fingerprint />
              {translations.addPasskey}
            </Button>
          )}
        />
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{translations.addTitle}</AlertDialogTitle>
            <AlertDialogDescription>{translations.addDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <label htmlFor="passkey-label" className="text-sm font-medium">
            {translations.labelLabel}
            <input
              id="passkey-label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={translations.labelPlaceholder}
              maxLength={MAX_PASSKEY_LABEL_LENGTH}
              className={`mt-2 ${INPUT}`}
            />
          </label>
          {error && (
            <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
              {translations.errors[error]}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBusy}>{translations.cancel}</AlertDialogCancel>
            <Button onClick={addPasskey} disabled={isBusy}>
              {isBusy ? <Loader2 className="animate-spin" /> : <Fingerprint />}
              {isBusy ? translations.addingPasskey : translations.addPasskey}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
