import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { AdminActionError } from '@/lib/admin-actions';
import { approveUser } from '@/lib/admin-actions';
import { ApproveUserButton } from './ApproveUserButton';

vi.mock('@/lib/admin-actions', () => ({
  approveUser: vi.fn(),
}));

const errors: Record<AdminActionError, string> = {
  unauthorized: 'Nemáte oprávnenie',
  notFound: 'Používateľ sa nenašiel',
  self: 'Nemôžete zmazať sám seba',
  hasResults: 'Používateľ má výsledky',
  invalidLink: 'Neplatné prepojenie',
  unknown: 'Neznáma chyba',
};

function renderButton() {
  return render(
    <ApproveUserButton userId="u1" label="Schváliť" translations={{ errors }} />,
  );
}

beforeEach(() => {
  vi.mocked(approveUser).mockReset();
});

describe('ApproveUserButton', () => {
  it('approves the user it was given', async () => {
    vi.mocked(approveUser).mockResolvedValue({ success: true });
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Schváliť' }));

    await vi.waitFor(() => expect(approveUser).toHaveBeenCalledWith('u1'));
  });

  it.each<[AdminActionError, string]>([
    ['unauthorized', errors.unauthorized],
    ['notFound', errors.notFound],
    ['unknown', errors.unknown],
  ])('shows the localized message for %s', async (error, message) => {
    vi.mocked(approveUser).mockResolvedValue({ success: false, error });
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Schváliť' }));

    // A failure used to throw out of a bare form action, so nothing reached the admin.
    expect(await screen.findByText(message)).toBeInTheDocument();
  });

  it('shows nothing when the approval succeeds', async () => {
    vi.mocked(approveUser).mockResolvedValue({ success: true });
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Schváliť' }));

    await vi.waitFor(() => expect(approveUser).toHaveBeenCalled());
    Object.values(errors).forEach((message) => {
      expect(screen.queryByText(message)).not.toBeInTheDocument();
    });
  });

  it('clears a stale error when retried', async () => {
    vi.mocked(approveUser).mockResolvedValueOnce({ success: false, error: 'unknown' });
    renderButton();

    fireEvent.click(screen.getByRole('button', { name: 'Schváliť' }));
    await screen.findByText(errors.unknown);

    vi.mocked(approveUser).mockResolvedValueOnce({ success: true });
    fireEvent.click(screen.getByRole('button', { name: 'Schváliť' }));

    await vi.waitFor(() => expect(screen.queryByText(errors.unknown)).not.toBeInTheDocument());
  });
});
