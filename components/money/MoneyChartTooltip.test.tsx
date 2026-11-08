import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import sk from '@/locales/sk.json';
import { MoneyChartTooltip } from '@/components/money/MoneyChartTooltip';
import type { MoneyChartPoint } from '@/lib/match-money-chart';

const labels = {
  players: sk.money.playersTitle,
  trainer: sk.money.trainerTitle,
  paid: sk.money.paid,
  unpaid: sk.money.unpaid,
};

function renderTooltip(overrides: Partial<MoneyChartPoint> = {}) {
  const point: MoneyChartPoint = {
    matchId: 1,
    players: 23,
    playersUnpaid: 8,
    trainer: 15,
    trainerUnpaid: 0,
    teamScore: 3812,
    opponentScore: 3650,
    dateLabel: '12. 9. 2026',
    shortDateLabel: '12. 9.',
    matchLabel: 'Podbrezová vs Brezno',
    leagueLabel: 'Interliga',
    ...overrides,
  };
  render(<MoneyChartTooltip point={point} labels={labels} />);
  return {
    players: () => within(screen.getByText(labels.players).parentElement as HTMLElement),
    trainer: () => within(screen.getByText(labels.trainer).parentElement as HTMLElement),
  };
}

describe('MoneyChartTooltip', () => {
  it('shows the date, the competition, the match and both team totals', () => {
    renderTooltip();
    expect(screen.getByText('12. 9. 2026 · Interliga')).toBeInTheDocument();
    expect(screen.getByText('Podbrezová vs Brezno')).toBeInTheDocument();
    expect(screen.getByText('3812 : 3650')).toBeInTheDocument();
  });

  it('shows a dash for a missing team total', () => {
    renderTooltip({ opponentScore: null });
    expect(screen.getByText('3812 : —')).toBeInTheDocument();
  });

  it('shows the players\' fines with the part still unpaid', () => {
    const rows = renderTooltip();
    expect(rows.players().getByText('23 €')).toBeInTheDocument();
    expect(rows.players().getByText(`(${sk.money.unpaid} 8 €)`)).toBeInTheDocument();
  });

  it('marks a fully paid amount as paid', () => {
    const rows = renderTooltip();
    expect(rows.trainer().getByText('15 €')).toBeInTheDocument();
    expect(rows.trainer().getByText(`(${sk.money.paid})`)).toBeInTheDocument();
  });

  it('shows 0 € without a status when a line collected nothing', () => {
    const rows = renderTooltip({ trainer: 0, trainerUnpaid: 0 });
    expect(rows.trainer().getByText('0 €')).toBeInTheDocument();
    expect(rows.trainer().queryByText(`(${sk.money.paid})`)).not.toBeInTheDocument();
  });

  it('shows cent amounts exactly', () => {
    const rows = renderTooltip({ players: 13.33, playersUnpaid: 0.33 });
    expect(rows.players().getByText('13.33 €')).toBeInTheDocument();
    expect(rows.players().getByText(`(${sk.money.unpaid} 0.33 €)`)).toBeInTheDocument();
  });
});
