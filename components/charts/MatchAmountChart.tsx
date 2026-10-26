'use client';

import { useMemo, type ReactNode } from 'react';
import {
  CartesianGrid, Line, LineChart, XAxis, YAxis,
  type TooltipContentProps, type TooltipValueType,
} from 'recharts';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import type { MatchChartPoint } from '@/lib/match-chart';

/** Recharts clones this element and fills in `active` and `payload` for the hovered point. */
function ActivePointTooltip<T extends MatchChartPoint>({
  active,
  payload,
  renderTooltip,
}: Partial<Pick<TooltipContentProps<TooltipValueType, string>, 'active' | 'payload'>> & {
  renderTooltip: (point: T) => ReactNode;
}) {
  const point: T | undefined = payload?.[0]?.payload;
  return active && point ? renderTooltip(point) : null;
}

/** One point per match, in the colour of the logo's side rules. */
export function MatchAmountChart<T extends MatchChartPoint>({
  title,
  points,
  renderTooltip,
}: {
  title: string;
  points: T[];
  renderTooltip: (point: T) => ReactNode;
}) {
  // --decor-dot is the colour of the logo's side rules and is already themed for dark mode.
  const chartConfig = useMemo(() => ({
    amount: { label: title, color: 'var(--decor-dot)' },
  }) satisfies ChartConfig, [title]);

  const shortDateById = useMemo(
    () => new Map(points.map((p) => [p.matchId, p.shortDateLabel])),
    [points],
  );

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[220px] w-full sm:h-[260px]">
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0 }} accessibilityLayer>
            <CartesianGrid vertical={false} />
            {/* Keyed by match, not date, so two matches on one day stay two points. */}
            <XAxis
              dataKey="matchId"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={(matchId: number) => shortDateById.get(matchId) ?? ''}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              allowDecimals={false}
              domain={[0, 'auto']}
              tickFormatter={(value: number) => `${value} €`}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: '4 4' }}
              content={<ActivePointTooltip renderTooltip={renderTooltip} />}
            />
            <Line
              dataKey="amount"
              type="monotone"
              stroke="var(--color-amount)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: 'var(--color-amount)', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
