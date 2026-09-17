import { describe, expect, it } from 'vitest';
import {
  fineAmount, isAllLeagues, leagueCondition, openingBalance, rosterCondition, seasonCondition,
  withdrawalTotal,
} from '@/lib/db-utils';
import { DEFAULT_SEASON_ID } from '@/lib/season-config';

interface NeonFragment {
  queryData: { strings: string[]; values: unknown[] };
}

/**
 * These helpers build SQL rather than values, so the assertion has to be on the text they
 * build. Reading the template pieces avoids needing a live connection to render it.
 */
function isFragment(value: unknown): value is NeonFragment {
  return typeof value === 'object' && value !== null && 'queryData' in value;
}

function render(fragment: unknown): string {
  const { strings, values } = (fragment as NeonFragment).queryData;
  return strings
    .map((part, i) => {
      if (i >= values.length) return part;
      const value = values[i];
      // A condition composed of other conditions nests fragments rather than strings.
      return part + (isFragment(value) ? render(value) : String(value));
    })
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

describe('openingBalance', () => {
  it.each([
    [13, undefined, '204::numeric'],
    [13, 'all', '204::numeric'],
    [13, 'interliga', '0::numeric'],
    [13, 'pohar', '0::numeric'],
    [13, 'turnaje', '0::numeric'],
    [12, 'all', '0::numeric'],
    [99, 'all', '0::numeric'],
  ])('season %i under %o carries %s into the balance', (seasonId, leagueKey, expected) => {
    expect(render(openingBalance(seasonId, leagueKey))).toBe(expected);
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

  it('leaves unstamped matches out unless asked, so the money queries keep their scope', () => {
    expect(render(leagueCondition('interliga'))).not.toContain('m.league_id IS NULL');
    expect(render(leagueCondition('pohar'))).not.toContain('m.league_id IS NULL');
  });

  it('keeps unstamped matches for the calendar, where they are the unplayed fixtures', () => {
    const options = { includeUnassigned: true };

    expect(render(leagueCondition('interliga', options))).toContain('m.league_id IS NULL');
    expect(render(leagueCondition('pohar', options))).toContain('m.league_id IS NULL');
  });

  it('never widens the tournament filter, because we stamp every tournament id ourselves', () => {
    const condition = render(leagueCondition('turnaje', { includeUnassigned: true }));

    expect(condition).not.toContain('m.league_id IS NULL');
  });

  it('still narrows nothing for the unfiltered view when unstamped rows are wanted', () => {
    expect(render(leagueCondition('all', { includeUnassigned: true }))).toBe('');
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

  it('narrows a reminder to the current season by default', () => {
    // A debt left over from a closed season must not buzz an admin or a player forever.
    expect(render(seasonCondition())).toBe(`m.season_id = ${DEFAULT_SEASON_ID}`);
  });

  it('narrows to any season asked for', () => {
    expect(render(seasonCondition(12))).toBe('m.season_id = 12');
  });
});

describe('rosterCondition', () => {
  it('keeps a plain player on the roster', () => {
    expect(render(rosterCondition())).toContain("u.role = 'player'");
  });

  it('keeps a linked account on the roster whatever its role', () => {
    // Linking a scraped player to an admin or trainer account moves the external id
    // but leaves the role alone, and the player must not vanish from the lists.
    expect(render(rosterCondition())).toContain('u.external_player_id IS NOT NULL');
    expect(render(rosterCondition())).toContain("u.role = 'player' OR");
  });

  it('still leaves unapproved accounts out', () => {
    expect(render(rosterCondition())).toContain('u.is_approved = true');
  });
});
