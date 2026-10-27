import {
  datedOldestFirst,
  scoreOrNull,
  type MatchChartFormatters,
  type MatchChartPoint,
} from '@/lib/match-chart';

export interface FineChartSource {
  matchId: number;
  date: string | null;
  calculatedFine: number;
  streakFine: number;
  isPaid: boolean;
  total: number;
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
 * not a league-filtered sum, so the streak is never left out here. A substitute's row holds
 * only the pins of their own whole lanes, so like the table's "-" it carries no score.
 */
export function buildFineChartPoints<T extends FineChartSource>(
  results: T[],
  format: MatchChartFormatters<T>,
): FineChartPoint[] {
  return datedOldestFirst(results).map((r) => {
    const amount = Math.round((r.calculatedFine + r.streakFine) * 100) / 100;
    return {
      matchId: r.matchId,
      amount,
      score: r.substitutionRole === 'minor' ? null : scoreOrNull(r.total),
      paymentState: amount > 0 && !r.isPaid ? 'unpaid' : 'paid',
      isPaid: r.isPaid,
      isSubstitution: r.substitutionRole === 'minor',
      dateLabel: format.date(r.date),
      shortDateLabel: format.shortDate(r.date),
      matchLabel: format.match(r),
      leagueLabel: format.league(r),
    };
  });
}
