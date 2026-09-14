import { describe, expect, it } from 'vitest';
import { buildPlayerMatchRows, type MissingMatch } from '@/lib/player-matches';

interface Result {
  matchId: number;
  date: string | null;
  total: number;
}

function result(matchId: number, date: string | null, total = 600): Result {
  return { matchId, date, total };
}

function missing(matchId: number, date: string | null, isPlayed: boolean): MissingMatch {
  return {
    matchId,
    date,
    opponent: `Opponent ${matchId}`,
    isHome: true,
    leagueName: 'Interliga',
    leagueId: 368,
    isPlayed,
  };
}

describe('buildPlayerMatchRows', () => {
  it('interleaves played results and missed matches newest first', () => {
    const rows = buildPlayerMatchRows(
      [result(1, '2026-09-05T10:00:00.000Z'), result(3, '2026-09-19T10:00:00.000Z')],
      [missing(2, '2026-09-12T10:00:00.000Z', true)],
    );

    expect(rows.map((r) => [r.match.matchId, r.kind])).toEqual([
      [3, 'result'],
      [2, 'didNotPlay'],
      [1, 'result'],
    ]);
  });

  it('keeps unplayed fixtures at the bottom, oldest first, whatever their dates', () => {
    const rows = buildPlayerMatchRows(
      [result(1, '2026-09-19T10:00:00.000Z')],
      [
        missing(2, '2026-09-26T10:00:00.000Z', false),
        // Older than the result, and still belongs to the forward-looking block.
        missing(3, '2026-09-05T10:00:00.000Z', false),
      ],
    );

    expect(rows.map((r) => [r.match.matchId, r.kind])).toEqual([
      [1, 'result'],
      [3, 'notPlayedYet'],
      [2, 'notPlayedYet'],
    ]);
  });

  it('sorts an undated match last within its own block', () => {
    const rows = buildPlayerMatchRows(
      [result(1, '2026-09-05T10:00:00.000Z'), result(2, null)],
      [missing(3, null, false), missing(4, '2026-10-03T10:00:00.000Z', false)],
    );

    expect(rows.map((r) => r.match.matchId)).toEqual([1, 2, 4, 3]);
  });

  it('drops a missing match the player already has a result for', () => {
    const rows = buildPlayerMatchRows(
      [result(1, '2026-09-05T10:00:00.000Z')],
      [missing(1, '2026-09-05T10:00:00.000Z', true)],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('result');
  });

  it('classifies by whether the match has been played', () => {
    const rows = buildPlayerMatchRows<Result>(
      [],
      [missing(1, '2026-09-05T10:00:00.000Z', true), missing(2, '2026-10-03T10:00:00.000Z', false)],
    );

    expect(rows.map((r) => r.kind)).toEqual(['didNotPlay', 'notPlayedYet']);
  });

  it('returns nothing for an empty season and never mutates its inputs', () => {
    expect(buildPlayerMatchRows<Result>([], [])).toEqual([]);

    const results = [result(2, '2026-09-12T10:00:00.000Z'), result(1, '2026-09-05T10:00:00.000Z')];
    const missingMatches = [
      missing(4, '2026-10-10T10:00:00.000Z', false),
      missing(3, '2026-10-03T10:00:00.000Z', false),
    ];
    buildPlayerMatchRows(results, missingMatches);

    expect(results.map((r) => r.matchId)).toEqual([2, 1]);
    expect(missingMatches.map((m) => m.matchId)).toEqual([4, 3]);
  });
});
