import {
  datedOldestFirst,
  type MatchChartFormatters,
  type MatchChartPoint,
} from '@/lib/match-chart';

export interface FineChartSource {
  matchId: number;
  date: string | null;
  calculatedFine: number;
  streakFine: number;
  isPaid: boolean;
  substitutionRole?: 'major' | 'minor' | null;
}

export interface FineChartPoint extends MatchChartPoint {
  isPaid: boolean;
  isSubstitution: boolean;
  dateLabel: string;
  matchLabel: string;
  leagueLabel: string;
}

/**
 * One point per match the player has a row for, oldest first. The amount is the row's whole
 * debt, `calculated_fine + streak_fine`, the same as the table's fine cell — a single row is
 * not a league-filtered sum, so the streak is never left out here.
 */
export function buildFineChartPoints<T extends FineChartSource>(
  results: T[],
  format: MatchChartFormatters<T>,
): FineChartPoint[] {
  return datedOldestFirst(results).map((r) => ({
    matchId: r.matchId,
    amount: Math.round((r.calculatedFine + r.streakFine) * 100) / 100,
    isPaid: r.isPaid,
    isSubstitution: r.substitutionRole === 'minor',
    dateLabel: format.date(r.date),
    shortDateLabel: format.shortDate(r.date),
    matchLabel: format.match(r),
    leagueLabel: format.league(r),
  }));
}
