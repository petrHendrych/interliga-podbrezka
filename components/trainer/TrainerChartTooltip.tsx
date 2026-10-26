import {
  TrainerMatchStatusBadge,
  TrainerPaymentBreakdown,
  type TrainerMatchPaymentLabels,
} from '@/components/money/TrainerMatchPayment';
import type { TrainerChartPoint } from '@/lib/trainer-payment-chart';

export function TrainerChartTooltip({
  point,
  labels,
}: {
  point: TrainerChartPoint;
  labels: TrainerMatchPaymentLabels;
}) {
  return (
    <div className="grid min-w-48 max-w-72 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="text-muted-foreground">{`${point.dateLabel} · ${point.leagueLabel}`}</p>
      <p className="font-medium">{point.matchLabel}</p>
      {point.amount > 0 ? (
        <>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold tabular-nums">{`${point.amount} €`}</span>
            <TrainerMatchStatusBadge row={point} labels={labels} />
          </div>
          <TrainerPaymentBreakdown payments={point.payments} labels={labels} />
        </>
      ) : (
        <span className="font-mono tabular-nums text-muted-foreground">0 €</span>
      )}
    </div>
  );
}
