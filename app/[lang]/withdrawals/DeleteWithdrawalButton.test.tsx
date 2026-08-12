import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  fireEvent, render, screen, waitFor, within,
} from '@testing-library/react';
import type { WithdrawalError } from '@/lib/bank-withdrawal-actions';
import { deleteWithdrawal } from '@/lib/bank-withdrawal-actions';
import { DeleteWithdrawalButton } from './DeleteWithdrawalButton';

vi.mock('@/lib/bank-withdrawal-actions', () => ({
  deleteWithdrawal: vi.fn(),
}));

const errors: Record<WithdrawalError, string> = {
  unauthorized: 'Nemáte oprávnenie',
  invalidAmount: 'Neplatná suma',
  invalidDescription: 'Neplatný popis',
  invalidCategory: 'Neplatná kategória',
  invalidDate: 'Neplatný dátum',
  notFound: 'Výber sa nenašiel',
  unknown: 'Neznáma chyba',
};

const translations = { cancel: 'Zrušiť', delete: 'Vymazať', errors };

function renderButton() {
  return render(
    <DeleteWithdrawalButton
      withdrawalId={7}
      label="Vymazať"
      title="Vymazať výber?"
      description="Táto akcia sa nedá vrátiť."
      translations={translations}
    />,
  );
}

async function openDialog(): Promise<HTMLElement> {
  fireEvent.click(screen.getAllByRole('button', { name: 'Vymazať' })[0]);
  await screen.findByText('Vymazať výber?');
  return document.querySelector('[data-base-ui-portal]') as HTMLElement;
}

beforeEach(() => {
  vi.mocked(deleteWithdrawal).mockReset();
});

describe('confirm dialog', () => {
  it('asks before deleting', async () => {
    renderButton();
    await openDialog();

    expect(deleteWithdrawal).not.toHaveBeenCalled();
  });

  it('deletes and closes on success', async () => {
    vi.mocked(deleteWithdrawal).mockResolvedValue({ success: true, id: 7 });
    renderButton();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: translations.delete }));

    await waitFor(() => expect(deleteWithdrawal).toHaveBeenCalledWith(7));
    await waitFor(() => {
      expect(screen.queryByText('Vymazať výber?')).not.toBeInTheDocument();
    });
  });

  it('stays open and shows the reason on failure', async () => {
    vi.mocked(deleteWithdrawal).mockResolvedValue({ success: false, error: 'notFound' });
    renderButton();
    const dialog = await openDialog();

    fireEvent.click(within(dialog).getByRole('button', { name: translations.delete }));

    expect(await screen.findByText(errors.notFound)).toBeInTheDocument();
    expect(screen.getByText('Vymazať výber?')).toBeInTheDocument();
  });
});
