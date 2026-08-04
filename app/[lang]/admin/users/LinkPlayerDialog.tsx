'use client';

import { useState, useTransition } from 'react';
import { Link2, Loader2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { linkScrapedPlayer, type AdminActionError } from '@/lib/admin-actions';
import { interpolate } from '@/lib/i18n/config';

export interface LinkCandidate {
  id: string;
  name: string;
  externalPlayerId: number | null;
  matchesCount: number;
  /** Name matches the account's name, so it is offered first. */
  isSuggested: boolean;
}

interface LinkPlayerDialogProps {
  accountId: string;
  accountName: string;
  candidates: LinkCandidate[];
  translations: {
    trigger: string;
    title: string;
    /** Interpolates `{player}`, `{account}` and `{matches}`. */
    description: string;
    placeholder: string;
    suggested: string;
    matches: string;
    empty: string;
    confirm: string;
    cancel: string;
    errors: Record<AdminActionError, string>;
  };
}

export function LinkPlayerDialog({
  accountId,
  accountName,
  candidates,
  translations,
}: LinkPlayerDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<AdminActionError | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    candidates.find((c) => c.isSuggested)?.id ?? null,
  );

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const handleLink = () => {
    if (!selectedId) return;
    setError(null);
    startTransition(async () => {
      const result = await linkScrapedPlayer(accountId, selectedId);
      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) setError(null);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={(
          <Button variant="outline" size="sm">
            <Link2 />
            {translations.trigger}
          </Button>
        )}
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{translations.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {candidates.length === 0
              ? translations.empty
              : interpolate(translations.description, {
                player: selected?.name ?? '—',
                account: accountName,
                matches: interpolate(translations.matches, {
                  count: selected?.matchesCount ?? 0,
                }),
              })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {candidates.length > 0 && (
          <Select
            value={selectedId}
            onValueChange={(value: string | null) => setSelectedId(value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={translations.placeholder}>
                {selected ? selected.name : translations.placeholder}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-[var(--anchor-width)]">
              {candidates.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{candidate.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {candidate.isSuggested && `${translations.suggested} · `}
                      {interpolate(translations.matches, { count: candidate.matchesCount })}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {translations.errors[error]}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{translations.cancel}</AlertDialogCancel>
          <Button onClick={handleLink} disabled={isPending || !selectedId}>
            {isPending ? <Loader2 className="animate-spin" /> : <Link2 />}
            {translations.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
