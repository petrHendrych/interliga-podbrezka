'use client';

import { MatchAmountChart } from '@/components/charts/MatchAmountChart';
import { FineChartTooltip, type FineChartTooltipLabels } from '@/components/player/FineChartTooltip';
import type { FineChartPoint } from '@/lib/player-fine-chart';

export interface PlayerFineChartLabels extends FineChartTooltipLabels {
  title: string;
}

export function PlayerFineChart({
  points,
  labels,
}: {
  points: FineChartPoint[];
  labels: PlayerFineChartLabels;
}) {
  return (
    <MatchAmountChart
      title={labels.title}
      points={points}
      renderTooltip={(point) => <FineChartTooltip point={point} labels={labels} />}
    />
  );
}
