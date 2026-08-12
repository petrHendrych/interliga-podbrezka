import { describe, expect, it } from 'vitest';
import {
  fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import { MatchFineTooltip, type MatchFineTooltipProps } from '@/components/MatchFineTooltip';

const labels = {
  paidStatus: sk.playerDetail.paidStatus,
  unpaidStatus: sk.playerDetail.unpaidStatus,
  noFine: sk.playerDetail.noFine,
  reasons: sk.playerDetail.fineReasons,
};

function renderTooltip(overrides: Partial<MatchFineTooltipProps> = {}) {
  return render(
    <MatchFineTooltip
      calculatedFine={0}
      streakFine={0}
      isPaid={false}
      faults={0}
      isWorstPlayer={false}
      isUnder600={false}
      isTeamUnder3750={false}
      fullFaultsCount={0}
      secondToLastFaultsCount={0}
      specialFaultsCount={0}
      labels={labels}
      {...overrides}
    />,
  );
}

/**
 * The popup is portalled and carries no role, so it is read off the portal container.
 * `fireEvent` rather than `user-event`: base-ui's own pointer handling closes the tooltip
 * again at the end of a full pointer sequence, which is why the trigger toggles on click.
 */
async function openTooltip(): Promise<HTMLElement> {
  fireEvent.click(screen.getByText(/€/));
  await waitFor(() => {
    expect(document.querySelector('[data-base-ui-portal]')).not.toBeNull();
  });
  return document.querySelector('[data-base-ui-portal]') as HTMLElement;
}

describe('the amount shown', () => {
  it('is the sum of the match fine and the success gathering', () => {
    renderTooltip({ calculatedFine: 12, streakFine: 10 });
    expect(screen.getByText(/22/)).toBeInTheDocument();
  });

  it('renders a plain zero with no tooltip when nothing is owed', () => {
    renderTooltip();

    expect(screen.getByText('0 €')).toBeInTheDocument();
    fireEvent.click(screen.getByText('0 €'));
    expect(document.querySelector('[data-base-ui-portal]')).toBeNull();
  });

  it('opens on click, because touch devices have no hover', async () => {
    renderTooltip({ calculatedFine: 5, faults: 2 });
    expect(await openTooltip()).toBeInTheDocument();
  });
});

describe('paid state', () => {
  it('labels an unpaid fine', async () => {
    renderTooltip({ calculatedFine: 5, faults: 2 });
    const tooltip = await openTooltip();

    expect(tooltip).toHaveTextContent(sk.playerDetail.unpaidStatus);
  });

  it('labels a paid fine', async () => {
    renderTooltip({ calculatedFine: 5, faults: 2, isPaid: true });
    const tooltip = await openTooltip();

    expect(tooltip).toHaveTextContent(sk.playerDetail.paidStatus);
  });
});

describe('the breakdown', () => {
  it('lists only the reasons that apply', async () => {
    renderTooltip({
      calculatedFine: 12,
      faults: 2,
      isWorstPlayer: true,
      isUnder600: true,
      isTeamUnder3750: true,
    });
    const tooltip = await openTooltip();

    expect(tooltip).toHaveTextContent(sk.playerDetail.fineReasons.worstPlayer);
    expect(tooltip).toHaveTextContent(sk.playerDetail.fineReasons.under600);
    expect(tooltip).toHaveTextContent(sk.playerDetail.fineReasons.teamUnder3750);
    expect(tooltip).not.toHaveTextContent(sk.playerDetail.noFine);
  });

  it('omits every flag that is not set', async () => {
    renderTooltip({ calculatedFine: 3, faults: 2 });
    const tooltip = await openTooltip();

    expect(tooltip).not.toHaveTextContent(sk.playerDetail.fineReasons.worstPlayer);
    expect(tooltip).not.toHaveTextContent(sk.playerDetail.fineReasons.under600);
    expect(tooltip).not.toHaveTextContent(sk.playerDetail.fineReasons.teamUnder3750);
  });

  it('names the specific special fault instead of the generic line', async () => {
    renderTooltip({ calculatedFine: 5, secondToLastFaultsCount: 1, specialFaultsCount: 1 });
    const tooltip = await openTooltip();

    expect(tooltip).toHaveTextContent(/predposledn|2\./i);
    expect(tooltip.textContent).not.toContain(
      sk.playerDetail.fineReasons.specialFaults.replace('{count}', '1'),
    );
  });

  it('drops the generic special-fault line when the fault into full is named', async () => {
    renderTooltip({ calculatedFine: 5, fullFaultsCount: 1, specialFaultsCount: 1 });
    const tooltip = await openTooltip();

    expect(tooltip.textContent).not.toContain(
      sk.playerDetail.fineReasons.specialFaults.replace('{count}', '1'),
    );
  });

  it('shows the success gathering only from the fifth faultless game', async () => {
    renderTooltip({ calculatedFine: 1, streakFine: 10, faultlessStreak: 5 });
    expect(await openTooltip()).toHaveTextContent(
      sk.playerDetail.fineReasons.streak.replace('{count}', '5'),
    );
  });

  it('hides the success gathering at four faultless games', async () => {
    renderTooltip({ calculatedFine: 1, isWorstPlayer: true, faultlessStreak: 4 });
    const tooltip = await openTooltip();

    expect(tooltip.textContent).not.toContain(
      sk.playerDetail.fineReasons.streak.replace('{count}', '4'),
    );
  });

  it('explains a fine no flag accounts for', async () => {
    renderTooltip({ calculatedFine: 7 });
    expect(await openTooltip()).toHaveTextContent(sk.playerDetail.noFine);
  });
});
