import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import sk from '@/locales/sk.json';
import { interpolate } from '@/lib/i18n/config';
import { applyMatchMoney } from '@/lib/match-money-actions';
import type { SheetSubstitution } from '@/lib/substitutions';
import { SubstitutionCard } from './SubstitutionCard';

vi.mock('@/lib/match-money-actions', () => ({
  applyMatchMoney: vi.fn(),
}));

const t = sk.money;

const MID_LANE: SheetSubstitution = {
  id: 8585,
  starter_user_id: 'u-vadovic',
  starter_name: 'Bystrík Vadovič',
  substitute_user_id: 'u-dubrava',
  substitute_name: 'Šimon Dubrava',
  throw_number: 103,
  lane: 4,
  lane_faults: 5,
  mid_lane: true,
  substitute_lane_faults: null,
  needs_fault_split: true,
};

function renderCard(substitution: SheetSubstitution, canEdit = true) {
  return render(
    <SubstitutionCard
      matchId={44990}
      substitution={substitution}
      labels={t}
      errors={t.errors}
      canEdit={canEdit}
    />,
  );
}

const splitLabel = interpolate(t.substitutionSplitLabel, {
  substitute: 'Šimon Dubrava', lane: 4, faults: 5,
});

beforeEach(() => {
  vi.mocked(applyMatchMoney).mockReset();
});

describe('SubstitutionCard', () => {
  it('names who replaced whom from which throw, and warns the split is still open', () => {
    renderCard(MID_LANE);

    expect(screen.getByText('Bystrík Vadovič → Šimon Dubrava od 103. hodu')).toBeInTheDocument();
    expect(screen.getByText(interpolate(t.substitutionNeedsSplit, { starter: 'Bystrík Vadovič' })))
      .toBeInTheDocument();
  });

  it('sends the substitute\'s share of the lane\'s faults', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: true });
    renderCard(MID_LANE);

    fireEvent.change(screen.getByLabelText(splitLabel), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t.save }));

    await vi.waitFor(() => expect(applyMatchMoney).toHaveBeenCalledWith(44990, {
      substitutions: [{ id: 8585, substituteLaneFaults: 2 }],
    }));
  });

  it('shows the mapped error and keeps the input when the split is refused', async () => {
    vi.mocked(applyMatchMoney).mockResolvedValue({ success: false, error: 'paidLocked' });
    renderCard(MID_LANE);

    fireEvent.change(screen.getByLabelText(splitLabel), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: t.save }));

    expect(await screen.findByText(t.errors.paidLocked)).toBeInTheDocument();
    expect(screen.getByLabelText(splitLabel)).toHaveValue(1);
  });

  it('shows a saved split read-only to a member', () => {
    renderCard({ ...MID_LANE, substitute_lane_faults: 2, needs_fault_split: false }, false);

    expect(screen.getByText('Šimon Dubrava: 2 z 5 chýb na dráhe')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers no input for a switch at the start of a lane', () => {
    renderCard({
      ...MID_LANE, throw_number: 91, mid_lane: false, lane_faults: 0, needs_fault_split: false,
    });

    expect(screen.getByText(t.substitutionExact)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
