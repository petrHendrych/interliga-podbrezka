import { getManualLeagues } from '@/lib/season-config';

/** A slot can be split between two players, so the squad can exceed six. */
export const MAX_PLAYERS = 12;
export const MAX_SCORE = 1000;
export const MAX_FAULTS = 200;

/** Error codes the client maps to a localized message; raw messages never reach it. */
export type ManualMatchError =
  | 'unauthorized'
  | 'invalidLeague'
  | 'invalidDate'
  | 'noPlayers'
  | 'duplicatePlayer'
  | 'invalidScore'
  | 'notFound'
  | 'notManual'
  | 'unknown';

export interface ManualMatchPlayerInput {
  userId: string;
  full: number;
  clean: number;
  faults: number;
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
  players: ManualMatchPlayerInput[];
}

export function isCountable(value: number, max: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

export function validateManualMatch(input: ManualMatchInput): ManualMatchError | null {
  const league = getManualLeagues(input.seasonId).find((l) => l.leagueId === input.leagueId);
  if (!league) return 'invalidLeague';

  const date = new Date(`${input.date}T12:00:00Z`);
  if (!input.date || Number.isNaN(date.getTime())) return 'invalidDate';

  if (input.players.length === 0 || input.players.length > MAX_PLAYERS) return 'noPlayers';
  if (input.players.some((p) => !p.userId)) return 'noPlayers';

  const uniqueIds = new Set(input.players.map((p) => p.userId));
  if (uniqueIds.size !== input.players.length) return 'duplicatePlayer';

  const scoresValid = input.players.every((p) => (
    isCountable(p.full, MAX_SCORE)
    && isCountable(p.clean, MAX_SCORE)
    && isCountable(p.faults, MAX_FAULTS)
  ));
  if (!scoresValid) return 'invalidScore';

  if (input.opponentTotalScore !== null
    && !isCountable(input.opponentTotalScore, MAX_SCORE * MAX_PLAYERS)) {
    return 'invalidScore';
  }

  return null;
}
