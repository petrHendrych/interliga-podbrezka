import { getManualLeagues } from '@/lib/season-config';
import { SUBSTITUTION_FIRST_SEASON_ID, THROWS_PER_GAME } from '@/lib/substitutions';

export const POSITION_COUNT = 6;
/** The league allows two substitutions per team and match; both may fall in one position. */
export const MAX_SUBSTITUTIONS = 2;
export const MAX_SCORE = 1000;
export const MAX_FAULTS = 200;
export const MAX_MATCH_POINTS = 8;
/** A switch at throw 1 is no switch: the substitute simply played the whole game. */
export const MIN_SUBSTITUTION_THROW = 2;

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type ManualMatchError =
  | 'unauthorized'
  | 'invalidLeague'
  | 'invalidDate'
  | 'incompletePositions'
  | 'tooManySubstitutions'
  | 'substitutionNotAllowed'
  | 'invalidThrowNumber'
  | 'duplicatePlayer'
  | 'invalidScore'
  | 'invalidMatchPoints'
  | 'notFound'
  | 'notManual'
  | 'unknown';

export interface ManualMatchPlayerInput {
  userId: string;
  full: number;
  clean: number;
  faults: number;
}

export interface ManualMatchSubstitutionInput extends ManualMatchPlayerInput {
  /** First throw the substitute bowled. */
  fromThrow: number;
}

export interface ManualMatchPositionInput {
  starter: ManualMatchPlayerInput;
  /** In order: the second one replaces the first. */
  substitutions: ManualMatchSubstitutionInput[];
}

export interface ManualMatchInput {
  /** Present → edit an existing manual match. */
  externalId?: number;
  seasonId: number;
  leagueId: number;
  /** `YYYY-MM-DD` from the date input. */
  date: string;
  opponent: string;
  isHome: boolean;
  opponentTotalScore: number | null;
  /** Both or neither: a single value cannot decide a loss. */
  teamMatchPoints: number | null;
  opponentMatchPoints: number | null;
  positions: ManualMatchPositionInput[];
}

export function isCountable(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

/** Half points exist: a drawn duel splits its point. */
export function isMatchPoints(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_MATCH_POINTS
    && Number.isInteger(value * 2);
}

function hasValidThrows(substitutions: ManualMatchSubstitutionInput[]): boolean {
  return substitutions.every((s, i) => (
    Number.isInteger(s.fromThrow)
    && s.fromThrow >= MIN_SUBSTITUTION_THROW
    && s.fromThrow <= THROWS_PER_GAME
    && (i === 0 || s.fromThrow > substitutions[i - 1].fromThrow)
  ));
}

export function validateManualMatch(input: ManualMatchInput): ManualMatchError | null {
  const league = getManualLeagues(input.seasonId).find((l) => l.leagueId === input.leagueId);
  if (!league) return 'invalidLeague';

  const date = new Date(`${input.date}T12:00:00Z`);
  if (!input.date || Number.isNaN(date.getTime())) return 'invalidDate';

  const people = input.positions.flatMap((p) => [p.starter, ...p.substitutions]);
  if (input.positions.length !== POSITION_COUNT) return 'incompletePositions';
  if (people.some((p) => !p.userId)) return 'incompletePositions';

  const substitutions = input.positions.flatMap((p) => p.substitutions);
  if (substitutions.length > MAX_SUBSTITUTIONS) return 'tooManySubstitutions';
  if (substitutions.length > 0 && input.seasonId < SUBSTITUTION_FIRST_SEASON_ID) {
    return 'substitutionNotAllowed';
  }
  if (!input.positions.every((p) => hasValidThrows(p.substitutions))) return 'invalidThrowNumber';

  const uniqueIds = new Set(people.map((p) => p.userId));
  if (uniqueIds.size !== people.length) return 'duplicatePlayer';

  const scoresValid = people.every((p) => (
    isCountable(p.full, MAX_SCORE)
    && isCountable(p.clean, MAX_SCORE)
    && isCountable(p.faults, MAX_FAULTS)
  ));
  if (!scoresValid) return 'invalidScore';

  if (input.opponentTotalScore !== null
    && !isCountable(input.opponentTotalScore, MAX_SCORE * POSITION_COUNT)) {
    return 'invalidScore';
  }

  const { teamMatchPoints, opponentMatchPoints } = input;
  if ((teamMatchPoints === null) !== (opponentMatchPoints === null)) return 'invalidMatchPoints';
  if (teamMatchPoints !== null && opponentMatchPoints !== null
    && !(isMatchPoints(teamMatchPoints) && isMatchPoints(opponentMatchPoints))) {
    return 'invalidMatchPoints';
  }

  return null;
}
