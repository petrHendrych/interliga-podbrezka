import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import { applyMatchMoney } from '@/lib/match-money-actions';
import type { TrainerConditionType } from '@/lib/money-rules';
import { TrainerPaymentCard, type TrainerPaymentCardPayment } from './TrainerPaymentCard';

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
};

const conditions: Record<TrainerConditionType, string> = {
  score_bonus: 'Výkon tímu',
  zero_faults: 'Bez chýb',
  elite_player: 'Elitný hráč',
  clean_sweep: 'Čistá výhra',
};

const basePayment: TrainerPaymentCardPayment = {
  id: 8,
  userId: 'trainer-1',
  userName: 'Peter Tréner',
  conditionType: 'score_bonus',
  amount: 15,
  isPaid: false,
};

function renderCard(overrides: Partial<TrainerPaymentCardPayment> = {}) {
  return render(
    <TrainerPaymentCard
      matchId={44568}
      payment={{ ...basePayment, ...overrides }}
      labels={labels}
      conditions={conditions}
      errors={errors}
    />,
  );
}

beforeEach(() => {
  vi.mocked(applyMatchMoney).mockReset();
});

describe('TrainerPaymentCard', () => {
  it('renders the trainer, the localized condition, the amount and an unpaid row', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderCard();

    expect(screen.getByText('Peter Tréner')).toBeInTheDocument();
    expect(screen.getByText('PT')).toBeInTheDocument();
    expect(screen.getByText(conditions.score_bonus)).toBeInTheDocument();
    expect(screen.getByText('15 €')).toBeInTheDocument();
    expect(screen.getByText(labels.unpaid)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));

    await vi.waitFor(() => expect(applyMatchMoney).toHaveBeenCalledWith(44568, {
      trainerPayments: [{ id: 8, isPaid: true }],
    }));
  });

  it('renders a paid row with the undo verb', () => {
    renderCard({ isPaid: true });

    expect(screen.getByText(labels.paid)).toBeInTheDocument();
    expect(screen.queryByText(labels.unpaid)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: labels.markUnpaid })).toBeInTheDocument();
  });

  it('falls back to the raw condition type when it is not localized', () => {
    renderCard({ conditionType: 'mystery_rule' });

    expect(screen.getByText('mystery_rule')).toBeInTheDocument();
  });
});
