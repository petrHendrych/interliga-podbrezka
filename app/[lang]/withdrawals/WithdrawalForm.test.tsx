import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WithdrawalCategory } from '@/lib/withdrawal-categories';
import type { WithdrawalError } from '@/lib/bank-withdrawal-actions';
import { createWithdrawal } from '@/lib/bank-withdrawal-actions';
import { WithdrawalForm } from './WithdrawalForm';

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh,
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('@/lib/bank-withdrawal-actions', () => ({
  createWithdrawal: vi.fn(),
}));

const errors: Record<WithdrawalError, string> = {
  unauthorized: 'Nemáte oprávnenie',
  invalidAmount: 'Neplatná suma',
  invalidDescription: 'Neplatný popis',
  invalidCategory: 'Neplatná kategória',
  invalidDate: 'Neplatný dátum',
  notFound: 'Nenájdené',
  unknown: 'Neznáma chyba',
};

const categories: Record<WithdrawalCategory, string> = {
  food: 'Jedlo',
  equipment: 'Vybavenie',
  travel: 'Cestovné',
  other: 'Iné',
};

const translations = {
  formTitle: 'Nový výber',
  amount: 'Suma',
  amountPlaceholder: '0.00',
  date: 'Dátum',
  datePlaceholder: 'Vyberte dátum',
  category: 'Kategória',
  categoryPlaceholder: 'Vyberte kategóriu',
  descriptionLabel: 'Popis',
  descriptionPlaceholder: 'Za čo sa platilo',
  save: 'Uložiť',
  saving: 'Ukladá sa…',
  categories,
  errors,
};

function renderForm() {
  return render(<WithdrawalForm lang="sk" today="2026-02-10" translations={translations} />);
}

function fill() {
  fireEvent.change(screen.getByLabelText(translations.amount), { target: { value: '42.50' } });
  fireEvent.change(screen.getByLabelText(translations.descriptionLabel), {
    target: { value: 'Obedy po zápase' },
  });
}

beforeEach(() => {
  vi.mocked(createWithdrawal).mockReset();
  refresh.mockClear();
});

describe('submitting', () => {
  it('sends the raw field values, leaving parsing to the server action', async () => {
    vi.mocked(createWithdrawal).mockResolvedValue({ success: true, id: 1 });
    renderForm();
    fill();

    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(createWithdrawal).toHaveBeenCalledWith({
      amount: '42.50',
      description: 'Obedy po zápase',
      category: 'food',
      date: '2026-02-10',
    }));
  });

  it('clears the form and refreshes the page on success', async () => {
    vi.mocked(createWithdrawal).mockResolvedValue({ success: true, id: 1 });
    renderForm();
    fill();

    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByLabelText(translations.amount)).toHaveValue(null);
    expect(screen.getByLabelText(translations.descriptionLabel)).toHaveValue('');
  });
});

describe('errors', () => {
  it.each<[WithdrawalError, string]>([
    ['invalidAmount', errors.invalidAmount],
    ['invalidDate', errors.invalidDate],
    ['unauthorized', errors.unauthorized],
  ])('renders the localized message for %s', async (error, message) => {
    vi.mocked(createWithdrawal).mockResolvedValue({ success: false, error });
    renderForm();
    fill();

    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('keeps what was typed so the entry can be corrected', async () => {
    vi.mocked(createWithdrawal).mockResolvedValue({ success: false, error: 'invalidAmount' });
    renderForm();
    fill();

    fireEvent.click(screen.getByRole('button', { name: translations.save }));

    await screen.findByText(errors.invalidAmount);
    expect(screen.getByLabelText(translations.amount)).toHaveValue(42.5);
    expect(refresh).not.toHaveBeenCalled();
  });
});
