import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import sk from '@/locales/sk.json';
import { TrainerPaymentSummary } from '@/components/money/TrainerPaymentSummary';

const labels = {
  totalDue: sk.trainerDetail.totalDue,
  paid: sk.trainerDetail.paid,
  unpaid: sk.trainerDetail.unpaid,
};

describe('TrainerPaymentSummary', () => {
  it('shows the total, the paid part and what is still owed under their labels', () => {
    render(<TrainerPaymentSummary summary={{ total: 45, paid: 15, unpaid: 30 }} labels={labels} />);

    expect(screen.getByText(labels.totalDue).nextSibling).toHaveTextContent('45 €');
    expect(screen.getByText(labels.paid).nextSibling).toHaveTextContent('15 €');
    expect(screen.getByText(labels.unpaid).nextSibling).toHaveTextContent('30 €');
  });

  it('paints only a remaining debt red', () => {
    render(<TrainerPaymentSummary summary={{ total: 25, paid: 25, unpaid: 0 }} labels={labels} />);

    expect(screen.getByText(labels.unpaid).nextSibling).toHaveTextContent('0 €');
    expect(screen.getByText(labels.unpaid).nextSibling).not.toHaveClass('text-red-600');
    expect(screen.getByText(labels.paid).nextSibling).toHaveClass('text-emerald-600');
  });
});
