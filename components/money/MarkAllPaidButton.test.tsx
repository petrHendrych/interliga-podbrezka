import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { MatchMoneyActionError } from '@/lib/match-money-actions';
import { applyMatchMoney } from '@/lib/match-money-actions';
import type { PaymentTarget } from '@/lib/match-money-payload';
import { MarkAllPaidButton } from './MarkAllPaidButton';

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

const translations = { cancel: 'Zrušiť', confirm: 'Potvrdiť', errors };
const title = 'Označiť všetky ako zaplatené?';

const targets: PaymentTarget[] = [
  { kind: 'fine', userId: 'u1' },
  { kind: 'bonus', userId: 'u1' },
  { kind: 'fine', userId: 'u2' },
  { kind: 'trainer', paymentId: 8 },
];

function renderButton(list: PaymentTarget[] = targets) {
  return render(
    <MarkAllPaidButton
      matchId={44568}
      targets={list}
      label="Označiť všetky"
      title={title}
      description="Všetky nezaplatené položky sa označia ako zaplatené."
      translations={translations}
    />,
  );
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Označiť všetky' }));
  await screen.findByText(title);
  return document.querySelector('[data-base-ui-portal]') as HTMLElement;
}

beforeEach(() => {
  vi.mocked(applyMatchMoney).mockReset();
});

describe('MarkAllPaidButton', () => {
  it('is disabled when nothing is unpaid', () => {
    renderButton([]);

    expect(screen.getByRole('button', { name: 'Označiť všetky' })).toBeDisabled();
  });

  it('asks before writing', async () => {
    renderButton();
    await openDialog();

    expect(applyMatchMoney).not.toHaveBeenCalled();
  });

  it('sends one merged payload and closes on success', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderButton();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: translations.confirm }));

    await waitFor(() => expect(applyMatchMoney).toHaveBeenCalledTimes(1));
    expect(applyMatchMoney).toHaveBeenCalledWith(44568, {
      players: [
        { userId: 'u1', isPaid: true, isBonusPaid: true },
        { userId: 'u2', isPaid: true },
      ],
      trainerPayments: [{ id: 8, isPaid: true }],
    });
    await waitFor(() => {
      expect(screen.queryByText(title)).not.toBeInTheDocument();
    });
  });

  it('uses custom variant and className', () => {
    render(
      <MarkAllPaidButton
        matchId={44568}
        targets={targets}
        label="Označiť všetky"
        title={title}
        description="description"
        variant="default"
        className="custom-class"
        translations={translations}
      />,
    );
    const button = screen.getByRole('button', { name: 'Označiť všetky' });
    expect(button).toHaveClass('custom-class');
    // Button from shadcn sets variant as a class
    expect(button).toHaveClass('bg-primary');
  });

  it('stays open and shows the reason on failure', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: false, error: 'unknown' });
    renderButton();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: translations.confirm }));

    expect(await screen.findByText(errors.unknown)).toBeInTheDocument();
    expect(screen.getByText(title)).toBeInTheDocument();
  });
});
