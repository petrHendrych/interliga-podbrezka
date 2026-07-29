'use client';

import * as React from 'react';
import { Tooltip } from '@/components/ui/tooltip';

export interface FineLabels {
  paidStatus: string;
  unpaidStatus: string;
  noFine: string;
  reasons: {
    faults: string;
    worstPlayer: string;
    under600: string;
    fullFaults: string;
    secondToLastFaults: string;
    specialFaults: string;
    streak: string;
  };
}

export interface MatchFineTooltipProps {
  calculatedFine: number;
  isPaid: boolean;
  faults: number;
  isWorstPlayer: boolean;
  isUnder600: boolean;
  fullFaultsCount: number;
  secondToLastFaultsCount: number;
  specialFaultsCount: number;
  faultlessStreak?: number;
  labels: FineLabels;
}

export function MatchFineTooltip({
  calculatedFine,
  isPaid,
  faults,
  isWorstPlayer,
  isUnder600,
  fullFaultsCount,
  secondToLastFaultsCount,
  specialFaultsCount,
  faultlessStreak,
  labels,
}: MatchFineTooltipProps) {
  if (calculatedFine <= 0) {
    return <span className="text-muted-foreground font-normal">0 €</span>;
  }

  const sequentialFine = (faults * (faults + 1)) / 2;
  const worstFine = isWorstPlayer ? 1 : 0;
  const under600Fine = isUnder600 ? 1 : 0;
  const totalSpecialCount = Math.max(
    fullFaultsCount + secondToLastFaultsCount,
    specialFaultsCount,
  );
  const specialFine = totalSpecialCount * 5;
  const expectedBaseFine = sequentialFine + worstFine + under600Fine + specialFine;
  const streakFine = Math.max(0, calculatedFine - expectedBaseFine);

  const reasonsList: string[] = [];

  if (faults > 0) {
    reasonsList.push(labels.reasons.faults.replace('{count}', String(faults)));
  }
  if (fullFaultsCount > 0) {
    reasonsList.push(
      labels.reasons.fullFaults.replace('{count}', String(fullFaultsCount)),
    );
  }
  if (secondToLastFaultsCount > 0) {
    reasonsList.push(
      labels.reasons.secondToLastFaults.replace(
        '{count}',
        String(secondToLastFaultsCount),
      ),
    );
  } else if (specialFaultsCount > 0 && fullFaultsCount === 0) {
    reasonsList.push(
      labels.reasons.specialFaults.replace(
        '{count}',
        String(specialFaultsCount),
      ),
    );
  }
  if (isWorstPlayer) {
    reasonsList.push(labels.reasons.worstPlayer);
  }
  if (isUnder600) {
    reasonsList.push(labels.reasons.under600);
  }
  if (streakFine > 0 || (faultlessStreak !== undefined && faultlessStreak >= 5)) {
    const streakNum = faultlessStreak || 5;
    const streakReasonText = labels.reasons.streak.includes('{count}')
      ? labels.reasons.streak.replace('{count}', String(streakNum))
      : labels.reasons.streak;
    reasonsList.push(streakReasonText);
  }

  const colorClasses = isPaid
    ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
    : 'text-red-600 dark:text-red-400 font-semibold';

  const tooltipContent = (
    <div className="space-y-1 text-left">
      <div className="font-semibold flex items-center gap-1.5 border-b pb-1 mb-1">
        <span>
          {calculatedFine}
          {' '}
          €
        </span>
        <span
          className={
            isPaid
              ? 'text-emerald-600 dark:text-emerald-400 font-medium text-[11px]'
              : 'text-red-600 dark:text-red-400 font-medium text-[11px]'
          }
        >
          (
          {isPaid ? labels.paidStatus : labels.unpaidStatus}
          )
        </span>
      </div>
      {reasonsList.length > 0 ? (
        <ul className="list-disc list-inside space-y-0.5 text-[11px]">
          {reasonsList.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">{labels.noFine}</p>
      )}
    </div>
  );

  return (
    <Tooltip content={tooltipContent}>
      <button
        type="button"
        className={`cursor-pointer hover:underline focus:outline-none ${colorClasses}`}
      >
        {calculatedFine}
        {' '}
        €
      </button>
    </Tooltip>
  );
}
