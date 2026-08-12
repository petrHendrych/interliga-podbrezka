/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
import { eq, sql } from 'drizzle-orm';
import { db } from './db';
import {
  matches,
  users,
  matchPlayerResults,
  scrapedData,
} from './db/schema';
import {
  getAllTeamIds,
  getSeasonAndLeagueConfig,
  INTERLIGA_LEAGUE_IDS,
  TEAM_SCORE_LIMIT,
  TOURNAMENT_LEAGUE_IDS,
} from './season-config';
import { MatchListItem, parseApiDate } from './api';
import {
  type SnapshotRow,
  computeAverage,
  isOurTeam,
  toSnapshotRows,
} from './sync-transform';

/** Renders a number list for an `IN (...)` clause. */
function idList(ids: number[]) {
  return sql.join(ids.map((id) => sql`${id}`), sql`, `);
}

export interface SyncMatchData {
  id?: number;
  startDate?: string;
  hall?: { name?: string };
  details?: { date?: string; hall?: { name?: string } };
  league?: { name?: string; seasonId?: number };
  homeTeam?: { id?: number; name?: string; club?: { id?: number; name?: string } };
  awayTeam?: { id?: number; name?: string; club?: { id?: number; name?: string } };
  results?: {
    [key: string]: {
      total?: number;
      players?: {
        player?: { id?: number; firstName?: string; lastName?: string; name?: string };
        full?: number;
        clean?: number;
        total?: number;
        faults?: number;
        average?: number;
      }[];
    };
  };
  lineUp?: {
    [key: string]: {
      player?: { id?: number; firstName?: string; lastName?: string; name?: string };
      full?: number;
      clean?: number;
      total?: number;
      faults?: number;
      average?: number;
    }[];
  };
}

interface SnapshotTeam {
  id?: number;
  name?: string;
  clubId?: number;
  club?: { id?: number; name?: string };
}

export interface PlayerResultSnapshot {
  full?: number;
  clean?: number;
  total?: number;
  faults?: number;
  average?: number;
  teamId?: number;
  player?: { firstName?: string; lastName?: string; name?: string };
  match?: {
    id?: number;
    startDate?: string;
    created?: string;
    hall?: { name?: string };
    league?: { name?: string; seasonId?: number };
    homeTeam?: SnapshotTeam;
    awayTeam?: SnapshotTeam;
  };
}

/** Keyed like `scraped_data.external_id`; untyped so both paths share the casts below. */
export interface ScrapePayloads {
  matchDetails: Map<number, unknown>;
  matchLists: Map<number, unknown>;
  playerResults: Map<number, unknown>;
}

/**
 * Single source of truth for every derived money field (see AGENTS.md).
 * Sync upserts write raw scores only; admin actions call this afterwards.
 */
export async function recalculateDerivedFinancials() {
  // `grp` increments on each fault, so a run of faultless games shares one group and
  // its row number is the streak length. Streaks span all seasons, so no filtering.
  await db.execute(sql`
    WITH worst AS (
      SELECT match_id, MIN(total) FILTER (WHERE total > 0) AS min_total
      FROM match_player_results
      GROUP BY match_id
    ),
    ordered AS (
      SELECT mpr.match_id, mpr.user_id, mpr.total, mpr.faults, m.date,
             COALESCE(mpr.special_faults_count, 0) AS sfc,
             w.min_total,
             COALESCE(
               m.team_total_score < ${TEAM_SCORE_LIMIT}
               AND mpr.total > 0
               AND (
                 (
                   m.is_home
                   AND (
                     m.league_id IN (${idList(INTERLIGA_LEAGUE_IDS)})
                     OR m.league_name ILIKE '%interliga%'
                   )
                 )
                 -- Tournaments are penalised home and away alike.
                 OR m.league_id IN (${idList(TOURNAMENT_LEAGUE_IDS)})
               ),
               false
             ) AS team_under_3750,
             SUM(CASE WHEN COALESCE(mpr.faults, 0) <> 0 THEN 1 ELSE 0 END) OVER (
               PARTITION BY mpr.user_id
               ORDER BY COALESCE(m.date, '1970-01-01'), mpr.match_id
               ROWS UNBOUNDED PRECEDING
             ) AS grp
      FROM match_player_results mpr
      JOIN matches m ON m.external_id = mpr.match_id
      JOIN worst w ON w.match_id = mpr.match_id
    ),
    streaks AS (
      SELECT *,
        CASE WHEN COALESCE(faults, 0) = 0 THEN
          ROW_NUMBER() OVER (
            PARTITION BY user_id, grp ORDER BY COALESCE(date, '1970-01-01'), match_id
          ) - CASE WHEN grp = 0 THEN 0 ELSE 1 END
        ELSE 0 END AS streak
      FROM ordered
    )
    UPDATE match_player_results mpr
    SET is_worst_player     = (s.total = s.min_total AND s.total > 0),
        is_under_600        = (s.total < 600 AND s.total > 0),
        is_team_under_3750  = s.team_under_3750,
        faultless_streak    = s.streak,
        bonus_received      = CASE WHEN s.total >= 700 THEN 40 ELSE 0 END,
        calculated_fine     = (COALESCE(s.faults, 0) * (COALESCE(s.faults, 0) + 1)) / 2
                            + CASE WHEN s.total = s.min_total AND s.total > 0 THEN 1 ELSE 0 END
                            + CASE WHEN s.total < 600 AND s.total > 0 THEN 1 ELSE 0 END
                            + s.sfc * 5
                            + CASE WHEN s.team_under_3750 THEN 10 ELSE 0 END,
        streak_fine         = CASE WHEN s.streak >= 5 THEN 10 ELSE 0 END
    FROM streaks s
    WHERE mpr.match_id = s.match_id AND mpr.user_id = s.user_id
  `);

  await db.execute(sql`
    WITH agg AS (
      SELECT m.external_id AS match_id, m.team_total_score,
             COUNT(*) FILTER (WHERE mpr.total > 0) AS active,
             SUM(mpr.faults) AS team_faults,
             COUNT(*) FILTER (WHERE mpr.total >= 700) AS elite
      FROM matches m
      JOIN match_player_results mpr ON mpr.match_id = m.external_id
      GROUP BY 1, 2
    ),
    spec AS (
      SELECT match_id, 'score_bonus' AS condition_type,
             CASE WHEN team_total_score >= 3900 THEN 15
                  WHEN team_total_score >= 3800 THEN 10 END AS amount
      FROM agg
      UNION ALL
      SELECT match_id, 'zero_faults',
             CASE WHEN team_faults = 0 AND active >= 6 THEN 10 END
      FROM agg
      UNION ALL
      SELECT match_id, 'elite_player',
             CASE WHEN elite > 0 THEN elite * 10 END
      FROM agg
    )
    INSERT INTO trainer_payments (match_id, user_id, condition_type, amount)
    SELECT s.match_id, t.id, s.condition_type, s.amount
    FROM spec s
    CROSS JOIN (SELECT id FROM users WHERE role = 'trainer' AND is_approved) t
    WHERE s.amount IS NOT NULL
    ON CONFLICT (match_id, user_id, condition_type)
      DO UPDATE SET amount = EXCLUDED.amount
  `);

  // Paid rows are spared so a recalculation cannot erase money that changed hands.
  await db.execute(sql`
    DELETE FROM trainer_payments tp
    WHERE NOT tp.is_paid AND NOT EXISTS (
      WITH agg AS (
        SELECT m.external_id AS match_id, m.team_total_score,
               COUNT(*) FILTER (WHERE mpr.total > 0) AS active,
               SUM(mpr.faults) AS team_faults,
               COUNT(*) FILTER (WHERE mpr.total >= 700) AS elite
        FROM matches m
        JOIN match_player_results mpr ON mpr.match_id = m.external_id
        GROUP BY 1, 2
      )
      SELECT 1 FROM agg
      WHERE agg.match_id = tp.match_id
        AND CASE tp.condition_type
              WHEN 'score_bonus'  THEN agg.team_total_score >= 3800
              WHEN 'zero_faults'  THEN agg.team_faults = 0 AND agg.active >= 6
              WHEN 'elite_player' THEN agg.elite > 0
              ELSE true
            END
    )
  `);
}

export async function syncAllPlayerResultsSnapshots(payload?: Map<number, unknown>) {
  const playerSnapshots: SnapshotRow[] = payload
    ? toSnapshotRows(payload)
    : await db
      .select({
        externalId: scrapedData.externalId,
        data: scrapedData.data,
      })
      .from(scrapedData)
      .where(eq(scrapedData.type, 'player_results'));

  if (playerSnapshots.length === 0) return;

  const existingUsers = await db
    .select({ id: users.id, externalPlayerId: users.externalPlayerId })
    .from(users)
    .where(sql`${users.externalPlayerId} IS NOT NULL`);

  const userMap = new Map<number, string>();
  existingUsers.forEach((u) => {
    if (u.externalPlayerId !== null) {
      userMap.set(u.externalPlayerId, u.id);
    }
  });

  const matchesMap = new Map<number, {
    externalId: number;
    date: Date | null;
    opponent: string;
    isHome: boolean;
    location: string | null;
    leagueName: string | null;
    seasonId: number | null;
    leagueId: number | null;
    updatedAt: Date;
  }>();

  const playerResultsToUpsertMap = new Map<string, {
    matchId: number;
    userId: string;
    full: number;
    clean: number;
    total: number;
    avg: string;
    faults: number;
    teamId: number;
  }>();

  for (const snapshot of playerSnapshots) {
    if (snapshot.externalId === null) continue;
    const externalPlayerId = Number(snapshot.externalId);
    const playerResults = snapshot.data as PlayerResultSnapshot[];

    if (externalPlayerId && Array.isArray(playerResults)) {
      const userId = userMap.get(externalPlayerId);
      if (!userId) continue;

      for (const item of playerResults) {
        const { match } = item;
        if (match && match.id) {
          const matchId = Number(match.id);
          const dateStr = match.startDate || match.created || null;
          const date = dateStr ? parseApiDate(dateStr) : null;
          const isHome = isOurTeam({
            clubId: match.homeTeam?.clubId || match.homeTeam?.club?.id,
            teamId: match.homeTeam?.id,
            name: match.homeTeam?.name || match.homeTeam?.club?.name,
          });

          const opponentTeam = isHome ? match.awayTeam : match.homeTeam;
          const opponent = opponentTeam?.name || opponentTeam?.club?.name || 'Unknown';
          const location = match.hall?.name || null;

          const playerTeamId = Number(item.teamId);
          const config = getSeasonAndLeagueConfig(
            playerTeamId,
            match.league?.seasonId,
            match.league?.name,
          );
          const seasonId = config?.seasonId || match.league?.seasonId || null;
          const leagueId = config?.leagueId || null;
          const leagueName = config?.leagueName || match.league?.name || null;

          // Team id is the only reliable signal. Matching on club name instead also
          // caught B-team and youth appearances, which do not belong in the pot.
          if (matchId && getAllTeamIds().includes(playerTeamId)) {
            if (!matchesMap.has(matchId)) {
              matchesMap.set(matchId, {
                externalId: matchId,
                date,
                opponent,
                isHome,
                location,
                leagueName,
                seasonId,
                leagueId,
                updatedAt: new Date(),
              });
            }

            const total = Number(item.total || 0);

            playerResultsToUpsertMap.set(`${matchId}_${userId}`, {
              matchId,
              userId,
              full: Number(item.full || 0),
              clean: Number(item.clean || 0),
              total,
              avg: String(Number(item.average || computeAverage(total))),
              faults: Number(item.faults || 0),
              teamId: playerTeamId,
            });
          }
        }
      }
    }
  }

  // Bulk upsert matches in 1 query
  const matchRows = Array.from(matchesMap.values());
  if (matchRows.length > 0) {
    await db
      .insert(matches)
      .values(matchRows)
      .onConflictDoUpdate({
        target: matches.externalId,
        set: {
          date: sql`COALESCE(EXCLUDED.date, matches.date)`,
          opponent: sql`COALESCE(EXCLUDED.opponent, matches.opponent)`,
          isHome: sql`COALESCE(EXCLUDED.is_home, matches.is_home)`,
          location: sql`COALESCE(EXCLUDED.location, matches.location)`,
          leagueName: sql`COALESCE(EXCLUDED.league_name, matches.league_name)`,
          seasonId: sql`COALESCE(EXCLUDED.season_id, matches.season_id)`,
          leagueId: sql`COALESCE(EXCLUDED.league_id, matches.league_id)`,
          updatedAt: sql`NOW()`,
        },
      });
  }

  // Bulk upsert player results in 1 query
  const prRows = Array.from(playerResultsToUpsertMap.values());
  if (prRows.length > 0) {
    await db
      .insert(matchPlayerResults)
      .values(prRows)
      .onConflictDoUpdate({
        target: [matchPlayerResults.matchId, matchPlayerResults.userId],
        set: {
          full: sql`EXCLUDED.full`,
          clean: sql`EXCLUDED.clean`,
          total: sql`EXCLUDED.total`,
          avg: sql`EXCLUDED.avg`,
          faults: sql`EXCLUDED.faults`,
          teamId: sql`EXCLUDED.team_id`,
        },
      });
  }
}

export async function syncData(payloads?: ScrapePayloads) {
  console.log(`Starting data sync from ${payloads ? 'scrape payloads' : 'scraped_data'}...`);

  try {
    const matchSnapshots: SnapshotRow[] = payloads
      ? toSnapshotRows(payloads.matchDetails)
      : await db
        .select({
          externalId: scrapedData.externalId,
          data: scrapedData.data,
        })
        .from(scrapedData)
        .where(eq(scrapedData.type, 'match_detail'));

    console.log(`Found ${matchSnapshots.length} matches in scraped_data to sync.`);

    // 1. Collect all users across all match snapshots and provision missing ones in bulk
    const playerMapByExtId = new Map<number, string>();
    const matchDataList: Array<{ matchId: number; data: SyncMatchData }> = [];

    for (const snapshot of matchSnapshots) {
      if (snapshot.externalId === null) continue;
      const matchId = Number(snapshot.externalId);
      const data = snapshot.data as SyncMatchData;
      matchDataList.push({ matchId, data });

      const isHome = isOurTeam({
        clubId: data.homeTeam?.club?.id,
        teamId: data.homeTeam?.id,
        name: data.homeTeam?.club?.name || data.homeTeam?.name,
      });

      const teamKey = isHome ? 'home' : 'away';
      const teamLineup = data.lineUp?.[teamKey] || data.results?.[teamKey]?.players || [];

      for (const p of teamLineup) {
        if (p.player?.id) {
          const playerFirstName = p.player?.firstName || '';
          const playerLastName = p.player?.lastName || '';
          const name = [playerFirstName, playerLastName].filter(Boolean).join(' ')
            || p.player?.name
            || `Player ${p.player.id}`;
          playerMapByExtId.set(p.player.id, name);
        }
      }
    }

    // Provision missing users in 1 query. `onConflictDoNothing` makes this safe
    // without first reading which of them already exist.
    const allExtPlayerIds = Array.from(playerMapByExtId.keys());
    if (allExtPlayerIds.length > 0) {
      await db
        .insert(users)
        .values(allExtPlayerIds.map((extId) => ({
          name: playerMapByExtId.get(extId) || `Player ${extId}`,
          externalPlayerId: extId,
          role: 'player',
          isApproved: true,
        })))
        .onConflictDoNothing();
    }

    // Refresh user ID mapping
    const allUserRows = await db
      .select({ id: users.id, externalPlayerId: users.externalPlayerId })
      .from(users)
      .where(sql`${users.externalPlayerId} IS NOT NULL`);

    const userMap = new Map<number, string>();
    allUserRows.forEach((u) => {
      if (u.externalPlayerId !== null) {
        userMap.set(u.externalPlayerId, u.id);
      }
    });

    // 2. Prepare bulk match rows, match player result rows, and trainer payment rows
    const matchesMapByExtId = new Map<number, {
      externalId: number;
      date: Date | null;
      opponent: string;
      isHome: boolean;
      location: string | null;
      teamTotalScore: number | null;
      opponentTotalScore: number | null;
      seasonId: number | null;
      leagueName: string | null;
      round: number | null;
      leagueId: number | null;
      updatedAt: Date;
    }>();

    // 2a. First, collect matches from match_list in scraped_data (upcoming matches included)
    const matchListSnapshots: SnapshotRow[] = payloads
      ? toSnapshotRows(payloads.matchLists)
      : await db
        .select({
          externalId: scrapedData.externalId,
          data: scrapedData.data,
        })
        .from(scrapedData)
        .where(eq(scrapedData.type, 'match_list'));

    const allPodbrezovaTeamIds = getAllTeamIds();

    for (const snapshot of matchListSnapshots) {
      const teamId = snapshot.externalId ? Number(snapshot.externalId) : undefined;
      const list = snapshot.data as MatchListItem[];
      if (Array.isArray(list)) {
        for (const m of list) {
          if (!m.id) continue;
          const matchId = Number(m.id);

          const homeTeamId = m.homeId ? Number(m.homeId) : undefined;
          const awayTeamId = m.awayId ? Number(m.awayId) : undefined;
          const homeName = m.homeName || '';
          const awayName = m.awayName || '';

          // Match on team id only. Name matching also hits every other Podbrezová
          // club team (B, C, juniors, women), which pulled ~1250 foreign fixtures
          // into `matches` and mislabelled them as our Slovenský pohár season.
          const isHome = homeTeamId != null && allPodbrezovaTeamIds.includes(homeTeamId);
          const isAway = awayTeamId != null && allPodbrezovaTeamIds.includes(awayTeamId);

          if (isHome || isAway) {
            const matchedTeamId = teamId || (isHome ? homeTeamId : awayTeamId);
            const matchedLeagueId = m.leagueId ? Number(m.leagueId) : undefined;
            const mLeagueName = typeof m.leagueName === 'string' ? m.leagueName : undefined;
            const mHallName = typeof m.hallName === 'string' ? m.hallName : null;
            const config = getSeasonAndLeagueConfig(matchedTeamId, matchedLeagueId, mLeagueName);

            const opponent = isHome ? awayName : homeName;
            const dateStr = m.startDate || null;
            const date = dateStr ? parseApiDate(dateStr) : null;

            let teamTotalScore: number | null = null;
            let opponentTotalScore: number | null = null;

            if (isHome) {
              teamTotalScore = m.homeTotal !== undefined ? (m.homeTotal as number | null) : null;
              opponentTotalScore = m.awayTotal !== undefined
                ? (m.awayTotal as number | null)
                : null;
            } else {
              teamTotalScore = m.awayTotal !== undefined ? (m.awayTotal as number | null) : null;
              opponentTotalScore = m.homeTotal !== undefined
                ? (m.homeTotal as number | null)
                : null;
            }

            matchesMapByExtId.set(matchId, {
              externalId: matchId,
              date,
              opponent,
              isHome,
              location: mHallName,
              teamTotalScore,
              opponentTotalScore,
              seasonId: config?.seasonId || null,
              leagueName: config?.leagueName || mLeagueName || null,
              round: m.round ? Number(m.round) : null,
              leagueId: config?.leagueId || matchedLeagueId || null,
              updatedAt: new Date(),
            });
          }
        }
      }
    }

    const prRowsToUpsert: Array<{
      matchId: number;
      userId: string;
      full: number;
      clean: number;
      total: number;
      avg: string;
      faults: number;
    }> = [];

    for (const { matchId, data } of matchDataList) {
      const isHome = isOurTeam({
        clubId: data.homeTeam?.club?.id,
        teamId: data.homeTeam?.id,
        name: data.homeTeam?.club?.name || data.homeTeam?.name,
      });

      const dateStr = data.details?.date || data.startDate || null;
      const date = dateStr ? parseApiDate(dateStr) : null;

      const matchedTeamId = isHome ? data.homeTeam?.id : (data.awayTeam?.id || undefined);
      const matchedLeagueId = (data as unknown as { leagueId?: number }).leagueId;
      const config = getSeasonAndLeagueConfig(matchedTeamId, matchedLeagueId, data.league?.name);

      const seasonId = config?.seasonId || data.league?.seasonId || null;
      const leagueName = config?.leagueName || data.league?.name || null;
      const leagueId = config?.leagueId || matchedLeagueId || null;

      const opponentTeam = isHome ? data.awayTeam : data.homeTeam;
      const opponent = opponentTeam?.club?.name || opponentTeam?.name || 'Unknown';
      const location = data.details?.hall?.name || data.hall?.name || null;

      const teamKey = isHome ? 'home' : 'away';
      const opponentKey = isHome ? 'away' : 'home';

      const teamLineup = data.lineUp?.[teamKey] || data.results?.[teamKey]?.players || [];
      const opponentLineup = data.lineUp?.[opponentKey]
        || data.results?.[opponentKey]?.players
        || [];

      const teamTotalScore = data.results?.[teamKey]?.total
        || teamLineup.reduce((sum, p) => sum + (p.total || 0), 0)
        || null;
      const opponentTotalScore = data.results?.[opponentKey]?.total
        || opponentLineup.reduce((sum, p) => sum + (p.total || 0), 0)
        || null;

      const existingMatch = matchesMapByExtId.get(matchId);

      matchesMapByExtId.set(matchId, {
        externalId: matchId,
        date: date || existingMatch?.date || null,
        opponent: opponent !== 'Unknown' ? opponent : (existingMatch?.opponent || 'Unknown'),
        isHome,
        location: location || existingMatch?.location || null,
        teamTotalScore: teamTotalScore || existingMatch?.teamTotalScore || null,
        opponentTotalScore: opponentTotalScore || existingMatch?.opponentTotalScore || null,
        seasonId: seasonId || existingMatch?.seasonId || null,
        leagueName: leagueName || existingMatch?.leagueName || null,
        round: existingMatch?.round || null,
        leagueId: leagueId || existingMatch?.leagueId || null,
        updatedAt: new Date(),
      });

      const playerResultsList = [];
      for (const p of teamLineup) {
        const extId = p.player?.id;
        if (extId) {
          const userId = userMap.get(extId);
          if (userId) {
            const full = p.full || 0;
            const clean = p.clean || 0;
            const total = p.total || 0;
            const faults = p.faults || 0;
            const avg = p.average || computeAverage(total);
            playerResultsList.push({
              userId,
              full,
              clean,
              total,
              faults,
              avg,
            });
          }
        }
      }

      for (const pr of playerResultsList) {
        prRowsToUpsert.push({
          matchId,
          userId: pr.userId,
          full: pr.full,
          clean: pr.clean,
          total: pr.total,
          avg: String(pr.avg),
          faults: pr.faults,
        });
      }
    }

    const matchesToUpsert = Array.from(matchesMapByExtId.values());

    // Execute bulk match upsert in 1 query
    if (matchesToUpsert.length > 0) {
      await db
        .insert(matches)
        .values(matchesToUpsert)
        .onConflictDoUpdate({
          target: matches.externalId,
          set: {
            date: sql`COALESCE(EXCLUDED.date, matches.date)`,
            opponent: sql`COALESCE(EXCLUDED.opponent, matches.opponent)`,
            isHome: sql`COALESCE(EXCLUDED.is_home, matches.is_home)`,
            location: sql`COALESCE(EXCLUDED.location, matches.location)`,
            teamTotalScore: sql`COALESCE(EXCLUDED.team_total_score, matches.team_total_score)`,
            opponentTotalScore: sql`COALESCE(EXCLUDED.opponent_total_score, matches.opponent_total_score)`,
            seasonId: sql`COALESCE(EXCLUDED.season_id, matches.season_id)`,
            leagueName: sql`COALESCE(EXCLUDED.league_name, matches.league_name)`,
            round: sql`COALESCE(EXCLUDED.round, matches.round)`,
            leagueId: sql`COALESCE(EXCLUDED.league_id, matches.league_id)`,
            updatedAt: sql`NOW()`,
          },
        });
    }

    // Execute bulk player results upsert in 1 query
    if (prRowsToUpsert.length > 0) {
      await db
        .insert(matchPlayerResults)
        .values(prRowsToUpsert)
        .onConflictDoUpdate({
          target: [matchPlayerResults.matchId, matchPlayerResults.userId],
          set: {
            full: sql`EXCLUDED.full`,
            clean: sql`EXCLUDED.clean`,
            total: sql`EXCLUDED.total`,
            avg: sql`EXCLUDED.avg`,
            faults: sql`EXCLUDED.faults`,
          },
        });
    }

    console.log('Syncing player results snapshots...');
    await syncAllPlayerResultsSnapshots(payloads?.playerResults);

    console.log('Recalculating fines, bonuses and trainer payments...');
    await recalculateDerivedFinancials();

    console.log('Data sync completed successfully.');
  } catch (error) {
    console.error('Data sync failed:', error);
    throw error;
  }
}
