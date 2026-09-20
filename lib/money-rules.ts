import {
  INTERLIGA_LEAGUE_IDS,
  TEAM_SCORE_LIMIT,
  TOURNAMENT_LEAGUE_IDS,
} from '@/lib/season-config';

/**
 * The JS mirror of the money SQL in `recalculateDerivedFinancials()` (`lib/sync.ts`).
 * The SQL cannot be unit tested, so every threshold and formula it applies lives here as
 * a pure function and is asserted by `money-rules.test.ts`. The two must change together;
 * each function names the SQL block it mirrors.
 */

export const UNDER_600_LIMIT = 600;
export const BONUS_TOTAL_LIMIT = 700;
export const PLAYER_BONUS = 40;
export const WORST_PLAYER_FINE = 1;
export const UNDER_600_FINE = 1;
export const TEAM_UNDER_LIMIT_FINE = 2;
export const SPECIAL_FAULT_FINE = 5;
export const STREAK_LENGTH = 5;
export const STREAK_FINE = 10;

export const TRAINER_SCORE_LIMIT = 3800;
export const TRAINER_SCORE_HIGH_LIMIT = 3900;
export const TRAINER_SCORE_TOP_LIMIT = 4000;
export const TRAINER_SCORE_BONUS = 10;
export const TRAINER_SCORE_HIGH_BONUS = 15;
export const TRAINER_SCORE_TOP_BONUS = 20;
export const TRAINER_ZERO_FAULTS_BONUS = 10;
export const TRAINER_ZERO_FAULTS_MIN_PLAYERS = 6;
export const TRAINER_ELITE_PLAYER_BONUS = 10;
export const CLEAN_SWEEP_TEAM_POINTS = 8;
export const TRAINER_CLEAN_SWEEP_FINE = 10;
/** The rule opens in 2026/2027; the 8:0 wins of earlier seasons are not charged. */
export const CLEAN_SWEEP_FIRST_SEASON_ID = 13;

export interface PlayerRow {
  userId: string;
  total: number;
  faults: number | null;
  specialFaultsCount: number;
}

export interface MatchContext {
  teamTotalScore?: number | null;
  isHome?: boolean | null;
  leagueId?: number | null;
  leagueName?: string | null;
  seasonId?: number | null;
  teamMatchPoints?: number | null;
  opponentMatchPoints?: number | null;
}

export interface PlayerDerived {
  isWorstPlayer: boolean;
  isUnder600: boolean;
  isTeamUnderLimit: boolean;
  calculatedFine: number;
  streakFine: number;
  bonusReceived: number;
}

export type TrainerConditionType = 'score_bonus' | 'zero_faults' | 'elite_player' | 'clean_sweep';

export interface TrainerPaymentAmount {
  conditionType: TrainerConditionType;
  amount: number;
}

/** `(COALESCE(faults, 0) * (COALESCE(faults, 0) + 1)) / 2` — sync.ts `calculated_fine`. */
export function faultFine(faults: number | null): number {
  const n = faults ?? 0;
  return (n * (n + 1)) / 2;
}

/** `s.sfc * 5` — sync.ts `calculated_fine`. */
export function specialFaultFine(count: number): number {
  return (count ?? 0) * SPECIAL_FAULT_FINE;
}

function isInterliga(match: MatchContext): boolean {
  return (match.leagueId !== undefined && match.leagueId !== null
    && INTERLIGA_LEAGUE_IDS.includes(match.leagueId))
    || (match.leagueName?.toLowerCase().includes('interliga') ?? false);
}

function isTournament(match: MatchContext): boolean {
  return match.leagueId !== undefined && match.leagueId !== null
    && TOURNAMENT_LEAGUE_IDS.includes(match.leagueId);
}

/** The `team_under_limit` league scope in sync.ts: a home Interliga match or a home tournament. */
export function isUnderLimitEligible(match: MatchContext): boolean {
  return Boolean(match.isHome) && (isInterliga(match) || isTournament(match));
}

export function isTeamUnderLimit(match: MatchContext): boolean {
  return isUnderLimitEligible(match)
    && typeof match.teamTotalScore === 'number'
    && match.teamTotalScore < TEAM_SCORE_LIMIT;
}

/** `CASE WHEN s.total >= 700 THEN 40 ELSE 0 END` — sync.ts `bonus_received`. */
export function playerBonus(total: number): number {
  return total >= BONUS_TOTAL_LIMIT ? PLAYER_BONUS : 0;
}

/** `CASE WHEN s.streak >= 5 THEN 10 ELSE 0 END` — sync.ts `streak_fine`. */
export function streakFineFor(streak: number): number {
  return streak >= STREAK_LENGTH ? STREAK_FINE : 0;
}

/** `MIN(total) FILTER (WHERE total > 0)` — the `worst` CTE in sync.ts. */
export function worstTotal(rows: PlayerRow[]): number | null {
  const played = rows.filter((r) => r.total > 0);
  if (played.length === 0) return null;
  return Math.min(...played.map((r) => r.total));
}

/**
 * Faultless-streak length per row for one player's games, ordered by date within one season
 * but across leagues. Mirrors the `grp`/`ROW_NUMBER()` window pair in sync.ts, both
 * partitioned by `user_id, season_id`: the first group of a season carries no offset, so a
 * player whose first game of the season is faultless is on a streak of 1 already. State is
 * kept per season id rather than reset on a change between neighbouring rows, because
 * `PARTITION BY` groups equal values wherever they sit in the ordering.
 */
export function faultlessStreaks(
  rows: { faults: number | null; seasonId: number | null }[],
): number[] {
  const perSeason = new Map<number | null, { group: number; rowNumber: number }>();

  return rows.map((row) => {
    const state = perSeason.get(row.seasonId) ?? { group: 0, rowNumber: 0 };
    perSeason.set(row.seasonId, state);

    const hasFault = (row.faults ?? 0) !== 0;
    if (hasFault) {
      state.group += 1;
      state.rowNumber = 1;
      return 0;
    }
    state.rowNumber += 1;
    return state.group === 0 ? state.rowNumber : state.rowNumber - 1;
  });
}

/** The whole `UPDATE match_player_results` in sync.ts, per player of one match. */
export function derivePlayers(
  match: MatchContext,
  rows: PlayerRow[],
  streakByUser: Record<string, number> = {},
): Map<string, PlayerDerived> {
  const minTotal = worstTotal(rows);
  const teamUnderLimit = isTeamUnderLimit(match);

  return new Map(rows.map((row) => {
    const played = row.total > 0;
    const isWorstPlayer = played && row.total === minTotal;
    const isUnder600 = played && row.total < UNDER_600_LIMIT;
    const underLimit = played && teamUnderLimit;
    const streak = streakByUser[row.userId] ?? 0;

    const derived: PlayerDerived = {
      isWorstPlayer,
      isUnder600,
      isTeamUnderLimit: underLimit,
      calculatedFine: faultFine(row.faults)
        + (isWorstPlayer ? WORST_PLAYER_FINE : 0)
        + (isUnder600 ? UNDER_600_FINE : 0)
        + specialFaultFine(row.specialFaultsCount)
        + (underLimit ? TEAM_UNDER_LIMIT_FINE : 0),
      streakFine: streakFineFor(streak),
      bonusReceived: playerBonus(row.total),
    };

    return [row.userId, derived];
  }));
}

/** `score_bonus` in the `spec` CTE: each tier replaces the one below it, they never stack. */
export function trainerScoreBonus(teamTotalScore: number | null | undefined): number | null {
  if (typeof teamTotalScore !== 'number') return null;
  if (teamTotalScore >= TRAINER_SCORE_TOP_LIMIT) return TRAINER_SCORE_TOP_BONUS;
  if (teamTotalScore >= TRAINER_SCORE_HIGH_LIMIT) return TRAINER_SCORE_HIGH_BONUS;
  if (teamTotalScore >= TRAINER_SCORE_LIMIT) return TRAINER_SCORE_BONUS;
  return null;
}

/** `zero_faults`: a NULL fault sum (no row carries a count) earns nothing. */
export function trainerZeroFaultsBonus(rows: PlayerRow[]): number | null {
  const counted = rows.filter((r) => r.faults !== null && r.faults !== undefined);
  if (counted.length === 0) return null;

  const teamFaults = counted.reduce((sum, r) => sum + (r.faults ?? 0), 0);
  const active = rows.filter((r) => r.total > 0).length;
  if (teamFaults !== 0 || active < TRAINER_ZERO_FAULTS_MIN_PLAYERS) return null;
  return TRAINER_ZERO_FAULTS_BONUS;
}

/** `elite_player`: one row per match worth 10 € per player on 700 or more. */
export function trainerElitePlayerBonus(rows: PlayerRow[]): number | null {
  const elite = rows.filter((r) => r.total >= BONUS_TOTAL_LIMIT).length;
  return elite > 0 ? elite * TRAINER_ELITE_PLAYER_BONUS : null;
}

/** `clean_sweep` in the `spec` CTE: 8:0 on match points, home or away, from season 13 on. */
export function trainerCleanSweepFine(match: MatchContext): number | null {
  if (typeof match.seasonId !== 'number' || match.seasonId < CLEAN_SWEEP_FIRST_SEASON_ID) {
    return null;
  }
  if (match.teamMatchPoints !== CLEAN_SWEEP_TEAM_POINTS || match.opponentMatchPoints !== 0) {
    return null;
  }
  return TRAINER_CLEAN_SWEEP_FINE;
}

/**
 * Trainer payments are fanned out over `role = 'trainer' AND is_approved` in sync.ts, so
 * approving one leaves every played match without their rows until a recalculation runs.
 */
export function approvalAffectsTrainerPayments(role: string): boolean {
  return role === 'trainer';
}

/** Amounts owed to **each** approved trainer for one match; the fan-out is the SQL's job. */
export function deriveTrainerPayments(
  match: MatchContext,
  rows: PlayerRow[],
): TrainerPaymentAmount[] {
  const candidates: [TrainerConditionType, number | null][] = [
    ['score_bonus', trainerScoreBonus(match.teamTotalScore)],
    ['zero_faults', trainerZeroFaultsBonus(rows)],
    ['elite_player', trainerElitePlayerBonus(rows)],
    ['clean_sweep', trainerCleanSweepFine(match)],
  ];

  return candidates
    .filter((entry): entry is [TrainerConditionType, number] => entry[1] !== null)
    .map(([conditionType, amount]) => ({ conditionType, amount }));
}
