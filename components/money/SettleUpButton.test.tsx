import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import { settlePlayerMoney, settleTrainerMoney } from '@/lib/settle-up-actions';
import { summarizePlayerSettlement, type PlayerSettlement } from '@/lib/settle-up-summary';
import { SettleUpButton, type SettleUpTarget } from './SettleUpButton';

vi.mock('@/lib/settle-up-actions', () => ({
  settlePlayerMoney: vi.fn(),
  settleTrainerMoney: vi.fn(),
}));

const labels = { ...sk.settleUp, matches: sk.home.matchesPlayed };
const TRAINER_ID = '0b6f9c62-3c1e-4b8e-9a51-2f4d7e8a1c33';

function playerSettlement(overrides: Partial<PlayerSettlement> = {}): PlayerSettlement {
  return {
    ...summarizePlayerSettlement([
      {
        matchId: 1, opponent: 'Trenčín', fine: 6, bonus: 0, isPaid: false, isBonusPaid: false, needsFaultSplit: false,
      },
      {
        matchId: 2, opponent: 'Zvolen', fine: 3, bonus: 40, isPaid: false, isBonusPaid: false, needsFaultSplit: false,
      },
      {
        matchId: 3, opponent: 'Prievidza', fine: 3, bonus: 0, isPaid: false, isBonusPaid: false, needsFaultSplit: false,
      },
    ]),
    ...overrides,
  };
}

function renderButton(target: SettleUpTarget) {
  return render(<SettleUpButton target={target} seasonId={13} lang="sk" labels={labels} />);
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Zaplatiť' }));
  await screen.findByText(sk.settleUp.title);
  return document.querySelector('[data-base-ui-portal]') as HTMLElement;
}

beforeEach(() => {
  vi.mocked(settlePlayerMoney).mockReset();
  vi.mocked(settleTrainerMoney).mockReset();
});

describe('SettleUpButton for a player', () => {
  it('shows the fines, the bonuses and what the player gets back', async () => {
    renderButton({ kind: 'player', externalPlayerId: 123, settlement: playerSettlement() });
    const dialog = await openDialog();

    expect(within(dialog).getByText('Pokuty: 12 € (3 zápasy)')).toBeInTheDocument();
    expect(within(dialog).getByText('Bonusy: 40 € (1 zápas)')).toBeInTheDocument();
    expect(within(dialog).getByText('Hráč dostane 28 €')).toBeInTheDocument();
    expect(settlePlayerMoney).not.toHaveBeenCalled();
  });

  it.each([
    [{ fines: 50, bonuses: 0, net: 50 }, 'Hráč zaplatí 50 €'],
    [{ fines: 40, bonuses: 40, net: 0 }, sk.settleUp.netEven],
  ])('words the net result of %o', async (overrides, expected) => {
    renderButton({ kind: 'player', externalPlayerId: 123, settlement: playerSettlement(overrides) });
    const dialog = await openDialog();

    expect(within(dialog).getByText(expected)).toBeInTheDocument();
  });

  it('leaves out an empty bonus line', async () => {
    renderButton({
      kind: 'player',
      externalPlayerId: 123,
      settlement: playerSettlement({ bonuses: 0, bonusMatchIds: [], net: 12 }),
    });
    const dialog = await openDialog();

    expect(within(dialog).queryByText(/^Bonusy/)).not.toBeInTheDocument();
  });

  it('settles exactly the rows it showed', async () => {
    vi.mocked(settlePlayerMoney).mockResolvedValueOnce({ success: true });
    renderButton({ kind: 'player', externalPlayerId: 123, settlement: playerSettlement() });
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Potvrdiť' }));

    await waitFor(() => expect(settlePlayerMoney).toHaveBeenCalledExactlyOnceWith(
      123,
      13,
      { fineMatchIds: [1, 2, 3], bonusMatchIds: [2] },
    ));
  });

  it('blocks the confirm and links the match while a substitution split is pending', async () => {
    renderButton({
      kind: 'player',
      externalPlayerId: 123,
      settlement: playerSettlement({ pendingSplit: [{ matchId: 44568, opponent: 'Trenčín' }] }),
    });
    const dialog = await openDialog();

    expect(within(dialog).getByText(/Zápas s Trenčín čaká na rozdelenie chýb/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: sk.settleUp.openMatch }))
      .toHaveAttribute('href', '/sk/money/44568');
    expect(within(dialog).getByRole('button', { name: 'Potvrdiť' })).toBeDisabled();
  });

  it('stays open with the mapped error when the settlement is refused', async () => {
    vi.mocked(settlePlayerMoney).mockResolvedValueOnce({ success: false, error: 'nothingToSettle' });
    renderButton({ kind: 'player', externalPlayerId: 123, settlement: playerSettlement() });
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Potvrdiť' }));

    expect(await within(dialog).findByText(sk.settleUp.errors.nothingToSettle)).toBeInTheDocument();
    expect(screen.getByText(sk.settleUp.title)).toBeInTheDocument();
  });
});

describe('SettleUpButton for a trainer', () => {
  it('shows the payments with their match count and no net line', async () => {
    renderButton({
      kind: 'trainer',
      trainerId: TRAINER_ID,
      settlement: { paymentIds: [7, 8, 9], matchCount: 5, total: 45 },
    });
    const dialog = await openDialog();

    expect(within(dialog).getByText('Platby: 45 € (5 zápasov)')).toBeInTheDocument();
    expect(within(dialog).getByText(sk.settleUp.trainerDescription)).toBeInTheDocument();
    expect(within(dialog).queryByText(/^Hráč/)).not.toBeInTheDocument();
  });

  it('settles the shown payment ids', async () => {
    vi.mocked(settleTrainerMoney).mockResolvedValueOnce({ success: true });
    renderButton({
      kind: 'trainer',
      trainerId: TRAINER_ID,
      settlement: { paymentIds: [7, 8], matchCount: 2, total: 30 },
    });
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Potvrdiť' }));

    await waitFor(() => expect(settleTrainerMoney)
      .toHaveBeenCalledExactlyOnceWith(TRAINER_ID, 13, [7, 8]));
  });
});
