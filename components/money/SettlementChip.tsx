export interface SettlementChipProps {
  label: string;
  unpaid: number;
  total: number;
  className?: string;
}

const MUTED = 'text-muted-foreground';
const OPEN = 'text-red-600 dark:text-red-400 font-semibold';
const PAID = 'text-emerald-600 dark:text-emerald-400 font-semibold';

function euro(amount: number): string {
  return `${Math.round(amount * 100) / 100} €`;
}

function Amount({ unpaid, total }: Pick<SettlementChipProps, 'unpaid' | 'total'>) {
  if (total <= 0) return <span className={MUTED}>{euro(0)}</span>;
  if (unpaid <= 0) return <span className={PAID}>{euro(total)}</span>;
  if (unpaid >= total) return <span className={OPEN}>{euro(total)}</span>;

  return (
    <>
      <span className={OPEN}>{euro(unpaid)}</span>
      <span className={MUTED}>{' / '}</span>
      <span className={PAID}>{euro(total - unpaid)}</span>
    </>
  );
}

export function SettlementChip({
  label, unpaid, total, className = 'bg-surface-2',
}: SettlementChipProps) {
  return (
    <div className={`rounded-lg p-2 text-center ${className}`}>
      <span className="block text-[10px] uppercase font-semibold tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm tabular-nums">
        <Amount unpaid={unpaid} total={total} />
      </span>
    </div>
  );
}
