import { describe, expect, it } from 'vitest';
import { getAllTeamIds } from '@/lib/season-config';
import {
  CLUB_ID,
  computeAverage,
  isOurTeam,
  normalizeMatchList,
  toSnapshotRows,
} from '@/lib/sync-transform';

describe('computeAverage', () => {
  it.each([
    [0, 0],
    [600, 150],
    [601, 150.3],
    [3750, 937.5],
  ])('a total of %i averages %o over four lanes', (total, expected) => {
    expect(computeAverage(total)).toBe(expected);
  });
});

describe('isOurTeam', () => {
  const [teamId] = getAllTeamIds();

  it('matches on our club id', () => {
    expect(isOurTeam({ clubId: CLUB_ID })).toBe(true);
  });

  it('matches on a configured team id', () => {
    expect(isOurTeam({ teamId })).toBe(true);
  });

  it('matches on the club name as a last resort', () => {
    expect(isOurTeam({ name: 'ŠKK Podbrezová' })).toBe(true);
  });

  it('rejects another club', () => {
    expect(isOurTeam({ clubId: 123, teamId: 999, name: 'Rakovice' })).toBe(false);
    expect(isOurTeam({})).toBe(false);
  });
});

describe('normalizeMatchList', () => {
  it('accepts a bare array', () => {
    expect(normalizeMatchList([1, 2])).toEqual([1, 2]);
  });

  it('unwraps a list envelope', () => {
    expect(normalizeMatchList({ list: [1] })).toEqual([1]);
  });

  it('returns an empty list when the envelope is empty', () => {
    expect(normalizeMatchList<number>({})).toEqual([]);
  });
});

describe('toSnapshotRows', () => {
  it('turns the scrape payload map into insertable rows', () => {
    expect(toSnapshotRows(new Map([[1, { a: 1 }], [2, { b: 2 }]]))).toEqual([
      { externalId: 1, data: { a: 1 } },
      { externalId: 2, data: { b: 2 } },
    ]);
  });
});
