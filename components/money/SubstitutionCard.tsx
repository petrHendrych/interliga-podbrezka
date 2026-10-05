'use client';

import { useState, useTransition } from 'react';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { interpolate } from '@/lib/i18n/config';
import { applyMatchMoney, type MatchMoneyActionError } from '@/lib/match-money-actions';
import type { SheetSubstitution } from '@/lib/substitutions';

export interface SubstitutionCardLabels {
  substitutionLine: string;
  substitutionLane: string;
  substitutionExact: string;
  substitutionNoLaneFaults: string;
  substitutionNeedsSplit: string;
  substitutionSplitLabel: string;
  substitutionSplitDone: string;
  save: string;
}

export interface SubstitutionCardProps {
  matchId: number;
  substitution: SheetSubstitution;
  labels: SubstitutionCardLabels;
  errors: Record<MatchMoneyActionError, string>;
  canEdit?: boolean;
}

const CARD = 'flex flex-col gap-3 rounded-xl bg-surface-2 p-4';

function statusText(substitution: SheetSubstitution, labels: SubstitutionCardLabels): string {
  if (!substitution.mid_lane) return labels.substitutionExact;
  if (substitution.lane_faults === 0) return labels.substitutionNoLaneFaults;
  if (substitution.substitute_lane_faults === null) {
    return interpolate(labels.substitutionNeedsSplit, { starter: substitution.starter_name });
  }
  return interpolate(labels.substitutionSplitDone, {
    substitute: substitution.substitute_name,
    count: substitution.substitute_lane_faults,
    faults: substitution.lane_faults,
  });
}

export function SubstitutionCard({
  matchId, substitution, labels, errors, canEdit = false,
}: SubstitutionCardProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<MatchMoneyActionError | null>(null);
  const [value, setValue] = useState(String(substitution.substitute_lane_faults ?? ''));

  const splittable = substitution.mid_lane && substitution.lane_faults > 0;
  const inputId = `substitution-${substitution.id}`;

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await applyMatchMoney(matchId, {
        substitutions: [{ id: substitution.id, substituteLaneFaults: Number(value) }],
      });
      if (!result.success) setError(result.error);
    });
  };

  return (
    <div className={CARD}>
      <div className="flex items-start gap-3 min-w-0">
        <ArrowRightLeft className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-semibold leading-tight">
            {interpolate(labels.substitutionLine, {
              starter: substitution.starter_name,
              substitute: substitution.substitute_name,
              throwNumber: substitution.throw_number,
            })}
          </p>
          <p className="text-sm text-muted-foreground">
            {interpolate(labels.substitutionLane, {
              lane: substitution.lane,
              faults: substitution.lane_faults,
            })}
          </p>
        </div>
      </div>

      <p className={substitution.needs_fault_split
        ? 'text-sm font-medium text-red-600 dark:text-red-400'
        : 'text-sm text-muted-foreground'}
      >
        {statusText(substitution, labels)}
      </p>

      {canEdit && splittable && (
        <div className="flex flex-col gap-2 border-t border-foreground/10 pt-3">
          <label htmlFor={inputId} className="text-sm">
            {interpolate(labels.substitutionSplitLabel, {
              substitute: substitution.substitute_name,
              lane: substitution.lane,
              faults: substitution.lane_faults,
            })}
          </label>
          <div className="flex items-center gap-2">
            <Input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={0}
              max={substitution.lane_faults}
              step={1}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="w-24"
            />
            <Button type="button" size="sm" onClick={handleSave} disabled={isPending || value === ''}>
              {isPending && <Loader2 className="animate-spin" />}
              {labels.save}
            </Button>
          </div>
          {error && (
            <p className="rounded-lg bg-destructive/15 px-2 py-1 text-xs text-destructive">
              {errors[error]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
