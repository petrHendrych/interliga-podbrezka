export interface DatedMatch {
  matchId: number;
  date: string | null;
}

/** A season match the player has no result row for — either already played, or still ahead. */
export interface MissingMatch extends DatedMatch {
  opponent: string | null;
  isHome: boolean | null;
  leagueName: string | null;
  leagueId: number | null;
  isPlayed: boolean;
}

export type PlayerMatchRow<TResult extends DatedMatch> =
  | { kind: 'result'; match: TResult }
  | { kind: 'didNotPlay'; match: MissingMatch }
  | { kind: 'notPlayedYet'; match: MissingMatch };

function timeOf(date: string | null): number {
  return date ? Date.parse(date) : NaN;
}

/** Undated rows sort last in either direction, so a half-scraped row never jumps the list. */
function byDate(direction: 'asc' | 'desc') {
  return (a: DatedMatch, b: DatedMatch): number => {
    const aTime = timeOf(a.date);
    const bTime = timeOf(b.date);
    if (Number.isNaN(aTime)) return Number.isNaN(bTime) ? 0 : 1;
    if (Number.isNaN(bTime)) return -1;
    return direction === 'asc' ? aTime - bTime : bTime - aTime;
  };
}

/**
 * Everything behind us newest first — the player's own results and the matches they sat out
 * interleaved — then the fixtures still ahead, oldest first.
 */
export function buildPlayerMatchRows<TResult extends DatedMatch>(
  results: TResult[],
  missing: MissingMatch[],
): PlayerMatchRow<TResult>[] {
  const resultIds = new Set(results.map((r) => r.matchId));
  const unseen = missing.filter((m) => !resultIds.has(m.matchId));

  const past: PlayerMatchRow<TResult>[] = [
    ...results.map((match) => ({ kind: 'result' as const, match })),
    ...unseen
      .filter((m) => m.isPlayed)
      .map((match) => ({ kind: 'didNotPlay' as const, match })),
  ].sort((a, b) => byDate('desc')(a.match, b.match));

  const upcoming: PlayerMatchRow<TResult>[] = unseen
    .filter((m) => !m.isPlayed)
    .sort(byDate('asc'))
    .map((match) => ({ kind: 'notPlayedYet' as const, match }));

  return [...past, ...upcoming];
}
