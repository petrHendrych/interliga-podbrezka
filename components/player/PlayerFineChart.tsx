'use client';

import { MatchAmountChart, type MatchChartLabels } from '@/components/charts/MatchAmountChart';
import { FineChartTooltip, type FineChartTooltipLabels } from '@/components/player/FineChartTooltip';
import type { FineChartPoint } from '@/lib/player-fine-chart';

export function PlayerFineChart({
  points,
  labels,
  chartLabels,
}: {
  points: FineChartPoint[];
  labels: FineChartTooltipLabels;
  chartLabels: MatchChartLabels;
}) {
  return (
    <MatchAmountChart
      points={points}
      labels={chartLabels}
      renderTooltip={(point) => <FineChartTooltip point={point} labels={labels} />}
    />
  );
}
