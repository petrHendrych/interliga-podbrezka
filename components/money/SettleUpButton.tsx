'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { HandCoins, Loader2, TriangleAlert } from 'lucide-react';
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
  settlePlayerMoney,
  settleTrainerMoney,
  type SettleUpActionError,
  type SettleUpActionResult,
} from '@/lib/settle-up-actions';
import type { PlayerSettlement, TrainerSettlement } from '@/lib/settle-up-summary';
import { interpolate, type Locale } from '@/lib/i18n/config';
import { pluralize, type PluralForms } from '@/lib/i18n/plural';
import type { Dictionary } from '@/lib/i18n/types';

export type SettleUpTarget =
  | { kind: 'player'; externalPlayerId: number; settlement: PlayerSettlement }
  | { kind: 'trainer'; trainerId: string; settlement: TrainerSettlement };

export interface SettleUpButtonProps {
  target: SettleUpTarget;
  seasonId: number;
  lang: Locale;
  labels: Dictionary['settleUp'] & { matches: PluralForms };
}

export function SettleUpButton({
  target, seasonId, lang, labels,
}: SettleUpButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<SettleUpActionError | null>(null);

  const matches = (count: number) => pluralize(lang, count, labels.matches);
  const line = (template: string, amount: number, count: number) => (
    interpolate(template, { amount, matches: matches(count) })
  );

  const lines: string[] = [];
  let net: string | null = null;
  let pendingSplit: PlayerSettlement['pendingSplit'] = [];

  if (target.kind === 'player') {
    const { settlement } = target;
    if (settlement.fines > 0) {
      lines.push(line(labels.fines, settlement.fines, settlement.fineMatchIds.length));
    }
    if (settlement.bonuses > 0) {
      lines.push(line(labels.bonuses, settlement.bonuses, settlement.bonusMatchIds.length));
    }
    if (settlement.net > 0) net = interpolate(labels.netPays, { amount: settlement.net });
    else if (settlement.net < 0) net = interpolate(labels.netReceives, { amount: -settlement.net });
    else net = labels.netEven;
    pendingSplit = settlement.pendingSplit;
  } else {
    const { settlement } = target;
    lines.push(line(labels.payments, settlement.total, settlement.matchCount));
  }

  const settle = (): Promise<SettleUpActionResult> => {
    if (target.kind === 'player') {
      const { fineMatchIds, bonusMatchIds } = target.settlement;
      return settlePlayerMoney(target.externalPlayerId, seasonId, { fineMatchIds, bonusMatchIds });
    }
    return settleTrainerMoney(target.trainerId, seasonId, target.settlement.paymentIds);
  };

  // Stays open on failure so the reason is visible instead of silently swallowed.
  const handleConfirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await settle();
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
          <Button className="w-full md:w-auto">
            <HandCoins />
            {labels.button}
          </Button>
        )}
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{labels.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {target.kind === 'player' ? labels.playerDescription : labels.trainerDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-1 text-sm">
          {lines.map((text) => <p key={text}>{text}</p>)}
          {net && <p className="mt-1 font-semibold">{net}</p>}
        </div>
        {pendingSplit.map(({ matchId, opponent }) => (
          <div
            key={matchId}
            className="flex items-start gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-amber-800 dark:text-amber-300"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <p>
              {interpolate(labels.pendingSplit, { opponent: opponent ?? '' })}
              {' '}
              <Link href={`/${lang}/money/${matchId}`} className="font-medium underline underline-offset-2">
                {labels.openMatch}
              </Link>
            </p>
          </div>
        ))}
        {error && (
          <p className="rounded-lg bg-destructive/15 px-3 py-2 text-sm text-destructive">
            {labels.errors[error]}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{labels.cancel}</AlertDialogCancel>
          <Button onClick={handleConfirm} disabled={isPending || pendingSplit.length > 0}>
            {isPending ? <Loader2 className="animate-spin" /> : <HandCoins />}
            {labels.confirm}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
