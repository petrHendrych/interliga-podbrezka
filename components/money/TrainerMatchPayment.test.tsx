import { describe, expect, it } from 'vitest';
import {
  fireEvent, render, screen, waitFor,
} from '@testing-library/react';
import sk from '@/locales/sk.json';
import { groupTrainerMatches, type TrainerPaymentRow } from '@/lib/trainer-matches';
import {
  TrainerMatchAmount,
  TrainerMatchStatusBadge,
} from '@/components/money/TrainerMatchPayment';

const labels = {
  paidStatus: sk.playerDetail.paidStatus,
  unpaidStatus: sk.playerDetail.unpaidStatus,
  partialStatus: sk.trainerDetail.partialStatus,
  conditions: sk.money.conditions,
};

type Payment = Pick<TrainerPaymentRow, 'conditionType' | 'amount' | 'isPaid'>;

function matchRow(payments: Payment[]) {
  const base = {
    matchId: 1,
    date: '2026-09-19T10:00:00.000Z',
    opponent: 'Opponent',
    isHome: true,
    leagueName: 'Interliga',
    leagueId: 368,
    teamTotalScore: 3950,
    isPlayed: true,
  };
  const rows: TrainerPaymentRow[] = payments.length > 0
    ? payments.map((p) => ({ ...base, ...p }))
    : [{
      ...base, conditionType: null, amount: 0, isPaid: false,
    }];
  return groupTrainerMatches(rows)[0];
}

/** Portalled with no role, so it is read off the portal; `fireEvent` keeps it open in jsdom. */
async function openTooltip(trigger: string): Promise<HTMLElement> {
  fireEvent.click(screen.getByText(trigger));
  await waitFor(() => {
    expect(document.querySelector('[data-base-ui-portal]')).not.toBeNull();
  });
  return document.querySelector('[data-base-ui-portal]') as HTMLElement;
}

describe('TrainerMatchAmount', () => {
  it('renders a plain zero with no tooltip when the match carries no payment', () => {
    render(<TrainerMatchAmount row={matchRow([])} labels={labels} />);

    fireEvent.click(screen.getByText('0 €'));
    expect(document.querySelector('[data-base-ui-portal]')).toBeNull();
  });

  it('shows the match total and breaks it down per condition with its paid state', async () => {
    render(
      <TrainerMatchAmount
        row={matchRow([
          { conditionType: 'score_bonus', amount: 15, isPaid: true },
          { conditionType: 'zero_faults', amount: 10, isPaid: false },
          { conditionType: 'elite_player', amount: 20, isPaid: false },
        ])}
        labels={labels}
      />,
    );

    const popup = await openTooltip('45 €');
    const items = [...popup.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual([
      `${sk.money.conditions.score_bonus}15 € (${sk.playerDetail.paidStatus})`,
      `${sk.money.conditions.zero_faults}10 € (${sk.playerDetail.unpaidStatus})`,
      `${sk.money.conditions.elite_player}20 € (${sk.playerDetail.unpaidStatus})`,
    ]);
  });

  it('falls back to the raw condition name for an unknown one', async () => {
    render(
      <TrainerMatchAmount
        row={matchRow([{ conditionType: 'mystery_rule', amount: 5, isPaid: false }])}
        labels={labels}
      />,
    );

    const popup = await openTooltip('5 €');
    expect(popup).toHaveTextContent('mystery_rule');
  });
});

describe('TrainerMatchStatusBadge', () => {
  it('shows a dash when nothing was owed', () => {
    render(<TrainerMatchStatusBadge row={matchRow([])} labels={labels} />);
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('shows paid once every condition is paid', () => {
    render(
      <TrainerMatchStatusBadge
        row={matchRow([{ conditionType: 'score_bonus', amount: 15, isPaid: true }])}
        labels={labels}
      />,
    );
    expect(screen.getByText(sk.playerDetail.paidStatus)).toBeInTheDocument();
  });

  it('shows unpaid while nothing is paid', () => {
    render(
      <TrainerMatchStatusBadge
        row={matchRow([{ conditionType: 'score_bonus', amount: 15, isPaid: false }])}
        labels={labels}
      />,
    );
    expect(screen.getByText(sk.playerDetail.unpaidStatus)).toBeInTheDocument();
  });

  it('shows what is still owed on a partly paid match', () => {
    render(
      <TrainerMatchStatusBadge
        row={matchRow([
          { conditionType: 'score_bonus', amount: 15, isPaid: true },
          { conditionType: 'zero_faults', amount: 10, isPaid: false },
        ])}
        labels={labels}
      />,
    );
    expect(screen.getByText('Zostáva 10 €')).toBeInTheDocument();
  });
});
