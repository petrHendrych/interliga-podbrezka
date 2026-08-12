import { describe, expect, it } from 'vitest';
import hu from '@/locales/hu.json';
import sk from '@/locales/sk.json';
import { INTERLIGA_LEAGUE_IDS, TOURNAMENT_LEAGUE_IDS } from '@/lib/season-config';
import { leagueLabelForId, leagueLabelForKey, leagueLabels } from '@/lib/i18n/league-labels';

const [interligaId] = INTERLIGA_LEAGUE_IDS;
const [worldCupId] = TOURNAMENT_LEAGUE_IDS;

describe('leagueLabels', () => {
  it('covers every league key', () => {
    expect(Object.keys(leagueLabels(sk)).sort())
      .toEqual(['interliga', 'ligamajstrov', 'pohar', 'svetovypohar']);
  });

  it('reads from the given dictionary, not from the config', () => {
    expect(leagueLabelForKey('interliga', hu)).toBe(hu.playerDetail.leagueInterliga);
    expect(leagueLabelForKey('interliga', sk)).toBe(sk.playerDetail.leagueInterliga);
  });
});

describe('leagueLabelForId', () => {
  it('localizes a known league id instead of showing the stored Slovak name', () => {
    expect(leagueLabelForId(interligaId, 'Interliga', hu)).toBe(hu.playerDetail.leagueInterliga);
    expect(leagueLabelForId(worldCupId, null, hu)).toBe(hu.playerDetail.leagueWorldCup);
  });

  it('falls back to the stored name for the retired Finále id 366', () => {
    expect(leagueLabelForId(366, 'Finále', sk)).toBe('Finále');
  });

  it('falls back to a dash when there is no stored name either', () => {
    expect(leagueLabelForId(366, null, sk)).toBe('-');
    expect(leagueLabelForId(null, '', sk)).toBe('-');
  });
});
