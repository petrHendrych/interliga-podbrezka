import { getAllTeamIds } from '@/lib/season-config';

/** Podbrezová's club id in the results API. */
export const CLUB_ID = 649;

export interface SnapshotRow {
  externalId: number | null;
  data: unknown;
}

export function toSnapshotRows(payload: Map<number, unknown>): SnapshotRow[] {
  return Array.from(payload, ([externalId, data]) => ({ externalId, data }));
}

/** The average the API omits: four lanes per player, one decimal. */
export function computeAverage(total: number): number {
  return total > 0 ? Math.round((total / 4) * 10) / 10 : 0;
}

export interface HomeTeamIdentity {
  clubId?: number | null;
  teamId?: number | null;
  name?: string | null;
}

/** Whether the home side of a fixture is us, so the match can be stamped `is_home`. */
export function isOurTeam({ clubId, teamId, name }: HomeTeamIdentity): boolean {
  return clubId === CLUB_ID
    || (teamId != null && getAllTeamIds().includes(teamId))
    || (name?.includes('Podbrezová') ?? false);
}

/** `/match/list` answers with a bare array on some leagues and `{ list }` on others. */
export function normalizeMatchList<T>(data: { list?: T[] } | T[]): T[] {
  if (Array.isArray(data)) return data;
  return data.list || [];
}
