'use client';

import { MatchAmountChart } from '@/components/charts/MatchAmountChart';
import type { TrainerMatchPaymentLabels } from '@/components/money/TrainerMatchPayment';
import { TrainerChartTooltip } from '@/components/trainer/TrainerChartTooltip';
import type { TrainerChartPoint } from '@/lib/trainer-payment-chart';

export interface TrainerPaymentChartLabels extends TrainerMatchPaymentLabels {
  title: string;
}

export function TrainerPaymentChart({
  points,
  labels,
}: {
  points: TrainerChartPoint[];
  labels: TrainerPaymentChartLabels;
}) {
  return (
    <MatchAmountChart
      title={labels.title}
      points={points}
      renderTooltip={(point) => <TrainerChartTooltip point={point} labels={labels} />}
    />
  );
}
