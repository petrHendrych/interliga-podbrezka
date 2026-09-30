import type { TrainerConditionType } from '@/lib/money-rules';
import { buildPlayerMatchRows, type PlayerMatchRow } from '@/lib/player-matches';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id would make Postgres throw on the `::uuid` cast instead of finding nobody. */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** One season match joined with at most one of the trainer's payment rows. */
export interface TrainerPaymentRow {
  matchId: number;
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  leagueName: string | null;
  leagueId: number | null;
  teamTotalScore: number | null;
  isPlayed: boolean;
  /** `null` when the match carries no payment for this trainer. */
  conditionType: string | null;
  amount: number;
  isPaid: boolean;
}

export interface TrainerMatchPayment {
  conditionType: string;
  amount: number;
  isPaid: boolean;
}

export type TrainerMatchStatus = 'none' | 'paid' | 'unpaid' | 'partial';

export interface TrainerMatchRow {
  matchId: number;
  date: string | null;
  opponent: string | null;
  isHome: boolean | null;
  leagueName: string | null;
  leagueId: number | null;
  teamTotalScore: number | null;
  isPlayed: boolean;
  payments: TrainerMatchPayment[];
  total: number;
  paid: number;
  unpaid: number;
  status: TrainerMatchStatus;
}

export interface TrainerPaymentSummary {
  total: number;
  paid: number;
  unpaid: number;
}

const CONDITION_ORDER: TrainerConditionType[] = [
  'score_bonus',
  'zero_faults',
  'elite_player',
  'clean_sweep',
];

function conditionRank(conditionType: string): number {
  const index = CONDITION_ORDER.indexOf(conditionType as TrainerConditionType);
  return index === -1 ? CONDITION_ORDER.length : index;
}

export function trainerMatchStatus(paid: number, unpaid: number): TrainerMatchStatus {
  if (paid + unpaid <= 0) return 'none';
  if (unpaid <= 0) return 'paid';
  if (paid <= 0) return 'unpaid';
  return 'partial';
}

/** One entry per match with its payments summed; order is left to `buildTrainerMatchRows`. */
export function groupTrainerMatches(rows: TrainerPaymentRow[]): TrainerMatchRow[] {
  const byMatch = new Map<number, TrainerMatchRow>();

  rows.forEach((row) => {
    let match = byMatch.get(row.matchId);
    if (!match) {
      match = {
        matchId: row.matchId,
        date: row.date,
        opponent: row.opponent,
        isHome: row.isHome,
        leagueName: row.leagueName,
        leagueId: row.leagueId,
        teamTotalScore: row.teamTotalScore,
        isPlayed: row.isPlayed,
        payments: [],
        total: 0,
        paid: 0,
        unpaid: 0,
        status: 'none',
      };
      byMatch.set(row.matchId, match);
    }
    if (row.conditionType !== null) {
      match.payments.push({
        conditionType: row.conditionType,
        amount: row.amount,
        isPaid: row.isPaid,
      });
    }
  });

  return [...byMatch.values()].map((match) => {
    const payments = [...match.payments]
      .sort((a, b) => conditionRank(a.conditionType) - conditionRank(b.conditionType));
    const paid = payments.reduce((sum, p) => sum + (p.isPaid ? p.amount : 0), 0);
    const unpaid = payments.reduce((sum, p) => sum + (p.isPaid ? 0 : p.amount), 0);
    return {
      ...match,
      payments,
      total: paid + unpaid,
      paid,
      unpaid,
      status: trainerMatchStatus(paid, unpaid),
    };
  });
}

/**
 * Same order as the player page: everything behind us newest first, then the fixtures still
 * ahead oldest first. A match holding a payment counts as behind us even without a score,
 * so money that is owed or paid never ends up among the upcoming fixtures.
 */
export function buildTrainerMatchRows(
  matches: TrainerMatchRow[],
): PlayerMatchRow<TrainerMatchRow>[] {
  const isPast = (match: TrainerMatchRow) => match.isPlayed || match.payments.length > 0;
  return buildPlayerMatchRows(
    matches.filter(isPast),
    matches.filter((match) => !isPast(match)),
  );
}

export function summarizeTrainerMatches(rows: TrainerMatchRow[]): TrainerPaymentSummary {
  return rows.reduce<TrainerPaymentSummary>(
    (sum, row) => ({
      total: sum.total + row.total,
      paid: sum.paid + row.paid,
      unpaid: sum.unpaid + row.unpaid,
    }),
    { total: 0, paid: 0, unpaid: 0 },
  );
}
