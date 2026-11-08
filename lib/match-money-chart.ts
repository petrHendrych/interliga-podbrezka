import {
  datedOldestFirst,
  scoreOrNull,
  type MatchChartAxisPoint,
  type MatchChartFormatters,
} from '@/lib/match-chart';
import type { DatedMatch } from '@/lib/player-matches';

/** Declared here rather than imported from `lib/match-money.ts`, which reaches the database. */
export interface MoneyChartSource extends DatedMatch {
  teamTotalScore: number | null;
  opponentTotalScore: number | null;
  fines: number;
  finesUnpaid: number;
  trainer: number;
  trainerUnpaid: number;
}

export interface MoneyChartPoint extends MatchChartAxisPoint {
  players: number;
  playersUnpaid: number;
  trainer: number;
  trainerUnpaid: number;
  teamScore: number | null;
  opponentScore: number | null;
  dateLabel: string;
  matchLabel: string;
  leagueLabel: string;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/** Every played match, oldest first, at the totals its card in the match list shows. */
export function buildMoneyChartPoints<T extends MoneyChartSource>(
  matches: T[],
  format: MatchChartFormatters<T>,
): MoneyChartPoint[] {
  return datedOldestFirst(matches).map((m) => ({
    matchId: m.matchId,
    players: cents(m.fines),
    playersUnpaid: cents(m.finesUnpaid),
    trainer: cents(m.trainer),
    trainerUnpaid: cents(m.trainerUnpaid),
    teamScore: scoreOrNull(m.teamTotalScore),
    opponentScore: scoreOrNull(m.opponentTotalScore),
    dateLabel: format.date(m.date),
    shortDateLabel: format.shortDate(m.date),
    matchLabel: format.match(m),
    leagueLabel: format.league(m),
  }));
}
