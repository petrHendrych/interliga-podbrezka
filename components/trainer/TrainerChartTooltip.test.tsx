import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import sk from '@/locales/sk.json';
import { interpolate } from '@/lib/i18n/config';
import { TrainerChartTooltip } from '@/components/trainer/TrainerChartTooltip';
import type { TrainerChartPoint } from '@/lib/trainer-payment-chart';

const labels = {
  paidStatus: sk.playerDetail.paidStatus,
  unpaidStatus: sk.playerDetail.unpaidStatus,
  partialStatus: sk.trainerDetail.partialStatus,
  conditions: sk.money.conditions,
  score: sk.trainerDetail.teamTotal,
};

function renderTooltip(overrides: Partial<TrainerChartPoint> = {}) {
  const point: TrainerChartPoint = {
    matchId: 1,
    amount: 0,
    score: null,
    paymentState: 'paid',
    status: 'none',
    unpaid: 0,
    payments: [],
    dateLabel: '12. 9. 2026',
    shortDateLabel: '12. 9.',
    matchLabel: 'vs Brezno (doma)',
    leagueLabel: 'Interliga',
    ...overrides,
  };
  return render(<TrainerChartTooltip point={point} labels={labels} />);
}

describe('TrainerChartTooltip', () => {
  it('shows the date, the competition and the match', () => {
    renderTooltip();
    expect(screen.getByText('12. 9. 2026 · Interliga')).toBeInTheDocument();
    expect(screen.getByText('vs Brezno (doma)')).toBeInTheDocument();
  });

  it('shows the team total for the match', () => {
    renderTooltip({ score: 3912 });
    expect(screen.getByText(`${sk.trainerDetail.teamTotal}: 3912`)).toBeInTheDocument();
  });

  it('shows no team total when the match has none', () => {
    renderTooltip({ score: null });
    expect(screen.queryByText(new RegExp(`^${sk.trainerDetail.teamTotal}:`))).not.toBeInTheDocument();
  });

  it('shows a match without a payment as 0 € with no status', () => {
    renderTooltip();
    expect(screen.getByText('0 €')).toBeInTheDocument();
    expect(screen.queryByText(sk.playerDetail.paidStatus)).not.toBeInTheDocument();
    expect(screen.queryByText(sk.playerDetail.unpaidStatus)).not.toBeInTheDocument();
  });

  it('shows the match total and each condition behind it', () => {
    renderTooltip({
      amount: 35,
      status: 'unpaid',
      unpaid: 35,
      payments: [
        { conditionType: 'score_bonus', amount: 15, isPaid: false },
        { conditionType: 'elite_player', amount: 20, isPaid: false },
      ],
    });
    expect(screen.getByText('35 €')).toBeInTheDocument();
    expect(screen.getByText(sk.playerDetail.unpaidStatus)).toBeInTheDocument();
    expect(screen.getByText(sk.money.conditions.score_bonus)).toBeInTheDocument();
    expect(screen.getByText('15 €')).toBeInTheDocument();
    expect(screen.getByText(sk.money.conditions.elite_player)).toBeInTheDocument();
    expect(screen.getByText('20 €')).toBeInTheDocument();
  });

  it('shows a fully paid match as paid', () => {
    renderTooltip({
      amount: 10,
      status: 'paid',
      payments: [{ conditionType: 'clean_sweep', amount: 10, isPaid: true }],
    });
    expect(screen.getByText(sk.playerDetail.paidStatus)).toBeInTheDocument();
    expect(screen.getByText(`(${sk.playerDetail.paidStatus})`)).toBeInTheDocument();
  });

  it('shows what is still owed on a partly paid match', () => {
    renderTooltip({
      amount: 25,
      status: 'partial',
      unpaid: 10,
      payments: [
        { conditionType: 'score_bonus', amount: 15, isPaid: true },
        { conditionType: 'zero_faults', amount: 10, isPaid: false },
      ],
    });
    expect(screen.getByText(interpolate(sk.trainerDetail.partialStatus, { amount: 10 })))
      .toBeInTheDocument();
    expect(screen.getByText(`(${sk.playerDetail.paidStatus})`)).toBeInTheDocument();
    expect(screen.getByText(`(${sk.playerDetail.unpaidStatus})`)).toBeInTheDocument();
  });
});
