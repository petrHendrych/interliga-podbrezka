'use client';

import {
  useId, useMemo, useState, type ReactNode,
} from 'react';
import {
  CartesianGrid, Line, LineChart, XAxis, YAxis, useXAxisScale,
  type TooltipContentProps, type TooltipValueType,
} from 'recharts';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { cn } from '@/lib/utils';
import {
  paymentStateRuns,
  type MatchChartAxisPoint,
  type MatchChartPoint,
  type MatchChartView,
  type MatchPaymentState,
} from '@/lib/match-chart';

export interface MatchSeriesChartLabels {
  /** Accessible name of the view switch. */
  view: string;
  views: Record<MatchChartView, string>;
}

export interface MatchChartLabels extends MatchSeriesChartLabels {
  paid: string;
  unpaid: string;
  /** Only the trainer page has partly paid matches, so only it passes this. */
  partial?: string;
}

/** One fixed-colour line of the series chart. */
export interface MatchChartSeries<T> {
  dataKey: keyof T & string;
  label: string;
  /** A CSS colour, e.g. `var(--chart-players)`. */
  color: string;
}

interface KeyEntry {
  key: string;
  color: string;
  label: string;
}

const VIEWS: MatchChartView[] = ['amount', 'score'];

const stateColor = (state: MatchPaymentState) => `var(--chart-${state})`;

/** Recharts clones this element and fills in `active` and `payload` for the hovered point. */
function ActivePointTooltip<T extends MatchChartAxisPoint>({
  active,
  payload,
  renderTooltip,
}: Partial<Pick<TooltipContentProps<TooltipValueType, string>, 'active' | 'payload'>> & {
  renderTooltip: (point: T) => ReactNode;
}) {
  const point: T | undefined = payload?.[0]?.payload;
  return active && point ? renderTooltip(point) : null;
}

/**
 * Hard colour stops at each match's x, in pixels: a bounding-box gradient would vanish on a
 * flat line (a season of 0 € matches), whose box has no height.
 */
function PaymentStateGradient({ id, points }: { id: string; points: MatchChartPoint[] }) {
  const xScale = useXAxisScale();
  const first = points[0];
  const last = points[points.length - 1];
  const x1 = first && xScale?.(first.matchId, { position: 'middle' });
  const x2 = last && xScale?.(last.matchId, { position: 'middle' });
  if (x1 === undefined || x2 === undefined || points.length < 2) return null;

  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>
        {paymentStateRuns(points.map((p) => p.paymentState)).flatMap((run) => [
          <stop key={`${run.state}-${run.start}`} offset={run.start} style={{ stopColor: stateColor(run.state) }} />,
          <stop key={`${run.state}-${run.end}`} offset={run.end} style={{ stopColor: stateColor(run.state) }} />,
        ])}
      </linearGradient>
    </defs>
  );
}

/** Recharts clones this element per point; each dot wears its own match's payment state. */
function PaymentStateDot({
  cx,
  cy,
  payload,
  r,
}: {
  cx?: number;
  cy?: number;
  payload?: MatchChartPoint;
  r: number;
}) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return <circle cx={cx} cy={cy} r={r} fill={stateColor(payload.paymentState)} />;
}

function ViewSwitch({
  view,
  labels,
  onChange,
}: {
  view: MatchChartView;
  labels: MatchSeriesChartLabels;
  onChange: (view: MatchChartView) => void;
}) {
  return (
    <div role="group" aria-label={labels.view} className="flex items-center gap-1.5">
      {VIEWS.map((value) => {
        const isActive = view === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            className={cn(
              'inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3 py-1.5 text-xs transition-colors hover:cursor-pointer',
              isActive
                ? 'bg-primary font-semibold text-primary-foreground shadow-sm'
                : 'bg-muted/80 font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            {labels.views[value]}
          </button>
        );
      })}
    </div>
  );
}

function ChartKey({ entries }: { entries: KeyEntry[] }) {
  return (
    <div className="flex h-6 items-center justify-center gap-4 pt-2 text-xs text-muted-foreground">
      {entries.map((entry) => (
        <span key={entry.key} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          {entry.label}
        </span>
      ))}
    </div>
  );
}

/** The card, view switch, axes, tooltip and key both chart modes share. */
function MatchChartFrame<T extends MatchChartAxisPoint>({
  points,
  labels,
  config,
  renderTooltip,
  renderLines,
  keyEntries,
  className,
}: {
  points: T[];
  labels: MatchSeriesChartLabels;
  config: ChartConfig;
  renderTooltip: (point: T) => ReactNode;
  renderLines: (view: MatchChartView) => ReactNode;
  keyEntries: (view: MatchChartView) => KeyEntry[];
  className?: string;
}) {
  const [view, setView] = useState<MatchChartView>('amount');

  const shortDateById = useMemo(
    () => new Map(points.map((p) => [p.matchId, p.shortDateLabel])),
    [points],
  );

  const isAmount = view === 'amount';

  return (
    <Card className={cn('mb-8', className)}>
      <CardHeader>
        <ViewSwitch view={view} labels={labels} onChange={setView} />
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        <ChartContainer config={config} className="aspect-auto h-[200px] w-full sm:h-[240px]">
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
              domain={isAmount ? [0, 'auto'] : ['auto', 'auto']}
              tickFormatter={isAmount ? (value: number) => `${value} €` : undefined}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: '4 4' }}
              content={<ActivePointTooltip renderTooltip={renderTooltip} />}
            />
            {renderLines(view)}
          </LineChart>
        </ChartContainer>
        <ChartKey entries={keyEntries(view)} />
      </CardContent>
    </Card>
  );
}

/**
 * One point per match. The amount view colours the line by payment state and the score view
 * plots the pins; switching keeps every match on its x and the card at its size.
 */
export function MatchAmountChart<T extends MatchChartPoint>({
  points,
  labels,
  renderTooltip,
}: {
  points: T[];
  labels: MatchChartLabels;
  renderTooltip: (point: T) => ReactNode;
}) {
  const gradientId = `payment-state-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const config = useMemo(() => ({
    amount: { label: labels.views.amount },
    score: { label: labels.views.score },
  }) satisfies ChartConfig, [labels.views.amount, labels.views.score]);

  return (
    <MatchChartFrame
      points={points}
      labels={labels}
      config={config}
      renderTooltip={renderTooltip}
      renderLines={(view) => (view === 'amount' ? (
        <>
          <PaymentStateGradient id={gradientId} points={points} />
          <Line
            key="amount"
            dataKey="amount"
            type="monotone"
            stroke={`url(#${gradientId})`}
            strokeWidth={2}
            dot={<PaymentStateDot r={2.5} />}
            activeDot={<PaymentStateDot r={5} />}
          />
        </>
      ) : (
        <Line
          key="score"
          dataKey="score"
          type="monotone"
          stroke="var(--chart-score)"
          strokeWidth={2}
          dot={{ r: 2.5, fill: 'var(--chart-score)', strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      ))}
      keyEntries={(view) => (view === 'score'
        ? [{ key: 'score', color: 'var(--chart-score)', label: labels.views.score }]
        : [
          { key: 'paid', color: stateColor('paid'), label: labels.paid },
          { key: 'unpaid', color: stateColor('unpaid'), label: labels.unpaid },
          ...(labels.partial
            ? [{ key: 'partial', color: stateColor('partial'), label: labels.partial }]
            : []),
        ])}
    />
  );
}

/** One point per match, one fixed-colour line per series of the active view. */
export function MatchSeriesChart<T extends MatchChartAxisPoint>({
  points,
  labels,
  series,
  renderTooltip,
  className,
}: {
  points: T[];
  labels: MatchSeriesChartLabels;
  series: Record<MatchChartView, MatchChartSeries<T>[]>;
  renderTooltip: (point: T) => ReactNode;
  className?: string;
}) {
  const config = useMemo(
    () => Object.fromEntries(
      [...series.amount, ...series.score].map((s) => [s.dataKey, { label: s.label }]),
    ) satisfies ChartConfig,
    [series],
  );

  return (
    <MatchChartFrame
      points={points}
      labels={labels}
      config={config}
      renderTooltip={renderTooltip}
      className={className}
      renderLines={(view) => series[view].map((s) => (
        <Line
          key={`${view}-${s.dataKey}`}
          dataKey={s.dataKey}
          type="monotone"
          stroke={s.color}
          strokeWidth={2}
          dot={{ r: 2.5, fill: s.color, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      ))}
      keyEntries={(view) => series[view].map((s) => ({
        key: s.dataKey,
        color: s.color,
        label: s.label,
      }))}
    />
  );
}
