import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import { applyMatchMoney } from '@/lib/match-money-actions';
import type { PaymentTarget } from '@/lib/match-money-payload';
import { PaidToggle } from './PaidToggle';

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
  markPaid: 'Označiť ako zaplatené',
  markUnpaid: 'Označiť ako nezaplatené',
};

const fineTarget: PaymentTarget = { kind: 'fine', userId: 'u1' };

function renderToggle(target: PaymentTarget, isPaid: boolean) {
  return render(
    <PaidToggle matchId={44568} target={target} isPaid={isPaid} labels={labels} errors={errors} />,
  );
}

beforeEach(() => {
  vi.mocked(applyMatchMoney).mockReset();
});

describe('PaidToggle', () => {
  it('marks an unpaid fine paid', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderToggle(fineTarget, false);

    expect(screen.getByText(labels.unpaid)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));

    await vi.waitFor(() => expect(applyMatchMoney).toHaveBeenCalledWith(44568, {
      players: [{ userId: 'u1', isPaid: true }],
    }));
  });

  it('marks a paid fine unpaid again', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderToggle(fineTarget, true);

    expect(screen.getByText(labels.paid)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: labels.markUnpaid }));

    await vi.waitFor(() => expect(applyMatchMoney).toHaveBeenCalledWith(44568, {
      players: [{ userId: 'u1', isPaid: false }],
    }));
  });

  it('flips only the bonus flag for a bonus target', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderToggle({ kind: 'bonus', userId: 'u1' }, false);

    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));

    await vi.waitFor(() => expect(applyMatchMoney).toHaveBeenCalledWith(44568, {
      players: [{ userId: 'u1', isBonusPaid: true }],
    }));
  });

  it('sends a trainer payment id for a trainer target', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderToggle({ kind: 'trainer', paymentId: 8 }, false);

    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));

    await vi.waitFor(() => expect(applyMatchMoney).toHaveBeenCalledWith(44568, {
      trainerPayments: [{ id: 8, isPaid: true }],
    }));
  });

  it.each<[MatchMoneyActionError, string]>([
    ['unauthorized', errors.unauthorized],
    ['notFound', errors.notFound],
    ['noBonus', errors.noBonus],
    ['invalid', errors.invalid],
    ['unknown', errors.unknown],
  ])('shows the localized message for %s', async (error, message) => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: false, error });
    renderToggle(fineTarget, false);

    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('clears a stale error when retried', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValueOnce({ success: false, error: 'unknown' });
    renderToggle(fineTarget, false);

    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));
    await screen.findByText(errors.unknown);

    vi.mocked(applyMatchMoney).mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: labels.markPaid }));

    await vi.waitFor(() => expect(screen.queryByText(errors.unknown)).not.toBeInTheDocument());
  });
});
