import {
  describe, expect, it, vi,
} from 'vitest';
import { render, screen } from '@testing-library/react';
import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import { PlayerMoneyCard, type PlayerMoneyCardPlayer, type PlayerMoneyRow } from './PlayerMoneyCard';

vi.mock('@/lib/match-money-actions', () => ({
  applyMatchMoney: vi.fn(),
}));

const errors: Record<MatchMoneyActionError, string> = {
  unauthorized: 'Nemáte oprávnenie',
  notFound: 'Záznam sa nenašiel',
  noBonus: 'Hráč nemá bonus',
  invalid: 'Neplatná hodnota',
  unknown: 'Neznáma chyba',
};

const labels = {
  paid: 'Zaplatené',
  unpaid: 'Nezaplatené',
  markPaid: 'Zaplatiť',
  markUnpaid: 'Vrátiť',
  total: 'Spolu',
  faults: 'Chyby',
  fine: 'Pokuta',
  bonus: 'Bonus',
};

const basePlayer: PlayerMoneyCardPlayer = {
  user_id: 'u1',
  user_name: 'Ján Novák',
  external_player_id: null,
  total: 712,
  faults: 2,
  calculated_fine: 3,
  streak_fine: 10,
  bonus_received: 40,
  is_paid: false,
  is_bonus_paid: false,
};

function renderCard(
  overrides: Partial<PlayerMoneyCardPlayer> = {},
  rows?: ReadonlyArray<PlayerMoneyRow>,
) {
  return render(
    <PlayerMoneyCard
      matchId={44568}
      player={{ ...basePlayer, ...overrides }}
      labels={labels}
      errors={errors}
      rows={rows}
    />,
  );
}

describe('PlayerMoneyCard', () => {
  it('shows the fine as calculated_fine + streak_fine, the bonus, total and faults', () => {
    renderCard();

    expect(screen.getByText('Ján Novák')).toBeInTheDocument();
    expect(screen.getByText('13 €')).toBeInTheDocument();
    expect(screen.getByText('40 €')).toBeInTheDocument();
    expect(screen.getByText('712')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders a toggle for the fine and one for the bonus when both are owed', () => {
    renderCard();

    expect(screen.getAllByRole('button', { name: labels.markPaid })).toHaveLength(2);
  });

  it('renders no fine toggle when nothing is owed', () => {
    renderCard({ calculated_fine: 0, streak_fine: 0 });

    expect(screen.getByText('0 €')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: labels.markPaid })).toHaveLength(1);
  });

  it('renders no bonus toggle when no bonus was earned', () => {
    renderCard({ bonus_received: 0 });

    expect(screen.getByText('0 €')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: labels.markPaid })).toHaveLength(1);
  });

  it('renders no toggles at all when there is no money to settle', () => {
    renderCard({ calculated_fine: 0, streak_fine: 0, bonus_received: 0 });

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to undo a paid fine while the bonus is still unpaid', () => {
    renderCard({ is_paid: true });

    expect(screen.getByRole('button', { name: labels.markUnpaid })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.markPaid })).toBeInTheDocument();
  });

  it('falls back to initials when no photo is mapped', () => {
    renderCard();

    expect(screen.getByText('JN')).toBeInTheDocument();
  });

  it('renders only the bonus row and the total tile in bonus-only mode', () => {
    renderCard({}, ['bonus']);

    expect(screen.getByText('40 €')).toBeInTheDocument();
    expect(screen.getByText('712')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: labels.markPaid })).toHaveLength(1);
    expect(screen.queryByText('13 €')).not.toBeInTheDocument();
    expect(screen.queryByText(labels.fine)).not.toBeInTheDocument();
    expect(screen.queryByText(labels.faults)).not.toBeInTheDocument();
  });

  it('shows an unpaid pill for the fine and a paid pill for the bonus in the same card', () => {
    renderCard({ is_bonus_paid: true });

    expect(screen.getByText(labels.unpaid)).toBeInTheDocument();
    expect(screen.getByText(labels.paid)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.markPaid })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.markUnpaid })).toBeInTheDocument();
  });
});
