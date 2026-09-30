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
  you: 'Ty',
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

function renderCard(
  overrides: Partial<TrainerPaymentCardPayment> = {},
  viewer: { canEdit?: boolean; isOwn?: boolean } = {},
) {
  return render(
    <TrainerPaymentCard
      matchId={44568}
      payment={{ ...basePayment, ...overrides }}
      labels={labels}
      conditions={conditions}
      errors={errors}
      canEdit={viewer.canEdit}
      isOwn={viewer.isOwn}
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

  it.each([
    [false, labels.unpaid],
    [true, labels.paid],
  ])('shows the amount and paid=%s state with no button when the viewer cannot edit', (isPaid, pill) => {
    renderCard({ isPaid }, { canEdit: false });

    expect(screen.getByText('15 €')).toBeInTheDocument();
    expect(screen.getByText(pill)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('marks the viewer\'s own payment and leaves other payments unmarked', () => {
    const { unmount } = renderCard({}, { isOwn: true });
    expect(screen.getByText(labels.you)).toBeInTheDocument();
    unmount();

    renderCard();
    expect(screen.queryByText(labels.you)).not.toBeInTheDocument();
  });

  it('falls back to the raw condition type when it is not localized', () => {
    renderCard({ conditionType: 'mystery_rule' });

    expect(screen.getByText('mystery_rule')).toBeInTheDocument();
  });
});
