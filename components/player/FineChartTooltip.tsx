import type { FineChartPoint } from '@/lib/player-fine-chart';

export interface FineChartTooltipLabels {
  paidStatus: string;
  unpaidStatus: string;
  noFine: string;
  substitution: string;
}

export function FineChartTooltip({
  point,
  labels,
}: {
  point: FineChartPoint;
  labels: FineChartTooltipLabels;
}) {
  return (
    <div className="grid min-w-40 max-w-64 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="text-muted-foreground">{`${point.dateLabel} · ${point.leagueLabel}`}</p>
      <div className="flex items-center gap-2 font-medium">
        <span>{point.matchLabel}</span>
        {point.isSubstitution ? (
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
            {labels.substitution}
          </span>
        ) : null}
      </div>
      {point.amount > 0 ? (
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-semibold tabular-nums">{`${point.amount} €`}</span>
          <span
            className={
              point.isPaid
                ? 'text-[11px] font-medium text-emerald-600 dark:text-emerald-400'
                : 'text-[11px] font-medium text-red-600 dark:text-red-400'
            }
          >
            {`(${point.isPaid ? labels.paidStatus : labels.unpaidStatus})`}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="font-mono tabular-nums">0 €</span>
          <span className="text-[11px]">{labels.noFine}</span>
        </div>
      )}
    </div>
  );
}
