import { computeAverage } from '@/lib/sync-transform';
import {
  type ManualPositionRow,
  type SubstitutionRole,
  manualSegmentsFromRows,
  splitManualPosition,
} from '@/lib/substitutions';
import type { ManualMatchPositionInput } from '@/lib/validation/manual-match';

export interface ManualMatchPlayerRow extends Omit<ManualPositionRow, 'positionShare'> {
  avg: string;
  /** `numeric` column, kept unrounded; the recalculation rounds the money to cents. */
  positionShare: string | null;
}

export interface ManualMatchSubstitutionRow {
  starterUserId: string;
  substituteUserId: string;
  throwNumber: number;
}

export interface ManualMatchRows {
  players: ManualMatchPlayerRow[];
  /** Chain links in order; the caller allocates their ids. */
  substitutions: ManualMatchSubstitutionRow[];
  /** Summed per position: a holder's row already carries the whole position. */
  teamTotalScore: number;
}

export function buildManualMatchRows(positions: ManualMatchPositionInput[]): ManualMatchRows {
  const segmentsPerPosition = positions.map((p) => [
    { ...p.starter, fromThrow: 1 },
    ...p.substitutions,
  ]);

  const players = segmentsPerPosition.flatMap(splitManualPosition).map((row) => ({
    ...row,
    avg: String(computeAverage(row.total)),
    positionShare: row.positionShare === null ? null : String(row.positionShare),
  }));

  const substitutions = segmentsPerPosition.flatMap((segments) => segments.slice(1).map((s, i) => ({
    starterUserId: segments[i].userId,
    substituteUserId: s.userId,
    throwNumber: s.fromThrow,
  })));

  const teamTotalScore = segmentsPerPosition
    .flat()
    .reduce((sum, s) => sum + s.full + s.clean, 0);

  return { players, substitutions, teamTotalScore };
}

export interface StoredManualPlayer {
  userId: string;
  name: string;
  full: number;
  clean: number;
  faults: number;
  substitutionRole: SubstitutionRole | null;
}

export interface ManualPositionPlayer {
  userId: string;
  name: string;
  /** The player's own part, as the admin entered it. */
  full: number;
  clean: number;
  faults: number;
}

export interface ManualPositionDetail {
  starter: ManualPositionPlayer;
  substitutions: (ManualPositionPlayer & { fromThrow: number })[];
}

/**
 * Inverse of `buildManualMatchRows()`: the saved rows and chain links back as the form's
 * positions. Starters keep the order of `players`.
 */
export function toManualPositions(
  players: StoredManualPlayer[],
  links: ManualMatchSubstitutionRow[],
): ManualPositionDetail[] {
  const byUser = new Map(players.map((p) => [p.userId, p]));
  const substituteIds = new Set(links.map((l) => l.substituteUserId));

  return players
    .filter((p) => !substituteIds.has(p.userId))
    .map((starter) => {
      const chain = [{ userId: starter.userId, fromThrow: 1 }];
      let next = links.find((l) => l.starterUserId === starter.userId);
      while (next && chain.length <= links.length) {
        chain.push({ userId: next.substituteUserId, fromThrow: next.throwNumber });
        const { substituteUserId } = next;
        next = links.find((l) => l.starterUserId === substituteUserId);
      }

      const [own, ...subs] = manualSegmentsFromRows(chain, byUser).map((s) => ({
        userId: s.userId,
        name: byUser.get(s.userId)?.name ?? '',
        full: s.full,
        clean: s.clean,
        faults: s.faults,
        fromThrow: s.fromThrow,
      }));
      const { fromThrow, ...starterOwn } = own;
      return { starter: starterOwn, substitutions: subs };
    });
}
