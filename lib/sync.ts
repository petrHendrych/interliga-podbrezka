/* eslint-disable no-console */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
import {
  eq,
  and,
  inArray,
  sql,
} from 'drizzle-orm';
import { db } from './db';
import {
  matches,
  users,
  matchPlayerResults,
  trainerPayments,
  scrapedData,
} from './db/schema';
import { getAllTeamIds, getSeasonAndLeagueConfig } from './season-config';
import { MatchListItem } from './api';

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

export async function recalculateFaultlessStreaks() {
  const results = await db
    .select({
      matchId: matchPlayerResults.matchId,
      userId: matchPlayerResults.userId,
      faults: matchPlayerResults.faults,
      isWorstPlayer: matchPlayerResults.isWorstPlayer,
      isUnder600: matchPlayerResults.isUnder600,
      specialFaultsCount: matchPlayerResults.specialFaultsCount,
      calculatedFine: matchPlayerResults.calculatedFine,
      date: matches.date,
    })
    .from(matchPlayerResults)
    .innerJoin(matches, eq(matchPlayerResults.matchId, matches.externalId))
    .orderBy(
      matchPlayerResults.userId,
      sql`COALESCE(${matches.date}, '1970-01-01'::timestamp) ASC`,
      matchPlayerResults.matchId,
    );

  const playerResultsMap = new Map<string, typeof results>();
  for (const row of results) {
    if (!row.userId) continue;
    const userId = String(row.userId);
    if (!playerResultsMap.has(userId)) {
      playerResultsMap.set(userId, []);
    }
    playerResultsMap.get(userId)!.push(row);
  }

  const updates: Array<{ matchId: number; userId: string; fine: number }> = [];

  for (const [userId, userRows] of playerResultsMap.entries()) {
    let streak = 0;
    for (const r of userRows) {
      const faults = Number(r.faults || 0);
      if (faults === 0) {
        streak += 1;
      } else {
        streak = 0;
      }

      const streakFine = streak >= 5 ? 10 : 0;
      const sequentialFine = (faults * (faults + 1)) / 2;
      const worstFine = r.isWorstPlayer ? 1 : 0;
      const under600Fine = r.isUnder600 ? 1 : 0;
      const specialFine = Number(r.specialFaultsCount || 0) * 5;

      const totalFine = sequentialFine + worstFine + under600Fine + specialFine + streakFine;

      const currentFine = Number(r.calculatedFine || 0);
      if (r.matchId && currentFine !== totalFine) {
        updates.push({ matchId: r.matchId, userId, fine: totalFine });
      }
    }
  }

  if (updates.length > 0) {
    const jsonUpdates = JSON.stringify(updates);
    await db.execute(sql`
      UPDATE match_player_results AS m
      SET calculated_fine = v.fine
      FROM jsonb_to_recordset(${jsonUpdates}::jsonb)
        AS v(match_id bigint, user_id uuid, fine numeric)
      WHERE m.match_id = v.match_id AND m.user_id = v.user_id;
    `);
  }
}

export async function syncAllPlayerResultsSnapshots() {
  const playerSnapshots = await db
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
    isUnder600: boolean;
    calculatedFine: string;
    bonusReceived: string;
    teamId: number;
  }>();

  for (const snapshot of playerSnapshots) {
    if (snapshot.externalId === null) continue;
    const externalPlayerId = Number(snapshot.externalId);
    const playerResults = snapshot.data as unknown as Array<{
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
        homeTeam?: {
          id?: number;
          name?: string;
          clubId?: number;
          club?: { id?: number; name?: string };
        };
        awayTeam?: {
          id?: number;
          name?: string;
          clubId?: number;
          club?: { id?: number; name?: string };
        };
      };
    }>;

    if (externalPlayerId && Array.isArray(playerResults)) {
      const userId = userMap.get(externalPlayerId);
      if (!userId) continue;

      for (const item of playerResults) {
        const { match } = item;
        if (match && match.id) {
          const matchId = Number(match.id);
          const dateStr = match.startDate || match.created || null;
          const date = dateStr ? new Date(dateStr) : null;
          const homeClubId = match.homeTeam?.clubId || match.homeTeam?.club?.id;
          const homeTeamId = match.homeTeam?.id;
          const homeName = match.homeTeam?.name || match.homeTeam?.club?.name || '';
          const isHome = homeClubId === 649
            || (homeTeamId != null && getAllTeamIds().includes(homeTeamId))
            || homeName.includes('Podbrezová');

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

          const podbrezovaATeamIds = getAllTeamIds();
          const mainPlayerIds = [170512, 169214, 169215, 170511, 19728, 20299];

          const playerTeam = (match.homeTeam?.id === playerTeamId)
            ? match.homeTeam
            : match.awayTeam;
          const playerTeamName = playerTeam?.name || playerTeam?.club?.name || '';
          const isPodbrezovaMatch = playerTeamName.includes('Podbrezová');

          if (isPodbrezovaMatch && matchId) {
            const isMainPlayer = mainPlayerIds.includes(externalPlayerId);
            const isATeamMatch = podbrezovaATeamIds.includes(playerTeamId);

            if (isMainPlayer || isATeamMatch) {
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

              const full = Number(item.full || 0);
              const clean = Number(item.clean || 0);
              const total = Number(item.total || 0);
              const faults = Number(item.faults || 0);
              const avg = Number(
                item.average || (total > 0 ? Math.round((total / 4) * 10) / 10 : 0),
              );

              const isUnder600 = total < 600 && total > 0;
              const bonusReceived = total > 700 ? 40 : 0;
              const calculatedFine = ((faults * (faults + 1)) / 2) + (isUnder600 ? 1 : 0);

              const key = `${matchId}_${userId}`;
              playerResultsToUpsertMap.set(key, {
                matchId,
                userId,
                full,
                clean,
                total,
                avg: String(avg),
                faults,
                isUnder600,
                calculatedFine: String(calculatedFine),
                bonusReceived: String(bonusReceived),
                teamId: playerTeamId,
              });
            }
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
          isUnder600: sql`EXCLUDED.is_under_600`,
          calculatedFine: sql`((EXCLUDED.faults * (EXCLUDED.faults + 1)) / 2) + 
            (CASE WHEN match_player_results.is_worst_player THEN 1 ELSE 0 END) + 
            (CASE WHEN EXCLUDED.is_under_600 THEN 1 ELSE 0 END) +
            (COALESCE(match_player_results.special_faults_count, 0) * 5)`,
          bonusReceived: sql`EXCLUDED.bonus_received`,
          teamId: sql`EXCLUDED.team_id`,
        },
      });
  }
}

export async function syncData() {
  console.log('Starting data sync from scraped_data...');

  try {
    const matchSnapshots = await db
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

      const homeClubId = data.homeTeam?.club?.id;
      const homeTeamId = data.homeTeam?.id;
      const homeName = data.homeTeam?.club?.name || data.homeTeam?.name || '';
      const isHome = homeClubId === 649
        || (homeTeamId != null && getAllTeamIds().includes(homeTeamId))
        || homeName.includes('Podbrezová');

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

    // Provision missing users in 1 query
    const allExtPlayerIds = Array.from(playerMapByExtId.keys());
    if (allExtPlayerIds.length > 0) {
      const existingUserRows = await db
        .select({ id: users.id, externalPlayerId: users.externalPlayerId })
        .from(users)
        .where(inArray(users.externalPlayerId, allExtPlayerIds));

      const existingUserExtIds = new Set(
        existingUserRows
          .map((u) => u.externalPlayerId)
          .filter((id): id is number => id !== null),
      );

      const usersToInsert = allExtPlayerIds
        .filter((extId) => !existingUserExtIds.has(extId))
        .map((extId) => ({
          name: playerMapByExtId.get(extId) || `Player ${extId}`,
          externalPlayerId: extId,
          role: 'player',
          isApproved: true,
        }));

      if (usersToInsert.length > 0) {
        await db.insert(users).values(usersToInsert).onConflictDoNothing();
      }
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
    const matchListSnapshots = await db
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

          const isHome = (homeTeamId && allPodbrezovaTeamIds.includes(homeTeamId))
            || (teamId && homeTeamId === teamId)
            || homeName.includes('Podbrezová') || homeName.includes('Podbrezova');

          const isAway = (awayTeamId && allPodbrezovaTeamIds.includes(awayTeamId))
            || (teamId && awayTeamId === teamId)
            || awayName.includes('Podbrezová') || awayName.includes('Podbrezova');

          if (isHome || isAway) {
            const matchedTeamId = teamId || (isHome ? homeTeamId : awayTeamId);
            const matchedLeagueId = m.leagueId ? Number(m.leagueId) : undefined;
            const mLeagueName = typeof m.leagueName === 'string' ? m.leagueName : undefined;
            const mHallName = typeof m.hallName === 'string' ? m.hallName : null;
            const config = getSeasonAndLeagueConfig(matchedTeamId, matchedLeagueId, mLeagueName);

            const opponent = isHome ? awayName : homeName;
            const dateStr = m.startDate || null;
            const date = dateStr ? new Date(dateStr) : null;

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
      isWorstPlayer: boolean;
      isUnder600: boolean;
      calculatedFine: string;
      bonusReceived: string;
    }> = [];

    const trainerPaymentsToUpsert: Array<{
      matchId: number;
      userId: string;
      conditionType: string;
      amount: string;
    }> = [];

    const trainers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'trainer'), eq(users.isApproved, true)));

    for (const { matchId, data } of matchDataList) {
      const homeClubId = data.homeTeam?.club?.id;
      const homeTeamId = data.homeTeam?.id;
      const homeName = data.homeTeam?.club?.name || data.homeTeam?.name || '';
      const isHome = homeClubId === 649
        || (homeTeamId != null && getAllTeamIds().includes(homeTeamId))
        || homeName.includes('Podbrezová');

      const dateStr = data.details?.date || data.startDate || null;
      const date = dateStr ? new Date(dateStr) : null;

      const matchedTeamId = isHome ? homeTeamId : (data.awayTeam?.id || undefined);
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
            const avg = p.average || (total > 0 ? Math.round((total / 4) * 10) / 10 : 0);
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

      let minTotal = Infinity;
      const activePlayers = playerResultsList.filter((p) => p.total > 0);
      if (activePlayers.length > 0) {
        minTotal = Math.min(...activePlayers.map((p) => p.total));
      }

      for (const pr of playerResultsList) {
        const isWorstPlayer = pr.total === minTotal && pr.total > 0;
        const isUnder600 = pr.total < 600 && pr.total > 0;

        let calculatedFine = (pr.faults * (pr.faults + 1)) / 2;
        if (isWorstPlayer) calculatedFine += 1;
        if (isUnder600) calculatedFine += 1;

        const bonusReceived = pr.total > 700 ? 30 : 0;

        prRowsToUpsert.push({
          matchId,
          userId: pr.userId,
          full: pr.full,
          clean: pr.clean,
          total: pr.total,
          avg: String(pr.avg),
          faults: pr.faults,
          isWorstPlayer,
          isUnder600,
          calculatedFine: String(calculatedFine),
          bonusReceived: String(bonusReceived),
        });
      }

      for (const trainer of trainers) {
        let scoreBonusAmount = 0;
        if (teamTotalScore !== null && teamTotalScore > 3900) scoreBonusAmount = 15;
        else if (teamTotalScore !== null && teamTotalScore > 3800) scoreBonusAmount = 10;

        if (scoreBonusAmount > 0) {
          trainerPaymentsToUpsert.push({
            matchId,
            userId: trainer.id,
            conditionType: 'score_bonus',
            amount: String(scoreBonusAmount),
          });
        }

        const teamTotalFaults = playerResultsList.reduce((acc, p) => acc + p.faults, 0);
        const activePlayersCount = playerResultsList.filter((p) => p.total > 0).length;
        if (teamTotalFaults === 0 && activePlayersCount >= 6) {
          trainerPaymentsToUpsert.push({
            matchId,
            userId: trainer.id,
            conditionType: 'zero_faults',
            amount: '10',
          });
        }

        const elitePlayersCount = playerResultsList.filter((p) => p.total > 700).length;
        if (elitePlayersCount > 0) {
          trainerPaymentsToUpsert.push({
            matchId,
            userId: trainer.id,
            conditionType: 'elite_player',
            amount: String(elitePlayersCount * 10),
          });
        }
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
            isWorstPlayer: sql`EXCLUDED.is_worst_player`,
            isUnder600: sql`EXCLUDED.is_under_600`,
            calculatedFine: sql`((EXCLUDED.faults * (EXCLUDED.faults + 1)) / 2) + 
              (CASE WHEN EXCLUDED.is_worst_player THEN 1 ELSE 0 END) + 
              (CASE WHEN EXCLUDED.is_under_600 THEN 1 ELSE 0 END) +
              (COALESCE(match_player_results.special_faults_count, 0) * 5)`,
            bonusReceived: sql`EXCLUDED.bonus_received`,
          },
        });
    }

    // Execute bulk trainer payments upsert in 1 query
    if (trainerPaymentsToUpsert.length > 0) {
      await db
        .insert(trainerPayments)
        .values(trainerPaymentsToUpsert)
        .onConflictDoUpdate({
          target: [trainerPayments.matchId, trainerPayments.userId, trainerPayments.conditionType],
          set: { amount: sql`EXCLUDED.amount` },
        });
    }

    // 3. Sync player_results snapshots in bulk
    console.log('Syncing player results snapshots...');
    await syncAllPlayerResultsSnapshots();

    // 4. Recalculate faultless streaks in 1 query
    console.log('Recalculating faultless streaks...');
    await recalculateFaultlessStreaks();

    console.log('Data sync completed successfully.');
  } catch (error) {
    console.error('Data sync failed:', error);
    throw error;
  }
}
