import type { MoneyChartPoint } from '@/lib/match-money-chart';

export interface MoneyChartTooltipLabels {
  players: string;
  trainer: string;
  paid: string;
  unpaid: string;
}

function MoneyRow({
  label,
  color,
  amount,
  unpaid,
  labels,
}: {
  label: string;
  color: string;
  amount: number;
  unpaid: number;
  labels: MoneyChartTooltipLabels;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-muted-foreground">{label}</span>
      {amount > 0 ? (
        <>
          <span className="font-mono font-semibold tabular-nums">{`${amount} €`}</span>
          {unpaid > 0 ? (
            <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
              {`(${labels.unpaid} ${unpaid} €)`}
            </span>
          ) : (
            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
              {`(${labels.paid})`}
            </span>
          )}
        </>
      ) : (
        <span className="font-mono tabular-nums text-muted-foreground">0 €</span>
      )}
    </div>
  );
}

export function MoneyChartTooltip({
  point,
  labels,
}: {
  point: MoneyChartPoint;
  labels: MoneyChartTooltipLabels;
}) {
  return (
    <div className="grid min-w-48 max-w-72 gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <p className="text-muted-foreground">{`${point.dateLabel} · ${point.leagueLabel}`}</p>
      <p className="font-medium">{point.matchLabel}</p>
      <p className="text-muted-foreground tabular-nums">
        {`${point.teamScore ?? '—'} : ${point.opponentScore ?? '—'}`}
      </p>
      <MoneyRow
        label={labels.players}
        color="var(--chart-players)"
        amount={point.players}
        unpaid={point.playersUnpaid}
        labels={labels}
      />
      <MoneyRow
        label={labels.trainer}
        color="var(--chart-trainers)"
        amount={point.trainer}
        unpaid={point.trainerUnpaid}
        labels={labels}
      />
    </div>
  );
}
