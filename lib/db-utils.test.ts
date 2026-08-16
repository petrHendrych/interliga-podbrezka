import { describe, expect, it } from 'vitest';
import {
  fineAmount, isAllLeagues, leagueCondition, withdrawalTotal,
} from '@/lib/db-utils';

interface NeonFragment {
  queryData: { strings: string[]; values: unknown[] };
}

/**
 * These helpers build SQL rather than values, so the assertion has to be on the text they
 * build. Reading the template pieces avoids needing a live connection to render it.
 */
function render(fragment: unknown): string {
  const { strings, values } = (fragment as NeonFragment).queryData;
  return strings
    .map((part, i) => part + (i < values.length ? String(values[i]) : ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('isAllLeagues', () => {
  it.each([[undefined, true], ['all', true], ['interliga', false], ['pohar', false]])(
    '%o means the unfiltered view: %s',
    (leagueKey, expected) => {
      expect(isAllLeagues(leagueKey)).toBe(expected);
    },
  );
});

describe('fineAmount', () => {
  it('adds the success gathering only when no league is selected', () => {
    expect(render(fineAmount())).toContain('streak_fine');
    expect(render(fineAmount('all'))).toContain('streak_fine');
  });

  it('leaves the success gathering out of a league-filtered sum', () => {
    // It is earned across competitions, so the league hosting the fifth game is arbitrary.
    expect(render(fineAmount('interliga'))).not.toContain('streak_fine');
    expect(render(fineAmount('turnaje'))).not.toContain('streak_fine');
  });

  it('always counts the match fine', () => {
    expect(render(fineAmount('interliga'))).toContain('calculated_fine');
  });
});

describe('withdrawalTotal', () => {
  it('sums withdrawals for the season when no league is selected', () => {
    expect(render(withdrawalTotal(12))).toContain('bank_withdrawals');
  });

  it('contributes nothing to a league-filtered balance, having no league of its own', () => {
    expect(render(withdrawalTotal(12, 'pohar'))).toBe('0::numeric');
  });
});

describe('leagueCondition', () => {
  it('matches Interliga by id and by name', () => {
    const condition = render(leagueCondition('interliga'));

    expect(condition).toContain('m.league_id IN');
    expect(condition).toContain("ILIKE '%interliga%'");
  });

  it('keeps the retired Finále spellings in the cup filter', () => {
    const condition = render(leagueCondition('pohar'));

    expect(condition).toContain("ILIKE '%finále%'");
    expect(condition).toContain("ILIKE '%pohar%'");
  });

  it('matches tournaments by id only, because we stamp those ids ourselves', () => {
    const condition = render(leagueCondition('turnaje'));

    expect(condition).toContain('m.league_id IN');
    expect(condition).not.toContain('ILIKE');
  });

  it('narrows nothing for the unfiltered view', () => {
    expect(render(leagueCondition())).toBe('');
    expect(render(leagueCondition('all'))).toBe('');
  });
});

describe('the reminder queries', () => {
  it('counts a debtor total the way the "all" filter does, success gathering included', () => {
    // `getUnpaidDebtorsByUser()` calls `fineAmount()` with no league on purpose: the reminder
    // asks what you owe the bank, not what you owe under one filter.
    const amount = render(fineAmount());

    expect(amount).toContain('calculated_fine');
    expect(amount).toContain('streak_fine');
  });

  it('would drop the success gathering if a league were ever passed in', () => {
    // Guards the mistake of "tidying" the call by threading a league key through it.
    expect(render(fineAmount('interliga'))).not.toContain('streak_fine');
  });
});
