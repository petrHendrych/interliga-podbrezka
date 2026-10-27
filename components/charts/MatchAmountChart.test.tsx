import {
  describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, within,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import { MatchAmountChart, type MatchChartLabels } from '@/components/charts/MatchAmountChart';
import type { MatchChartPoint } from '@/lib/match-chart';

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
    // jsdom has no layout, and Recharts draws nothing into a 0×0 container.
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
      renderChart();
      const stops = [...document.querySelectorAll<SVGStopElement>('linearGradient stop')]
        .map((stop) => [stop.getAttribute('offset'), stop.style.stopColor]);
      expect(stops).toEqual([['0', 'var(--chart-unpaid)'], ['1', 'var(--chart-unpaid)']]);
    } finally {
      size.mockRestore();
    }
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
