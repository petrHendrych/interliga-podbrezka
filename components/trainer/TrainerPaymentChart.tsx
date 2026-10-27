'use client';

import { MatchAmountChart, type MatchChartLabels } from '@/components/charts/MatchAmountChart';
import {
  TrainerChartTooltip,
  type TrainerChartTooltipLabels,
} from '@/components/trainer/TrainerChartTooltip';
import type { TrainerChartPoint } from '@/lib/trainer-payment-chart';

export function TrainerPaymentChart({
  points,
  labels,
  chartLabels,
}: {
  points: TrainerChartPoint[];
  labels: TrainerChartTooltipLabels;
  chartLabels: MatchChartLabels;
}) {
  return (
    <MatchAmountChart
      points={points}
      labels={chartLabels}
      renderTooltip={(point) => <TrainerChartTooltip point={point} labels={labels} />}
    />
  );
}
