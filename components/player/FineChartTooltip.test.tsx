import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import sk from '@/locales/sk.json';
import { FineChartTooltip } from '@/components/player/FineChartTooltip';
import type { FineChartPoint } from '@/lib/player-fine-chart';

const labels = {
  paidStatus: sk.playerDetail.paidStatus,
  unpaidStatus: sk.playerDetail.unpaidStatus,
  noFine: sk.playerDetail.noFine,
  substitution: sk.playerDetail.substitution,
};

function renderTooltip(overrides: Partial<FineChartPoint> = {}) {
  const point: FineChartPoint = {
    matchId: 1,
    amount: 5,
    isPaid: false,
    isSubstitution: false,
    dateLabel: '12. 9. 2026',
    shortDateLabel: '12. 9.',
    matchLabel: 'vs Brezno (doma)',
    leagueLabel: 'Interliga',
    ...overrides,
  };
  return render(<FineChartTooltip point={point} labels={labels} />);
}

describe('FineChartTooltip', () => {
  it('shows the date, the competition and the match', () => {
    renderTooltip();
    expect(screen.getByText('12. 9. 2026 · Interliga')).toBeInTheDocument();
    expect(screen.getByText('vs Brezno (doma)')).toBeInTheDocument();
  });

  it('shows an unpaid fine with its status', () => {
    renderTooltip({ amount: 5, isPaid: false });
    expect(screen.getByText('5 €')).toBeInTheDocument();
    expect(screen.getByText(`(${sk.playerDetail.unpaidStatus})`)).toBeInTheDocument();
    expect(screen.queryByText(`(${sk.playerDetail.paidStatus})`)).not.toBeInTheDocument();
  });

  it('shows a paid fine with its status', () => {
    renderTooltip({ amount: 5, isPaid: true });
    expect(screen.getByText(`(${sk.playerDetail.paidStatus})`)).toBeInTheDocument();
    expect(screen.queryByText(`(${sk.playerDetail.unpaidStatus})`)).not.toBeInTheDocument();
  });

  it('shows the whole debt of a match whose fine includes the success gathering', () => {
    renderTooltip({ amount: 15 });
    expect(screen.getByText('15 €')).toBeInTheDocument();
  });

  it('shows a substitution share to the cent', () => {
    renderTooltip({ amount: 0.34 });
    expect(screen.getByText('0.34 €')).toBeInTheDocument();
  });

  it('shows a clean match as 0 € with no fine and no paid status', () => {
    renderTooltip({ amount: 0, isPaid: false });
    expect(screen.getByText('0 €')).toBeInTheDocument();
    expect(screen.getByText(sk.playerDetail.noFine)).toBeInTheDocument();
    expect(screen.queryByText(`(${sk.playerDetail.unpaidStatus})`)).not.toBeInTheDocument();
    expect(screen.queryByText(`(${sk.playerDetail.paidStatus})`)).not.toBeInTheDocument();
  });

  it('marks a substitute\'s row', () => {
    renderTooltip({ isSubstitution: true });
    expect(screen.getByText(sk.playerDetail.substitution)).toBeInTheDocument();
  });

  it('carries no substitution mark on a regular row', () => {
    renderTooltip();
    expect(screen.queryByText(sk.playerDetail.substitution)).not.toBeInTheDocument();
  });
});
