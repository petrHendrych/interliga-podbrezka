'use client';

import {
  MatchSeriesChart,
  type MatchChartSeries,
  type MatchSeriesChartLabels,
} from '@/components/charts/MatchAmountChart';
import { MoneyChartTooltip, type MoneyChartTooltipLabels } from '@/components/money/MoneyChartTooltip';
import type { MatchChartView } from '@/lib/match-chart';
import type { MoneyChartPoint } from '@/lib/match-money-chart';

export interface MatchMoneyChartLabels extends MatchSeriesChartLabels, MoneyChartTooltipLabels {
  team: string;
  opponent: string;
}

export function MatchMoneyChart({
  points,
  labels,
}: {
  points: MoneyChartPoint[];
  labels: MatchMoneyChartLabels;
}) {
  const series: Record<MatchChartView, MatchChartSeries<MoneyChartPoint>[]> = {
    amount: [
      { dataKey: 'players', label: labels.players, color: 'var(--chart-players)' },
      { dataKey: 'trainer', label: labels.trainer, color: 'var(--chart-trainers)' },
    ],
    score: [
      { dataKey: 'teamScore', label: labels.team, color: 'var(--chart-score)' },
      { dataKey: 'opponentScore', label: labels.opponent, color: 'var(--muted-foreground)' },
    ],
  };

  return (
    <MatchSeriesChart
      points={points}
      labels={labels}
      series={series}
      className="mb-0"
      renderTooltip={(point) => <MoneyChartTooltip point={point} labels={labels} />}
    />
  );
}
