import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettlementChip } from './SettlementChip';

function renderChip(unpaid: number, total: number) {
  return render(<SettlementChip label="Pokuty" unpaid={unpaid} total={total} />);
}

describe('SettlementChip', () => {
  it('shows only the match total in red while nobody has paid', () => {
    renderChip(10, 10);

    expect(screen.getByText('10 €')).toHaveClass('text-red-600');
    expect(screen.queryByText('/', { exact: false })).not.toBeInTheDocument();
  });

  it('splits a partly paid total into the missing part in red and the paid part in green', () => {
    renderChip(4, 10);

    expect(screen.getByText('4 €')).toHaveClass('text-red-600');
    expect(screen.getByText('6 €')).toHaveClass('text-emerald-600');
    expect(screen.queryByText('10 €')).not.toBeInTheDocument();
  });

  it('shows only the paid total in green once everything is paid', () => {
    renderChip(0, 10);

    expect(screen.getByText('10 €')).toHaveClass('text-emerald-600');
    expect(screen.queryByText('0 €')).not.toBeInTheDocument();
  });

  it('shows a muted zero when the match raised nothing in this category', () => {
    renderChip(0, 0);

    const amount = screen.getByText('0 €');
    expect(amount).toHaveClass('text-muted-foreground');
    expect(amount).not.toHaveClass('text-emerald-600');
  });

  it('keeps half-euro parts without float drift', () => {
    renderChip(2.5, 12.6);

    expect(screen.getByText('2.5 €')).toHaveClass('text-red-600');
    expect(screen.getByText('10.1 €')).toHaveClass('text-emerald-600');
  });

  it('renders the category label', () => {
    renderChip(0, 0);

    expect(screen.getByText('Pokuty')).toBeInTheDocument();
  });
});
