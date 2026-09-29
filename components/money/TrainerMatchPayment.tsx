'use client';

import type { TrainerConditionType } from '@/lib/money-rules';
import type { TrainerMatchRow, TrainerMatchStatus } from '@/lib/trainer-matches';
import { interpolate } from '@/lib/i18n/config';
import { Tooltip } from '@/components/ui/tooltip';

export interface TrainerMatchPaymentLabels {
  paidStatus: string;
  unpaidStatus: string;
  /** Carries `{amount}`, the part still owed. */
  partialStatus: string;
  conditions: Record<TrainerConditionType, string>;
}

interface TrainerMatchPaymentProps {
  row: TrainerMatchRow;
  labels: TrainerMatchPaymentLabels;
}

const PAID_TEXT = 'text-emerald-600 dark:text-emerald-400';
const UNPAID_TEXT = 'text-red-600 dark:text-red-400';
const PARTIAL_TEXT = 'text-amber-600 dark:text-amber-400';

const STATUS_TEXT: Record<TrainerMatchStatus, string> = {
  none: 'text-muted-foreground',
  paid: PAID_TEXT,
  unpaid: UNPAID_TEXT,
  partial: PARTIAL_TEXT,
};

const PILL = 'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap';

const STATUS_PILL: Record<Exclude<TrainerMatchStatus, 'none'>, string> = {
  paid: `${PILL} border-emerald-600/30 ${PAID_TEXT}`,
  unpaid: `${PILL} border-red-600/30 ${UNPAID_TEXT}`,
  partial: `${PILL} border-amber-600/30 ${PARTIAL_TEXT}`,
};

function conditionLabel(
  conditionType: string,
  conditions: Record<TrainerConditionType, string>,
): string {
  return conditionType in conditions
    ? conditions[conditionType as TrainerConditionType]
    : conditionType;
}

export function TrainerMatchAmount({ row, labels }: TrainerMatchPaymentProps) {
  if (row.total <= 0) {
    return <span className="text-muted-foreground font-normal">0 €</span>;
  }

  const content = (
    <ul className="flex min-w-44 flex-col gap-1 text-left text-[11px]">
      {row.payments.map((payment) => (
        <li key={payment.conditionType} className="flex items-baseline justify-between gap-4">
          <span>{conditionLabel(payment.conditionType, labels.conditions)}</span>
          <span className="whitespace-nowrap tabular-nums">
            <span className="font-semibold">{`${payment.amount} €`}</span>
            {' '}
            <span className={payment.isPaid ? PAID_TEXT : UNPAID_TEXT}>
              {`(${payment.isPaid ? labels.paidStatus : labels.unpaidStatus})`}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <Tooltip content={content}>
      <span className={`cursor-pointer font-semibold hover:underline focus:outline-none ${STATUS_TEXT[row.status]}`}>
        {`${row.total} €`}
      </span>
    </Tooltip>
  );
}

export function TrainerMatchStatusBadge({ row, labels }: TrainerMatchPaymentProps) {
  if (row.status === 'none') {
    return <span className="text-muted-foreground">-</span>;
  }

  const text = {
    paid: labels.paidStatus,
    unpaid: labels.unpaidStatus,
    partial: interpolate(labels.partialStatus, { amount: row.unpaid }),
  }[row.status];

  return <span className={STATUS_PILL[row.status]}>{text}</span>;
}
