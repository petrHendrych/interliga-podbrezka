import {
  datedOldestFirst,
  scoreOrNull,
  type MatchChartFormatters,
  type MatchChartPoint,
  type MatchPaymentState,
} from '@/lib/match-chart';
import {
  isPastTrainerMatch,
  type TrainerMatchPayment,
  type TrainerMatchRow,
  type TrainerMatchStatus,
} from '@/lib/trainer-matches';

const PAYMENT_STATE: Record<TrainerMatchStatus, MatchPaymentState> = {
  none: 'paid',
  paid: 'paid',
  unpaid: 'unpaid',
  partial: 'partial',
};

export interface TrainerChartPoint extends MatchChartPoint {
  status: TrainerMatchStatus;
  unpaid: number;
  payments: TrainerMatchPayment[];
  dateLabel: string;
  matchLabel: string;
  leagueLabel: string;
}

/** Every match behind us, oldest first, at the total the table's payment cell shows. */
export function buildTrainerChartPoints(
  matches: TrainerMatchRow[],
  format: MatchChartFormatters<TrainerMatchRow>,
): TrainerChartPoint[] {
  return datedOldestFirst(matches.filter(isPastTrainerMatch)).map((m) => ({
    matchId: m.matchId,
    amount: m.total,
    score: scoreOrNull(m.teamTotalScore),
    paymentState: PAYMENT_STATE[m.status],
    status: m.status,
    unpaid: m.unpaid,
    payments: m.payments,
    dateLabel: format.date(m.date),
    shortDateLabel: format.shortDate(m.date),
    matchLabel: format.match(m),
    leagueLabel: format.league(m),
  }));
}
