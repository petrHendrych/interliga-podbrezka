import {
  asc, desc, eq, gte, sql,
} from 'drizzle-orm';
import { db } from './db';
import { matches, matchPlayerResults, users } from './db/schema';
import { MANUAL_MATCH_ID_BASE } from './season-config';

export interface ManualMatchListItem {
  externalId: number;
  date: string | null;
  seasonId: number | null;
  leagueId: number | null;
  leagueName: string | null;
  opponent: string | null;
  isHome: boolean | null;
  teamTotalScore: number | null;
  opponentTotalScore: number | null;
  playersCount: number;
}

export interface ManualMatchPlayer {
  userId: string;
  name: string;
  full: number;
  clean: number;
  faults: number;
}

export interface ManualMatchDetail {
  externalId: number;
  /** `YYYY-MM-DD`, ready for an `<input type="date">`. */
  date: string;
  seasonId: number;
  leagueId: number;
  opponent: string;
  isHome: boolean;
  opponentTotalScore: number | null;
  players: ManualMatchPlayer[];
}

export interface SelectablePlayer {
  id: string;
  name: string;
}

function toDateInputValue(value: Date | string | null): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export async function listManualMatches(): Promise<ManualMatchListItem[]> {
  const rows = await db
    .select({
      externalId: matches.externalId,
      date: matches.date,
      seasonId: matches.seasonId,
      leagueId: matches.leagueId,
      leagueName: matches.leagueName,
      opponent: matches.opponent,
      isHome: matches.isHome,
      teamTotalScore: matches.teamTotalScore,
      opponentTotalScore: matches.opponentTotalScore,
      playersCount: sql<number>`(
        SELECT COUNT(*)::int FROM match_player_results mpr
        WHERE mpr.match_id = ${matches.externalId}
      )`,
    })
    .from(matches)
    .where(gte(matches.externalId, MANUAL_MATCH_ID_BASE))
    .orderBy(desc(matches.date));

  return rows.map((r) => ({
    externalId: Number(r.externalId),
    date: r.date ? new Date(r.date).toISOString() : null,
    seasonId: r.seasonId ?? null,
    leagueId: r.leagueId ?? null,
    leagueName: r.leagueName ?? null,
    opponent: r.opponent ?? null,
    isHome: r.isHome ?? null,
    teamTotalScore: r.teamTotalScore ?? null,
    opponentTotalScore: r.opponentTotalScore ?? null,
    playersCount: Number(r.playersCount || 0),
  }));
}

export async function getManualMatch(externalId: number): Promise<ManualMatchDetail | null> {
  if (externalId < MANUAL_MATCH_ID_BASE) return null;

  const [matchRows, playerRows] = await db.batch([
    db.select().from(matches).where(eq(matches.externalId, externalId)),
    db
      .select({
        userId: matchPlayerResults.userId,
        name: users.name,
        full: matchPlayerResults.full,
        clean: matchPlayerResults.clean,
        faults: matchPlayerResults.faults,
      })
      .from(matchPlayerResults)
      .innerJoin(users, eq(matchPlayerResults.userId, users.id))
      .where(eq(matchPlayerResults.matchId, externalId))
      .orderBy(asc(users.name)),
  ]);

  const match = matchRows[0];
  if (!match) return null;

  return {
    externalId: Number(match.externalId),
    date: toDateInputValue(match.date),
    seasonId: match.seasonId ?? 0,
    leagueId: match.leagueId ?? 0,
    opponent: match.opponent ?? '',
    isHome: match.isHome ?? false,
    opponentTotalScore: match.opponentTotalScore ?? null,
    players: playerRows.map((p) => ({
      userId: String(p.userId),
      name: String(p.name),
      full: Number(p.full || 0),
      clean: Number(p.clean || 0),
      faults: Number(p.faults || 0),
    })),
  };
}

export async function listSelectablePlayers(): Promise<SelectablePlayer[]> {
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(sql`${users.role} = 'player' AND ${users.isApproved}`)
    .orderBy(asc(users.name));

  return rows.map((r) => ({ id: String(r.id), name: String(r.name) }));
}
