import type { TrainerPaymentSummary as Summary } from '@/lib/trainer-matches';

export interface TrainerPaymentSummaryLabels {
  totalDue: string;
  paid: string;
  unpaid: string;
}

interface TrainerPaymentSummaryProps {
  summary: Summary;
  labels: TrainerPaymentSummaryLabels;
}

const TILE = 'rounded-lg bg-surface-2 px-2 py-1.5 sm:p-2 text-center flex flex-col justify-center';
const LABEL = 'block text-[10px] leading-tight uppercase font-semibold tracking-wide text-muted-foreground';
const VALUE = 'text-base sm:text-lg leading-tight font-bold tabular-nums';

export function TrainerPaymentSummary({ summary, labels }: TrainerPaymentSummaryProps) {
  const tiles = [
    {
      key: 'totalDue',
      label: labels.totalDue,
      amount: summary.total,
      tone: '',
    },
    {
      key: 'paid',
      label: labels.paid,
      amount: summary.paid,
      tone: summary.paid > 0 ? 'text-emerald-600 dark:text-emerald-400' : '',
    },
    {
      key: 'unpaid',
      label: labels.unpaid,
      amount: summary.unpaid,
      tone: summary.unpaid > 0 ? 'text-red-600 dark:text-red-400' : '',
    },
  ];

  return (
    <dl className="grid w-full grid-cols-3 gap-1.5 sm:gap-2">
      {tiles.map((tile) => (
        <div key={tile.key} className={TILE}>
          <dt className={LABEL}>{tile.label}</dt>
          <dd className={`${VALUE} ${tile.tone}`}>{`${tile.amount} €`}</dd>
        </div>
      ))}
    </dl>
  );
}
