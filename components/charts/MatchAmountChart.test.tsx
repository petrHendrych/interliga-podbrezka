import {
  describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import {
  MatchAmountChart,
  MatchSeriesChart,
  type MatchChartLabels,
  type MatchChartSeries,
  type MatchSeriesChartLabels,
} from '@/components/charts/MatchAmountChart';
import type { MatchChartAxisPoint, MatchChartPoint, MatchChartView } from '@/lib/match-chart';

const points: MatchChartPoint[] = [
  {
    matchId: 1, amount: 5, score: 612, paymentState: 'unpaid', shortDateLabel: '12. 9.',
  },
  {
    matchId: 2, amount: 0, score: 640, paymentState: 'paid', shortDateLabel: '19. 9.',
  },
];

const playerLabels: MatchChartLabels = {
  view: sk.playerDetail.chartView,
  views: { amount: sk.playerDetail.chartFines, score: sk.playerDetail.chartScore },
  paid: sk.playerDetail.paidStatus,
  unpaid: sk.playerDetail.unpaidStatus,
};

/** jsdom has no layout, and Recharts draws nothing into a 0×0 container. */
function withLayout(run: () => void) {
  const size = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 320,
    height: 220,
    top: 0,
    left: 0,
    right: 320,
    bottom: 220,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  try {
    run();
  } finally {
    size.mockRestore();
  }
}

function renderChart(labels: MatchChartLabels = playerLabels) {
  render(<MatchAmountChart points={points} labels={labels} renderTooltip={() => null} />);
  const pills = within(screen.getByRole('group', { name: labels.view }));
  return {
    amountPill: () => pills.getByRole('button', { name: labels.views.amount }),
    scorePill: () => pills.getByRole('button', { name: labels.views.score }),
  };
}

describe('MatchAmountChart', () => {
  it('opens on the fines view', () => {
    const chart = renderChart();
    expect(chart.amountPill()).toHaveAttribute('aria-pressed', 'true');
    expect(chart.scorePill()).toHaveAttribute('aria-pressed', 'false');
  });

  it('explains the payment colours under the fines view', () => {
    renderChart();
    expect(screen.getByText(sk.playerDetail.paidStatus)).toBeInTheDocument();
    expect(screen.getByText(sk.playerDetail.unpaidStatus)).toBeInTheDocument();
  });

  it('switches the pills and the key to the score view', () => {
    const chart = renderChart();
    fireEvent.click(chart.scorePill());

    expect(chart.scorePill()).toHaveAttribute('aria-pressed', 'true');
    expect(chart.amountPill()).toHaveAttribute('aria-pressed', 'false');
    // The pill and the key both read "Výkon".
    expect(screen.getAllByText(sk.playerDetail.chartScore)).toHaveLength(2);
    expect(screen.queryByText(sk.playerDetail.paidStatus)).not.toBeInTheDocument();
  });

  it('switches back to the fines view', () => {
    const chart = renderChart();
    fireEvent.click(chart.scorePill());
    fireEvent.click(chart.amountPill());
    expect(chart.amountPill()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(sk.playerDetail.paidStatus)).toBeInTheDocument();
  });

  it('colours the fine line from the first match\'s payment state', () => {
    withLayout(() => {
      renderChart();
      const stops = [...document.querySelectorAll<SVGStopElement>('linearGradient stop')]
        .map((stop) => [stop.getAttribute('offset'), stop.style.stopColor]);
      expect(stops).toEqual([['0', 'var(--chart-unpaid)'], ['1', 'var(--chart-unpaid)']]);
    });
  });

  it('lists partly paid in the key only when the page passes it', () => {
    renderChart({ ...playerLabels, partial: sk.trainerDetail.partlyPaid });
    expect(screen.getByText(sk.trainerDetail.partlyPaid)).toBeInTheDocument();
  });

  it('leaves partly paid out of the player key', () => {
    renderChart();
    expect(screen.queryByText(sk.trainerDetail.partlyPaid)).not.toBeInTheDocument();
  });
});

interface MoneyPoint extends MatchChartAxisPoint {
  players: number;
  trainer: number;
  teamScore: number | null;
  opponentScore: number | null;
}

const moneyPoints: MoneyPoint[] = [
  {
    matchId: 1, players: 23, trainer: 15, teamScore: 3812, opponentScore: 3650, shortDateLabel: '12. 9.',
  },
  {
    matchId: 2, players: 8, trainer: 0, teamScore: 3690, opponentScore: null, shortDateLabel: '19. 9.',
  },
];

const moneyLabels: MatchSeriesChartLabels = {
  view: sk.playerDetail.chartView,
  views: { amount: sk.trainerDetail.chartPayments, score: sk.trainerDetail.chartScore },
};

const moneySeries: Record<MatchChartView, MatchChartSeries<MoneyPoint>[]> = {
  amount: [
    { dataKey: 'players', label: sk.money.playersTitle, color: 'var(--chart-players)' },
    { dataKey: 'trainer', label: sk.money.trainerTitle, color: 'var(--chart-trainers)' },
  ],
  score: [
    { dataKey: 'teamScore', label: sk.money.chartTeam, color: 'var(--chart-score)' },
    { dataKey: 'opponentScore', label: sk.admin.matches.opponent, color: 'var(--muted-foreground)' },
  ],
};

function renderSeriesChart() {
  render(
    <MatchSeriesChart
      points={moneyPoints}
      labels={moneyLabels}
      series={moneySeries}
      renderTooltip={() => null}
    />,
  );
  const pills = within(screen.getByRole('group', { name: moneyLabels.view }));
  return {
    amountPill: () => pills.getByRole('button', { name: moneyLabels.views.amount }),
    scorePill: () => pills.getByRole('button', { name: moneyLabels.views.score }),
  };
}

const lineStrokes = () => [...document.querySelectorAll('path.recharts-line-curve')]
  .map((path) => path.getAttribute('stroke'));

describe('MatchSeriesChart', () => {
  it('opens on the amount view with one key entry per money line', () => {
    const chart = renderSeriesChart();
    expect(chart.amountPill()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(sk.money.playersTitle)).toBeInTheDocument();
    expect(screen.getByText(sk.money.trainerTitle)).toBeInTheDocument();
    expect(screen.queryByText(sk.playerDetail.paidStatus)).not.toBeInTheDocument();
    expect(screen.queryByText(sk.playerDetail.unpaidStatus)).not.toBeInTheDocument();
  });

  it('swaps the key to our team and the opponent on the score view', () => {
    const chart = renderSeriesChart();
    fireEvent.click(chart.scorePill());

    expect(chart.scorePill()).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(sk.money.chartTeam)).toBeInTheDocument();
    expect(screen.getByText(sk.admin.matches.opponent)).toBeInTheDocument();
    expect(screen.queryByText(sk.money.playersTitle)).not.toBeInTheDocument();
  });

  it('draws each series in its own fixed colour', () => {
    withLayout(() => {
      const chart = renderSeriesChart();
      expect(lineStrokes()).toEqual(['var(--chart-players)', 'var(--chart-trainers)']);

      fireEvent.click(chart.scorePill());
      expect(lineStrokes()).toEqual(['var(--chart-score)', 'var(--muted-foreground)']);
    });
  });
});
